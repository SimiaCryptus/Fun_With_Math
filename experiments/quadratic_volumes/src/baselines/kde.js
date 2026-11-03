// Gaussian KDE with a held-out-selected bandwidth. Cost per point at
// resolution eps is -log2 f̂(x) - log2 v_eps.

import { log2 } from '../core/special.js';

const BW = [0.01, 0.02, 0.035, 0.05, 0.08, 0.12];

function logDensity(points, refIdx, x, h, d = 3) {
  const c = 1 / (Math.pow(2 * Math.PI * h * h, d / 2) * refIdx.length);
  let s = 0;
  for (const j of refIdx) {
    let q = 0;
    for (let a = 0; a < d; a++) {
      const t = x[a] - points[j * d + a];
      q += t * t;
    }
    s += Math.exp(-q / (2 * h * h));
  }
  return Math.max(s * c, 1e-300);
}

export function kdeBaseline(points, trainIdx, testIdx, {
  vEps, d = 3, maxRef = 1500, maxEval = 2500, rng,
} = {}) {
  const pick = (arr, m) => {
    if (arr.length <= m) return arr;
    const step = arr.length / m;
    const out = [];
    for (let i = 0; i < m; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  };
  const ref = pick(trainIdx, maxRef);
  const sel = pick(trainIdx, Math.min(600, trainIdx.length));
  const evalIdx = pick(testIdx, maxEval);
  const x = new Float64Array(d);
  const score = (idx, h) => {
    let s = 0;
    for (const i of idx) {
      for (let a = 0; a < d; a++) x[a] = points[i * d + a];
      s += -log2(logDensity(points, ref, x, h, d)) - log2(vEps);
    }
    return s / Math.max(1, idx.length);
  };
  let bestH = BW[0], bestV = Infinity;
  for (const h of BW) {
    const v = score(sel, h);
    if (v < bestV) { bestV = v; bestH = h; }
  }
  return {
    name: `KDE (h=${bestH})`,
    bitsPerPoint: score(evalIdx, bestH),
    modelBitsPerTrainPoint: 0,
  };
}