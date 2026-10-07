/* Renderer: background, placement (centre / corners), size, drop shadow.
   Themes draw centred on (0,0) inside their own box; this file decides where
   that box lands in the 1920×1080 frame. */
'use strict';

(function (CDM) {
  const { W, H } = CDM;

  // Off-screen layer so the drop shadow can be applied to the whole theme at once.
  let layer = null, lctx = null;
  function getLayer() {
    if (!layer) {
      layer = document.createElement('canvas');
      layer.width = W; layer.height = H;
      lctx = layer.getContext('2d');
    }
    return lctx;
  }

  // refBox (optional, from theme.scaleBox): a fixed reference size the scale is
  // based on, so e.g. flip cards are the same size for 9:00, 10:00 and 1:00:00.
  // The scale is still capped so the actual box never overflows the frame.
  CDM.placement = function (box, S, refBox) {
    const margin = Math.max(0, +S.margin || 0);
    const fitOf = b => Math.min((W - 2 * margin) / b.w, (H - 2 * margin) / b.h);
    let sc = fitOf(refBox || box) * Math.max(5, Math.min(100, +S.size || 100)) / 100;
    if (refBox) sc = Math.min(sc, fitOf(box));
    const w = box.w * sc, h = box.h * sc;
    const pos = S.position || 'center';
    let x = W / 2, y = H / 2;
    if (pos.includes('left')) x = margin + w / 2;
    if (pos.includes('right')) x = W - margin - w / 2;
    if (pos.startsWith('top')) y = margin + h / 2;
    if (pos.startsWith('bottom')) y = H - margin - h / 2;
    return { x, y, sc };
  };

  // Render the frame at time t into ctx (a 1920×1080 2D context).
  CDM.render = function (ctx, t, S) {
    const m = CDM.modelAt(t, S);
    const theme = CDM.themeById(S.theme);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (m.c.bg) { ctx.fillStyle = m.c.bg; ctx.fillRect(0, 0, W, H); }
    CDM.lastBounds = null;
    if (m.flashOff) return m;

    const box = theme.box(m, S);
    const pl = CDM.placement(box, S, theme.scaleBox && theme.scaleBox(m, S));
    // Area that can contain drawn pixels (box + room for glow and drop shadow).
    // The PNG encoder only reads this region back from the canvas.
    const pad = 130 * pl.sc + 48;
    CDM.lastBounds = {
      x0: Math.max(0, Math.floor(pl.x - box.w * pl.sc / 2 - pad)), x1: Math.min(W, Math.ceil(pl.x + box.w * pl.sc / 2 + pad)),
      y0: Math.max(0, Math.floor(pl.y - box.h * pl.sc / 2 - pad)), y1: Math.min(H, Math.ceil(pl.y + box.h * pl.sc / 2 + pad)),
    };

    const lc = getLayer();
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, W, H);
    lc.setTransform(pl.sc, 0, 0, pl.sc, pl.x, pl.y);
    lc.save();
    if (m.message) (theme.drawMessage || ((c, mm, b) => CDM.drawMessageDefault(c, mm, b, theme.font)))(lc, m, box, S);
    else theme.draw(lc, m, box, S);
    lc.restore();

    if (S.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 24 * pl.sc + 6;
      ctx.shadowOffsetY = 8 * pl.sc + 2;
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(layer, 0, 0);
    }
    return m;
  };

  // A string that changes whenever the rendered image would change. Used by the
  // PNG exporters to skip re-encoding identical frames (most countdown frames
  // repeat 30× per second).
  CDM.frameKey = function (t, S) {
    const m = CDM.modelAt(t, S);
    const theme = CDM.themeById(S.theme);
    const parts = [m.text, m.urgent, m.finished, m.message, m.flashOff];
    if (theme.motion) {
      const extra = theme.motion(m, S);
      if (extra === true) return 'f' + Math.round(t * CDM.FPS);   // every frame unique
      if (extra !== false && extra != null) parts.push(extra);
    }
    return parts.join('|');
  };
})(window.CDM);
