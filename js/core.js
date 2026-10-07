/* CS Countdown Video Maker — core: namespace, settings, time model, helpers.
   Everything is a pure function of (time, settings), so the preview and the
   exporter render exactly the same frames. */
'use strict';

window.CDM = window.CDM || {};
(function (CDM) {
  CDM.W = 1920;
  CDM.H = 1080;
  CDM.FPS = 30;
  CDM.themes = [];

  CDM.registerTheme = function (theme) { CDM.themes.push(theme); };
  CDM.themeById = function (id) { return CDM.themes.find(t => t.id === id) || CDM.themes[0]; };

  // ── SETTINGS
  CDM.DEFAULTS = {
    hours: 0, minutes: 5, seconds: 0,
    direction: 'down',          // 'down' | 'up'
    format: 'auto',             // 'auto' | 'm:ss' | 'mm:ss' | 'h:mm:ss' | 'hh:mm:ss' | 'ss'
    theme: 'ring',
    label: 'COUNTDOWN',         // empty = time only
    endHold: 3,                 // seconds to hold after zero
    endMessage: '',             // shown during the hold (empty = keep showing 0:00)
    endFlash: false,            // blink during the hold
    position: 'center',         // center | bottom-right | bottom-left | top-right | top-left | bottom-center | top-center
    size: 100,                  // % of the largest size that fits
    margin: 60,                 // px from the frame edge for corner placements
    bg: 'transparent',          // transparent | black | green | blue | white | custom
    bgCustom: '#202020',
    accent: '#ff4500',
    text: '#ffffff',
    panel: '#161616',
    warn: '#ff2020',
    labelColor: '',             // '' = automatic (follows the theme's default)
    border: '',                 // frames / outlines / rims; '' = automatic
    track: '',                  // unfilled part of rings, bars, unlit LEDs; '' = automatic
    warnOn: true,
    warnSecs: 10,
    glow: true,
    shadow: true,
    smooth: false,              // continuous rings/bars; makes every frame unique (big transparent files)
    tick: false,
    tickMode: 'all',            // 'all' = every second | 'last' = only the last tickSecs seconds
    tickSecs: 5,
    tickSound: 'auto',          // auto (flip sound for the Flip clock, tick otherwise) | tick | flip | click
    beep: true,
    beepSecs: 5,
    zeroBeep: true,
    beepFreq: 880,
    beepVol: 60,
    clipMode: 'off',            // off | start | endAtZero | atZero | loop
    clipVol: 80,
    exportFormat: 'mov-png',    // mov-png | mp4 | png-seq | wav
    compact: true,              // MOV: store repeated frames once (see Muxer.addVideoRef)
  };

  CDM.BACKGROUNDS = {
    transparent: null,
    black: '#000000',
    green: '#00b140',
    blue: '#0047bb',
    white: '#ffffff',
  };

  CDM.totalSeconds = S => Math.max(0, (S.hours | 0) * 3600 + (S.minutes | 0) * 60 + (S.seconds | 0));
  // Countdown frames + hold frames. Always at least one frame at zero, so the
  // clip never ends on 0:01 when the hold is 0.
  CDM.frameCount = S => Math.round(CDM.totalSeconds(S) * CDM.FPS) + Math.max(1, Math.round((+S.endHold || 0) * CDM.FPS));
  CDM.videoSeconds = S => CDM.frameCount(S) / CDM.FPS;

  CDM.bgColor = S => S.bg === 'custom' ? S.bgCustom : CDM.BACKGROUNDS[S.bg];

  // ── FORMATTING
  const p2 = n => String(n).padStart(2, '0');
  CDM.formatTime = function (secs, format, totalSecs) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    let f = format;
    if (f === 'auto') f = totalSecs >= 3600 ? 'h:mm:ss' : 'm:ss';
    switch (f) {
      case 'ss': return String(secs);
      case 'mm:ss': return `${p2(Math.floor(secs / 60))}:${p2(s)}`;
      case 'h:mm:ss': return `${h}:${p2(m)}:${p2(s)}`;
      case 'hh:mm:ss': return `${p2(h)}:${p2(m)}:${p2(s)}`;
      default: return `${Math.floor(secs / 60)}:${p2(s)}`;   // m:ss
    }
  };

  // ── TIME MODEL
  // Returns everything a theme needs to draw the frame at video time t (seconds).
  CDM.modelAt = function (t, S) {
    const T = CDM.totalSeconds(S);
    const down = S.direction !== 'up';
    const finished = t >= T;
    let value, since, progress, prevValue;
    if (down) {
      const rem = Math.max(0, T - t);
      value = Math.ceil(rem - 1e-9);
      since = finished ? t - T : value - rem;
      prevValue = value + 1;
      progress = T > 0 ? (S.smooth ? rem : value) / T : 0;     // fraction remaining
    } else {
      const el = Math.min(T, t);
      value = Math.floor(el + 1e-9);
      since = finished ? t - T : el - value;
      prevValue = value - 1;
      progress = T > 0 ? (S.smooth ? el : value) / T : 0;      // fraction elapsed
    }
    // No flip/transition into the very first value shown.
    const animating = t >= 1 && !(finished && t - T >= 1);
    // Time until the display next changes, and what it changes to. Animated themes
    // (the flip clock) run their transition *before* the change so the new number
    // lands exactly on the second — where the beeps and ticks are.
    const untilNext = finished ? Infinity : 1 - since;
    const nextValue = down ? value - 1 : value + 1;

    const remainingSecs = down ? value : T - value;
    const urgent = S.warnOn && !finished && T > 0 && remainingSecs <= (S.warnSecs | 0) && remainingSecs > 0;
    const zeroUrgent = S.warnOn && finished;

    const holding = finished;
    const showMessage = holding && !!(S.endMessage || '').trim();
    const flashOff = holding && S.endFlash && Math.floor((t - T) * 2) % 2 === 1;

    const bg = CDM.bgColor(S);
    const dark = bg ? CDM.luma(bg) < 0.5 : true;
    const acc = urgent || zeroUrgent ? S.warn : S.accent;

    return {
      t, T, down, value, prevValue, since, animating, progress,
      smooth: !!S.smooth,
      text: CDM.formatTime(value, S.format, T),
      prevText: CDM.formatTime(Math.max(0, prevValue), S.format, T),
      untilNext,
      nextText: CDM.formatTime(Math.max(0, nextValue), S.format, T),
      label: (S.label || '').trim(),
      message: showMessage ? S.endMessage.trim() : '',
      finished, holding, urgent: urgent || zeroUrgent, flashOff,
      glow: !!S.glow,
      // border / track are null when automatic — each theme picks its own default.
      c: {
        acc, fg: S.text, panel: S.panel, warn: S.warn, bg, dark,
        label: S.labelColor || acc, labelAuto: !S.labelColor,
        border: S.border || null,
        track: S.track || null,
        dim: CDM.rgba(S.text, 0.12),
        faint: CDM.rgba(S.text, 0.05),
      },
    };
  };

  // ── COLOR HELPERS
  CDM.hexRgb = function (hex) {
    if (!hex || hex[0] !== '#') return [128, 128, 128];
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  };
  CDM.rgba = (hex, a) => { const [r, g, b] = CDM.hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  CDM.luma = hex => { const [r, g, b] = CDM.hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  CDM.shade = function (hex, f) {   // f < 1 darkens, f > 1 lightens
    const [r, g, b] = CDM.hexRgb(hex).map(v => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))));
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  };

  // ── DRAWING HELPERS (shared by themes)
  CDM.fitFont = function (ctx, text, font, maxW, maxPx) {
    ctx.font = `${maxPx}px ${font}`;
    const w = ctx.measureText(text).width;
    return w > maxW ? Math.floor(maxPx * maxW / w) : maxPx;
  };

  CDM.glow = function (ctx, m, color, blur) {
    if (m.glow) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  };
  CDM.noGlow = ctx => { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; };

  // Draw the label (e.g. "COUNTDOWN") with letter spacing, centred at x,y.
  CDM.drawLabel = function (ctx, m, x, y, px, color, font) {
    if (!m.label) return;
    ctx.save();
    ctx.font = `${px}px ${font || "'Share Tech Mono', monospace"}`;
    ctx.letterSpacing = `${Math.round(px * 0.18)}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || m.c.label;
    // letterSpacing adds trailing space after the last glyph; nudge to re-centre.
    ctx.fillText(m.label.toUpperCase(), x + px * 0.09, y);
    ctx.restore();
  };

  // Default end-of-countdown message renderer, used when a theme has no drawMessage().
  CDM.drawMessageDefault = function (ctx, m, box, font) {
    ctx.save();
    const px = CDM.fitFont(ctx, m.message, font || "'Bebas Neue', sans-serif", box.w * 0.9, box.h * 0.45);
    ctx.font = `${px}px ${font || "'Bebas Neue', sans-serif"}`;
    ctx.fillStyle = m.c.fg;
    CDM.glow(ctx, m, m.c.acc, 30);
    CDM.fillCentered(ctx, m.message, 0, 0);
    ctx.restore();
  };

  CDM.roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
})(window.CDM);
