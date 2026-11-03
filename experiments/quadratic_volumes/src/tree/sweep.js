// Threshold sweep for one candidate field: counts from the points, measures
// from a single shared FieldBoxTree sweep, gains as intervals. One-sided
// thresholds and two-sided slabs come out of the same sweep (idea.md §9).

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

function countBelow(sorted, t) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m] < t) lo = m + 1; else hi = m;
  }
  return lo;
}

/**
 * Evaluate every threshold (and, if enabled, every slab) of one candidate.
 * @returns best { gain, constraint, cost, tree, nL, nR, VL, VR } or null
 */
export function sweepField({
  cand, points, idx, region, d = 3, vEps, numFamilies, protocol,
  treeOpts = {}, refineBudget = 1500, maxThresholds = 32,
  slabs = false, maxSlabKnots = 12,
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

  const knots = [];
  if (slabs) {
    const stride = Math.max(1, Math.ceil(ts.length / maxSlabKnots));
    for (let i = 0; i < ts.length; i += stride) knots.push(ts[i]);
  }

  const tree = new FieldBoxTree(region, f, treeOpts);
  tree.refine(slabs ? [...ts, ...knots] : ts, refineBudget);

  const n = idx.length;
  const base = {
    protocol,
    numFamilies,
    gridSize: cand.gridSize ?? 1,
    paramCount: cand.paramCount ?? 0,
    n,
  };
  const costOne = splitCost({ ...base, numThresholds: ts.length });
  const costSlab = splitCost({ ...base, numThresholds: ts.length, slab: true });

  let best = null;
  const consider = (g, make) => {
    if (!best || g.lo > best.gain.lo) best = make();
  };

  for (const t of ts) {
    const nL = countBelow(sorted, t);
    const nR = n - nL;
    const { VL, VR } = tree.bounds(t);
    const g = gainInterval({
      nL, nR, VL, VR, vEps, branchBits: kt(nL, nR), cSplit: costOne,
    });
    consider(g, () => ({
      gain: g, cost: costOne, t, nL, nR, tree,
      family: cand.family,
      label: `${cand.label ?? cand.family} < ${t.toFixed(4)}`,
      constraint: constraint(f, 'lt', t),
      VL, VR,
    }));
  }

  for (let i = 0; i < knots.length; i++) {
    for (let j = i + 1; j < knots.length; j++) {
      const t1 = knots[i], t2 = knots[j];
      const nL = countBelow(sorted, t2) - countBelow(sorted, t1);
      const nR = n - nL;
      const { VL, VR } = tree.slabBounds(t1, t2);
      const g = gainInterval({
        nL, nR, VL, VR, vEps, branchBits: kt(nL, nR), cSplit: costSlab,
      });
      consider(g, () => ({
        gain: g, cost: costSlab, t: t1, t2, nL, nR, tree,
        family: cand.family,
        label: `${t1.toFixed(4)} <= ${cand.label ?? cand.family} < ${t2.toFixed(4)}`,
        constraint: constraint(f, 'slabIn', t1, t2),
        VL, VR,
      }));
    }
  }

  return best;
}