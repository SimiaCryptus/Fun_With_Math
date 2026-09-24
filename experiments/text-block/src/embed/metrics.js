import { covariance, jacobiEig } from './linalg.js';

/** Diagnostics for an embedding X (n×d, position order). */

function dist2(X, d, p, q) {
  let s = 0;
  for (let c = 0; c < d; c++) {
    const df = X[p * d + c] - X[q * d + c];
    s += df * df;
  }
  return s;
}

/** (Σλ)² / Σλ² of the centred covariance; ≈1 means collapse. */
export function effectiveRank(X, n, d) {
  if (n < 2 || d < 1) return 0;
  const { C } = covariance(X, n, d);
  const { values } = jacobiEig(C, d);
  let s1 = 0;
  let s2 = 0;
  for (let v of values) {
    v = Math.max(v, 0);
    s1 += v;
    s2 += v * v;
  }
  return s2 > 0 ? (s1 * s1) / s2 : 0;
}

/** Indices of the k nearest positions to p (excluding p). */
export function knn(X, n, d, p, k = 5) {
  const cand = [];
  for (let q = 0; q < n; q++) if (q !== p) cand.push([q, dist2(X, d, p, q)]);
  cand.sort((a, b) => a[1] - b[1]);
  return cand.slice(0, k).map((c) => c[0]);
}

/** Fraction of each position's k nearest neighbours that share its glyph. */
export function knnPurity(X, n, d, codes, k = 5) {
  if (n < 2 || !codes) return 0;
  const kk = Math.min(k, n - 1);
  let hits = 0;
  for (let p = 0; p < n; p++) {
    for (const q of knn(X, n, d, p, kk)) if (codes[q] === codes[p]) hits++;
  }
  return hits / (n * kk);
}

/** ‖x_p − x_{p+1}‖ along the ring. */
export function boundarySignal(X, n, d) {
  const out = new Float32Array(n);
  if (n < 2) return out;
  for (let p = 0; p < n; p++) out[p] = Math.sqrt(dist2(X, d, p, (p + 1) % n));
  return out;
}

/** Mean neighbour distance along the ring vs. mean distance over all pairs. */
export function ringSmoothness(X, n, d) {
  if (n < 3) return { adjacent: 0, random: 0, ratio: 0 };
  const b = boundarySignal(X, n, d);
  let adjacent = 0;
  for (const v of b) adjacent += v;
  adjacent /= n;
  let random = 0;
  let count = 0;
  for (let p = 0; p < n; p++) {
    for (let q = p + 1; q < n; q++) {
      random += Math.sqrt(dist2(X, d, p, q));
      count++;
    }
  }
  random /= count;
  return { adjacent, random, ratio: random > 0 ? adjacent / random : 0 };
}