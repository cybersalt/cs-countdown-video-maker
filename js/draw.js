/* Shared drawing helpers for themes. */
'use strict';

(function (CDM) {
  // A scratch context for measuring text outside of a draw call (e.g. in theme.box()).
  const mctx = document.createElement('canvas').getContext('2d');
  CDM.mctx = mctx;

  // Proportional fonts make "1:11" narrower than "0:00", so the time would wobble
  // left/right every second. Draw digits in fixed-width cells instead.
  function cellWidth(ctx, ch) {
    return /\d/.test(ch) ? ctx.measureText('0').width : ctx.measureText(ch).width;
  }
  CDM.tabularWidth = function (ctx, text) {
    let w = 0;
    for (const ch of text) w += cellWidth(ctx, ch);
    return w;
  };
  // Calls draw(ch, x, y) for each character, centred as a block on (cx, cy).
  // ctx.font must already be set.
  CDM.tabular = function (ctx, text, cx, cy, draw) {
    const total = CDM.tabularWidth(ctx, text);
    let x = cx - total / 2;
    ctx.save();
    ctx.textAlign = 'center';
    for (const ch of text) {
      const w = cellWidth(ctx, ch);
      draw(ch, x + w / 2, cy);
      x += w;
    }
    ctx.restore();
  };
  CDM.fillTabular = (ctx, text, cx, cy) => CDM.tabular(ctx, text, cx, cy, (ch, x, y) => ctx.fillText(ch, x, y));
  // Like fillTabular, but centres the digits' actual ink vertically on cy.
  // (textBaseline 'middle' centres the font's em box, which sits digits too high in some fonts.)
  // Offset to add to a centre y so that, with textBaseline 'alphabetic', the ink of
  // `sample` is vertically centred there. ctx.font must already be set.
  CDM.inkMid = function (ctx, sample) {
    const mt = ctx.measureText(sample || '0123456789');
    return (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2;
  };
  CDM.fillTabularCentered = function (ctx, text, cx, cy) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    CDM.fillTabular(ctx, text, cx, cy + CDM.inkMid(ctx));
    ctx.restore();
  };
  // Non-tabular text (messages), ink-centred on (cx, cy).
  CDM.fillCentered = function (ctx, text, cx, cy) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, cx, cy + CDM.inkMid(ctx, text));
    ctx.restore();
  };

  // Largest px size (≤ maxPx) at which text fits maxW using tabular widths.
  CDM.fitTabular = function (ctx, text, font, maxW, maxPx, weight) {
    ctx.font = `${weight || ''} ${maxPx}px ${font}`;
    const w = CDM.tabularWidth(ctx, text);
    return w > maxW ? Math.floor(maxPx * maxW / w) : maxPx;
  };
  CDM.measureTabular = function (text, font, px) {
    mctx.font = `${px}px ${font}`;
    return CDM.tabularWidth(mctx, text);
  };
  CDM.measure = function (text, font, px, spacing) {
    mctx.font = `${px}px ${font}`;
    mctx.letterSpacing = spacing ? `${spacing}px` : '0px';
    const w = mctx.measureText(text).width;
    mctx.letterSpacing = '0px';
    return w;
  };

  // ── 7-SEGMENT DIGITS
  const SEG = {
    '0': [1, 1, 1, 1, 1, 1, 0], '1': [0, 1, 1, 0, 0, 0, 0], '2': [1, 1, 0, 1, 1, 0, 1],
    '3': [1, 1, 1, 1, 0, 0, 1], '4': [0, 1, 1, 0, 0, 1, 1], '5': [1, 0, 1, 1, 0, 1, 1],
    '6': [1, 0, 1, 1, 1, 1, 1], '7': [1, 1, 1, 0, 0, 0, 0], '8': [1, 1, 1, 1, 1, 1, 1],
    '9': [1, 1, 1, 1, 0, 1, 1], '-': [0, 0, 0, 0, 0, 0, 1], ' ': [0, 0, 0, 0, 0, 0, 0],
  };
  CDM.seg7Layout = function (text, dh) {
    const dw = dh * 0.58, colW = dw * 0.38, gap = dh * 0.063;
    let w = 0;
    for (const ch of text) w += (ch === ':' ? colW : dw) + gap;
    return { dw, colW, gap, w: w - gap };
  };
  // Draws text in 7-segment style, centred on (cx, cy). Lit segments are drawn in
  // one path so the glow is applied once.
  CDM.drawSeg7 = function (ctx, text, cx, cy, dh, on, off, m) {
    const L = CDM.seg7Layout(text, dh);
    const sw = L.dw * 0.135, sgap = L.dw * 0.045, bv = sw * 0.4;
    const offPath = new Path2D(), onPath = new Path2D();
    function seg(path, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1, ln = Math.hypot(dx, dy);
      const nx = -dy / ln * sw / 2, ny = dx / ln * sw / 2, ux = dx / ln, uy = dy / ln;
      path.moveTo(x1 + ux * bv, y1 + uy * bv);
      path.lineTo(x1 + nx + ux * bv * 2, y1 + ny + uy * bv * 2);
      path.lineTo(x2 + nx - ux * bv * 2, y2 + ny - uy * bv * 2);
      path.lineTo(x2 - ux * bv, y2 - uy * bv);
      path.lineTo(x2 - nx - ux * bv * 2, y2 - ny - uy * bv * 2);
      path.lineTo(x1 - nx + ux * bv * 2, y1 - ny + uy * bv * 2);
      path.closePath();
    }
    let x = cx - L.w / 2;
    const y0 = cy - dh / 2, ym = cy, y2 = cy + dh / 2, slant = dh * 0.05;
    for (const ch of text) {
      if (ch === ':') {
        const r = dh * 0.06, xc = x + L.colW / 2;
        onPath.moveTo(xc + r + slant * 0.18, ym - dh * 0.18); onPath.arc(xc + slant * 0.18, ym - dh * 0.18, r, 0, Math.PI * 2);
        onPath.moveTo(xc + r - slant * 0.18, ym + dh * 0.18); onPath.arc(xc - slant * 0.18, ym + dh * 0.18, r, 0, Math.PI * 2);
        x += L.colW + L.gap;
        continue;
      }
      const segs = SEG[ch] || SEG[' '];
      const x0 = x, x1 = x + L.dw, p = sw / 2 + sgap, e = sw / 2;
      // slight italic slant like real LED clocks
      const sx = y => (cy - y) / dh * slant;
      const lines = [
        [x0 + p, y0 + e, x1 - p, y0 + e], [x1 - e, y0 + p, x1 - e, ym - p],
        [x1 - e, ym + p, x1 - e, y2 - p], [x0 + p, y2 - e, x1 - p, y2 - e],
        [x0 + e, ym + p, x0 + e, y2 - p], [x0 + e, y0 + p, x0 + e, ym - p],
        [x0 + p, ym, x1 - p, ym],
      ];
      lines.forEach(([a, b, c, d], i) => seg(segs[i] ? onPath : offPath, a + sx(b), b, c + sx(d), d));
      x += L.dw + L.gap;
    }
    ctx.save();
    ctx.fillStyle = off; ctx.fill(offPath);
    ctx.fillStyle = on;
    CDM.glow(ctx, m, on, dh * 0.12);
    ctx.fill(onPath);
    ctx.restore();
    return L;
  };

  // ── 5×7 DOT-MATRIX FONT
  const F = {
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11111 00010 00100 00010 00001 10001 01110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11100 10010 10001 10001 10001 10010 11100',
    'E': '11111 10000 10000 11110 10000 10000 11111', 'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111', 'H': '10001 10001 10001 11111 10001 10001 10001',
    'I': '01110 00100 00100 00100 00100 00100 01110', 'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 10100 11000 10100 10010 10001', 'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001', 'N': '10001 10001 11001 10101 10011 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110', 'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101', 'R': '11110 10001 10001 11110 10100 10010 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110', 'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110', 'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 10101 01010', 'X': '10001 10001 01010 00100 01010 10001 10001',
    'Y': '10001 10001 10001 01010 00100 00100 00100', 'Z': '11111 00001 00010 00100 01000 10000 11111',
    ':': '00 11 11 00 11 11 00', '.': '0 0 0 0 0 0 1', '!': '1 1 1 1 1 0 1', "'": '1 1 0 0 0 0 0',
    ',': '0 0 0 0 0 1 1', '-': '0000 0000 0000 1111 0000 0000 0000', ' ': '000 000 000 000 000 000 000',
    '?': '01110 10001 00001 00010 00100 00000 00100', '/': '00001 00010 00010 00100 01000 01000 10000',
    ' ': '00000 00000 00000 00000 00000 00000 00000',   // blank digit cell (padding)
  };
  const GLYPHS = {};
  for (const k in F) GLYPHS[k] = F[k].split(' ').map(r => r.split('').map(Number));
  CDM.dotGlyph = ch => GLYPHS[ch.toUpperCase()] || GLYPHS[' '];
  // Column bitmap (array of 7-row columns) for a string, 1 blank column between glyphs.
  CDM.dotColumns = function (text) {
    const cols = [];
    [...text].forEach((ch, i) => {
      const g = CDM.dotGlyph(ch);
      if (i) cols.push([0, 0, 0, 0, 0, 0, 0]);
      for (let c = 0; c < g[0].length; c++) cols.push(g.map(row => row[c]));
    });
    return cols;
  };
  // Draws a dot-matrix string centred on (cx, cy); returns its width.
  CDM.drawDots = function (ctx, text, cx, cy, pitch, on, off, m, extraCols) {
    const cols = CDM.dotColumns(text);
    const pad = extraCols || 0, n = cols.length + pad * 2;
    const w = n * pitch, r = pitch * 0.4;
    const x0 = cx - w / 2 + pitch / 2, y0 = cy - 3 * pitch;
    const onP = new Path2D(), offP = new Path2D();
    for (let c = 0; c < n; c++) {
      const col = cols[c - pad];
      for (let rr = 0; rr < 7; rr++) {
        const lit = col && col[rr];
        const P = lit ? onP : offP, x = x0 + c * pitch, y = y0 + rr * pitch;
        P.moveTo(x + r, y); P.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.save();
    ctx.fillStyle = off; ctx.fill(offP);
    ctx.fillStyle = on; CDM.glow(ctx, m, on, pitch * 0.9); ctx.fill(onP);
    ctx.restore();
    return w;
  };
  CDM.dotWidth = (text, pitch, extraCols) => (CDM.dotColumns(text).length + 2 * (extraCols || 0)) * pitch;
})(window.CDM);
