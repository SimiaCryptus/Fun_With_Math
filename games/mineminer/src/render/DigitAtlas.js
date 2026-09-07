import * as THREE from 'three';

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 7;

/**
 * Glyph slots are indexed in HALF-steps: slot = count * 2. With every class
 * weighted 1 the maximum count is 26 (slot 52); half weights only ever produce
 * multiples of 0.5, so 53 slots cover every reachable label, and slot 53 is ✕.
 */
export const MAX_HALF_STEPS = 52;
export const GLYPH_X = 53; // ✕ glyph slot, used for defused mines and scars

const BASE_COLOURS = [
  '#000000', '#4d8dff', '#3ddc5a', '#ff4646', '#7b8cff',
  '#e0568a', '#2fd3d3', '#ffffff', '#b8b8b8',
];

const _lerp = new THREE.Color();

/** count (possibly fractional) -> atlas slot. */
export function glyphForCount(count) {
  return Math.max(0, Math.min(MAX_HALF_STEPS, Math.round(count * 2)));
}

/** "3", "3½", "½" ... */
export function countLabel(count) {
  const slot = glyphForCount(count);
  const whole = Math.floor(slot / 2);
  if (slot % 2 === 0) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}

function rampColour(n, target) {
  if (n <= 8) return target.set(BASE_COLOURS[n]);
  const t = Math.min(1, (n - 9) / 17);
  return target.setHSL(0.78 + 0.12 * t, 0.85, 0.62 + 0.15 * t);
}

/**
 * Classic Minesweeper ramp for 1–8, then a perceptual purple→magenta ramp for 9–26.
 * Fractional counts blend between the two neighbouring steps.
 */
export function numberColour(n, target = new THREE.Color()) {
  const lo = Math.max(1, Math.floor(n));
  const hi = Math.max(1, Math.ceil(n));
  rampColour(lo, target);
  if (lo === hi) return target;
  return target.lerp(rampColour(hi, _lerp), n - lo);
}

/** Canvas-baked glyph atlas: slots 0..52 are half-step counts, slot 53 is ✕. White glyphs, tinted per instance. */
export class DigitAtlas {
  constructor({ cell = 64, colourblind = false } = {}) {
    this.cell = cell;
    const canvas = document.createElement('canvas');
    canvas.width = cell * ATLAS_COLS;
    canvas.height = cell * ATLAS_ROWS;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let slot = 1; slot <= GLYPH_X; slot++) {
      const col = slot % ATLAS_COLS;
      const row = Math.floor(slot / ATLAS_COLS);
      const cx = col * cell + cell / 2;
      const cy = row * cell + cell / 2;
      const text = slot === GLYPH_X ? '✕' : countLabel(slot / 2);
      const size = cell * (text.length >= 3 ? 0.44 : text.length === 2 ? 0.58 : 0.74);
      ctx.font = `bold ${size}px "Segoe UI", Roboto, Arial, sans-serif`;
      ctx.fillText(text, cx, cy);
      // Colourblind aid: underline the whole-number 6 and 9 (slots 12 and 18).
      if (colourblind && (slot === 12 || slot === 18)) {
        ctx.fillRect(cx - cell * 0.22, cy + cell * 0.36, cell * 0.44, cell * 0.06);
      }
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.uvScale = new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
  }

  /** Bottom-left UV of glyph slot `n` (CanvasTexture flips Y). */
  uvOffset(n, out) {
    const col = n % ATLAS_COLS;
    const row = Math.floor(n / ATLAS_COLS);
    out[0] = col / ATLAS_COLS;
    out[1] = 1 - (row + 1) / ATLAS_ROWS;
    return out;
  }

  dispose() {
    this.texture.dispose();
  }
}