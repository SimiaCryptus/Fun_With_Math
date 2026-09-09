/**
 * atlas.js — one canvas glyph atlas for every letter (§5.2).
  * White glyphs with a dark halo on transparent. The letter shader tints the
  * white (r = 1) part per instance and keeps the halo dark, so glyphs stay
  * readable over any cube colour and over each other.
 */

import * as THREE from 'three';

export const GLYPHS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'QU'];

/**
 * @returns {{texture: THREE.Texture, uv: Map<string, [number,number,number,number]>,
 *            get(letter: string): [number,number,number,number]}}
 */
export function createAtlas({ size = 1024, cols = 6 } = {}) {
  const rows = Math.ceil(GLYPHS.length / cols);
  const cw = size / cols;
  const ch = size / rows;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
   g.lineJoin = 'round';
   g.lineCap = 'round';

  const uv = new Map();
  GLYPHS.forEach((glyph, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const cx = c * cw + cw / 2;
    const cy = r * ch + ch / 2;
    const two = glyph.length > 1;
     const text = two ? 'Qu' : glyph;
     g.font = `800 ${Math.round(ch * (two ? 0.46 : 0.68))}px ui-rounded, system-ui, sans-serif`;
     // dark halo first, white glyph on top
     g.lineWidth = Math.max(2, ch * 0.075);
     g.strokeStyle = '#000000';
     g.strokeText(text, cx, cy + ch * 0.02);
     g.fillStyle = '#ffffff';
     g.fillText(text, cx, cy + ch * 0.02);
    // v is flipped: texture space origin is bottom-left.
    uv.set(glyph, [c / cols, 1 - (r + 1) / rows, 1 / cols, 1 / rows]);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;

  const fallback = uv.get('A');
  return {
    texture,
    uv,
    get(letter) {
      const key = String(letter).toUpperCase();
      return uv.get(key === 'QU' ? 'QU' : key) ?? fallback;
    },
  };
}

export default createAtlas;