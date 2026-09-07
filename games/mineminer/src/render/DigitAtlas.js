import * as THREE from 'three';

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;
export const GLYPH_X = 27; // ✕ glyph slot, used for defused mines and scars

const BASE_COLOURS = [
  '#000000', '#4d8dff', '#3ddc5a', '#ff4646', '#7b8cff',
  '#e0568a', '#2fd3d3', '#ffffff', '#b8b8b8',
];

/** Classic Minesweeper ramp for 1–8, then a perceptual purple→magenta ramp for 9–26. */
export function numberColour(n, target = new THREE.Color()) {
  if (n <= 8) return target.set(BASE_COLOURS[n]);
  const t = (n - 9) / 17;
  return target.setHSL(0.78 + 0.12 * t, 0.85, 0.62 + 0.15 * t);
}

/** Canvas-baked glyph atlas: slots 0..26 are digits, slot 27 is ✕. White glyphs, tinted per instance. */
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
    for (let n = 1; n <= GLYPH_X; n++) {
      const col = n % ATLAS_COLS;
      const row = Math.floor(n / ATLAS_COLS);
      const cx = col * cell + cell / 2;
      const cy = row * cell + cell / 2;
      const text = n === GLYPH_X ? '✕' : String(n);
      const size = text.length > 1 ? cell * 0.58 : cell * 0.74;
      ctx.font = `bold ${size}px "Segoe UI", Roboto, Arial, sans-serif`;
      ctx.fillText(text, cx, cy);
      if (colourblind && (n === 6 || n === 9)) {
        ctx.fillRect(cx - cell * 0.22, cy + cell * 0.36, cell * 0.44, cell * 0.06);
      }
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.uvScale = new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
  }

  /** Bottom-left UV of glyph `n` (CanvasTexture flips Y). */
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