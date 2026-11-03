// TrainNode recursion (idea.md §9). M2 scope: tightBox + axis generators,
// one-sided thresholds, no racing yet — each candidate's FieldBoxTree is
// refined to a fixed budget before the argmax is taken.

import { gainInterval, kt } from '../core/codelength.js';
import { splitCost } from '../core/ledger.js';
import { measure } from '../geometry/oracle.js';
import { Region, constraintHolds, complementConstraint } from '../geometry/region.js';
import { unitBox } from '../geometry/box.js';
import { resolveGenerators } from '../generators/index.js';
import { sweepField } from './sweep.js';
import { makeLeaf, makeNode } from './node.js';

const DEFAULTS = {
  d: 3,
  maxDepth: 6,
  nMin: 50,
  vEps: Math.pow(2, -30),
  protocol: 'fullSample',
   families: ['tightBox', 'axis'],
   slabs: true,
  measureOpts: { maxBoxes: 20000, minWidth: 1 / 1024 },
  treeOpts: { maxBoxes: 20000, minWidth: 1 / 1024 },
  refineBudget: 1500,
  maxThresholds: 32,
  onEvent: null,
};

function splitIdx(points, idx, con, d) {
  const left = [], right = [];
  const x = new Float64Array(d);
  for (const i of idx) {
    for (let k = 0; k < d; k++) x[k] = points[i * d + k];
    (constraintHolds(con, x) ? left : right).push(i);
  }
  return { left, right };
}

function evaluateContraction(cand, { region, idx, vEps, numFamilies, protocol, measureOpts }) {
  const child = region.withAll(cand.constraints);
  const mChild = measure(child, measureOpts);
  const mParent = measure(region, measureOpts);
  const VL = mChild;
  const VR = {
    lo: Math.max(0, mParent.lo - mChild.hi),
    hi: Math.max(0, mParent.hi - mChild.lo),
    kind: 'certified',
  };
  const n = idx.length;
  const cost = splitCost({
    protocol, numFamilies, gridSize: 1, numThresholds: 1,
    paramCount: cand.paramCount, n,
  });
  const g = gainInterval({
    nL: n, nR: 0, VL, VR, vEps, branchBits: kt(n, 0), cSplit: cost,
  });
  return {
    special: 'contract', constraints: cand.constraints, childRegion: child,
    gain: g, cost, nL: n, nR: 0, family: 'tightBox',
    label: cand.label, VL, VR,
  };
}

export function trainTree(points, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const gens = resolveGenerators(o.families);
  const root = new Region(o.rootBox || unitBox(o.d));
  const allIdx = [];
  const N = points.length / o.d;
  for (let i = 0; i < N; i++) allIdx.push(i);
  const stats = { splits: 0, nodes: 0, modelBits: 0, oracleBoxes: 0 };

  const build = (region, idx, depth) => {
    stats.nodes++;
    o.onEvent && o.onEvent({ type: 'nodeStart', depth, n: idx.length });
    const asLeaf = () =>
      makeLeaf({ region, idx, measure: measure(region, o.measureOpts), depth });

    if (idx.length < o.nMin || depth >= o.maxDepth) return asLeaf();

    const cands = [];
    for (const g of gens) {
      cands.push(...g.propose({ points, idx, region, d: o.d }));
    }
    const numFamilies = new Set(cands.map((c) => c.family)).size || 1;

    let best = null;
    for (const c of cands) {
      let r = null;
      if (c.special === 'contract') {
        r = evaluateContraction(c, {
          region, idx, vEps: o.vEps, numFamilies,
          protocol: o.protocol, measureOpts: o.measureOpts,
        });
      } else {
        r = sweepField({
          cand: c, points, idx, region, d: o.d, vEps: o.vEps, numFamilies,
          protocol: o.protocol, treeOpts: o.treeOpts,
           refineBudget: o.refineBudget, maxThresholds: o.maxThresholds,
           slabs: o.slabs,
        });
      }
      if (r && (!best || r.gain.lo > best.gain.lo)) best = r;
    }
    o.onEvent && o.onEvent({ type: 'sweepDone', depth, best });

    if (!best || best.gain.lo <= 0) {
      o.onEvent && o.onEvent({ type: 'leaf', depth, n: idx.length });
      return asLeaf();
    }

    stats.splits++;
    stats.modelBits += best.cost;
    o.onEvent && o.onEvent({ type: 'accepted', depth, best });

    if (best.special === 'contract') {
      // Unary contraction: all points go left; the complement is an empty leaf.
      const left = build(best.childRegion, idx, depth + 1);
       // The complement of a conjunction: keep it as the parent region for
       // membership tests, but report the certified complement measure.
       const comp = region;
      const right = makeLeaf({
        region: comp, idx: [], measure: best.VR, depth: depth + 1,
      });
      return makeNode({
        constraint: { field: null, kind: 'contract', t: 0, constraints: best.constraints },
        cost: best.cost, gain: best.gain, left, right, depth,
        family: 'tightBox', label: best.label,
      });
    }

    const parts = splitIdx(points, idx, best.constraint, o.d);
    const leftRegion = region.with(best.constraint);
     const rightRegion = region.with(complementConstraint(best.constraint));
    return makeNode({
      constraint: best.constraint,
      cost: best.cost,
      gain: best.gain,
      left: build(leftRegion, parts.left, depth + 1),
      right: build(rightRegion, parts.right, depth + 1),
      depth,
      family: best.family,
      label: best.label,
    });
  };

  const tree = build(root, allIdx, 0);
  return { tree, stats, root };
}