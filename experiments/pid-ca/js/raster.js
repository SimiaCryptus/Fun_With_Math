/**
 * raster.js — rasterisation helpers for the paintable target field (§3.2, §7.7).
 *
 * Pure geometry/glyph helpers: they know nothing about the grid or the
 * simulation, they just enumerate integer cell coordinates. simulation.js
 * turns those coordinates into writes on `grid.targetField`.
 */

/** Bresenham line: calls fn(x, y) for every cell on the segment (inclusive). */
export function forEachLineCell(x0, y0, x1, y1, fn) {
  let x = x0 | 0;
  let y = y0 | 0;
  const ex = x1 | 0;
  const ey = y1 | 0;
  const dx = Math.abs(ex - x);
  const sx = x < ex ? 1 : -1;
  const dy = -Math.abs(ey - y);
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  // Hard guard: a degenerate call must still paint exactly one cell.
  for (let guard = 0; guard < 1e6; guard++) {
    fn(x, y);
    if (x === ex && y === ey) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Rasterise a text string into a 1-bit mask at cell resolution.
 * @returns {{width:number, height:number, mask:Uint8Array}}
 */
export function rasterizeText(text, fontSize, options = {}) {
  const size = Math.max(2, Math.round(fontSize) || 2);
  const family = options.family || 'ui-sans-serif, system-ui, sans-serif';
  const font = (options.bold ? 'bold ' : '') + size + 'px ' + family;

  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d');
  pctx.font = font;
  const metrics = pctx.measureText(text);
  const w = Math.max(1, Math.ceil(metrics.width) + 2);
  const h = Math.max(1, Math.ceil(size * 1.45) + 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 1, h / 2);

  const data = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  const cut = options.coverage === undefined ? 96 : options.coverage;
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) mask[i] = data[p] > cut ? 1 : 0;
  return { width: w, height: h, mask };
}

export default rasterizeText;
