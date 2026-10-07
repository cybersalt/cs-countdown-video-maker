/* Presets: save / load named settings (with the sound clip) in this browser,
   export them to a .json file and import them again. Also remembers the last
   sound clip between visits. Storage is IndexedDB, so clips of a few MB fit. */
'use strict';

(function (CDM) {
  const $ = s => document.querySelector(s);
  const APP_ID = 'cs-countdown-video-maker';

  // ── STARTER PRESETS (built in, can't be deleted)
  const STARTERS = [
    { id: 'corner-badge', name: 'Corner badge — Starting soon', settings: { theme: 'badge', position: 'bottom-right', size: 35, label: 'STARTING SOON', bg: 'transparent', minutes: 5 } },
    { id: 'fullscreen-ring', name: 'Full-screen ring on black', settings: { theme: 'ring', position: 'center', size: 100, label: 'COUNTDOWN', bg: 'black', minutes: 5, endMessage: "TIME'S UP" } },
    { id: 'flip-sounds', name: 'Flip clock with flip sounds', settings: { theme: 'flip', position: 'center', size: 100, label: '', bg: 'transparent', minutes: 1, tick: true, tickMode: 'all', tickSound: 'auto' } },
    { id: 'lower-third', name: 'Lower-third progress bar — Back in', settings: { theme: 'bar', position: 'bottom-center', size: 45, label: 'BACK IN', bg: 'transparent', minutes: 10, beep: false, zeroBeep: false } },
  ];

  // ── INDEXEDDB
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('cdm-video-maker', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('presets', { keyPath: 'name' });
          r.result.createObjectStore('kv');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  }
  const getAll = () => tx('presets', 'readonly', s => s.getAll());
  const putPreset = p => tx('presets', 'readwrite', s => s.put(p));
  const delPreset = name => tx('presets', 'readwrite', s => s.delete(name));
  const kvGet = key => tx('kv', 'readonly', s => s.get(key));
  const kvSet = (key, val) => tx('kv', 'readwrite', s => s.put(val, key));
  const kvDel = key => tx('kv', 'readwrite', s => s.delete(key));

  function status(msg, cls) {
    const el = $('#presetStatus');
    el.textContent = msg; el.className = 'note ' + (cls || '');
  }
  const currentClip = () => CDM.audio.clipBytes ? { name: CDM.audio.clipName, bytes: CDM.audio.clipBytes } : null;

  async function setClip(clip) {
    try {
      if (clip && clip.bytes) await CDM.audio.loadClipBytes(clip.name, clip.bytes);
      else CDM.audio.clearClip();
    } catch (e) {
      CDM.audio.clearClip();
      status(`The saved sound clip couldn't be read: ${e.message}`, 'err');
    }
    rememberClip();
  }
  async function rememberClip() {
    try {
      const c = currentClip();
      if (c) await kvSet('lastClip', c); else await kvDel('lastClip');
    } catch (e) { /* storage unavailable — not critical */ }
  }
  document.addEventListener('cdm:clip', rememberClip);

  // ── PRESET LIST
  let userPresets = [];
  async function refreshList(selectValue) {
    try { userPresets = (await getAll()).sort((a, b) => a.name.localeCompare(b.name)); }
    catch (e) { userPresets = []; status('Saved presets are unavailable in this browser mode.', 'err'); }
    const sel = $('#presetSel');
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    sel.innerHTML = '<option value="">Choose a preset…</option>' +
      '<optgroup label="Starters">' + STARTERS.map(p => `<option value="starter:${p.id}">${esc(p.name)}</option>`).join('') + '</optgroup>' +
      (userPresets.length ? '<optgroup label="Your presets">' + userPresets.map(p => `<option value="user:${esc(p.name)}">${esc(p.name)}${p.clip ? ' ♪' : ''}</option>`).join('') + '</optgroup>' : '');
    sel.value = selectValue || '';
    updateButtons();
  }
  function selected() {
    const v = $('#presetSel').value;
    if (v.startsWith('user:')) return { kind: 'user', preset: userPresets.find(p => p.name === v.slice(5)) };
    if (v.startsWith('starter:')) return { kind: 'starter', preset: STARTERS.find(p => p.id === v.slice(8)) };
    return { kind: null };
  }
  function updateButtons() {
    $('#btnPresetDelete').disabled = selected().kind !== 'user';
    $('#btnPresetExportAll').hidden = !userPresets.length;
  }

  $('#presetSel').addEventListener('change', async () => {
    const s = selected();
    updateButtons();
    if (!s.preset) return;
    if (s.kind === 'starter') {
      CDM.app.applySettings({ ...CDM.DEFAULTS, ...s.preset.settings });
      status(`Loaded “${s.preset.name}”.`);
    } else {
      CDM.app.applySettings(s.preset.settings);
      await setClip(s.preset.clip);
      CDM.app.refresh();
      status(`Loaded “${s.preset.name}”${s.preset.clip ? ' with its sound clip' : ''}.`);
    }
  });

  $('#btnPresetSave').addEventListener('click', async () => {
    const s = selected();
    const name = (prompt('Name for this preset:', s.kind === 'user' ? s.preset.name : '') || '').trim();
    if (!name) return;
    if (userPresets.some(p => p.name === name) && !confirm(`Replace the existing preset “${name}”?`)) return;
    try {
      await putPreset({ name, settings: { ...CDM.app.settings }, clip: currentClip(), saved: Date.now() });
      await refreshList('user:' + name);
      status(`Saved “${name}”${currentClip() ? ' (with the sound clip)' : ''}.`, 'ok');
    } catch (e) {
      status(`Couldn't save the preset: ${e.message}`, 'err');
    }
  });

  $('#btnPresetDelete').addEventListener('click', async () => {
    const s = selected();
    if (s.kind !== 'user' || !confirm(`Delete the preset “${s.preset.name}”?`)) return;
    await delPreset(s.preset.name);
    await refreshList();
    status(`Deleted “${s.preset.name}”.`);
  });

  // ── FILE EXPORT / IMPORT
  function toB64(buf) {
    const b = new Uint8Array(buf); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(str) {
    const s = atob(str), b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b.buffer;
  }
  const packClip = c => c ? { name: c.name, data: toB64(c.bytes) } : null;
  const unpackClip = c => c && typeof c.data === 'string' ? { name: String(c.name || 'clip'), bytes: fromB64(c.data) } : null;
  const fileSafe = s => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'countdown';

  function downloadJSON(obj, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  $('#btnPresetExport').addEventListener('click', () => {
    const s = selected();
    const name = s.kind === 'user' ? s.preset.name : (s.kind === 'starter' ? s.preset.name : 'Countdown settings');
    downloadJSON({ app: APP_ID, type: 'preset', version: 1, name, settings: { ...CDM.app.settings }, clip: packClip(currentClip()) },
      `countdown-preset-${fileSafe(name)}.json`);
    status(`Exported the current settings${currentClip() ? ' and sound clip' : ''}.`, 'ok');
  });

  $('#btnPresetExportAll').addEventListener('click', () => {
    downloadJSON({
      app: APP_ID, type: 'presets', version: 1,
      presets: userPresets.map(p => ({ name: p.name, settings: p.settings, clip: packClip(p.clip) })),
    }, 'countdown-presets.json');
    status(`Exported ${userPresets.length} preset${userPresets.length === 1 ? '' : 's'}.`, 'ok');
  });

  $('#presetImport').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.app !== APP_ID) throw new Error("this isn't a Countdown Video Maker settings file");
      const list = data.type === 'presets' ? (data.presets || []) : [data];
      let n = 0, last = null;
      for (const p of list) {
        if (!p || typeof p.settings !== 'object') continue;
        let name = String(p.name || f.name.replace(/\.json$/i, '')).trim().slice(0, 80) || 'Imported';
        if (userPresets.some(u => u.name === name) && !confirm(`A preset called “${name}” already exists. Replace it?`)) {
          name += ' (imported)';
        }
        await putPreset({ name, settings: p.settings, clip: unpackClip(p.clip), saved: Date.now() });
        n++; last = name;
      }
      if (!n) throw new Error('no presets found in the file');
      await refreshList(n === 1 ? 'user:' + last : '');
      if (n === 1) {
        $('#presetSel').dispatchEvent(new Event('change'));   // apply it straight away
        status(`Imported and loaded “${last}”.`, 'ok');
      } else {
        status(`Imported ${n} presets — pick one from the list.`, 'ok');
      }
    } catch (err) {
      status(`Couldn't import ${f.name}: ${err.message}.`, 'err');
    }
  });

  // ── START: list presets, restore the last sound clip
  refreshList();
  kvGet('lastClip').then(async c => {
    if (c && c.bytes && !CDM.audio.clip) {
      try { await CDM.audio.loadClipBytes(c.name, c.bytes); CDM.app.refresh(); } catch (e) { /* ignore */ }
    }
  }).catch(() => { /* storage unavailable */ });
})(window.CDM);
