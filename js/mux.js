/* Minimal MP4 / QuickTime MOV writer.
   Video: 'png ' (PNG per frame, keeps alpha — Vegas & Camtasia read this) or
          'avc1' (H.264 from WebCodecs).
   Audio: 'sowt' (16-bit PCM, MOV only) or 'mp4a' (AAC from WebCodecs).
   Samples are streamed into mdat as they arrive; moov is written at the end.
   No external dependencies, so it keeps working offline / when a CDN changes. */
'use strict';

(function (CDM) {
  // ── BYTE HELPERS
  function cat(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const u8 = v => new Uint8Array([v & 255]);
  const u16 = v => new Uint8Array([(v >> 8) & 255, v & 255]);
  const u24 = v => new Uint8Array([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; };
  const i32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0); return b; };
  const u64 = v => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v)); return b; };
  const str = s => new Uint8Array([...s].map(c => c.charCodeAt(0)));
  const zeros = n => new Uint8Array(n);
  const flat = a => a.flat(Infinity).filter(Boolean);
  function box(type, ...payload) {
    const body = cat(flat(payload));
    return cat([u32(body.length + 8), str(type), body]);
  }
  const fullbox = (type, version, flags, ...payload) => box(type, u8(version), u24(flags), ...payload);
  const MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);
  function pascal(s, len) { const b = zeros(len); b[0] = s.length; b.set(str(s), 1); return b; }

  // ── SINKS
  // FileSink streams to a FileSystemWritableFileStream (File System Access API).
  class FileSink {
    constructor(writable) { this.w = writable; this.pos = 0; this.buf = []; this.bufLen = 0; this.bufStart = 0; }
    async write(data) {
      if (!this.bufLen) this.bufStart = this.pos;
      this.buf.push(data); this.bufLen += data.length; this.pos += data.length;
      if (this.bufLen > 16 * 1024 * 1024) await this.flush();
    }
    async flush() {
      if (!this.bufLen) return;
      await this.w.write({ type: 'write', position: this.bufStart, data: cat(this.buf) });
      this.buf = []; this.bufLen = 0;
    }
    async writeAt(pos, data) { await this.flush(); await this.w.write({ type: 'write', position: pos, data }); }
    async close() { await this.flush(); await this.w.close(); }
    async abort() { try { await this.w.abort(); } catch (e) { /* ignore */ } }
  }
  // MemorySink keeps chunks in memory and produces a Blob (fallback download).
  class MemorySink {
    constructor() { this.chunks = []; this.pos = 0; }
    async write(data) { this.chunks.push(data); this.pos += data.length; }
    async writeAt(pos, data) {
      let o = 0;
      for (const c of this.chunks) {
        const end = o + c.length;
        for (let i = 0; i < data.length; i++) {
          const p = pos + i;
          if (p >= o && p < end) c[p - o] = data[i];
        }
        o = end;
        if (o >= pos + data.length) break;
      }
    }
    async close() { this.blob = new Blob(this.chunks); this.chunks = []; }
    async abort() { this.chunks = []; }
  }
  CDM.FileSink = FileSink;
  CDM.MemorySink = MemorySink;

  // ── MUXER
  class Muxer {
    constructor(sink, opts) {
      this.sink = sink;
      this.mov = opts.format === 'mov';
      this.tracks = [];
      if (opts.video) {
        const v = opts.video;
        this.video = { kind: 'video', id: 1, ...v, timescale: v.fps * 512, delta: 512, samples: [], chunks: [], lastEnd: -1 };
        this.tracks.push(this.video);
      }
      if (opts.audio) {
        const a = opts.audio;
        this.audio = { kind: 'audio', id: this.tracks.length + 1, ...a, timescale: a.sampleRate, samples: [], chunks: [], lastEnd: -1, frames: 0 };
        this.tracks.push(this.audio);
      }
    }

    async start() {
      const ftyp = this.mov
        ? box('ftyp', str('qt  '), u32(0x200), str('qt  '))
        : box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
      await this.sink.write(ftyp);
      this.widePos = this.sink.pos;
      await this.sink.write(box(this.mov ? 'wide' : 'free'));      // 8 bytes, becomes a 64-bit mdat header if needed
      this.mdatPos = this.sink.pos;
      await this.sink.write(cat([u32(0), str('mdat')]));
      this.dataStart = this.sink.pos;
    }

    addToChunk(track, offset, size, sampleCount) {
      const last = track.chunks[track.chunks.length - 1];
      if (last && track.lastEnd === offset) { last.count += sampleCount; }
      else track.chunks.push({ offset, count: sampleCount });
      track.lastEnd = offset + size;
    }

    // data: Uint8Array; key: keyframe; cts: composition offset in track timescale (H.264 B-frames)
    // Returns a reference that addVideoRef() can reuse.
    async addVideo(data, key, cts) {
      const t = this.video, offset = this.sink.pos;
      await this.sink.write(data);
      t.samples.push({ size: data.length, key: !!key, cts: cts || 0 });
      this.addToChunk(t, offset, data.length, 1);
      return { offset, size: data.length };
    }

    // Repeat an earlier (intra-only, e.g. PNG) frame without writing its bytes again:
    // the new sample's chunk offset points at the existing data. Timing stays a
    // constant 30 fps, so editors see an ordinary CFR file.
    addVideoRef(ref) {
      const t = this.video;
      t.samples.push({ size: ref.size, key: true, cts: 0 });
      this.addToChunk(t, ref.offset, ref.size, 1);
    }

    // PCM: data = interleaved s16le, frames = sample frames. AAC: one encoded frame per call.
    async addAudio(data, frames) {
      const t = this.audio, offset = this.sink.pos;
      await this.sink.write(data);
      if (t.codec === 'sowt') { t.frames += frames; this.addToChunk(t, offset, data.length, frames); }
      else { t.samples.push({ size: data.length, key: true }); t.frames += frames; this.addToChunk(t, offset, data.length, 1); }
    }

    async finish() {
      const end = this.sink.pos, mdatSize = end - this.mdatPos;
      if (mdatSize > 0xffffffff) {
        await this.sink.writeAt(this.widePos, cat([u32(1), str('mdat'), u64(end - this.widePos)]));
      } else {
        await this.sink.writeAt(this.mdatPos, u32(mdatSize));
      }
      await this.sink.write(this.moov(end));
      await this.sink.close();
    }

    trackDuration(t) {   // in the track's timescale
      if (t.kind === 'video') return t.samples.length * t.delta;
      return t.codec === 'sowt' ? t.frames : t.samples.length * 1024;
    }

    moov(maxOffset) {
      const MTS = 1000;
      const durs = this.tracks.map(t => Math.round(this.trackDuration(t) / t.timescale * MTS));
      const movieDur = Math.max(...durs);
      const co64 = maxOffset > 0xffffffff;
      const mvhd = fullbox('mvhd', 0, 0, u32(0), u32(0), u32(MTS), u32(movieDur), u32(0x00010000), u16(0x0100),
        zeros(10), MATRIX, zeros(24), u32(this.tracks.length + 1));
      const traks = this.tracks.map((t, i) => this.trak(t, durs[i], co64));
      return box('moov', mvhd, traks);
    }

    trak(t, movieDur, co64) {
      const video = t.kind === 'video';
      const tkhd = fullbox('tkhd', 0, 3, u32(0), u32(0), u32(t.id), u32(0), u32(movieDur), zeros(8),
        u16(0), u16(0), u16(video ? 0 : 0x0100), u16(0), MATRIX,
        u32(video ? t.width << 16 : 0), u32(video ? t.height << 16 : 0));

      // H.264 with B-frames: shift composition offsets to be >= 0 and add an edit list.
      let edts = null, minCts = 0;
      if (video && t.samples.some(s => s.cts)) {
        minCts = Math.min(...t.samples.map(s => s.cts));
        if (minCts < 0) {
          edts = box('edts', fullbox('elst', 0, 0, u32(1), u32(movieDur), u32(-minCts), u32(0x00010000)));
        }
      }

      const mdhd = fullbox('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(this.trackDuration(t)), u16(0x55c4), u16(0));
      const hname = video ? 'VideoHandler' : 'SoundHandler';
      const hdlr = fullbox('hdlr', 0, 0, this.mov ? str('mhlr') : u32(0), str(video ? 'vide' : 'soun'), zeros(12),
        this.mov ? cat([u8(hname.length), str(hname)]) : cat([str(hname), u8(0)]));
      const xmhd = video ? fullbox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)) : fullbox('smhd', 0, 0, u16(0), u16(0));
      const dhlr = this.mov ? fullbox('hdlr', 0, 0, str('dhlr'), str('url '), zeros(12), cat([u8(11), str('DataHandler')])) : null;
      const dinf = box('dinf', fullbox('dref', 0, 0, u32(1), fullbox('url ', 0, 1)));

      const stbl = box('stbl',
        fullbox('stsd', 0, 0, u32(1), video ? this.videoEntry(t) : this.audioEntry(t)),
        this.stts(t),
        video && t.samples.some(s => s.cts) ? this.ctts(t, minCts) : null,
        video && t.codec === 'avc' ? this.stss(t) : null,
        this.stsc(t), this.stsz(t), this.stco(t, co64));
      const minf = box('minf', xmhd, dhlr, dinf, stbl);
      const mdia = box('mdia', mdhd, hdlr, minf);
      return box('trak', tkhd, edts, mdia);
    }

    videoEntry(t) {
      const png = t.codec === 'png';
      return box(png ? 'png ' : 'avc1',
        zeros(6), u16(1),
        u16(0), u16(0), png && this.mov ? str('appl') : u32(0), u32(png ? 0 : 0), u32(png ? 1024 : 0),
        u16(t.width), u16(t.height), u32(0x00480000), u32(0x00480000), u32(0), u16(1),
        pascal(png ? 'PNG' : 'AVC Coding', 32),
        u16(png ? 32 : 24), u16(0xffff),
        png ? null : box('avcC', t.description));
    }

    audioEntry(t) {
      const aac = t.codec === 'aac';
      const entry = [zeros(6), u16(1), u16(0), u16(0), u32(0),
        u16(t.channels), u16(16), u16(0), u16(0), u32(t.sampleRate << 16 >>> 0)];
      if (!aac) return box('sowt', entry);
      return box('mp4a', entry, this.esds(t));
    }

    esds(t) {
      const asc = t.description || new Uint8Array([0x11, 0x90]);   // AAC-LC, 48 kHz, stereo
      const desc = (tag, body) => {
        const len = body.length;
        return cat([u8(tag), new Uint8Array([0x80 | (len >> 21 & 0x7f), 0x80 | (len >> 14 & 0x7f), 0x80 | (len >> 7 & 0x7f), len & 0x7f]), body]);
      };
      const dcd = desc(0x04, cat([u8(0x40), u8(0x15), u24(0), u32(t.bitrate || 192000), u32(t.bitrate || 192000), desc(0x05, asc)]));
      const es = desc(0x03, cat([u16(1), u8(0), dcd, desc(0x06, u8(0x02))]));
      return fullbox('esds', 0, 0, es);
    }

    stts(t) {
      let entries;
      if (t.kind === 'video') entries = [[t.samples.length, t.delta]];
      else if (t.codec === 'sowt') entries = [[t.frames, 1]];
      else entries = [[t.samples.length, 1024]];
      return fullbox('stts', 0, 0, u32(entries.length), entries.map(([c, d]) => cat([u32(c), u32(d)])));
    }

    ctts(t, minCts) {
      const runs = [];
      for (const s of t.samples) {
        const o = s.cts - Math.min(0, minCts);
        const last = runs[runs.length - 1];
        if (last && last[1] === o) last[0]++; else runs.push([1, o]);
      }
      return fullbox('ctts', 0, 0, u32(runs.length), runs.map(([c, o]) => cat([u32(c), i32(o)])));
    }

    stss(t) {
      const keys = [];
      t.samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
      return fullbox('stss', 0, 0, u32(keys.length), keys.map(k => u32(k)));
    }

    stsc(t) {
      const runs = [];
      t.chunks.forEach((c, i) => {
        const last = runs[runs.length - 1];
        if (!last || last[1] !== c.count) runs.push([i + 1, c.count]);
      });
      return fullbox('stsc', 0, 0, u32(runs.length), runs.map(([first, n]) => cat([u32(first), u32(n), u32(1)])));
    }

    stsz(t) {
      if (t.codec === 'sowt') return fullbox('stsz', 0, 0, u32(t.channels * 2), u32(t.frames));
      return fullbox('stsz', 0, 0, u32(0), u32(t.samples.length), t.samples.map(s => u32(s.size)));
    }

    stco(t, co64) {
      return co64
        ? fullbox('co64', 0, 0, u32(t.chunks.length), t.chunks.map(c => u64(c.offset)))
        : fullbox('stco', 0, 0, u32(t.chunks.length), t.chunks.map(c => u32(c.offset)));
    }
  }
  CDM.Muxer = Muxer;
})(window.CDM);
