/** Seeded randomness: mulberry32, string hash, Gaussian samples, per-id seed vectors. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the joined parts, followed by a murmur-style avalanche. */
export function hash(...parts) {
  const s = parts.join('\u241f');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Standard normal sample (Box–Muller). */
export function gaussian(rand) {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The same id and seed always give the same vector. */
export function seedVector(id, seed, d, { normalize = false } = {}) {
  const rand = mulberry32(hash(id, seed));
  const v = new Float32Array(d);
  let s = 0;
  for (let i = 0; i < d; i++) {
    v[i] = gaussian(rand);
    s += v[i] * v[i];
  }
  if (normalize && s > 0) {
    const k = 1 / Math.sqrt(s);
    for (let i = 0; i < d; i++) v[i] *= k;
  }
  return v;
}