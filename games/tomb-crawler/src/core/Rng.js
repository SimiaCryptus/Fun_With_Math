export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Murmur3-style integer hash of any number of ints.
export function hash32(...values) {
  let h = 0x9e3779b9;
  for (const v of values) {
    let k = v | 0;
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  constructor(seed) { this._next = mulberry32(seed); }
  float() { return this._next(); }
  range(a, b) { return a + (b - a) * this._next(); }
  int(a, b) { return a + Math.floor(this._next() * (b - a + 1)); }
  chance(p) { return this._next() < p; }
  pick(arr) { return arr[Math.floor(this._next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted(entries) {
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    let x = this._next() * total;
    for (const [v, w] of entries) {
      x -= Math.max(0, w);
      if (x < 0) return v;
    }
    return entries[entries.length - 1][0];
  }
}

export const randomSeed = () => (Math.random() * 4294967296) >>> 0;
export const dailySeed = () => {
  const d = new Date();
  return hash32(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0xdada);
};