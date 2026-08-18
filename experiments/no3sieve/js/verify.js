// verify.js — independent certifier (§7.1). Shares only `primdir` with the engine.
// For each p, hash primdir(q - p) over all q; a collision *is* a collinear triple,
// and the offending triple is reported explicitly. O(k^2) time, O(k) space.
//
// Horizon-aware (theory.md §2A): with `opts.horizonW = W > 0` only triples of L∞
// span <= W are violations, which is exactly what the engine promises at finite W.
// `W = 0` (default) certifies full, classical validity.
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
  const W = Number.isInteger(opts.horizonW) && opts.horizonW > 0 ? opts.horizonW : Infinity;
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
  const seen = new Map(); // dir class -> indices seen within W of the apex
  for (let i = 0; i < k; i++) {
    seen.clear();
    const ax = points[2 * i],
      ay = points[2 * i + 1];
    for (let j = 0; j < k; j++) {
      if (j === i) continue;
      const vx = points[2 * j] - ax,
        vy = points[2 * j + 1] - ay;
      if (linfIndex(vx, vy) > W) continue; // pair too far to forbid anything
      const d = primdir(vx, vy);
      const kk = key2(d[0], d[1]);
      const list = seen.get(kk);
      if (!list) {
        seen.set(kk, [j]);
        continue;
      }
      for (let q = 0; q < list.length; q++) {
        const p = list[q];
        // The third clause of L2A.4: the two partners may straddle the apex.
        if (linfIndex(points[2 * j] - points[2 * p], points[2 * j + 1] - points[2 * p + 1]) > W)
          continue;
        return {
          ok: false,
          method: 'primdir-hash',
          k,
          horizon_w: W === Infinity ? 0 : W,
          triple: [
            [ax, ay],
            [points[2 * p], points[2 * p + 1]],
            [points[2 * j], points[2 * j + 1]],
          ],
          ms: now() - t0,
        };
      }
      list.push(j);
    }
  }
  // I2 corollary: <= 2 per row / column / diagonal / antidiagonal *per W-window*
  // (L2A.2 + L2.3). At W = ∞ the window is the whole line and this degenerates to
  // the classical "<= 2 ever" — which is precisely what produces the four 2-wide
  // vacancy strips through the origin, at every distance.
  const fams = [
    { name: 'row', key: (x, y) => y, pos: (x) => x },
    { name: 'col', key: (x) => x, pos: (x, y) => y },
    { name: 'diag', key: (x, y) => x - y, pos: (x) => x },
    { name: 'anti', key: (x, y) => x + y, pos: (x) => x },
  ];
  for (const f of fams) {
    const m = new Map();
    for (let i = 0; i < k; i++) {
      const x = points[2 * i],
        y = points[2 * i + 1];
      const kk = f.key(x, y);
      let a = m.get(kk);
      if (!a) m.set(kk, (a = []));
      a.push(f.pos(x, y));
    }
    for (const [kk, a] of m) {
      if (a.length < 3) continue;
      a.sort((p, q) => p - q);
      for (let i = 0; i + 2 < a.length; i++)
        if (a[i + 2] - a[i] <= W)
          return {
            ok: false,
            method: 'I2',
            k,
            horizon_w: W === Infinity ? 0 : W,
            family: f.name,
            index: kk,
            at: [a[i], a[i + 1], a[i + 2]],
          };
    }
  }
  let rMax = 0;
  for (let i = 0; i < k; i++) rMax = Math.max(rMax, linfIndex(points[2 * i], points[2 * i + 1]));
  const ms = now() - t0;
  log.debug(`certified k=${k} rMax=${rMax} W=${W} in ${ms.toFixed(1)} ms`);
  return {
    ok: true,
    method: W === Infinity ? 'primdir-hash + I2' : `primdir-hash + I2 (horizon W=${W})`,
    k,
    horizon_w: W === Infinity ? 0 : W,
    rMax,
    ms,
  };
}

/**
 * Brute-force C(k,3) cross-product check (§7.2). Only for small k (CI-grade).
 * `opts = { maxK, horizonW }`; a bare number is still accepted as `maxK`.
 */
export function verifyBruteForce(points, opts = {}) {
  if (typeof opts === 'number') opts = { maxK: opts };
  const maxK = Number.isInteger(opts.maxK) ? opts.maxK : 400;
  const W = Number.isInteger(opts.horizonW) && opts.horizonW > 0 ? opts.horizonW : Infinity;
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
          // D2A.1: at a finite horizon only span <= W triples are forbidden.
          if (W !== Infinity) {
            const span = Math.max(
              linfIndex(bx, by),
              linfIndex(cx, cy),
              linfIndex(cx - bx, cy - by)
            );
            if (span > W) continue;
          }
          return {
            ok: false,
            method: 'cross-product',
            horizon_w: W === Infinity ? 0 : W,
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
