// viewport.js — infinite-canvas camera (§5.2). World coordinates ARE lattice
// coordinates. No bounds, no clamping. f64 stays exact to |x| < 2^53.
// Defensive note: "no clamping" applies to the *world*, not to the inputs. A NaN
// that reaches cx/cy silently blanks every subsequent frame, so it is rejected here.
import { createLogger } from './util/log.js';

const log = createLogger('viewport');
const MIN_ZOOM = 1 / 64,
  MAX_ZOOM = 64;
const SAFE = 9007199254740992; // 2^53
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export class Viewport {
  constructor() {
    this.cx = 0;
    this.cy = 0;
    this.zoom = 12; // pixels per cell
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
  }

  resize(w, h, dpr) {
    if (!fin(w) || !fin(h) || w <= 0 || h <= 0) {
      log.warn(`resize: ignoring non-positive viewport ${w}x${h}`);
      return;
    }
    this.w = w;
    this.h = h;
    this.dpr = fin(dpr) && dpr > 0 ? dpr : 1;
  }

  toScreenX(x) {
    return (x - this.cx) * this.zoom + this.w / 2;
  }

  toScreenY(y) {
    return this.h / 2 - (y - this.cy) * this.zoom;
  } // +y is up
  toWorldX(sx) {
    return (sx - this.w / 2) / this.zoom + this.cx;
  }

  toWorldY(sy) {
    return (this.h / 2 - sy) / this.zoom + this.cy;
  }

  cellAt(sx, sy) {
    if (!fin(sx) || !fin(sy)) return null;
    const x = Math.round(this.toWorldX(sx)),
      y = Math.round(this.toWorldY(sy));
    if (!fin(x) || !fin(y) || Math.abs(x) > SAFE || Math.abs(y) > SAFE) return null;
    return [x, y];
  }

  panPixels(dx, dy) {
    if (!fin(dx) || !fin(dy)) {
      log.warn(`panPixels: ignoring (${dx},${dy})`);
      return;
    }
    this.cx -= dx / this.zoom;
    this.cy += dy / this.zoom;
    this._sane('panPixels');
  }

  /** Zoom anchored at a screen point: the cell under the cursor is invariant. */
  zoomAt(sx, sy, factor) {
    if (!fin(sx) || !fin(sy) || !fin(factor) || factor <= 0) {
      log.warn(`zoomAt: ignoring (${sx},${sy},×${factor})`);
      return;
    }
    const wx = this.toWorldX(sx),
      wy = this.toWorldY(sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.cx = wx - (sx - this.w / 2) / this.zoom;
    this.cy = wy - (this.h / 2 - sy) / this.zoom;
    this._sane('zoomAt');
  }

  fitRing(R) {
    if (!fin(R) || R < 0) {
      log.warn(`fitRing: ignoring R=${R}`);
      return;
    }
    const pad = 1.08;
    this.cx = 0;
    this.cy = 0;
    this.zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(this.w, this.h) / ((2 * R + 1) * pad))
    );
  }

  /** Last line of defence: a NaN camera renders an empty canvas forever. */
  _sane(where) {
    if (fin(this.cx) && fin(this.cy) && fin(this.zoom) && this.zoom > 0) return;
    log.error(
      `${where}: camera became non-finite (cx=${this.cx}, cy=${this.cy}, zoom=${this.zoom}); resetting`
    );
    this.cx = 0;
    this.cy = 0;
    this.zoom = 12;
  }

  /** Visible world box, integer cell bounds inclusive. */
  visibleBox() {
    this._sane('visibleBox');
    return {
      x0: Math.floor(this.toWorldX(0)) - 1,
      x1: Math.ceil(this.toWorldX(this.w)) + 1,
      y0: Math.floor(this.toWorldY(this.h)) - 1,
      y1: Math.ceil(this.toWorldY(0)) + 1,
    };
  }
}
