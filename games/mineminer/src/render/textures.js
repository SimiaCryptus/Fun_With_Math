import * as THREE from 'three';

let cache = null;

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pixelNoise(ctx, size, base, spread, rnd, tint = [1, 1, 1.04]) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = base + (rnd() - 0.5) * spread;
      ctx.fillStyle = `rgb(${v * tint[0] | 0},${v * tint[1] | 0},${v * tint[2] | 0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** 16×16 pixel-art textures baked once at startup (Minecraft DNA, no asset files). */
export function getTextures() {
  if (cache) return cache;

  const stone = make(16, (ctx, s) => {
    const r = lcg(7);
    pixelNoise(ctx, s, 122, 42, r);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let k = 0; k < 12; k++) ctx.fillRect(Math.floor(r() * s), Math.floor(r() * s), 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let k = 0; k < 8; k++) ctx.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1, 1);
  });

  const ore = make(16, (ctx, s) => {
    const r = lcg(11);
    pixelNoise(ctx, s, 96, 36, r);
    for (let k = 0; k < 7; k++) {
      const x = Math.floor(r() * (s - 2));
      const y = Math.floor(r() * (s - 2));
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = '#ffb0b0';
      ctx.fillRect(x, y, 1, 1);
    }
  });

  const marked = make(16, (ctx, s) => {
    const r = lcg(5);
    pixelNoise(ctx, s, 118, 36, r);
    ctx.fillStyle = 'rgba(255,122,26,0.5)';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(5, 3, 1, 10);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.moveTo(6, 3);
    ctx.lineTo(12, 5.5);
    ctx.lineTo(6, 8);
    ctx.closePath();
    ctx.fill();
  });

  const steel = make(32, (ctx, s) => {
    const r = lcg(3);
    pixelNoise(ctx, s, 60, 16, r, [0.95, 1, 1.1]);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(2, 2, s - 4, 1);
    ctx.fillStyle = '#9aa3ad';
    for (const [x, y] of [[4, 4], [s - 6, 4], [4, s - 6], [s - 6, s - 6]]) ctx.fillRect(x, y, 2, 2);
  });
  steel.wrapS = steel.wrapT = THREE.RepeatWrapping;

  cache = { stone, ore, marked, steel };
  return cache;
}