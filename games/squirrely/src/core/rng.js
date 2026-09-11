/** 32-bit splitmix-style finaliser used to derive stream seeds. */
export function splitmix32(seed) {
  let z = (seed + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** mulberry32 stream with helpers. Never uses Math.random. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.seed = seed >>> 0;
  rng.int = (n) => Math.floor(rng() * n);
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.norm = () => {
    let u = 0;
    while (u === 0) u = rng();
    const w = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  };
  rng.pick = (arr) => arr[rng.int(arr.length)];
  rng.weighted = (weights) => {
    let sum = 0;
    for (const k in weights) sum += weights[k];
    if (sum <= 0) return null;
    let r = rng() * sum;
    let last = null;
    for (const k in weights) {
      if (weights[k] <= 0) continue;
      last = k;
      r -= weights[k];
      if (r < 0) return k;
    }
    return last;
  };
  rng.fork = (salt) => makeRng(splitmix32(rng.seed ^ Math.imul(salt | 0, 0x9e3779b9)));
  return rng;
}