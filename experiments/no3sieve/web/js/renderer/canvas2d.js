// canvas2d.js — the fallback-but-default renderer. Layer order:
//   unknown hatch -> density overlay -> grid -> ring guides -> points -> selection
// LOD (§5.2): sub-pixel zoom AGGREGATES (never point-samples) — a density-2/n set
// vanishes under naive downsampling and the picture lies.
import { rasterize, buildSAT, centeredDensityMap } from '../sat.js';
import { viridis } from './colormap.js';
import { linfIndex } from '../lattice.js';
import { createLogger } from '../util/log.js';

const log = createLogger('renderer');
const MAX_IMAGE_PIXELS = 1 << 24; // 16M px per offscreen buffer

export class Renderer {
  constructor(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function')
      throw new TypeError('Renderer: expected an HTMLCanvasElement');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx)
      throw new Error('Renderer: 2D context unavailable (canvas blocked or out of memory)');
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d');
    if (!this.offCtx) throw new Error('Renderer: offscreen 2D context unavailable');
    this._cache = null; // memoized density raster
    this.lastFrameMs = 0;
    this.lastStride = 1;
    this.lastError = null;
  }

  invalidateOverlay() {
    this._cache = null;
  }

  draw(vp, ps, opts) {
    if (!vp || !ps || !opts) throw new TypeError('Renderer.draw(vp, ps, opts): missing argument');
    if (!(vp.w > 0) || !(vp.h > 0)) return; // zero-size canvas: nothing to do
    const t0 = performance.now();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, vp.w, vp.h);

    // One failing *layer* must not blank the whole picture: isolate each.
    this._layer('unknown', () => {
      if (opts.unknown && ps.rGen >= 0) this._drawUnknown(vp, ps.rGen);
    });
    this._layer('density', () => {
      if (opts.density && ps.k > 0) this._drawDensity(vp, ps, opts);
    });
    this._layer('grid', () => {
      if (opts.grid) this._drawGrid(vp);
    });
    this._layer('rings', () => {
      if (opts.rings && ps.rGen >= 0) this._drawRings(vp, ps.rGen);
    });
    this._layer('points', () => this._drawPoints(vp, ps));
    this._layer('selection', () => {
      if (opts.selection) this._drawSelection(vp, opts.selection);
    });
    this._layer('hover', () => {
      if (opts.hover) this._drawHover(vp, opts.hover);
    });

    this.lastFrameMs = performance.now() - t0;
  }

  _layer(name, fn) {
    try {
      fn();
    } catch (e) {
      this.lastError = `${name}: ${e && e.message ? e.message : e}`;
      log.once(`layer-${name}`, 'error', `layer "${name}" failed and was skipped:`, e);
      try {
        this.ctx.restore();
      } catch (_) {
        /* unbalanced save() from the failed layer */
      }
    }
  }

  // Ungenerated regions get a distinct hatch — "unknown" must never read as "empty".
  _drawUnknown(vp, rGen) {
    const ctx = this.ctx;
    const x0 = vp.toScreenX(-rGen - 0.5),
      x1 = vp.toScreenX(rGen + 0.5);
    const y0 = vp.toScreenY(rGen + 0.5),
      y1 = vp.toScreenY(-rGen - 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, vp.w, vp.h);
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.fill('evenodd'); // clip trick: fill only outside the ball
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d1117';
    ctx.fill('evenodd');
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(120,140,165,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 14;
    for (let d = -vp.h; d < vp.w + vp.h; d += step) {
      ctx.moveTo(d, 0);
      ctx.lineTo(d + vp.h, vp.h);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawDensity(vp, ps, opts) {
    const s = opts.s;
    if (!Number.isInteger(s) || s < 1) {
      log.once('bad-s', 'warn', `density overlay: invalid s=${s}`);
      return;
    }
    const box = vp.visibleBox();
    const apron = Math.ceil(s / 2) + 1;
    const x0 = box.x0 - apron,
      y0 = box.y0 - apron;
    const w = box.x1 - box.x0 + 2 * apron,
      h = box.y1 - box.y0 + 2 * apron;
    if (!(w > 0) || !(h > 0)) return;
    // Aggregate LOD: cap the sample grid, never sample sparsely.
    const stride = Math.max(1, Math.ceil(Math.max(w, h) / 700));
    this.lastStride = stride;
    const sig = `${x0},${y0},${w},${h},${stride},${s},${ps.k},${opts.norm}`;
    if (!this._cache || this._cache.sig !== sig) {
      const R = rasterize(ps.points, x0, y0, w, h, stride);
      if (R.cw <= 0 || R.ch <= 0) return;
      if (R.cw * R.ch > MAX_IMAGE_PIXELS) {
        log.once(
          'overlay-too-big',
          'warn',
          `density overlay skipped: ${R.cw}x${R.ch} exceeds ${MAX_IMAGE_PIXELS} px`
        );
        return;
      }
      const S = buildSAT(R.grid, R.cw, R.ch);
      const sCells = Math.max(1, Math.round(s / stride));
      const D = centeredDensityMap(S, R.cw, R.ch, sCells);
      const denom = opts.norm === '2s' ? 2 * s : s;
      const domain = opts.norm === '2s' ? 1 : 2;
      const img = this.offCtx.createImageData(R.cw, R.ch);
      const px = img.data;
      for (let y = 0; y < R.ch; y++) {
        for (let x = 0; x < R.cw; x++) {
          const v = D[y * R.cw + x] / denom;
          const c = viridis(v / domain);
          // top-down image rows correspond to decreasing world y
          const o = ((R.ch - 1 - y) * R.cw + x) * 4;
          px[o] = c[0];
          px[o + 1] = c[1];
          px[o + 2] = c[2];
          px[o + 3] = 255;
        }
      }
      this.off.width = R.cw;
      this.off.height = R.ch;
      this.offCtx.putImageData(img, 0, 0);
      this._cache = { sig, R, D, denom, domain, sCells };
    }
    const R = this._cache.R;
    const sx = vp.toScreenX(R.x0 - 0.5);
    const sy = vp.toScreenY(R.y0 + R.ch * R.stride - 0.5);
    const sw = R.cw * R.stride * vp.zoom,
      sh = R.ch * R.stride * vp.zoom;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = opts.alpha;
    ctx.drawImage(this.off, sx, sy, sw, sh);
    ctx.restore();
  }

  _drawGrid(vp) {
    if (vp.zoom < 8) return;
    const ctx = this.ctx,
      b = vp.visibleBox();
    ctx.strokeStyle = 'rgba(140,160,185,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = b.x0; x <= b.x1; x++) {
      const sx = Math.round(vp.toScreenX(x - 0.5)) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, vp.h);
    }
    for (let y = b.y0; y <= b.y1; y++) {
      const sy = Math.round(vp.toScreenY(y - 0.5)) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(vp.w, sy);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(88,166,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(vp.toScreenX(0), 0);
    ctx.lineTo(vp.toScreenX(0), vp.h);
    ctx.moveTo(0, vp.toScreenY(0));
    ctx.lineTo(vp.w, vp.toScreenY(0));
    ctx.stroke();
  }

  // Ring guides are L∞ spheres, i.e. squares — the overlay's iso-contours.
  _drawRings(vp, rGen) {
    const ctx = this.ctx;
    const spanCells = vp.w / vp.zoom;
    let step = Math.pow(2, Math.max(0, Math.ceil(Math.log2(spanCells / 12))));
    ctx.strokeStyle = 'rgba(200,140,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let R = step; R <= rGen; R += step) {
      const x0 = vp.toScreenX(-R - 0.5),
        x1 = vp.toScreenX(R + 0.5);
      const y0 = vp.toScreenY(R + 0.5),
        y1 = vp.toScreenY(-R - 0.5);
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.stroke();
  }

  _drawPoints(vp, ps) {
    const ctx = this.ctx,
      z = vp.zoom,
      k = ps.k,
      P = ps.points;
    if (!k) return;
    const b = vp.visibleBox();
    if (z >= 2) {
      const size = Math.max(2, z * 0.72);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < k; i++) {
        const x = P[2 * i],
          y = P[2 * i + 1];
        if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
        ctx.fillRect(vp.toScreenX(x) - size / 2, vp.toScreenY(y) - size / 2, size, size);
      }
    } else {
      // Sub-pixel: accumulate into pixel buckets (aggregate, not sample).
      const iw = Math.max(1, Math.min(8192, Math.ceil(vp.w)));
      const ih = Math.max(1, Math.min(8192, Math.ceil(vp.h)));
      const img = this.ctx.createImageData(iw, ih);
      const d = img.data;
      for (let i = 0; i < k; i++) {
        const x = P[2 * i],
          y = P[2 * i + 1];
        const sx = vp.toScreenX(x) | 0,
          sy = vp.toScreenY(y) | 0;
        if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
        const o = (sy * img.width + sx) * 4;
        d[o] = Math.min(255, d[o] + 90);
        d[o + 1] = Math.min(255, d[o + 1] + 90);
        d[o + 2] = Math.min(255, d[o + 2] + 90);
        d[o + 3] = 255;
      }
      this.off.width = img.width;
      this.off.height = img.height;
      this.offCtx.putImageData(img, 0, 0);
      this.ctx.drawImage(this.off, 0, 0);
    }
  }

  _drawSelection(vp, sel) {
    const ctx = this.ctx;
    const x0 = vp.toScreenX(sel.x0 - 0.5),
      x1 = vp.toScreenX(sel.x0 + sel.s - 0.5);
    const y0 = vp.toScreenY(sel.y0 + sel.s - 0.5),
      y1 = vp.toScreenY(sel.y0 - 0.5);
    ctx.strokeStyle = '#ffd33d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  _drawHover(vp, cell) {
    if (vp.zoom < 4) return;
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,211,61,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vp.toScreenX(cell[0] - 0.5), vp.toScreenY(cell[1] + 0.5), vp.zoom, vp.zoom);
  }
}

export { linfIndex };
