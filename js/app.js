/* App: settings UI, live preview, theme thumbnails, export button. */
'use strict';

(function (CDM) {
  const LS_KEY = 'cdm-settings-v2';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  // ── SETTINGS (remembered in this browser only)
  let S = { ...CDM.DEFAULTS };
  try { Object.assign(S, JSON.parse(localStorage.getItem(LS_KEY)) || {}); } catch (e) { /* storage unavailable */ }
  if (!CDM.themes.some(t => t.id === S.theme)) S.theme = CDM.DEFAULTS.theme;
  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

  const INT_KEYS = { hours: [0, 99], minutes: [0, 59], seconds: [0, 59], warnSecs: [1, 3600], beepSecs: [1, 60], tickSecs: [1, 3600] };
  const NOT_VISUAL = new Set(['tick', 'tickMode', 'tickSecs', 'tickSound', 'beep', 'beepSecs', 'zeroBeep', 'beepFreq', 'beepVol', 'clipMode', 'clipVol', 'exportFormat', 'compact']);
  const NO_THUMBS = new Set(['position', 'size', 'margin', 'endHold', 'endMessage', 'endFlash', ...NOT_VISUAL]);

  // ── PREVIEW
  const canvas = $('#preview'), ctx = canvas.getContext('2d');
  let pos = 0, playing = false, playFrom = 0, playStart = 0, dirty = true;
  const lastFrameT = () => (CDM.frameCount(S) - 1) / CDM.FPS;
  const videoLen = () => CDM.videoSeconds(S);

  function frame(now) {
    requestAnimationFrame(frame);
    if (playing) {
      pos = playFrom + (now - playStart) / 1000;
      if (pos >= videoLen()) { pos = videoLen(); pause(); }
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    CDM.render(ctx, Math.min(pos, lastFrameT()), S);
    const len = videoLen();
    $('#scrub').value = len ? Math.round(pos / len * 1000) : 0;
    $('#clock').textContent = `${fmtClock(pos)} / ${fmtClock(len)}`;
  }
  const fmtClock = s => {
    s = Math.floor(s + 1e-6);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  function play() {
    if (pos >= videoLen() - 0.02) pos = 0;
    playing = true; playFrom = pos; playStart = performance.now();
    CDM.audio.previewStart(S, pos);
    $('#btnPlay').textContent = '❚❚';
  }
  function pause() {
    playing = false;
    CDM.audio.previewStop();
    $('#btnPlay').textContent = '▶';
    dirty = true;
  }
  function seek(p, autoplay) {
    pos = Math.max(0, Math.min(videoLen(), p));
    dirty = true;
    if (playing || autoplay) play();
  }
  $('#btnPlay').onclick = () => playing ? pause() : play();
  $('#btnRestart').onclick = () => seek(0);
  $('#btnLast').onclick = () => seek(CDM.totalSeconds(S) - 15, true);
  $('#scrub').oninput = e => seek(e.target.value / 1000 * videoLen());
  document.addEventListener('keydown', e => {
    if (e.target.matches('input[type=text], input[type=number], select')) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === 'Home') { e.preventDefault(); seek(0); }
    else if (e.key === 'e' || e.key === 'E') seek(CDM.totalSeconds(S) - 5, true);
  });

  // ── THEME THUMBNAILS
  const thumbBig = document.createElement('canvas');
  thumbBig.width = CDM.W; thumbBig.height = CDM.H;
  const thumbCtx = thumbBig.getContext('2d');
  const themeBox = $('#themes');
  CDM.themes.forEach(t => {
    const b = document.createElement('button');
    b.dataset.v = t.id;
    b.innerHTML = `<canvas width="320" height="180"></canvas><span>${t.name}</span>`;
    b.onclick = () => set('theme', t.id);
    themeBox.appendChild(b);
  });
  let thumbTimer = null;
  function drawThumbs() {
    const T = CDM.totalSeconds(S);
    const sample = Math.floor(T * 0.38);
    $$('#themes button').forEach(b => {
      const tS = { ...S, theme: b.dataset.v, position: 'center', size: 100, margin: 40, shadow: false };
      CDM.render(thumbCtx, sample, tS);
      const c = b.querySelector('canvas').getContext('2d');
      c.fillStyle = S.bg === 'transparent' ? '#26272b' : '#000';
      c.fillRect(0, 0, 320, 180);
      c.drawImage(thumbBig, 0, 0, 320, 180);
    });
  }
  const scheduleThumbs = () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, 120); };

  // ── BINDINGS
  function set(k, v) {
    if (k in INT_KEYS) {
      const [lo, hi] = INT_KEYS[k];
      v = Math.max(lo, Math.min(hi, parseInt(v, 10) || 0));
    } else if (typeof CDM.DEFAULTS[k] === 'number') v = parseFloat(v) || 0;
    S[k] = v;
    changed(k);
  }
  function changed(k) {
    save();
    if (k === 'theme') buildColors();
    syncUI(k);
    if (!NOT_VISUAL.has(k)) dirty = true;
    if (!NO_THUMBS.has(k)) scheduleThumbs();
    if (pos > videoLen()) pos = videoLen();
    if (playing) CDM.audio.previewStart(S, pos);
    updateInfo();
  }

  // inputs, selects, checkboxes
  $$('input[data-k], select[data-k]').forEach(el => {
    const k = el.dataset.k;
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => set(k, el.type === 'checkbox' ? el.checked : el.value));
    if (el.type === 'number') el.addEventListener('blur', () => syncUI());
  });
  // button groups
  $$('.seg[data-k], .swatches[data-k], .formats[data-k]').forEach(g => {
    g.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (b) set(g.dataset.k, b.dataset.v);
    });
  });
  $('.sw-custom input').addEventListener('input', () => set('bg', 'custom'));
  // quick-pick chips for text fields
  $$('.chips[data-for]').forEach(g => {
    g.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (b) set(g.dataset.for, b.dataset.v);
    });
  });
  // position grid — moving to a corner shrinks a full-size timer automatically
  $('#posgrid').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    const toCenter = b.dataset.v === 'center';
    if (!toCenter && S.size >= 90) S.size = 35;
    if (toCenter && S.position !== 'center' && S.size <= 40) S.size = 100;
    set('position', b.dataset.v);
  });

  $('#btnResetColors').onclick = () => {
    ['accent', 'text', 'panel', 'warn', 'labelColor', 'border', 'track'].forEach(k => { S[k] = CDM.DEFAULTS[k]; });
    changed('accent');
  };

  // ── PER-THEME COLOURS
  // Each theme lists the colour roles it uses and what to call them (theme.colors).
  // border / track / label can be "auto" ('' in settings) = the theme's own default.
  const ROLE_KEY = { accent: 'accent', text: 'text', panel: 'panel', border: 'border', track: 'track', label: 'labelColor' };
  const AUTO_KEYS = new Set(['border', 'track', 'labelColor']);
  function autoShown(k) {   // what to show in an "auto" swatch
    if (k === 'labelColor') return S.theme === 'neon' ? S.text : S.accent;
    if (k === 'border') return S.theme === 'neon' ? S.text : S.accent;
    return S.text;
  }
  function buildColors() {
    const theme = CDM.themeById(S.theme);
    const roles = Object.entries(theme.colors || { accent: 'Accent', text: 'Numbers', label: 'Label' });
    roles.push(['warn', 'Warning']);
    const box = $('#colors');
    box.innerHTML = '';
    for (const [role, name] of roles) {
      const k = role === 'warn' ? 'warn' : ROLE_KEY[role];
      const lab = document.createElement('label');
      lab.innerHTML = `<span class="cswatch"><input type="color" data-c="${k}"></span><span>${name}</span>`;
      const sw = lab.querySelector('.cswatch'), inp = lab.querySelector('input');
      if (AUTO_KEYS.has(k)) {
        sw.insertAdjacentHTML('beforeend', '<i class="auto">AUTO</i><button class="clr" title="Back to automatic">×</button>');
        sw.querySelector('.clr').addEventListener('click', e => { e.preventDefault(); set(k, ''); });
      }
      inp.addEventListener('input', () => set(k, inp.value));
      box.appendChild(lab);
    }
    $('#colorsFor').textContent = `${theme.name} colours`;
    syncColors();
  }
  function syncColors() {
    $$('#colors input[data-c]').forEach(inp => {
      const k = inp.dataset.c, auto = AUTO_KEYS.has(k) && !S[k];
      const v = auto ? autoShown(k) : S[k];
      if (inp.value !== v) inp.value = v;
      const sw = inp.parentElement;
      const a = sw.querySelector('.auto'), x = sw.querySelector('.clr');
      if (a) a.hidden = !auto;
      if (x) x.hidden = auto;
    });
  }
  $('#btnTestBeep').onclick = () => CDM.audio.testBeep(S);
  $('#btnTestTick').onclick = () => CDM.audio.testTick(S);

  // sound clip
  $('#clipFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await CDM.audio.loadClip(f);
      if (S.clipMode === 'off') S.clipMode = 'atZero';
      changed('clipMode');
      document.dispatchEvent(new CustomEvent('cdm:clip'));
    } catch (err) {
      setStatus(`Couldn't read that sound file: ${err.message}`, 'err');
    }
    e.target.value = '';
  });
  $('#btnClearClip').onclick = () => { CDM.audio.clearClip(); changed('clipMode'); document.dispatchEvent(new CustomEvent('cdm:clip')); };

  // Replace all settings (presets / imported files). Unknown keys and wrong types are ignored.
  function applySettings(obj) {
    const clean = { ...CDM.DEFAULTS };
    for (const k in CDM.DEFAULTS) {
      if (obj && k in obj && typeof obj[k] === typeof CDM.DEFAULTS[k]) clean[k] = obj[k];
    }
    if (!CDM.themes.some(t => t.id === clean.theme)) clean.theme = CDM.DEFAULTS.theme;
    if (playing) pause();
    pos = 0;
    Object.keys(S).forEach(k => delete S[k]);
    Object.assign(S, clean);
    save();
    buildColors();
    refresh();
    scheduleThumbs();
  }
  function refresh() { syncUI(); updateInfo(); dirty = true; }

  const BG_NAMES = { transparent: 'Transparent', black: 'Black', green: 'Green screen', blue: 'Blue screen', white: 'White', custom: 'Custom colour' };
  const OUT_FMT = { size: v => v + '%', margin: v => v + ' px', beepFreq: v => v + ' Hz', beepVol: v => v + '%', clipVol: v => v + '%' };

  function syncUI(skipKey) {
    $$('input[data-k], select[data-k]').forEach(el => {
      const k = el.dataset.k;
      if (k === skipKey && el === document.activeElement && el.type !== 'range') return;   // don't fight the user's typing
      if (el.type === 'checkbox') el.checked = !!S[k];
      else if (el.value !== String(S[k])) el.value = S[k];
    });
    $$('.seg[data-k], .swatches[data-k], .formats[data-k]').forEach(g => {
      g.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === String(S[g.dataset.k])));
    });
    $$('.chips[data-for]').forEach(g => {
      g.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === String(S[g.dataset.for])));
    });
    $$('#posgrid button').forEach(b => b.classList.toggle('on', b.dataset.v === S.position));
    $$('#themes button').forEach(b => b.classList.toggle('on', b.dataset.v === S.theme));
    $$('output[data-out]').forEach(o => { const k = o.dataset.out; o.textContent = (OUT_FMT[k] || (v => v))(S[k]); });
    syncColors();
    $('#tickLast').hidden = S.tickMode !== 'last';
    $('#screen').classList.toggle('alpha', S.bg === 'transparent');
    $('#bgname').textContent = BG_NAMES[S.bg] || '';
    const clip = CDM.audio.clip;
    $('#clipName').textContent = clip ? `${CDM.audio.clipName} (${clip.duration.toFixed(1)} s)` : 'No clip';
    $('#btnClearClip').hidden = !clip;
  }

  function updateInfo() {
    const T = CDM.totalSeconds(S), N = CDM.frameCount(S), f = S.exportFormat;
    const parts = [`Length ${fmtClock(videoLen())}`, `${N.toLocaleString()} frames`];
    if (CDM.audio.hasAudio(S)) parts.push('with sound');
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const fname = f === 'png-seq' ? CDM.exportName(S, 'x').replace(/\.x$/, '') + '/' : CDM.exportName(S, { 'mov-png': 'mov', mp4: 'mp4', wav: 'wav' }[f]);
    let html = `Saves as <b>${esc(fname)}</b><br>` + parts.join(' · ');
    if (!T) html = '<span class="warn">Set a time first.</span>';
    else if (f === 'mp4' && S.bg === 'transparent') html += '<br><span class="warn">MP4 can\'t be transparent — the background will be black. Use MOV for transparency.</span>';
    else if ((f === 'mov-png' || f === 'png-seq') && S.bg !== 'transparent') html += `<br><span class="warn">Background is ${BG_NAMES[S.bg].toLowerCase()} — pick the checkered swatch for a transparent overlay.</span>`;
    else if (f === 'wav' && !CDM.audio.hasAudio(S)) html += '<br><span class="warn">No sound is turned on.</span>';
    if (T && f === 'png-seq') html += '<br><span class="warn">Tip: save to a folder that OneDrive / Dropbox doesn\'t sync (e.g. on another drive). Sync tools grab each new frame as it\'s written, which slows the export down.</span>';
    $('#xinfo').innerHTML = html + '<span id="xest"></span>';
    $('#compactRow').hidden = f !== 'mov-png';
    clearTimeout(estTimer);
    if (T && (f === 'mov-png' || f === 'png-seq')) estTimer = setTimeout(estimate, 400);
  }

  // File-size estimate for the PNG-based formats (they vary a lot by theme/size).
  let estTimer = null, estSeq = 0;
  async function estimate() {
    const seq = ++estSeq, f = S.exportFormat;
    const e = await CDM.estimateExport({ ...S });
    if (seq !== estSeq || !$('#xest')) return;
    const bytes = f === 'mov-png' ? e.movBytes : e.seqBytes;
    const secs = Math.max(1, Math.round(e.unique * 0.06 + e.N * 0.0015));
    let html = `<br>About ${fmtBytes(bytes)} · ${e.unique.toLocaleString()} distinct frames · roughly ${fmtClock(secs)} to export`;
    if (e.unique > e.N * 0.3 && e.N > 900) {
      html += '<br><span class="warn">Most frames are different (smooth motion or animation), so this will be a big file. ' +
        'Untick “Smooth motion”, pick a smaller size, or use MP4 if you don\'t need transparency.</span>';
    }
    $('#xest').innerHTML = html;
  }
  const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';

  // ── EXPORT
  let exporting = false, cancelFlag = false;
  function setStatus(msg, cls) { const el = $('#xstatus'); el.textContent = msg; el.className = 'xstatus ' + (cls || ''); }

  $('#btnExport').onclick = async () => {
    if (exporting) return;
    if (!CDM.totalSeconds(S)) { setStatus('Set a time first.', 'err'); return; }
    const snap = { ...S }, format = snap.exportFormat;
    if (format === 'wav' && !CDM.audio.hasAudio(snap)) { setStatus('Turn on beeps/ticks or add a sound clip first.', 'err'); return; }
    if (playing) pause();
    let dest;
    try {
      dest = await CDM.pickDestination(snap, format);
    } catch (e) {
      if (e.name !== 'AbortError') setStatus(e.message, 'err');
      return;
    }
    exporting = true; cancelFlag = false;
    $('#btnExport').disabled = true; $('#btnCancel').hidden = false; $('#xprog').hidden = false;
    setStatus('Rendering…');
    const t0 = performance.now();
    try {
      const name = await CDM.runExport({
        S: snap, format, dest,
        cancelled: () => cancelFlag,
        onProgress: (frac, text) => { $('#xfill').style.width = (frac * 100).toFixed(1) + '%'; $('#xtxt').textContent = text; },
      });
      setStatus(`✓ Saved ${name} in ${((performance.now() - t0) / 1000).toFixed(1)} s`, 'ok');
    } catch (e) {
      if (e.name === 'AbortError') setStatus('Export cancelled.');
      else { console.error(e); setStatus('Export failed: ' + (e.message || e), 'err'); }
    } finally {
      exporting = false;
      $('#btnExport').disabled = false; $('#btnCancel').hidden = true; $('#xprog').hidden = true;
      $('#xfill').style.width = '0';
    }
  };
  $('#btnCancel').onclick = () => { cancelFlag = true; };

  // Editor how-tos: only one open at a time (also done natively by <details name>, this covers older browsers).
  $$('.howto details').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) $$('.howto details').forEach(o => { if (o !== d) o.open = false; });
  }));

  // ── START
  buildColors();
  syncUI();
  updateInfo();
  CDM.loadFonts().then(() => { dirty = true; drawThumbs(); });
  drawThumbs();
  requestAnimationFrame(frame);
  CDM.app = { get settings() { return S; }, seek, play, pause, applySettings, refresh, setStatus };
})(window.CDM);
