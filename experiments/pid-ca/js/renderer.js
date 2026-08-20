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
/** Bioelectrical palette (bioelectrical.md §7): polarized / firing / refractory. */
export const MEMBRANE_COLORS = [
  [18, 28, 52], // 0 — polarized (gate CLOSED)
  [244, 248, 255], // 1 — firing (gate OPEN)
  [168, 56, 56], // 2 — refractory
];
const OVERLAY_MID = [16, 18, 24];
const OVERLAY_COLD = [70, 130, 255];
const OVERLAY_WARM = [255, 120, 40];
/**
 * Every colour the renderer uses, resolved to numeric RGB. The defaults below
 * mirror the schema defaults in config.js — a Config always overrides them.
 */
export const DEFAULT_THEME = {
  background: '#05080c',
  zero: ZERO_COLOR,
  posLow: POS_LOW,
  posHigh: POS_HIGH,
  negLow: NEG_LOW,
  negHigh: NEG_HIGH,
  membrane: MEMBRANE_COLORS,
  overlayMid: OVERLAY_MID,
  overlayCold: OVERLAY_COLD,
  overlayWarm: OVERLAY_WARM,
  overlayAlpha: 0.72,
  gridLine: 'rgba(255,255,255,0.07)',
};
/** Configuration keys that participate in the visual theme (cache key source). */
const THEME_KEYS = [
  'colorBackground',
  'colorState0',
  'colorStatePosLow',
  'colorStatePosHigh',
  'colorStateNegLow',
  'colorStateNegHigh',
  'colorPolarized',
  'colorFiring',
  'colorRefractory',
  'colorOverlayMid',
  'colorOverlayLow',
  'colorOverlayHigh',
  'overlayAlpha',
  'colorGridLines',
  'gridLineAlpha',
];
/** `#rrggbb` / `#rgb` → [r, g, b]; `fallback` on anything unparseable. */
export function hexToRgb(hex, fallback = [0, 0, 0]) {
  if (typeof hex !== 'string') return fallback;
  let s = hex.trim().replace(/^#/, '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return fallback;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** [r, g, b] → `rgb(r,g,b)` (rounded), for DOM styling. */
export function rgbCss(c) {
  return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
}
/** Stable cache key for the palette derived from a configuration. */
export function themeKey(cfg) {
  if (!cfg) return 'default';
  let key = '';
  for (const k of THEME_KEYS) key += String(cfg[k]) + '|';
  return key;
}
/** Resolve a configuration into the numeric palette the renderer consumes. */
export function themeFromConfig(cfg) {
  if (!cfg) return DEFAULT_THEME;
  const line = hexToRgb(cfg.colorGridLines, [255, 255, 255]);
  const lineAlpha = Number.isFinite(cfg.gridLineAlpha) ? cfg.gridLineAlpha : 0.07;
  return {
    background:
      typeof cfg.colorBackground === 'string' ? cfg.colorBackground : DEFAULT_THEME.background,
    zero: hexToRgb(cfg.colorState0, ZERO_COLOR),
    posLow: hexToRgb(cfg.colorStatePosLow, POS_LOW),
    posHigh: hexToRgb(cfg.colorStatePosHigh, POS_HIGH),
    negLow: hexToRgb(cfg.colorStateNegLow, NEG_LOW),
    negHigh: hexToRgb(cfg.colorStateNegHigh, NEG_HIGH),
    membrane: [
      hexToRgb(cfg.colorPolarized, MEMBRANE_COLORS[0]),
      hexToRgb(cfg.colorFiring, MEMBRANE_COLORS[1]),
      hexToRgb(cfg.colorRefractory, MEMBRANE_COLORS[2]),
    ],
    overlayMid: hexToRgb(cfg.colorOverlayMid, OVERLAY_MID),
    overlayCold: hexToRgb(cfg.colorOverlayLow, OVERLAY_COLD),
    overlayWarm: hexToRgb(cfg.colorOverlayHigh, OVERLAY_WARM),
    overlayAlpha: Number.isFinite(cfg.overlayAlpha) ? cfg.overlayAlpha : 0.72,
    gridLine: 'rgba(' + line[0] + ',' + line[1] + ',' + line[2] + ',' + lineAlpha + ')',
  };
}

function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Colour for a signed state within [min, max] (§7.6). */
export function colorForState(s, min, max, theme = DEFAULT_THEME) {
  if (s === 0) return theme.zero;
  if (s > 0) {
    const span = Math.max(1, max - 1);
    return lerpColor(theme.posLow, theme.posHigh, Math.min(1, (s - 1) / span));
  }
  const span = Math.max(1, -min - 1);
  return lerpColor(theme.negLow, theme.negHigh, Math.min(1, (-s - 1) / span));
}

/** Palette indexed by (state − min). */
export function buildStatePalette(min, max, theme = DEFAULT_THEME) {
  const lo = Math.min(0, min | 0);
  const hi = Math.max(lo, max | 0);
  const out = [];
  for (let s = lo; s <= hi; s++) out.push(colorForState(s, lo, hi, theme));
  return out;
}

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
    this._themeKey = null;
    this._theme = DEFAULT_THEME;
  }
  /** Cached theme; rebuilding it also invalidates the state palette. */
  _themeFor(cfg) {
    const key = themeKey(cfg);
    if (this._themeKey !== key) {
      this._themeKey = key;
      this._theme = themeFromConfig(cfg);
      this._paletteKey = null;
      this.canvas.style.background = this._theme.background;
    }
    return this._theme;
  }
  /** Cached signed-range palette; rebuilt only when the range changes. */
  _statePalette(min, max, theme) {
    const key = min + ':' + max + ':' + this._themeKey;
    if (this._paletteKey !== key) {
      this._paletteKey = key;
      this._palette = buildStatePalette(min, max, theme);
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
      case 'target':
        return grid.targetField;
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
    const theme = this._themeFor(cfg);
    const palette = pid ? this._statePalette(cfg.stateMin, cfg.stateMax, theme) : theme.membrane;
    const mid = theme.overlayMid;
    const alpha = theme.overlayAlpha;
    // Signed states are stored as-is, so shift into palette space.
    const offset = pid ? -Math.min(0, cfg.stateMin | 0) : 0;
    const voltageOverlay = cfg.overlay === 'voltage';
    // The target field is shown relative to the scalar T (its neutral value).
    const targetOverlay = cfg.overlay === 'target';
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
          : targetOverlay
            ? (overlay[idx] - cfg.target) / scale
            : overlay[idx] / scale;
        if (t > 1) t = 1;
        else if (t < -1) t = -1;
        const a = Math.abs(t);
        const target = t < 0 ? theme.overlayCold : theme.overlayWarm;
        const hr = mid[0] + (target[0] - mid[0]) * a;
        const hg = mid[1] + (target[1] - mid[1]) * a;
        const hb = mid[2] + (target[2] - mid[2]) * a;
        r = r * (1 - alpha) + hr * alpha;
        g = g * (1 - alpha) + hg * alpha;
        b = b * (1 - alpha) + hb * alpha;
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

    if (cfg.showGridLines && cellSize >= 5) this._drawGridLines(grid, cellSize, theme);
  }

  _drawGridLines(grid, cellSize, theme) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = (theme || DEFAULT_THEME).gridLine;
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
