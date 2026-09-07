/** Deterministic string -> uint32 hash (based on cyrb / MurmurHash finalizer). */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: small, fast, good-enough seeded PRNG returning [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed) {
  return mulberry32(typeof seed === 'number' ? seed : hashString(String(seed)));
}

const WORDS = [
  'granite', 'basalt', 'quartz', 'obsidian', 'cobalt', 'flint', 'shale', 'ember',
  'iron', 'copper', 'slate', 'marble', 'pyrite', 'garnet', 'onyx', 'amber',
];

export function randomSeedString() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w}-${Math.floor(Math.random() * 1000)}`;
}