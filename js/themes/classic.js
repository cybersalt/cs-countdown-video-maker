/* The four original themes: Ring, Radio (7-segment), Watch, Minimal.
   Theme contract:
     id, name, font             — font used for the default end-message renderer
     box(m, S) → {w, h}         — size of the drawing, centred on (0,0)
     draw(ctx, m, box, S)       — draw the time
     drawMessage(ctx, m, box)   — optional, draw the end message
     motion(m, S)               — optional, see CDM.frameKey (true = every frame differs)
     colors: { role: 'Label' }  — which colour roles the theme uses, and what to call them
                                  in the UI (roles: accent, text, panel, border, track, label).
                                  m.c.border / m.c.track are null when on "auto". */
'use strict';

(function (CDM) {
  const BEBAS = "'Bebas Neue', sans-serif";
  const MONO = "'Share Tech Mono', monospace";
  const TAU = Math.PI * 2;

  // ── RING
  CDM.registerTheme({
    id: 'ring', name: 'Ring', font: BEBAS,
    colors: { accent: 'Ring', track: 'Track & ticks', text: 'Numbers', label: 'Label' },
    box: () => ({ w: 900, h: 900 }),
    motion: m => m.smooth && !m.finished,
    draw(ctx, m) {
      const r = 370, lw = 46;
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * TAU - Math.PI / 2, big = i % 5 === 0, d = big ? 34 : 16;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - d), Math.sin(a) * (r - d));
        ctx.lineTo(Math.cos(a) * (r + d), Math.sin(a) * (r + d));
        ctx.strokeStyle = m.c.track || m.c.dim; ctx.lineWidth = big ? 2.5 : 1.2; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.strokeStyle = m.c.track || m.c.faint; ctx.lineWidth = lw; ctx.stroke();
      if (m.progress > 0) {
        ctx.save();
        CDM.glow(ctx, m, m.c.acc, 50);
        ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + TAU * m.progress);
        ctx.strokeStyle = m.c.acc; ctx.lineWidth = lw; ctx.lineCap = 'butt'; ctx.stroke();
        ctx.restore();
      }
      const px = CDM.fitTabular(ctx, m.fitText, BEBAS, 560, 290);
      ctx.font = `${px}px ${BEBAS}`; ctx.fillStyle = m.c.fg;
      CDM.fillTabularCentered(ctx, m.text, 0, 0);
      CDM.drawLabel(ctx, m, 0, 190, 44);
    },
  });

  // ── RADIO (7-segment LED clock radio)
  const R_DH = 222;
  function radioDims(text, m) {
    const L = CDM.seg7Layout(text, R_DH);
    const pw = Math.max(760, L.w + 180), ph = 290;
    const cw = pw + 200, ch = m.label ? 500 : 420;
    return { L, pw, ph, cw, ch };
  }
  function radioBody(ctx, m, d) {
    const { pw, ph, cw, ch } = d, x = -cw / 2, y = -ch / 2;
    const g = ctx.createLinearGradient(0, y, 0, y + ch);
    g.addColorStop(0, CDM.shade(m.c.panel, 1.18)); g.addColorStop(0.5, m.c.panel); g.addColorStop(1, CDM.shade(m.c.panel, 0.55));
    ctx.fillStyle = g; CDM.roundRect(ctx, x, y, cw, ch, 30); ctx.fill();
    ctx.strokeStyle = m.c.border || CDM.shade(m.c.panel, 1.4); ctx.lineWidth = m.c.border ? 8 : 2; ctx.stroke();
    const py = (m.label ? -40 : 0) - ph / 2;
    ctx.fillStyle = '#060606'; CDM.roundRect(ctx, -pw / 2, py, pw, ph, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
    if (m.glow) {
      ctx.save(); ctx.globalAlpha = 0.09; ctx.filter = 'blur(28px)';
      ctx.fillStyle = m.c.acc; ctx.fillRect(-pw / 2 + 60, py + 30, pw - 120, ph - 60); ctx.restore();
    }
    return py;
  }
  CDM.registerTheme({
    id: 'radio', name: 'Radio', font: MONO,
    colors: { accent: 'LED digits', track: 'Unlit segments', panel: 'Body', border: 'Bezel', label: 'Label' },
    box(m) { const d = radioDims(m.fitText, m); return { w: d.cw + 20, h: d.ch + 20 }; },
    draw(ctx, m) {
      const d = radioDims(m.fitText, m);
      const py = radioBody(ctx, m, d);
      // padText keeps a dark (unlit) digit where 10:00 becomes 9:59, like a real clock radio
      CDM.drawSeg7(ctx, m.padText, 0, py + d.ph / 2, R_DH, m.c.acc, m.c.track || CDM.rgba(m.c.acc, 0.1), m);
      if (m.label) {
        ctx.save(); CDM.glow(ctx, m, m.c.label, 12);
        CDM.drawLabel(ctx, m, 0, py + d.ph + 62, 34);
        ctx.restore();
      }
    },
    drawMessage(ctx, m) {
      const d = radioDims(m.fitText, m);
      const py = radioBody(ctx, m, d);
      const px = CDM.fitFont(ctx, m.message.toUpperCase(), MONO, d.pw - 80, 170);
      ctx.save();
      ctx.font = `${px}px ${MONO}`;
      ctx.fillStyle = m.c.acc; CDM.glow(ctx, m, m.c.acc, 24);
      CDM.fillCentered(ctx, m.message.toUpperCase(), 0, py + d.ph / 2);
      ctx.restore();
    },
  });

  // ── WATCH (analog stopwatch)
  const WR = 410;
  CDM.registerTheme({
    id: 'watch', name: 'Stopwatch', font: BEBAS,
    colors: { accent: 'Hand & progress', track: 'Progress track', text: 'Numbers', panel: 'Face', border: 'Case', label: 'Label' },
    box: () => ({ w: 2 * WR + 80, h: 2 * WR + 40 }),
    motion: m => m.smooth && !m.finished,
    draw(ctx, m) {
      const R = WR, fR = R * 0.905, face = m.c.panel, light = CDM.luma(face) > 0.5;
      const metal = m.c.border || '#666666';
      // crown + case
      ctx.fillStyle = CDM.shade(metal, 1.15); CDM.roundRect(ctx, R - 10, -24, 32, 48, 7); ctx.fill();
      ctx.fillStyle = CDM.shade(metal, 1.3); CDM.roundRect(ctx, -22, -R - 34, 44, 40, 6); ctx.fill();
      const cg = ctx.createRadialGradient(-R * 0.35, -R * 0.35, 0, 0, 0, R * 1.05);
      cg.addColorStop(0, CDM.shade(metal, 1.5)); cg.addColorStop(0.25, metal); cg.addColorStop(0.6, CDM.shade(metal, 0.57)); cg.addColorStop(1, CDM.shade(metal, 0.24));
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke();
      // face
      const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, fR);
      fg.addColorStop(0, CDM.shade(face, 1.07)); fg.addColorStop(1, CDM.shade(face, 0.92));
      ctx.beginPath(); ctx.arc(0, 0, fR, 0, TAU); ctx.fillStyle = fg; ctx.fill();
      // progress track
      const arcR = fR - 16;
      ctx.beginPath(); ctx.arc(0, 0, arcR, 0, TAU);
      ctx.strokeStyle = m.c.track || (light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'); ctx.lineWidth = 16; ctx.stroke();
      if (m.progress > 0) {
        ctx.beginPath(); ctx.arc(0, 0, arcR, -Math.PI / 2, -Math.PI / 2 + TAU * m.progress);
        ctx.strokeStyle = m.c.acc; ctx.lineWidth = 16; ctx.lineCap = 'butt'; ctx.stroke();
      }
      // ticks + numerals
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * TAU - Math.PI / 2, is5 = i % 5 === 0, is15 = i % 15 === 0;
        const oR = fR - 12, iR = oR - (is15 ? 46 : is5 ? 28 : 14);
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * iR, Math.sin(a) * iR); ctx.lineTo(Math.cos(a) * oR, Math.sin(a) * oR);
        ctx.strokeStyle = light ? (is15 ? '#333' : is5 ? '#777' : '#bbb') : (is15 ? '#ddd' : is5 ? '#999' : '#444');
        ctx.lineWidth = is15 ? 4 : is5 ? 2.5 : 1; ctx.lineCap = 'square'; ctx.stroke();
      }
      ctx.font = `bold 36px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = light ? '#444' : '#bbb';
      [0, 15, 30, 45].forEach(i => {
        const a = i / 60 * TAU - Math.PI / 2, nr = fR - 78;
        ctx.fillText(String(i), Math.cos(a) * nr, Math.sin(a) * nr);
      });
      // label
      if (m.label) CDM.drawLabel(ctx, m, 0, -fR * 0.36, 30);
      // digital inset
      const iw = 300, ih = 82, iy = fR * 0.27;
      ctx.fillStyle = light ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.55)'; CDM.roundRect(ctx, -iw / 2, iy, iw, ih, 8); ctx.fill();
      ctx.strokeStyle = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
      const px = CDM.fitTabular(ctx, m.fitText, BEBAS, iw - 30, 62);
      ctx.font = `${px}px ${BEBAS}`; ctx.fillStyle = m.c.fg;
      CDM.fillTabularCentered(ctx, m.text, 0, iy + ih / 2);
      // sweep hand: always clockwise, one turn per minute
      let secs = Math.min(m.t, m.T) % 60;
      if (!m.smooth) secs = Math.floor(secs + 1e-9);
      const ha = secs / 60 * TAU - Math.PI / 2;
      ctx.save();
      ctx.shadowBlur = 14; ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.moveTo(-Math.cos(ha) * fR * 0.2, -Math.sin(ha) * fR * 0.2);
      ctx.lineTo(Math.cos(ha) * fR * 0.72, Math.sin(ha) * fR * 0.72);
      ctx.strokeStyle = m.c.acc; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fillStyle = light ? '#555' : '#ccc'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fillStyle = m.c.acc; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fillStyle = light ? '#fff' : '#111'; ctx.fill();
    },
  });

  // ── MINIMAL
  CDM.registerTheme({
    id: 'minimal', name: 'Minimal', font: BEBAS,
    colors: { accent: 'Lines', text: 'Numbers', label: 'Label' },
    box: () => ({ w: 1300, h: 780 }),
    draw(ctx, m) {
      ctx.fillStyle = m.c.acc;
      ctx.fillRect(-540, -360, 1080, 5); ctx.fillRect(-540, 355, 1080, 5);
      const px = CDM.fitTabular(ctx, m.fitText, BEBAS, 1180, 400);
      ctx.save();
      ctx.font = `${px}px ${BEBAS}`; ctx.fillStyle = m.c.fg;
      CDM.glow(ctx, m, CDM.rgba(m.c.fg, 0.25), 30);
      CDM.fillTabularCentered(ctx, m.text, 0, m.label ? -30 : 0);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.8; CDM.drawLabel(ctx, m, 0, 255, 46); ctx.restore();
    },
  });
})(window.CDM);
