/**
 * RNG — deterministic randomness. See idea.md §3.1.
 *
 * Every board flows from a 32-bit seed so it can be shared as a short string
 * and so the Daily Cube is identical for everyone.
 */

/**
 * mulberry32: tiny, fast 32-bit PRNG. Returns a function yielding floats in [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash → unsigned 32-bit integer. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** In-place Fisher–Yates shuffle driven by `rng`. Returns the same array. */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Uniformly pick one element. */
export function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Integer in [min, max) */
export function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min));
}

/** A fresh, non-deterministic 32-bit seed (crypto when available). */
export function randomSeed() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    return c.getRandomValues(new Uint32Array(1))[0];
  }
  return (Math.random() * 2 ** 32) >>> 0;
}

/** 8-hex-digit representation used in share strings. */
export function seedToHex(seed) {
  return (seed >>> 0).toString(16).padStart(8, '0');
}

/** Parse an 8-hex-digit seed; returns null if malformed. */
export function hexToSeed(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{1,8}$/i.test(hex)) return null;
  return parseInt(hex, 16) >>> 0;
}