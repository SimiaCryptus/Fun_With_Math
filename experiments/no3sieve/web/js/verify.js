// verify.js — independent certifier (§7.1). Shares only `primdir` with the engine.
// For each p, hash primdir(q - p) over all q; a collision *is* a collinear triple,
// and the offending triple is reported explicitly. O(k^2) time, O(k) space.
import { primdir, linfIndex, key2 } from './lattice.js';
import { createLogger } from './util/log.js';

const log = createLogger('verify');
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function verify(points, opts = {}) {
  if (!points || typeof points.length !== 'number')
    throw new TypeError('verify: `points` must be an array-like of interleaved x,y');
  if (points.length % 2 !== 0)
    throw new RangeError(`verify: points has odd length ${points.length} (expected x,y pairs)`);
  const k = points.length / 2;
  const t0 = now();
  const softCap = Number.isInteger(opts.warnK) ? opts.warnK : 20000;
  if (k > softCap)
    log.warn(`verify: k=${k} → ~${((k * k) / 1e6).toFixed(0)}M pair checks; this will block`);
  // Duplicates would make primdir(0,0) throw mid-scan; report them as a failure
  // instead of crashing the caller with an opaque "primdir(0,0) is undefined".
  const cells = new Map();
  for (let i = 0; i < k; i++) {
    const x = points[2 * i],
      y = points[2 * i + 1];
    if ((x | 0) !== x || (y | 0) !== y)
      return {
        ok: false,
        method: 'input',
        k,
        reason: `point ${i} = (${x},${y}) is not an int32 lattice point`,
        ms: now() - t0,
      };
    const kk = key2(x, y);
    const prev = cells.get(kk);
    if (prev !== undefined)
      return { ok: false, method: 'duplicate', k, duplicate: [[x, y], prev, i], ms: now() - t0 };
    cells.set(kk, i);
  }
  const seen = new Map();
  for (let i = 0; i < k; i++) {
    seen.clear();
    const ax = points[2 * i],
      ay = points[2 * i + 1];
    for (let j = 0; j < k; j++) {
      if (j === i) continue;
      const d = primdir(points[2 * j] - ax, points[2 * j + 1] - ay);
      const kk = key2(d[0], d[1]);
      const prev = seen.get(kk);
      if (prev !== undefined) {
        return {
          ok: false,
          method: 'primdir-hash',
          k,
          triple: [
            [ax, ay],
            [points[2 * prev], points[2 * prev + 1]],
            [points[2 * j], points[2 * j + 1]],
          ],
          ms: now() - t0,
        };
      }
      seen.set(kk, j);
    }
  }
  // I2 corollary: <= 2 per row / column / diagonal / antidiagonal.
  const buckets = [new Map(), new Map(), new Map(), new Map()];
  for (let i = 0; i < k; i++) {
    const x = points[2 * i],
      y = points[2 * i + 1];
    const keys = [y, x, x - y, x + y];
    for (let b = 0; b < 4; b++) {
      const m = buckets[b],
        kk = keys[b];
      const n = (m.get(kk) || 0) + 1;
      if (n > 2) return { ok: false, method: 'I2', k, line: b, index: kk };
      m.set(kk, n);
    }
  }
  let rMax = 0;
  for (let i = 0; i < k; i++) rMax = Math.max(rMax, linfIndex(points[2 * i], points[2 * i + 1]));
  const ms = now() - t0;
  log.debug(`certified k=${k} rMax=${rMax} in ${ms.toFixed(1)} ms`);
  return {
    ok: true,
    method: 'primdir-hash + I2',
    k,
    rMax,
    ms,
  };
}

/** Brute-force C(k,3) cross-product check (§7.2). Only for small k (CI-grade). */
export function verifyBruteForce(points, maxK = 400) {
  if (!points || typeof points.length !== 'number')
    throw new TypeError('verifyBruteForce: `points` must be an array-like of interleaved x,y');
  if (points.length % 2 !== 0)
    throw new RangeError(`verifyBruteForce: points has odd length ${points.length}`);
  if (!Number.isInteger(maxK) || maxK < 0)
    throw new RangeError(`verifyBruteForce: maxK must be a non-negative integer (got ${maxK})`);
  const k = points.length / 2;
  if (k > maxK) {
    log.debug(`brute force skipped: k=${k} > maxK=${maxK}`);
    return { ok: true, skipped: true, k, reason: `k > ${maxK}` };
  }
  for (let a = 0; a < k; a++)
    for (let b = a + 1; b < k; b++)
      for (let c = b + 1; c < k; c++) {
        const ax = points[2 * a],
          ay = points[2 * a + 1];
        const bx = points[2 * b] - ax,
          by = points[2 * b + 1] - ay;
        const cx = points[2 * c] - ax,
          cy = points[2 * c + 1] - ay;
        if (bx * cy - by * cx === 0) {
          return {
            ok: false,
            method: 'cross-product',
            triple: [
              [ax, ay],
              [points[2 * b], points[2 * b + 1]],
              [points[2 * c], points[2 * c + 1]],
            ],
          };
        }
      }
  return { ok: true, method: 'cross-product', k };
}
