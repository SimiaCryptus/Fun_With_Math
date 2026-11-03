// Deterministic, seedable PRNGs. DOM-free.

/** mulberry32: fast 32-bit seeded generator. Returns float in [0,1). */
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

/**
 * Wrap a uniform generator with the helpers the lab needs.
 * @param {number|function} seedOrFn
 */
export function makeRng(seedOrFn = 1) {
  const next = typeof seedOrFn === 'function' ? seedOrFn : mulberry32(seedOrFn);
  let spare = null;

  const rng = {
    /** uniform in [0,1) */
    uniform: next,
    /** uniform in [lo,hi) */
    range(lo, hi) {
      return lo + (hi - lo) * next();
    },
    /** integer in [0,n) */
    int(n) {
      return Math.min(n - 1, Math.floor(next() * n));
    },
    /** standard normal (Marsaglia polar, cached spare) */
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u, v, s2;
      do {
        u = 2 * next() - 1;
        v = 2 * next() - 1;
        s2 = u * u + v * v;
      } while (s2 === 0 || s2 >= 1);
      const m = Math.sqrt((-2 * Math.log(s2)) / s2);
      spare = v * m;
      return u * m;
    },
    /** in-place Fisher-Yates */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
    /** indices 0..n-1 shuffled */
    permutation(n) {
      const a = new Int32Array(n);
      for (let i = 0; i < n; i++) a[i] = i;
      return rng.shuffle(a);
    },
    /** split a 0..n-1 index set into two disjoint parts */
    splitIndices(n, fracFirst) {
      const p = rng.permutation(n);
      const k = Math.round(n * fracFirst);
      return { first: p.slice(0, k), second: p.slice(k) };
    },
  };
  return rng;
}