/* Audio: beeps, ticks and an optional sound clip.
   The same event list drives the live preview (Web Audio nodes) and the export
   (mixed sample-by-sample, so it stays in sync with the frames). */
'use strict';

(function (CDM) {
  const SR = 48000;
  CDM.AUDIO_SR = SR;

  const A = CDM.audio = {
    clip: null,        // AudioBuffer (decoded at 48 kHz)
    clipName: '',
  };

  let actx = null;
  function ctx() {
    if (!actx) actx = new AudioContext({ sampleRate: SR });
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  // The original file bytes are kept too (A.clipBytes) so the clip can be saved
  // with presets and remembered between visits.
  A.loadClipBytes = async function (name, bytes) {
    // OfflineAudioContext decodes (and resamples to 48 kHz) without needing a user
    // gesture, so a remembered clip can be restored on page load. decode detaches its input.
    const clip = await new OfflineAudioContext(2, 1, SR).decodeAudioData(bytes.slice(0));
    A.clip = clip; A.clipName = name; A.clipBytes = bytes;
    return clip;
  };
  A.loadClip = async file => A.loadClipBytes(file.name, await file.arrayBuffer());
  A.clearClip = function () { A.clip = null; A.clipName = ''; A.clipBytes = null; };

  // ── TICK SOUNDS
  // Synthesised once into sample buffers, so the export and the preview play the
  // exact same samples (the noise uses a fixed seed).
  const SAMPLES = {};
  A.TICK_SOUNDS = { tick: 'Tick', flip: 'Flip card', click: 'Soft click' };
  A.tickSoundFor = S => S.tickSound && S.tickSound !== 'auto' ? S.tickSound : (S.theme === 'flip' ? 'flip' : 'tick');
  function makeSample(kind) {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2147483648 - 1; };
    // 2-pole resonant band-pass (biquad), used to colour noise
    function bandpass(f0, q) {
      const w = 2 * Math.PI * f0 / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
      const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      return x => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
    }
    let out;
    if (kind === 'flip') {
      // split-flap card: a papery "fl" as the card releases, then the "ap" as it lands
      const n = Math.round(0.14 * SR), bpHi = bandpass(3200, 0.9), bpLo = bandpass(1400, 1.4);
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR, w = rnd();
        const e1 = Math.exp(-t / 0.010) * Math.min(1, t / 0.0015);
        const t2 = t - 0.055, e2 = t2 > 0 ? Math.exp(-t2 / 0.016) * Math.min(1, t2 / 0.001) : 0;
        const thump = t2 > 0 ? Math.sin(2 * Math.PI * 190 * t2) * Math.exp(-t2 / 0.018) : 0;
        out[i] = bpHi(w) * e1 * 1.6 + bpLo(w) * e2 * 2.4 + thump * 0.35;
      }
    } else if (kind === 'click') {
      const n = Math.round(0.05 * SR), bp = bandpass(2200, 2);
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        out[i] = (Math.sin(2 * Math.PI * 950 * t) * 0.6 + bp(rnd()) * 1.2) * Math.exp(-t / 0.006);
      }
    } else {
      const n = Math.round(0.04 * SR);
      out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / SR; out[i] = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 110); }
    }
    let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
    if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;   // normalise
    return out;
  }
  const sample = kind => SAMPLES[kind] || (SAMPLES[kind] = makeSample(kind));

  // ── EVENTS
  A.events = function (S) {
    const T = CDM.totalSeconds(S), end = CDM.videoSeconds(S), ev = [];
    const vol = (S.beepVol | 0) / 100;
    const beepAt = new Set();
    if (S.beep && T > 0) {
      for (let k = Math.min(S.beepSecs | 0, T); k >= 1; k--) {
        ev.push({ type: 'tone', t: T - k, f: +S.beepFreq || 880, dur: 0.12, vol: vol * 0.55 });
        beepAt.add(T - k);
      }
    }
    if (S.zeroBeep && T > 0) {
      ev.push({ type: 'tone', t: T, f: +S.beepFreq || 880, dur: 0.8, vol: vol * 0.55 });
      beepAt.add(T);
    }
    if (S.tick) {
      // A beep on the same second replaces the tick.
      const from = S.tickMode === 'last' ? Math.max(0, T - (S.tickSecs | 0)) : 0;
      const sound = A.tickSoundFor(S), dur = sample(sound).length / SR;
      const tv = vol * (sound === 'tick' ? 0.45 : 0.6);
      for (let s = from; s < T; s++) if (!beepAt.has(s)) ev.push({ type: 'tick', t: s, sound, dur, vol: tv });
    }
    if (A.clip && S.clipMode !== 'off') {
      const d = A.clip.duration, v = (S.clipVol | 0) / 100;
      let t = 0, stop = end, loop = false;
      if (S.clipMode === 'atZero') t = T;
      else if (S.clipMode === 'endAtZero') t = T - d;
      else if (S.clipMode === 'loop') { loop = true; stop = T; }
      ev.push({ type: 'clip', t, end: Math.min(end, loop ? stop : t + d), loop, vol: v });
    }
    return ev.filter(e => e.t < end).sort((a, b) => a.t - b.t);
  };

  // ── OFFLINE MIX (export)
  // Returns [left, right] Float32Arrays for samples [start, start+n).
  A.mix = function (events, start, n) {
    const L = new Float32Array(n), R = new Float32Array(n);
    const t0 = start / SR, t1 = (start + n) / SR;
    for (const e of events) {
      const eEnd = e.type === 'clip' ? e.end : e.t + e.dur;
      if (eEnd <= t0 || e.t >= t1) continue;
      if (e.type === 'clip') {
        const c = A.clip, len = c.length;
        const cl = c.getChannelData(0), cr = c.numberOfChannels > 1 ? c.getChannelData(1) : cl;
        const fadeN = Math.round(0.03 * SR);
        const endS = Math.round(e.end * SR), firstS = Math.round(e.t * SR);
        for (let i = 0; i < n; i++) {
          const s = start + i;
          if (s < firstS || s >= endS) continue;
          let k = s - firstS;
          if (e.loop) k %= len; else if (k >= len) continue;
          let g = e.vol;
          if (endS - s < fadeN) g *= (endS - s) / fadeN;
          L[i] += cl[k] * g; R[i] += cr[k] * g;
        }
      } else if (e.type === 'tick') {
        const smp = sample(e.sound), first = Math.round(e.t * SR);
        const s0 = Math.max(0, first - start), s1 = Math.min(n, first + smp.length - start);
        for (let i = s0; i < s1; i++) { const v = smp[start + i - first] * e.vol; L[i] += v; R[i] += v; }
      } else {
        const s0 = Math.max(0, Math.round(e.t * SR) - start), s1 = Math.min(n, Math.round((e.t + e.dur) * SR) - start);
        for (let i = s0; i < s1; i++) {
          const tt = (start + i) / SR - e.t;
          const v = Math.sin(2 * Math.PI * e.f * tt) * Math.min(1, tt / 0.005, (e.dur - tt) / 0.03) * e.vol;
          L[i] += v; R[i] += v;
        }
      }
    }
    for (let i = 0; i < n; i++) {   // soft clip just in case
      if (L[i] > 1) L[i] = 1; else if (L[i] < -1) L[i] = -1;
      if (R[i] > 1) R[i] = 1; else if (R[i] < -1) R[i] = -1;
    }
    return [L, R];
  };
  A.hasAudio = S => A.events(S).length > 0;

  A.toPCM16 = function ([L, R]) {   // interleaved little-endian
    const out = new Uint8Array(L.length * 4), dv = new DataView(out.buffer);
    for (let i = 0; i < L.length; i++) {
      dv.setInt16(i * 4, Math.round(L[i] * 32767), true);
      dv.setInt16(i * 4 + 2, Math.round(R[i] * 32767), true);
    }
    return out;
  };
  A.wavHeader = function (frames) {
    const bytes = frames * 4, h = new DataView(new ArrayBuffer(44));
    const str = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); h.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
    str(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 2, true);
    h.setUint32(24, SR, true); h.setUint32(28, SR * 4, true); h.setUint16(32, 4, true); h.setUint16(34, 16, true);
    str(36, 'data'); h.setUint32(40, bytes, true);
    return new Uint8Array(h.buffer);
  };

  // ── LIVE PREVIEW
  let nodes = [], timer = null, base = 0, cursor = 0, events = [];
  A.previewStart = function (S, pos) {
    A.previewStop();
    const c = ctx();
    events = A.events(S);
    base = c.currentTime + 0.05 - pos;
    cursor = pos;
    // clips already running at the start position
    for (const e of events) if (e.type === 'clip' && e.t < pos && e.end > pos) schedule(e, pos);
    pump();
    timer = setInterval(pump, 200);
  };
  function pump() {
    const c = actx; if (!c) return;
    const now = c.currentTime - base, until = now + 1.2;
    for (const e of events) if (e.t >= cursor && e.t < until) schedule(e, e.t);
    cursor = Math.max(cursor, until);
  }
  function schedule(e, from) {
    const c = actx, when = base + from, out = c.destination;
    if (when < c.currentTime - 0.05) return;
    if (e.type === 'clip') {
      if (!A.clip) return;
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = A.clip; src.loop = e.loop; g.gain.value = e.vol;
      src.connect(g).connect(out);
      let off = from - e.t;
      if (e.loop) off %= A.clip.duration;
      src.start(Math.max(when, c.currentTime), off);
      src.stop(base + e.end);
      nodes.push(src);
      return;
    }
    const t = Math.max(when, c.currentTime);
    if (e.type === 'tick') { nodes.push(playSample(e.sound, e.vol, t)); return; }
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = e.f; o.connect(g).connect(out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.vol, t + 0.005);
    g.gain.setValueAtTime(e.vol, t + e.dur - 0.03); g.gain.linearRampToValueAtTime(0, t + e.dur);
    o.start(t); o.stop(t + e.dur + 0.01);
    nodes.push(o);
  }
  const BUFFERS = {};
  function playSample(kind, vol, t) {
    const c = ctx();
    if (!BUFFERS[kind]) {
      const smp = sample(kind), b = c.createBuffer(1, smp.length, SR);
      b.copyToChannel(smp, 0);
      BUFFERS[kind] = b;
    }
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = BUFFERS[kind]; g.gain.value = vol;
    src.connect(g).connect(c.destination);
    src.start(t);
    return src;
  }
  A.testTick = function (S) {
    const c = ctx(), kind = A.tickSoundFor(S), v = (S.beepVol | 0) / 100 * (kind === 'tick' ? 0.45 : 0.6);
    [0, 1, 2].forEach(i => playSample(kind, v, c.currentTime + 0.03 + i * 0.6));
  };
  A.previewStop = function () {
    clearInterval(timer); timer = null;
    nodes.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } });
    nodes = [];
  };
  A.testBeep = function (S) {
    const c = ctx(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + 0.02, v = (S.beepVol | 0) / 100 * 0.55;
    o.frequency.value = +S.beepFreq || 880; o.connect(g).connect(c.destination);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005);
    g.gain.setValueAtTime(v, t + 0.12); g.gain.linearRampToValueAtTime(0, t + 0.15);
    o.start(t); o.stop(t + 0.16);
  };
})(window.CDM);
