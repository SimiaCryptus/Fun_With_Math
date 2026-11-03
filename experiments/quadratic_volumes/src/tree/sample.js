// Use the trained tree as a *generator*: draw points from the fitted
// piecewise-uniform density (idea.md §3.2). A leaf is chosen with
// probability p_j = n_j/N, then a certified-IN box of that leaf is chosen
// with probability proportional to its measure, then a point is drawn
// uniformly inside it. The resulting cloud is what the codec "believes"
// the data look like; comparing it with the real cloud is a direct,
// visual read of how much structure the model actually captured.

import { walkLeaves } from './node.js';

function pick(cum, u) {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (cum[m] < u) lo = m + 1; else hi = m;
  }
  return lo;
}

export function sampleFromTree(tree, M, rng) {
  const leaves = [];
  let N = 0;
  for (const L of walkLeaves(tree)) {
    const bs = (L.measure && L.measure.boxesIn) || [];
    if (!L.n || !bs.length) continue;
    const cum = new Float64Array(bs.length);
    let v = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      v += Math.max(0, b.hi[0] - b.lo[0]) *
           Math.max(0, b.hi[1] - b.lo[1]) *
           Math.max(0, b.hi[2] - b.lo[2]);
      cum[i] = v;
    }
    if (!(v > 0)) continue;
    leaves.push({ n: L.n, bs, cum, v });
    N += L.n;
  }
  const out = new Float32Array(Math.max(0, M) * 3);
  if (!leaves.length || !M) return out;

  const lc = new Float64Array(leaves.length);
  let s = 0;
  for (let i = 0; i < leaves.length; i++) {
    s += leaves[i].n / N;
    lc[i] = s;
  }
  for (let k = 0; k < M; k++) {
    const L = leaves[pick(lc, rng.uniform() * s)];
    const b = L.bs[pick(L.cum, rng.uniform() * L.v)];
    for (let d = 0; d < 3; d++) {
      out[k * 3 + d] = b.lo[d] + (b.hi[d] - b.lo[d]) * rng.uniform();
    }
  }
  return out;
}