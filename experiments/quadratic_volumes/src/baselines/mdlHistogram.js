// Regular-grid histogram with MDL-chosen bin count, scored in the same
// currency as the tree: model bits + held-out bits/point at resolution eps.

import { log2 } from '../core/special.js';

const GRIDS = [2, 3, 4, 6, 8, 12, 16, 24, 32];

function fit(points, idx, B, d = 3) {
  const K = Math.pow(B, d);
  const counts = new Float64Array(K);
  for (const i of idx) {
    let k = 0;
    for (let a = 0; a < d; a++) {
      const v = Math.min(B - 1, Math.max(0, Math.floor(points[i * d + a] * B)));
      k = k * B + v;
    }
    counts[k]++;
  }
  return { B, K, counts, n: idx.length, V: Math.pow(1 / B, d) };
}

function bits(model, points, idx, vEps, d = 3) {
  const { B, K, counts, n, V } = model;
  const denom = n + 0.5 * K;
  let s = 0;
  for (const i of idx) {
    let k = 0;
    for (let a = 0; a < d; a++) {
      const v = Math.min(B - 1, Math.max(0, Math.floor(points[i * d + a] * B)));
      k = k * B + v;
    }
    const p = (counts[k] + 0.5) / denom;
    s += -log2(p) + log2(V / vEps);
  }
  return s / Math.max(1, idx.length);
}

export function mdlHistogram(points, trainIdx, testIdx, { vEps, d = 3 } = {}) {
  let best = null;
  for (const B of GRIDS) {
    const m = fit(points, trainIdx, B, d);
    const K = m.K;
    if (K > 4 * trainIdx.length) continue;
    const modelBits = log2(GRIDS.length) + ((K - 1) / 2) * log2(Math.max(2, trainIdx.length));
    const train = bits(m, points, trainIdx, vEps, d);
    const score = train + modelBits / trainIdx.length;
    if (!best || score < best.score) best = { m, modelBits, score, B };
  }
  if (!best) return null;
  return {
    name: `MDL histogram (${best.B}³)`,
    bitsPerPoint: bits(best.m, points, testIdx, vEps, d),
    modelBitsPerTrainPoint: best.modelBits / trainIdx.length,
  };
}