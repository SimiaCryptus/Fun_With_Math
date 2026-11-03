// Threshold sweep for one candidate field: counts from the points, measures
// from a single shared FieldBoxTree sweep, gains as intervals. One-sided
// thresholds and two-sided slabs come out of the same sweep (idea.md §9).
//
// M5: a candidate is a *state* that can be re-evaluated after refinement,
// so the racing loop (tree/race.js) can spend geometry only where contested.

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

function fieldValues(points, idx, f, d) {
  const z = new Float64Array(idx.length);
  const x = new Float64Array(d);
  for (let i = 0; i < idx.length; i++) {
    for (let k = 0; k < d; k++) x[k] = points[idx[i] * d + k];
    z[i] = f.eval(x);
  }
  return z;
}

/**
 * Build a refinable candidate state for one field.
 *
 * `scoreIdx` are the points the gain is credited on (all node points under
 * the full-sample protocol; the holdout points under the conditional one).
 * `proposeIdx` are the points the thresholds are read from.
 */
export function prepareCandidate({
  cand, points, idx, scoreIdx = idx, proposeIdx = idx, region, d = 3, vEps,
  numFamilies, protocol, treeOpts = {}, maxThresholds = 32,
  slabs = false, maxSlabKnots = 12, complexityMultiplier = 1,
}) {
  const f = cand.field;
  const propSorted = Float64Array.from(fieldValues(points, proposeIdx, f, d)).sort();
  const ts = candidateThresholds(propSorted, maxThresholds);
  if (!ts.length) return null;

  const scoreSorted = scoreIdx === proposeIdx
    ? propSorted
    : Float64Array.from(fieldValues(points, scoreIdx, f, d)).sort();

  const knots = [];
  if (slabs) {
    const stride = Math.max(1, Math.ceil(ts.length / maxSlabKnots));
    for (let i = 0; i < ts.length; i += stride) knots.push(ts[i]);
  }
  const allT = slabs ? [...ts, ...knots] : ts;

  const tree = new FieldBoxTree(region, f, treeOpts);
  const n = scoreSorted.length;
  const base = {
    protocol,
    numFamilies,
    gridSize: cand.gridSize ?? 1,
    paramCount: cand.paramCount ?? 0,
    n: Math.max(2, idx.length),
  };
  const costOne =
    complexityMultiplier * splitCost({ ...base, numThresholds: ts.length });
  const costSlab =
    complexityMultiplier * splitCost({ ...base, numThresholds: ts.length, slab: true });

  let cached = null;
  let frozen = false;

  function evaluate() {
    if (cached) return cached;
    let best = null;
    const consider = (g, make) => {
      if (!best || g.lo > best.gain.lo) best = make();
    };
    for (const t of ts) {
      const nL = countBelow(scoreSorted, t);
      const nR = n - nL;
      const { VL, VR } = tree.bounds(t);
      const g = gainInterval({
        nL, nR, VL, VR, vEps, branchBits: kt(nL, nR), cSplit: costOne,
      });
      consider(g, () => ({
        gain: g, cost: costOne, t, t2: null, nL, nR, tree,
        family: cand.family,
        label: `${cand.label ?? cand.family} < ${t.toFixed(4)}`,
        constraint: constraint(f, 'lt', t),
        VL, VR,
      }));
    }
    for (let i = 0; i < knots.length; i++) {
      for (let j = i + 1; j < knots.length; j++) {
        const t1 = knots[i], t2 = knots[j];
        const nL = countBelow(scoreSorted, t2) - countBelow(scoreSorted, t1);
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
    cached = best;
    return best;
  }

  return {
    kind: 'field',
    family: cand.family,
    label: cand.label ?? cand.family,
    get frozen() { return frozen; },
    evaluate,
    refine(budget) {
      if (frozen) return 0;
      const used = tree.refine(allT, budget);
      if (used === 0) frozen = true;
      else cached = null;
      return used;
    },
  };
}

/** Backwards-compatible one-shot sweep: prepare, refine once, evaluate. */
export function sweepField(opts) {
  const st = prepareCandidate(opts);
  if (!st) return null;
  st.refine(opts.refineBudget ?? 1500);
  return st.evaluate();
}