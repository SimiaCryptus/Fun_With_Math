// Threshold sweep for one candidate field: counts from the points, measures
// from a single shared FieldBoxTree sweep, gains as intervals.

import { gainInterval, kt } from '../core/codelength.js';
import { FieldBoxTree } from '../geometry/fieldBoxTree.js';
import { splitCost } from '../core/ledger.js';
import { constraint } from '../geometry/region.js';

/** Interior quantile thresholds of the sorted field values. */
export function candidateThresholds(z, m = 32) {
  const n = z.length;
  if (n < 2) return [];
  const k = Math.min(m, n - 1);
  const ts = [];
  for (let i = 1; i <= k; i++) {
    const pos = Math.floor((i * n) / (k + 1));
    const a = z[Math.max(0, pos - 1)], b = z[Math.min(n - 1, pos)];
    if (b > a) ts.push(0.5 * (a + b));
  }
  return [...new Set(ts)];
}

/**
 * Evaluate every threshold of one field candidate.
 * @returns best { gain, constraint, cost, tree, t, nL, nR } or null
 */
export function sweepField({
  cand, points, idx, region, d = 3, vEps, numFamilies, protocol,
  treeOpts = {}, refineBudget = 1500, maxThresholds = 32,
}) {
  const f = cand.field;
  const z = new Float64Array(idx.length);
  const x = new Float64Array(d);
  for (let i = 0; i < idx.length; i++) {
    for (let k = 0; k < d; k++) x[k] = points[idx[i] * d + k];
    z[i] = f.eval(x);
  }
  const sorted = Float64Array.from(z).sort();
  const ts = candidateThresholds(sorted, maxThresholds);
  if (!ts.length) return null;

  const tree = new FieldBoxTree(region, f, treeOpts);
  tree.refine(ts, refineBudget);

  const n = idx.length;
  const cost = splitCost({
    protocol,
    numFamilies,
    gridSize: cand.gridSize ?? 1,
    numThresholds: ts.length,
    paramCount: cand.paramCount ?? 0,
    n,
  });

  let best = null;
  for (const t of ts) {
    let nL = 0;
    // sorted counts: number of z strictly below t
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sorted[m] < t) lo = m + 1; else hi = m;
    }
    nL = lo;
    const nR = n - nL;
    const { VL, VR } = tree.bounds(t);
    const g = gainInterval({
      nL, nR, VL, VR, vEps, branchBits: kt(nL, nR), cSplit: cost,
    });
    if (!best || g.lo > best.gain.lo) {
      best = {
        gain: g, cost, t, nL, nR, tree,
        family: cand.family,
        label: `${cand.label ?? cand.family} < ${t.toFixed(4)}`,
        constraint: constraint(f, 'lt', t),
        VL, VR,
      };
    }
  }
  return best;
}