/* Exporters. Frames are rendered directly from the time model — no screen
   recording, no real-time wait, and frame timing is exact.
     mov-png  — QuickTime MOV, PNG codec, transparent, + PCM audio (Vegas & Camtasia)
     mp4      — H.264 MP4 (opaque), + AAC audio when the browser can encode it
     png-seq  — folder of PNG frames + audio.wav (universal fallback)
     wav      — the audio track on its own */
'use strict';

(function (CDM) {
  const { W, H, FPS } = CDM;
  const SR = CDM.AUDIO_SR;
  const SPF = SR / FPS;   // audio samples per video frame (1600)

  CDM.FONTS = ["100px 'Bebas Neue'", "100px 'Share Tech Mono'", "600 100px 'Oswald'", "700 100px 'Orbitron'", "900 100px 'Orbitron'"];
  CDM.loadFonts = () => Promise.all(CDM.FONTS.map(f => document.fonts.load(f).catch(() => null)));

  const pad2 = n => String(n).padStart(2, '0');
  // Characters Windows/macOS don't allow in file names.
  CDM.safeFileName = s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|[. ]+$/g, '').slice(0, 120);
  CDM.exportName = function (S, ext) {
    // Named after the loaded/saved preset when there is one.
    const preset = CDM.currentPresetName && CDM.safeFileName(CDM.currentPresetName);
    if (preset) return `${preset}.${ext}`;
    const h = S.hours | 0, m = S.minutes | 0, s = S.seconds | 0;
    const dur = (h ? `${h}h` : '') + `${h ? pad2(m) : m}m${pad2(s)}s`;
    return `countdown-${dur}-${S.theme}${S.bg === 'transparent' ? '-alpha' : ''}.${ext}`;
  };

  const FORMATS = {
    'mov-png': { ext: 'mov', mime: 'video/quicktime', desc: 'QuickTime movie' },
    'mp4': { ext: 'mp4', mime: 'video/mp4', desc: 'MP4 video' },
    'wav': { ext: 'wav', mime: 'audio/wav', desc: 'WAV audio' },
  };

  // Ask where to save BEFORE any await, while we still have the click's user activation.
  CDM.pickDestination = async function (S, format) {
    if (format === 'png-seq') {
      if (!window.showDirectoryPicker) throw new Error('PNG sequence export needs Chrome or Edge (folder access).');
      const dir = await window.showDirectoryPicker({ id: 'cdm-export', mode: 'readwrite' });
      const name = CDM.exportName(S, 'x').replace(/\.x$/, '');
      return { dir: await dir.getDirectoryHandle(name, { create: true }), folderName: name };
    }
    const f = FORMATS[format], name = CDM.exportName(S, f.ext);
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        id: 'cdm-export', suggestedName: name,
        types: [{ description: f.desc, accept: { [f.mime]: ['.' + f.ext] } }],
      });
      return { sink: new CDM.FileSink(await handle.createWritable()), name: handle.name };
    }
    return { sink: new CDM.MemorySink(), name, download: true };
  };

  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }
  // ── PNG ENCODER
  // Chrome's canvas.toBlob() PNG uses its fastest zlib setting, which leaves the
  // mostly-transparent frames ~8× bigger than they need to be. This encoder uses
  // the Sub filter + the browser's native zlib (CompressionStream) instead.
  const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  function crc32(bytes, start, end) {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  }
  // Snapshot synchronously (so the canvas can be redrawn straight away), compress async.
  // bounds: region that may contain drawing (from CDM.render); everything outside it
  // is the plain background colour bg = [r,g,b,a], so it doesn't need reading back.
  CDM.encodePNG = function (ctx, bounds, bg) {
    const stride = W * 4, raw = new Uint8Array((stride + 1) * H);
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i += 4) { row[i] = bg[0]; row[i + 1] = bg[1]; row[i + 2] = bg[2]; row[i + 3] = bg[3]; }
    const plain = new Uint8Array(stride + 1);   // a filtered background-only row
    plain[0] = 1; plain.set(bg, 1);
    const b = bounds && bounds.x1 > bounds.x0 && bounds.y1 > bounds.y0 ? bounds : null;
    const px = b ? ctx.getImageData(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).data : null;
    const bw = b ? (b.x1 - b.x0) * 4 : 0;
    for (let y = 0; y < H; y++) {
      const o = y * (stride + 1);
      if (!b || y < b.y0 || y >= b.y1) { raw.set(plain, o); continue; }
      row.set(px.subarray((y - b.y0) * bw, (y - b.y0 + 1) * bw), b.x0 * 4);
      raw[o] = 1;   // Sub filter
      for (let i = 0; i < 4; i++) raw[o + 1 + i] = row[i];
      for (let i = 4; i < stride; i++) raw[o + 1 + i] = row[i] - row[i - 4];
      // restore the background where this row's drawing was, for the next row
      for (let i = b.x0 * 4; i < b.x0 * 4 + bw; i += 4) { row[i] = bg[0]; row[i + 1] = bg[1]; row[i + 2] = bg[2]; row[i + 3] = bg[3]; }
    }
    const z = new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    return z.then(buf => {
      const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
      dv.setUint32(0, W); dv.setUint32(4, H); ihdr[8] = 8; ihdr[9] = 6;   // 8-bit RGBA
      const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr),
        pngChunk('IDAT', new Uint8Array(buf)), pngChunk('IEND', new Uint8Array(0))];
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
      return out;
    });
  };
  function bgRGBA(S) {
    const c = CDM.bgColor(S);
    return c ? [...CDM.hexRgb(c), 255] : [0, 0, 0, 0];
  }

  // Rough output estimate for the UI: how many distinct frames, and their size.
  CDM.estimateExport = async function (S) {
    const N = CDM.frameCount(S);
    let unique = 0, last = null;
    for (let i = 0; i < N; i++) {
      const k = CDM.frameKey(i / FPS, S);
      if (k !== last) { unique++; last = k; }
    }
    const canvas = makeCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const T = CDM.totalSeconds(S);
    let bytes = 0;
    const samples = [0.38, 0.8].map(f => Math.floor(T * f) + 0.5);
    for (const t of samples) { CDM.render(ctx, t, S); bytes += (await CDM.encodePNG(ctx, CDM.lastBounds, bgRGBA(S))).length; }
    const per = bytes / samples.length;
    const audio = CDM.audio.hasAudio(S) ? N * SPF * 4 : 0;
    return { N, unique, per, movBytes: per * (S.compact ? unique : N) + audio, seqBytes: per * N };
  };

  // job: { S, format, dest, onProgress(frac, text), cancelled() }
  CDM.runExport = async function (job) {
    const { S, format, dest } = job;
    await CDM.loadFonts();
    const N = CDM.frameCount(S);
    const events = CDM.audio.events(S);
    const audio = events.length > 0;
    const t0 = performance.now();
    const progress = (i, extra) => {
      const frac = i / N, el = (performance.now() - t0) / 1000;
      const eta = frac > 0.02 ? el / frac - el : null;
      job.onProgress(frac, `${i} / ${N} frames${eta != null ? ` · ~${Math.ceil(eta)}s left` : ''}${extra || ''}`);
    };
    const check = () => { if (job.cancelled()) throw new DOMException('Export cancelled', 'AbortError'); };

    try {
      if (format === 'wav') return await exportWav(job, N, events, progress, check);
      if (format === 'mp4') return await exportMp4(job, N, events, progress, check);
      if (format === 'png-seq') return await exportPngSeq(job, N, events, audio, progress, check);
      return await exportMovPng(job, N, events, audio, progress, check);
    } catch (e) {
      if (dest.sink) await dest.sink.abort();
      throw e;
    }
  };

  async function finishSink(dest) {
    if (dest.download) download(dest.sink.blob, dest.name);
    return dest.name;
  }

  // ── MOV (PNG codec, alpha)
  async function exportMovPng(job, N, events, audio, progress, check) {
    const { S, dest } = job;
    const mux = new CDM.Muxer(dest.sink, {
      format: 'mov',
      video: { codec: 'png', width: W, height: H, fps: FPS },
      audio: audio ? { codec: 'sowt', sampleRate: SR, channels: 2 } : null,
    });
    await mux.start();
    const canvas = makeCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bg = bgRGBA(S);
    const queue = [];             // ordered: promise of PNG bytes, or REPEAT
    const REPEAT = {};
    let lastKey = null, lastPromise = null, lastRef = null, written = 0, audioPos = 0;

    async function writeOne() {
      const item = queue.shift();
      if (item === REPEAT) mux.addVideoRef(lastRef);
      else lastRef = await mux.addVideo(await item, true);
      written++;
      if (audio && (written % FPS === 0 || written === N)) {
        const n = written * SPF - audioPos;
        await mux.addAudio(CDM.audio.toPCM16(CDM.audio.mix(events, audioPos, n)), n);
        audioPos += n;
      }
      if (written % 15 === 0) progress(written);
    }

    for (let i = 0; i < N; i++) {
      check();
      const t = i / FPS, key = CDM.frameKey(t, S);
      if (key !== lastKey) {
        CDM.render(ctx, t, S);
        lastPromise = CDM.encodePNG(ctx, CDM.lastBounds, bg);
        lastKey = key;
        queue.push(lastPromise);
      } else {
        queue.push(S.compact ? REPEAT : lastPromise);
      }
      if (queue.length >= 8) await writeOne();
    }
    while (queue.length) { check(); await writeOne(); }
    progress(N, ' · finishing…');
    await mux.finish();
    return finishSink(dest);
  }

  // ── PNG SEQUENCE (+ audio.wav)
  async function exportPngSeq(job, N, events, audio, progress, check) {
    const { S, dest } = job;
    const canvas = makeCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bg = bgRGBA(S);
    const digits = Math.max(5, String(N).length);
    let lastKey = null, lastBlob = null;
    const inflight = [];
    for (let i = 0; i < N; i++) {
      check();
      const t = i / FPS, key = CDM.frameKey(t, S);
      if (key !== lastKey) { CDM.render(ctx, t, S); lastBlob = CDM.encodePNG(ctx, CDM.lastBounds, bg); lastKey = key; }
      const name = `frame_${String(i).padStart(digits, '0')}.png`, blobP = lastBlob;
      inflight.push((async () => {
        const fh = await dest.dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable(); await w.write(await blobP); await w.close();
      })());
      if (inflight.length >= 8) await inflight.shift();
      if (i % 15 === 0) progress(i);
    }
    await Promise.all(inflight);
    if (audio) {
      const fh = await dest.dir.getFileHandle('audio.wav', { create: true });
      const sink = new CDM.FileSink(await fh.createWritable());
      await writeWavTo(sink, N, events, check);
    }
    return dest.folderName + '/';
  }

  // ── WAV
  async function writeWavTo(sink, N, events, check) {
    const total = N * SPF;
    await sink.write(CDM.audio.wavHeader(total));
    for (let pos = 0; pos < total; pos += SR) {
      check();
      const n = Math.min(SR, total - pos);
      await sink.write(CDM.audio.toPCM16(CDM.audio.mix(events, pos, n)));
    }
    await sink.close();
  }
  async function exportWav(job, N, events, progress, check) {
    if (!events.length) throw new Error('There is no sound to export — turn on beeps/ticks or add a sound clip.');
    progress(0);
    await writeWavTo(job.dest.sink, N, events, check);
    progress(N);
    return finishSink(job.dest);
  }

  // ── MP4 (H.264 + AAC)
  async function exportMp4(job, N, events, progress, check) {
    const { dest } = job;
    if (!window.VideoEncoder) throw new Error('MP4 export needs the WebCodecs API (Chrome or Edge).');
    // H.264 has no alpha channel, so a transparent background becomes black.
    const S = job.S.bg === 'transparent' ? { ...job.S, bg: 'black' } : job.S;

    let vcfg = null;
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) {
      const c = { codec, width: W, height: H, framerate: FPS, bitrate: 12_000_000, avc: { format: 'avc' } };
      if ((await VideoEncoder.isConfigSupported(c)).supported) { vcfg = c; break; }
    }
    if (!vcfg) throw new Error('This browser cannot encode H.264. Use the MOV export instead.');

    let acfg = null, audioNote = '';
    if (events.length) {
      const c = { codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 192000 };
      if (window.AudioEncoder && (await AudioEncoder.isConfigSupported(c).catch(() => ({}))).supported) acfg = c;
      else audioNote = ' (no AAC encoder in this browser — sound skipped; export WAV separately)';
    }

    const mux = new CDM.Muxer(dest.sink, {
      format: 'mp4',
      video: { codec: 'avc', width: W, height: H, fps: FPS },
      audio: acfg ? { codec: 'aac', sampleRate: SR, channels: 2, bitrate: 192000 } : null,
    });
    await mux.start();

    const out = [];   // encoded chunks waiting to be written, in arrival order
    let failure = null, vIndex = 0;
    const venc = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta && meta.decoderConfig && meta.decoderConfig.description) mux.video.description = new Uint8Array(meta.decoderConfig.description);
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        const pts = Math.round(chunk.timestamp / 1e6 * mux.video.timescale);
        out.push({ v: true, data, key: chunk.type === 'key', cts: pts - vIndex++ * mux.video.delta });
      },
      error: e => { failure = e; },
    });
    venc.configure(vcfg);
    let aenc = null;
    if (acfg) {
      aenc = new AudioEncoder({
        output: (chunk, meta) => {
          if (meta && meta.decoderConfig && meta.decoderConfig.description) mux.audio.description = new Uint8Array(meta.decoderConfig.description);
          const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
          out.push({ v: false, data });
        },
        error: e => { failure = e; },
      });
      aenc.configure(acfg);
    }
    async function drain() {
      while (out.length) {
        const c = out.shift();
        if (c.v) await mux.addVideo(c.data, c.key, c.cts);
        else await mux.addAudio(c.data, 1024);
      }
    }

    const canvas = makeCanvas(), ctx = canvas.getContext('2d', { alpha: false });
    let audioPos = 0;
    for (let i = 0; i < N; i++) {
      check();
      if (failure) throw failure;
      CDM.render(ctx, i / FPS, S);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(frame, { keyFrame: i % FPS === 0 });
      frame.close();
      if (aenc && ((i + 1) % FPS === 0 || i === N - 1)) {
        const n = (i + 1) * SPF - audioPos, [L, R] = CDM.audio.mix(events, audioPos, n);
        const planar = new Float32Array(n * 2); planar.set(L, 0); planar.set(R, n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfChannels: 2, numberOfFrames: n, timestamp: Math.round(audioPos / SR * 1e6), data: planar });
        aenc.encode(ad); ad.close();
        audioPos += n;
      }
      while (venc.encodeQueueSize > 6) await new Promise(r => venc.addEventListener('dequeue', r, { once: true }));
      await drain();
      if (i % 15 === 0) progress(i, audioNote);
    }
    await venc.flush();
    if (aenc) await aenc.flush();
    if (failure) throw failure;
    await drain();
    venc.close(); if (aenc) aenc.close();
    progress(N, ' · finishing…');
    await mux.finish();
    await finishSink(dest);
    return dest.name + audioNote;
  }
})(window.CDM);
