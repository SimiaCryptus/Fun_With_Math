/* =====================================================================
   primegen-core.js — primitives shared by Algorithms A, B and C
   (experiments/primegen/algorithm.md).  No DOM, no network.

     assertExact / MAX_EXACT   integer hygiene (why there is no BigInt)
     buildWheel(w)             §4.2 — wheel tables step[] / gte[]
     MinHeap                   the "merge" of §5.4, keyed by item[0]
     sieveRef(limit)           Eratosthenes — validation only
     countLE / fmtInt          reporting helpers
   ===================================================================== */

export const SMALL_PRIMES = [2, 3, 5, 7, 11, 13, 17];

/* ---------------------------------------------------------------------
   integer hygiene — why there is no BigInt in the hot loop
     Every quantity of these algorithms (n, p, a, r, p^e and the emitted
     composite) is an *exact* integer while it stays below 2^53, so plain
     Numbers are the correct representation: a BigInt in the heap would
     either throw on mixed arithmetic (`p * a` with one BigInt operand) or
     cost ~20× in speed.  The drivers therefore assert the exact range
     instead of silently returning wrong primes — that assertion is
     precisely the point where BigInt (or a segmented restart, §4.6)
     would become necessary.
   ------------------------------------------------------------------ */
export const MAX_EXACT = Number.MAX_SAFE_INTEGER; // 2^53 − 1

export function assertExact(x, what = 'value') {
  if (!Number.isSafeInteger(x))
    throw new RangeError(
      `${what} = ${x} leaves the exact-integer range (2^53 − 1); BigInt required here`
    );
}

/* ---------------------------------------------------------------------
   §4.2  wheel tables
     spokes  = { r in [0,W) : gcd(r,W) = 1 },  spokes[0] = 1
     step[r] = (smallest spoke > r,  possibly wrapped) − r
     gte[r]  = (smallest spoke ≥ r,  possibly wrapped) − r
   Built in one backward pass over [0,W).  Cached per w.
   ------------------------------------------------------------------ */
const wheelCache = new Map();

export function buildWheel(w) {
  if (wheelCache.has(w)) return wheelCache.get(w);
  const wp = SMALL_PRIMES.slice(0, w);
  let W = 1;
  for (const p of wp) W *= p;
  const isSpoke = new Uint8Array(W).fill(1);
  isSpoke[0] = 0; // gcd(0,W) = W
  for (const p of wp) for (let r = 0; r < W; r += p) isSpoke[r] = 0;
  const step = new Int32Array(W),
    gte = new Int32Array(W);
  let nxt = W + 1; // spokes[0] === 1
  for (let r = W - 1; r >= 0; r--) {
    step[r] = nxt - r;
    gte[r] = isSpoke[r] ? 0 : nxt - r;
    if (isSpoke[r]) nxt = r;
  }
  let phi = 0;
  for (let r = 0; r < W; r++) if (isSpoke[r]) phi++;
  const wheel = {
    w,
    primes: wp,
    W,
    phi,
    kappa: phi / W,
    step,
    gte,
    next: (x) => x + step[x % W], // next_coprime
    nextGE: (x) => x + gte[x % W], // next_coprime_ge (§4.6)
    first: 1 + step[1], // = p_{w+1}
  };
  wheelCache.set(w, wheel);
  return wheel;
}

/* ---------------------------------------------------------------------
   binary min-heap keyed by item[0]  (the "merge" of §5.4)
   ------------------------------------------------------------------ */
export class MinHeap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  key() {
    return this.a[0][0];
  }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      const t = a[p];
      a[p] = a[i];
      a[i] = t;
      i = p;
    }
  }
  pop() {
    const a = this.a,
      top = a[0],
      last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        const t = a[i];
        a[i] = a[m];
        a[m] = t;
        i = m;
      }
    }
    return top;
  }
}

/* ---------------------------------------------------------------------
   reference sieve — validation only, never used by the generators
   ------------------------------------------------------------------ */
export function sieveRef(limit) {
  if (limit < 2) return [];
  const s = new Uint8Array(limit + 1).fill(1);
  s[0] = s[1] = 0;
  for (let i = 2; i * i <= limit; i++) if (s[i]) for (let j = i * i; j <= limit; j += i) s[j] = 0;
  const out = [];
  for (let i = 2; i <= limit; i++) if (s[i]) out.push(i);
  return out;
}

/* reporting helpers ------------------------------------------------- */
export function countLE(sorted, x) {
  let i = 0;
  while (i < sorted.length && sorted[i] <= x) i++;
  return i; // π(x) when `sorted` is the prime list
}

export const fmtInt = (n) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : String(n);
