// Seeded PRNGs (idea.md §4.11). Never use Math.random in the simulation.

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

// createRng('labrek-001') → function returning [0,1). Compatible with simplex-noise createNoise3D(rng).
export function createRng(seed) {
  const s = typeof seed === 'number' ? (seed >>> 0) : fnv1a(String(seed));
  const m = mulberry32(s);
  const u = () => (m() * 4294967296) >>> 0;
  const r = sfc32(u(), u(), u(), u());
  for (let i = 0; i < 12; i++) r();
  const rng = () => r();
  rng.int = (n) => Math.floor(r() * n);
  rng.range = (lo, hi) => lo + (hi - lo) * r();
  return rng;
}