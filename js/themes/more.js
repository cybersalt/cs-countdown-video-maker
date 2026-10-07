/* Additional themes: Flip, Scoreboard, Pie, Bar, Neon, Badge, Segments, Digital. */
'use strict';

(function (CDM) {
  const BEBAS = "'Bebas Neue', sans-serif";
  const MONO = "'Share Tech Mono', monospace";
  const OSWALD = "'Oswald', sans-serif";
  const ORBIT = "'Orbitron', sans-serif";
  const TAU = Math.PI * 2;

  // ── FLIP CLOCK (split-flap cards, one per group: H / MM / SS)
  const FLIP = { px: 300, h: 400, digitW: 165, pad: 50, colon: 70, dur: 0.4 };
  function flipLayout(text) {
    const groups = text.split(':');
    const widths = groups.map(g => g.length * FLIP.digitW + FLIP.pad * 2);
    const w = widths.reduce((a, b) => a + b, 0) + FLIP.colon * (groups.length - 1);
    return { groups, widths, w };
  }
  function flipHalf(ctx, m, txt, x, y, w, h, half, sy) {
    const hy = y + h / 2;
    ctx.save();
    ctx.translate(0, hy); ctx.scale(1, Math.max(0.0001, sy)); ctx.translate(0, -hy);
    ctx.beginPath();
    if (half === 'top') ctx.rect(x - 2, y - 2, w + 4, h / 2 - 1);
    else ctx.rect(x - 2, hy + 3, w + 4, h / 2);
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, CDM.shade(m.c.panel, 1.13)); g.addColorStop(0.5, CDM.shade(m.c.panel, 1.06));
    g.addColorStop(0.5, CDM.shade(m.c.panel, 1.02)); g.addColorStop(1, CDM.shade(m.c.panel, 0.8));
    ctx.fillStyle = g; CDM.roundRect(ctx, x, y, w, h, 24); ctx.fill();
    if (m.c.border) { ctx.strokeStyle = m.c.border; ctx.lineWidth = 6; ctx.stroke(); }
    ctx.font = `600 ${FLIP.px}px ${OSWALD}`; ctx.fillStyle = m.c.fg;
    CDM.fillTabularCentered(ctx, txt, x + w / 2, hy);
    if (sy < 1) { ctx.fillStyle = `rgba(0,0,0,${(1 - sy) * 0.55})`; ctx.fillRect(x, y, w, h); }
    ctx.restore();
  }
  CDM.registerTheme({
    id: 'flip', name: 'Flip clock', font: OSWALD,
    colors: { panel: 'Cards', text: 'Numbers', accent: 'Colon', border: 'Card edge', label: 'Label' },
    box(m) { return { w: flipLayout(m.text).w + 40, h: FLIP.h + (m.label ? 130 : 0) + 40 }; },
    // The flip runs during the last FLIP.dur seconds BEFORE each change and lands
    // exactly on the second, in sync with beeps and ticks.
    motion: m => m.untilNext < FLIP.dur ? 'a' + Math.round(m.untilNext * 30) : false,
    draw(ctx, m) {
      const flipping = m.untilNext < FLIP.dur;
      const L = flipLayout(m.text), next = m.nextText.split(':');
      const sameShape = next.length === L.groups.length;
      const y = -FLIP.h / 2 - (m.label ? 55 : 0);
      let x = -L.w / 2;
      const p = flipping ? 1 - m.untilNext / FLIP.dur : 1;
      L.groups.forEach((cur, i) => {
        const w = L.widths[i], nxt = flipping && sameShape ? next[i] : cur;
        // shadow under card
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; CDM.roundRect(ctx, x + 6, y + 14, w, FLIP.h, 24); ctx.fill(); ctx.restore();
        if (nxt === cur) {
          flipHalf(ctx, m, cur, x, y, w, FLIP.h, 'top', 1);
          flipHalf(ctx, m, cur, x, y, w, FLIP.h, 'bottom', 1);
        } else {
          // new number behind on top, old number still on the bottom, leaf falling between
          flipHalf(ctx, m, nxt, x, y, w, FLIP.h, 'top', 1);
          flipHalf(ctx, m, cur, x, y, w, FLIP.h, 'bottom', 1);
          if (p < 0.5) flipHalf(ctx, m, cur, x, y, w, FLIP.h, 'top', Math.cos(p * Math.PI));
          else flipHalf(ctx, m, nxt, x, y, w, FLIP.h, 'bottom', -Math.cos(p * Math.PI));
        }
        // hinge
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y + FLIP.h / 2 - 2, w, 5);
        ctx.fillStyle = CDM.shade(m.c.panel, 0.6);
        ctx.fillRect(x - 6, y + FLIP.h / 2 - 14, 12, 28); ctx.fillRect(x + w - 6, y + FLIP.h / 2 - 14, 12, 28);
        x += w;
        if (i < L.groups.length - 1) {
          ctx.fillStyle = m.c.acc;
          ctx.beginPath(); ctx.arc(x + FLIP.colon / 2, y + FLIP.h * 0.36, 13, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(x + FLIP.colon / 2, y + FLIP.h * 0.64, 13, 0, TAU); ctx.fill();
          x += FLIP.colon;
        }
      });
      CDM.drawLabel(ctx, m, 0, y + FLIP.h + 80, 48);
    },
  });

  // ── SCOREBOARD (dot-matrix bulbs)
  const SB = { pitch: 26, lpitch: 11 };
  function sbDims(text, m) {
    const tw = CDM.dotWidth(text, SB.pitch, 1);
    const lw = m.label ? CDM.dotWidth(m.label, SB.lpitch, 0) : 0;
    const w = Math.max(tw, lw) + 100;
    const h = 7 * SB.pitch + 90 + (m.label ? 7 * SB.lpitch + 70 : 0);
    return { w, h };
  }
  function sbBoard(ctx, m, d) {
    const x = -d.w / 2, y = -d.h / 2, frame = m.c.border || CDM.shade(m.c.panel, 1.6);
    ctx.fillStyle = frame; CDM.roundRect(ctx, x - 16, y - 16, d.w + 32, d.h + 32, 18); ctx.fill();
    ctx.fillStyle = CDM.shade(m.c.panel, 0.35); CDM.roundRect(ctx, x, y, d.w, d.h, 8); ctx.fill();
    ctx.fillStyle = CDM.shade(frame, 1.5);
    [[x - 2, y - 2], [x + d.w + 2, y - 2], [x - 2, y + d.h + 2], [x + d.w + 2, y + d.h + 2]].forEach(([bx, by]) => {
      ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill();
    });
  }
  function sbContent(ctx, m, d, text) {
    const off = m.c.track || CDM.rgba(m.c.acc, 0.09);
    let cy = 0;
    if (m.label) {
      const ly = -d.h / 2 + 45 + 3 * SB.lpitch;
      CDM.drawDots(ctx, m.label.toUpperCase(), 0, ly, SB.lpitch, m.c.labelAuto ? CDM.shade(m.c.acc, 1.15) : m.c.label, off, m, 0);
      cy = ly + 3 * SB.lpitch + 70 + 3.5 * SB.pitch;
    }
    CDM.drawDots(ctx, text, 0, cy, SB.pitch, m.c.acc, off, m, 1);
  }
  CDM.registerTheme({
    id: 'scoreboard', name: 'Scoreboard', font: MONO,
    colors: { accent: 'Lit bulbs', track: 'Unlit bulbs', panel: 'Board', border: 'Frame', label: 'Label bulbs' },
    box(m) { const d = sbDims(m.text.replace(/\d/g, '0'), m); return { w: d.w + 60, h: d.h + 60 }; },
    draw(ctx, m) {
      const d = sbDims(m.text.replace(/\d/g, '0'), m);
      sbBoard(ctx, m, d); sbContent(ctx, m, d, m.text);
    },
    drawMessage(ctx, m, box) {
      const msg = m.message.toUpperCase();
      const d = sbDims(m.text.replace(/\d/g, '0'), m);
      const need = CDM.dotWidth(msg, SB.pitch, 1) + 100;
      const dd = { w: Math.max(d.w, need), h: d.h };
      const s = Math.min(1, (box.w - 60) / dd.w);
      ctx.scale(s, s);
      sbBoard(ctx, m, dd); sbContent(ctx, m, dd, msg);
    },
  });

  // ── PIE (time-timer style wedge)
  CDM.registerTheme({
    id: 'pie', name: 'Pie', font: BEBAS,
    colors: { accent: 'Wedge', panel: 'Face', border: 'Rim', track: 'Tick marks', text: 'Numbers', label: 'Label' },
    box: m => ({ w: 820, h: m.label ? 1080 : 1000 }),
    motion: m => m.smooth && !m.finished,
    draw(ctx, m) {
      const r = 330, cy = m.label ? -150 : -110;
      ctx.beginPath(); ctx.arc(0, cy, r + 26, 0, TAU); ctx.fillStyle = m.c.border || CDM.shade(m.c.panel, 1.5); ctx.fill();
      ctx.beginPath(); ctx.arc(0, cy, r, 0, TAU); ctx.fillStyle = m.c.panel; ctx.fill();
      if (m.progress > 0) {
        ctx.save(); CDM.glow(ctx, m, m.c.acc, 40);
        ctx.beginPath(); ctx.moveTo(0, cy);
        ctx.arc(0, cy, r - 14, -Math.PI / 2, -Math.PI / 2 + TAU * m.progress);
        ctx.closePath(); ctx.fillStyle = m.c.acc; ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * TAU - Math.PI / 2, big = i % 5 === 0;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4));
        ctx.lineTo(Math.cos(a) * (r + (big ? 22 : 12)), cy + Math.sin(a) * (r + (big ? 22 : 12)));
        ctx.strokeStyle = CDM.rgba(m.c.track || m.c.fg, big ? (m.c.track ? 1 : 0.7) : (m.c.track ? 0.6 : 0.35));
        ctx.lineWidth = big ? 4 : 2; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, cy, 34, 0, TAU); ctx.fillStyle = CDM.shade(m.c.panel, 1.8); ctx.fill();
      const px = CDM.fitTabular(ctx, m.text, BEBAS, 760, 230);
      ctx.font = `${px}px ${BEBAS}`; ctx.fillStyle = m.c.fg;
      CDM.fillTabularCentered(ctx, m.text, 0, cy + r + 150);
      CDM.drawLabel(ctx, m, 0, cy + r + 270, 44);
    },
  });

  // ── BAR (lower-third progress bar)
  CDM.registerTheme({
    id: 'bar', name: 'Progress bar', font: BEBAS,
    colors: { accent: 'Bar fill', track: 'Bar track', text: 'Numbers', label: 'Label' },
    box: () => ({ w: 1400, h: 330 }),
    motion: m => m.smooth && !m.finished,
    draw(ctx, m) {
      const bw = 1320, bh = 44, by = 90, x = -bw / 2;
      ctx.font = `200px ${BEBAS}`; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = m.c.fg;
      const tw = CDM.tabularWidth(ctx, m.text);
      CDM.fillTabular(ctx, m.text, x + tw / 2, by - 30);
      if (m.label) {
        ctx.save();
        ctx.font = `48px ${MONO}`; ctx.letterSpacing = '9px'; ctx.textAlign = 'right'; ctx.fillStyle = m.c.label;
        ctx.fillText(m.label.toUpperCase(), bw / 2, by - 44);
        ctx.restore();
      }
      ctx.fillStyle = m.c.track || m.c.dim; CDM.roundRect(ctx, x, by, bw, bh, bh / 2); ctx.fill();
      if (m.progress > 0) {
        ctx.save(); CDM.glow(ctx, m, m.c.acc, 30);
        ctx.fillStyle = m.c.acc; CDM.roundRect(ctx, x, by, Math.max(bh, bw * m.progress), bh, bh / 2); ctx.fill();
        ctx.restore();
      }
    },
  });

  // ── NEON (glowing tube text + frame)
  CDM.registerTheme({
    id: 'neon', name: 'Neon', font: BEBAS,
    colors: { accent: 'Number tubes', border: 'Frame tube', label: 'Label tube' },
    box: () => ({ w: 1400, h: 740 }),
    draw(ctx, m) { neon(ctx, m, m.text, true); },
    drawMessage(ctx, m) { neon(ctx, m, m.message, false); },
  });
  function tube(ctx, m, color, w, fn) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (m.glow) {
      ctx.shadowColor = color; ctx.shadowBlur = 45; ctx.strokeStyle = color; ctx.lineWidth = w * 1.6; ctx.globalAlpha = 0.6; fn('stroke');
      ctx.globalAlpha = 1; ctx.shadowBlur = 18;
    }
    ctx.strokeStyle = color; ctx.lineWidth = w; fn('stroke');
    ctx.shadowBlur = 0; ctx.strokeStyle = CDM.shade(color, 1.75); ctx.lineWidth = w * 0.38; fn('stroke');
    ctx.restore();
  }
  function neon(ctx, m, text, tab) {
    const fw = 1300, fh = 640;
    tube(ctx, m, m.c.border || m.c.fg, 9, () => { CDM.roundRect(ctx, -fw / 2, -fh / 2, fw, fh, 60); ctx.stroke(); });
    const px = tab ? CDM.fitTabular(ctx, text, BEBAS, 1100, 380) : CDM.fitFont(ctx, text, BEBAS, 1100, 380);
    ctx.font = `${px}px ${BEBAS}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const ty = (m.label ? -30 : 0) + CDM.inkMid(ctx, tab ? '0123456789' : text);
    tube(ctx, m, m.c.acc, 7, () => {
      if (tab) CDM.tabular(ctx, text, 0, ty, (ch, x, y) => ctx.strokeText(ch, x, y));
      else ctx.strokeText(text, 0, ty);
    });
    if (m.label) {
      ctx.font = `64px ${MONO}`; ctx.letterSpacing = '14px';
      tube(ctx, m, m.c.labelAuto ? m.c.fg : m.c.label, 3, () => ctx.strokeText(m.label.toUpperCase(), 7, 215));
      ctx.letterSpacing = '0px';
    }
  }

  // ── BADGE (compact pill, made for corner overlays)
  function badgeDims(m) {
    const tw = CDM.measureTabular(m.text.replace(/\d/g, '0'), BEBAS, 130);
    const lw = m.label ? CDM.measure(m.label.toUpperCase(), MONO, 34, 6) : 0;
    const content = Math.max(tw, lw);
    const h = m.label ? 220 : 170;
    return { w: 60 + 44 + 36 + content + 70, h, content };
  }
  CDM.registerTheme({
    id: 'badge', name: 'Badge', font: BEBAS,
    colors: { panel: 'Pill', border: 'Outline', accent: 'Dot', text: 'Numbers', label: 'Label' },
    box(m) { const d = badgeDims(m); return { w: d.w + 30, h: d.h + 30 }; },
    draw(ctx, m) { badge(ctx, m, m.text, true); },
    drawMessage(ctx, m) { badge(ctx, m, m.message, false); },
  });
  function badge(ctx, m, text, tab) {
    const d = badgeDims(m), x = -d.w / 2, y = -d.h / 2;
    ctx.save();
    ctx.fillStyle = CDM.rgba(m.c.panel, 0.92); CDM.roundRect(ctx, x, y, d.w, d.h, d.h / 2); ctx.fill();
    ctx.strokeStyle = m.c.border || CDM.rgba(m.c.acc, 0.85); ctx.lineWidth = 4; ctx.stroke();
    const dx = x + 60 + 22;
    ctx.save(); CDM.glow(ctx, m, m.c.acc, 25);
    ctx.beginPath(); ctx.arc(dx, 0, 22, 0, TAU); ctx.fillStyle = m.c.acc; ctx.fill();
    ctx.restore();
    const cx = dx + 22 + 36 + d.content / 2;
    if (m.label) {
      ctx.font = `34px ${MONO}`; ctx.letterSpacing = '6px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = m.c.label; ctx.fillText(m.label.toUpperCase(), cx + 3, -58);
      ctx.letterSpacing = '0px';
    }
    const ty = m.label ? 32 : 0;
    let px = 130;
    if (!tab) px = CDM.fitFont(ctx, text, BEBAS, d.content, 130);
    ctx.font = `${px}px ${BEBAS}`; ctx.fillStyle = m.c.fg;
    if (tab) CDM.fillTabularCentered(ctx, text, cx, ty); else CDM.fillCentered(ctx, text, cx, ty);
    ctx.restore();
  }

  // ── SEGMENTS (LED ring that switches off segment by segment)
  const SEGN = 60;
  CDM.registerTheme({
    id: 'segments', name: 'LED ring', font: ORBIT,
    colors: { accent: 'Lit segments', track: 'Unlit segments', text: 'Numbers', label: 'Label' },
    box: () => ({ w: 900, h: 900 }),
    motion: m => 'n' + Math.ceil(m.progress * SEGN - 1e-9),
    draw(ctx, m) {
      const r1 = 330, r2 = 410, lit = Math.ceil(m.progress * SEGN - 1e-9);
      const onP = new Path2D(), offP = new Path2D(), gap = 0.012 * TAU / 2;
      for (let i = 0; i < SEGN; i++) {
        const a0 = i / SEGN * TAU - Math.PI / 2 + gap, a1 = (i + 1) / SEGN * TAU - Math.PI / 2 - gap;
        const P = i < lit ? onP : offP;
        P.moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
        P.arc(0, 0, r2, a0, a1); P.arc(0, 0, r1, a1, a0, true); P.closePath();
      }
      ctx.fillStyle = m.c.track || m.c.faint; ctx.fill(offP);
      ctx.save(); ctx.fillStyle = m.c.acc; CDM.glow(ctx, m, m.c.acc, 35); ctx.fill(onP); ctx.restore();
      const px = CDM.fitTabular(ctx, m.text, ORBIT, 520, 170, 900);
      ctx.font = `900 ${px}px ${ORBIT}`; ctx.fillStyle = m.c.fg;
      CDM.fillTabularCentered(ctx, m.text, 0, 0);
      CDM.drawLabel(ctx, m, 0, 130, 36);
    },
  });

  // ── DIGITAL (HUD with corner brackets)
  CDM.registerTheme({
    id: 'digital', name: 'Digital HUD', font: ORBIT,
    colors: { accent: 'Brackets & progress', track: 'Unlit progress', text: 'Numbers', label: 'Label' },
    box: () => ({ w: 1500, h: 640 }),
    motion: m => 'n' + Math.round(m.progress * 40),
    draw(ctx, m) {
      const w = 1400, h = 540, L = 90;
      ctx.save();
      ctx.strokeStyle = m.c.acc; ctx.lineWidth = 8; CDM.glow(ctx, m, m.c.acc, 20);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
        const cx = sx * w / 2, cy = sy * h / 2;
        ctx.beginPath(); ctx.moveTo(cx - sx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - sy * L); ctx.stroke();
      });
      ctx.restore();
      const px = CDM.fitTabular(ctx, m.text, ORBIT, 1240, 260, 700);
      ctx.font = `700 ${px}px ${ORBIT}`; ctx.fillStyle = m.c.fg;
      ctx.save(); CDM.glow(ctx, m, CDM.rgba(m.c.fg, 0.35), 25);
      CDM.fillTabularCentered(ctx, m.text, 0, 0);
      ctx.restore();
      if (m.label) {
        ctx.font = `40px ${MONO}`; ctx.letterSpacing = '12px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = m.c.label; ctx.fillText(m.label.toUpperCase(), 6, -h / 2 + 70); ctx.letterSpacing = '0px';
      }
      // progress ticks along the bottom
      const n = 40, tw = (w - 200) / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < Math.round(m.progress * n) ? m.c.acc : (m.c.track || m.c.dim);
        ctx.fillRect(-w / 2 + 100 + i * tw + 3, h / 2 - 80, tw - 6, 22);
      }
    },
  });
})(window.CDM);
