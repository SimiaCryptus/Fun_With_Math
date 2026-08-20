/**
 * raster.js — rasterisation helpers for the paintable / text target field (§3.2, §7.7).
 *
 * Pure geometry/glyph helpers: they know nothing about the grid or the
 * simulation, they just enumerate integer cell coordinates or 1-bit masks.
 * simulation.js turns those into writes on `grid.targetField`.
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

// ---------------------------------------------------------------- fonts
export const FONT_STACKS = {
  sans: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace',
};

/** Resolve a short font name ('sans' | 'serif' | 'mono') to a CSS stack. */
export function fontStack(name) {
  return FONT_STACKS[name] || FONT_STACKS.sans;
}

let _probeCtx = null;
function probeContext() {
  if (!_probeCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    _probeCtx = canvas.getContext('2d');
  }
  return _probeCtx;
}

function fontString(size, o) {
  return (
    (o.italic ? 'italic ' : '') +
    (o.bold ? 'bold ' : '') +
    size +
    'px ' +
    (o.family || FONT_STACKS.sans)
  );
}

/** Normalise CRLF/CR and split into lines (newline support). */
export function splitLines(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    .split('\n');
}

/** Metric-only measurement of a multi-line block at a given font size. */
export function measureTextBlock(text, fontSize, options = {}) {
  const size = Math.max(1, Math.round(fontSize) || 1);
  const ctx = probeContext();
  ctx.font = fontString(size, options);
  const lines = splitLines(text);
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  const lineHeight = size * Math.max(0.4, options.lineHeight || 1.15);
  return {
    width: Math.max(1, Math.ceil(w)),
    height: Math.max(1, Math.ceil(lineHeight * lines.length)),
    lineHeight,
    lines,
  };
}

/**
 * Rasterise a (possibly multi-line) string into a 1-bit mask at cell resolution.
 * @returns {{width:number, height:number, mask:Uint8Array}}
 */
export function rasterizeTextBlock(text, fontSize, options = {}) {
  const size = Math.max(2, Math.round(fontSize) || 2);
  const metrics = measureTextBlock(text, size, options);
  const lines = metrics.lines;
  const pad = Math.max(2, Math.ceil(size * 0.3));
  const w = Math.max(1, metrics.width + pad * 2);
  const h = Math.max(1, Math.ceil(metrics.lineHeight * lines.length) + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = fontString(size, options);
  ctx.textBaseline = 'middle';
  const align = options.align === 'left' ? 'left' : options.align === 'right' ? 'right' : 'center';
  ctx.textAlign = align;
  const ax = align === 'left' ? pad : align === 'right' ? w - pad : w / 2;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], ax, pad + metrics.lineHeight * (i + 0.5));
  }

  const data = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  const cut = options.coverage === undefined ? 96 : options.coverage;
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) mask[i] = data[p] > cut ? 1 : 0;
  return { width: w, height: h, mask };
}

/** Crop a mask to its inked bounding box (the "effective" render size). */
export function trimMask(glyph) {
  const { width, height, mask } = glyph;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { width: 0, height: 0, mask: new Uint8Array(0) };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const src = (y + minY) * width + minX;
    out.set(mask.subarray(src, src + w), y * w);
  }
  return { width: w, height: h, mask: out };
}

/**
 * Auto-fit a text block into a `boxWidth × boxHeight` cell box.
 *
 * The returned mask is trimmed to its ink, so the fit constrains whichever
 * of the *effective* render width/height is proportionally larger: after
 * fitting, max(w / boxWidth, h / boxHeight) ≈ 1.
 *
 * @returns {{width:number, height:number, mask:Uint8Array, fontSize:number}}
 */
export function fitTextBlock(text, boxWidth, boxHeight, options = {}) {
  const maxSize = Math.max(2, Math.round(options.maxFontSize || 512));
  const bw = Math.max(1, Math.floor(boxWidth));
  const bh = Math.max(1, Math.floor(boxHeight));
  const base = measureTextBlock(text, 100, options);
  let size = Math.floor(100 * Math.min(bw / base.width, bh / base.height));
  size = Math.max(2, Math.min(maxSize, size || 2));

  let glyph = trimMask(rasterizeTextBlock(text, size, options));
  if (!glyph.width) return { ...glyph, fontSize: size };

  // Shrink until the inked box fits (metrics over-/under-estimate slightly).
  let guard = 0;
  while ((glyph.width > bw || glyph.height > bh) && size > 2 && guard++ < 64) {
    const k = Math.min(bw / glyph.width, bh / glyph.height);
    const next = Math.max(2, Math.min(size - 1, Math.floor(size * k)));
    if (next === size) break;
    size = next;
    glyph = trimMask(rasterizeTextBlock(text, size, options));
    if (!glyph.width) return { ...glyph, fontSize: size };
  }
  // Then grow one step at a time while it still fits, so the larger of the
  // two relative dimensions lands as close to the limit as possible.
  guard = 0;
  while (size < maxSize && guard++ < 64) {
    const bigger = trimMask(rasterizeTextBlock(text, size + 1, options));
    if (!bigger.width || bigger.width > bw || bigger.height > bh) break;
    size += 1;
    glyph = bigger;
  }
  glyph.fontSize = size;
  return glyph;
}

/**
 * Backwards-compatible single-call rasteriser (now newline-aware) used by
 * the click-to-stamp target tool.
 */
export function rasterizeText(text, fontSize, options = {}) {
  return rasterizeTextBlock(text, fontSize, options);
}

export default rasterizeText;
