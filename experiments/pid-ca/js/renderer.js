/**
 * renderer.js — canvas visualisation of the current grid (§7.6, §9).
 *
 * Never mutates simulation state. Draws at grid resolution into an offscreen
 * ImageData, then upscales with nearest-neighbour sampling.
 */

/** Neutral (state 0) and the two signed ramp endpoints. */
export const ZERO_COLOR = [16, 21, 28];
const POS_LOW = [78, 201, 176]; // +1 — teal
const POS_HIGH = [240, 162, 74]; // +max — amber
const NEG_LOW = [86, 132, 224]; // −1 — blue
const NEG_HIGH = [186, 92, 226]; // −min — violet

/** Legacy 3-entry palette (0 / +1 / +2), retained for convenience. */
export const STATE_COLORS = [ZERO_COLOR, POS_LOW, POS_HIGH];

function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Colour for a signed state within [min, max] (§7.6). */
export function colorForState(s, min, max) {
  if (s === 0) return ZERO_COLOR;
  if (s > 0) {
    const span = Math.max(1, max - 1);
    return lerpColor(POS_LOW, POS_HIGH, Math.min(1, (s - 1) / span));
  }
  const span = Math.max(1, -min - 1);
  return lerpColor(NEG_LOW, NEG_HIGH, Math.min(1, (-s - 1) / span));
}

/** Palette indexed by (state − min). */
export function buildStatePalette(min, max) {
  const lo = Math.min(0, min | 0);
  const hi = Math.max(lo, max | 0);
  const out = [];
  for (let s = lo; s <= hi; s++) out.push(colorForState(s, lo, hi));
  return out;
}
/** Bioelectrical palette (bioelectrical.md §7): polarized / firing / refractory. */
export const MEMBRANE_COLORS = [
  [18, 28, 52], // 0 — polarized (gate CLOSED)
  [244, 248, 255], // 1 — firing (gate OPEN)
  [168, 56, 56], // 2 — refractory
];

const OVERLAY_MID = [16, 18, 24];
const OVERLAY_COLD = [70, 130, 255];
const OVERLAY_WARM = [255, 120, 40];
const OVERLAY_ALPHA = 0.72;

const MAX_CANVAS_EDGE = 4096;

export class Renderer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;
    this.offscreen = document.createElement('canvas');
    this.offCtx = this.offscreen.getContext('2d');
    this.image = null;
    this.cellSize = config.get('cellSize');
    this._paletteKey = null;
    this._palette = STATE_COLORS;
  }
  /** Cached signed-range palette; rebuilt only when the range changes. */
  _statePalette(min, max) {
    const key = min + ':' + max;
    if (this._paletteKey !== key) {
      this._paletteKey = key;
      this._palette = buildStatePalette(min, max);
    }
    return this._palette;
  }

  /** Effective cell size, capped so the backing canvas never explodes. */
  _effectiveCellSize(grid) {
    const requested = Math.max(1, this.config.get('cellSize') | 0);
    const capW = Math.max(1, Math.floor(MAX_CANVAS_EDGE / grid.width));
    const capH = Math.max(1, Math.floor(MAX_CANVAS_EDGE / grid.height));
    return Math.max(1, Math.min(requested, capW, capH));
  }

  _ensureBuffers(grid, cellSize) {
    if (this.offscreen.width !== grid.width || this.offscreen.height !== grid.height) {
      this.offscreen.width = grid.width;
      this.offscreen.height = grid.height;
      this.image = this.offCtx.createImageData(grid.width, grid.height);
    }
    const cw = grid.width * cellSize;
    const ch = grid.height * cellSize;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.canvas.style.width = cw + 'px';
    }
  }

  _overlayBuffer(grid, mode) {
    switch (mode) {
      case 'u':
        return grid.u;
      case 'integral':
        return grid.integral;
      case 'error':
        return grid.error;
      case 'voltage':
        return grid.V;
      default:
        return null;
    }
  }

  draw(simulation) {
    const cfg = this.config.all();
    const grid = simulation.grid;
    const cellSize = this._effectiveCellSize(grid);
    this.cellSize = cellSize;
    this._ensureBuffers(grid, cellSize);

    const data = this.image.data;
    const states = grid.states;
    const overlay = this._overlayBuffer(grid, cfg.overlay);
    const scale = Math.max(0.0001, cfg.overlayScale);
    const pid = cfg.mode === 'pid';
    const palette = pid ? this._statePalette(cfg.stateMin, cfg.stateMax) : MEMBRANE_COLORS;
    // Signed states are stored as-is, so shift into palette space.
    const offset = pid ? -Math.min(0, cfg.stateMin | 0) : 0;
    const voltageOverlay = cfg.overlay === 'voltage';
    const hotSpan = Math.max(1e-6, cfg.vMax - cfg.vRest);
    const coldSpan = Math.max(1e-6, cfg.vRest - cfg.vMin);

    for (let idx = 0, p = 0; idx < grid.size; idx++, p += 4) {
      const base = palette[states[idx] + offset] || palette[offset] || palette[0];
      let r = base[0],
        g = base[1],
        b = base[2];

      if (overlay) {
        // Voltage maps V_min (cold) → V_rest (neutral) → V_max (hot) (§7).
        let t = voltageOverlay
          ? (overlay[idx] - cfg.vRest) / (overlay[idx] >= cfg.vRest ? hotSpan : coldSpan)
          : overlay[idx] / scale;
        if (t > 1) t = 1;
        else if (t < -1) t = -1;
        const a = Math.abs(t);
        const target = t < 0 ? OVERLAY_COLD : OVERLAY_WARM;
        const hr = OVERLAY_MID[0] + (target[0] - OVERLAY_MID[0]) * a;
        const hg = OVERLAY_MID[1] + (target[1] - OVERLAY_MID[1]) * a;
        const hb = OVERLAY_MID[2] + (target[2] - OVERLAY_MID[2]) * a;
        r = r * (1 - OVERLAY_ALPHA) + hr * OVERLAY_ALPHA;
        g = g * (1 - OVERLAY_ALPHA) + hg * OVERLAY_ALPHA;
        b = b * (1 - OVERLAY_ALPHA) + hb * OVERLAY_ALPHA;
      }

      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }

    this.offCtx.putImageData(this.image, 0, 0);

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);

    if (cfg.showGridLines && cellSize >= 5) this._drawGridLines(grid, cellSize);
  }

  _drawGridLines(grid, cellSize) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < grid.width; x++) {
      const px = x * cellSize + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.canvas.height);
    }
    for (let y = 1; y < grid.height; y++) {
      const py = y * cellSize + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(this.canvas.width, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Translate a pointer event into grid coordinates, or null if outside. */
  cellFromEvent(event, grid) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    const px = (event.clientX - rect.left) * sx;
    const py = (event.clientY - rect.top) * sy;
    const x = Math.floor(px / this.cellSize);
    const y = Math.floor(py / this.cellSize);
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
    return { x, y };
  }
}
