// TrainNode recursion (idea.md §9) with decision-directed racing (§6.2)
// and the accounting protocols of §4.3.

import { gainInterval, kt } from '../core/codelength.js';
import { splitCost } from '../core/ledger.js';
import { measure } from '../geometry/oracle.js';
import { Region, constraintHolds, complementConstraint } from '../geometry/region.js';
import { unitBox } from '../geometry/box.js';
import { makeRng } from '../core/rng.js';
import { resolveGenerators } from '../generators/index.js';
import { prepareCandidate } from './sweep.js';
import { race } from './race.js';
import { makeLeaf, makeNode } from './node.js';

const DEFAULTS = {
  d: 3,
  maxDepth: 6,
  nMin: 50,
  vEps: Math.pow(2, -30),
  protocol: 'fullSample',       // 'fullSample' | 'conditional'
  holdoutFrac: 0.5,
  families: ['tightBox', 'axis'],
  slabs: true,
  measureOpts: { maxBoxes: 20000, minWidth: 1 / 1024 },
  treeOpts: { maxBoxes: 20000, minWidth: 1 / 1024, initialBoxes: 3000 },
  raceBudget: 8000,
  raceStep: 750,
  maxThresholds: 32,
  complexityMultiplier: 1,
  seed: 7,
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

function contractionState(cand, {
  region, idx, nScore, vEps, numFamilies, protocol, measureOpts,
  complexityMultiplier,
}) {
  const child = region.withAll(cand.constraints);
  const mChild = measure(child, measureOpts);
  const mParent = measure(region, measureOpts);
  const VL = mChild;
  const VR = {
    lo: Math.max(0, mParent.lo - mChild.hi),
    hi: Math.max(0, mParent.hi - mChild.lo),
    kind: 'certified',
  };
  const cost = complexityMultiplier * splitCost({
    protocol, numFamilies, gridSize: 1, numThresholds: 1,
    paramCount: cand.paramCount, n: Math.max(2, idx.length),
  });
  const g = gainInterval({
    nL: nScore, nR: 0, VL, VR, vEps,
    branchBits: kt(nScore, 0), cSplit: cost,
  });
  const result = {
    special: 'contract', constraints: cand.constraints, childRegion: child,
    gain: g, cost, nL: nScore, nR: 0, family: 'tightBox',
    label: cand.label, VL, VR,
  };
  return {
    kind: 'contract',
    family: 'tightBox',
    label: cand.label,
    frozen: true,
    evaluate: () => result,
    refine: () => 0,
  };
}

export function trainTree(points, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const gens = resolveGenerators(o.families);
  const root = new Region(o.rootBox || unitBox(o.d));
  const rng = makeRng(o.seed);
  const allIdx = o.idx ? Array.from(o.idx) : [];
  if (!o.idx) {
    const N = points.length / o.d;
    for (let i = 0; i < N; i++) allIdx.push(i);
  }
  const stats = {
    splits: 0, nodes: 0, modelBits: 0, raceBoxes: 0, raceNodes: 0,
  };

  const build = (region, idx, depth) => {
    stats.nodes++;
    o.onEvent && o.onEvent({ type: 'nodeStart', depth, n: idx.length });
    const asLeaf = () =>
      makeLeaf({ region, idx, measure: measure(region, o.measureOpts), depth });

    if (idx.length < o.nMin || depth >= o.maxDepth) return asLeaf();

    // §4.3: conditional code fits and screens on a fitting set, credits
    // compression only on the holdout; fullSample screens on holdout but
    // scores on everything, paying for the parameters.
    let fitIdx = idx, scoreIdx = idx, proposeIdx = idx;
    if (o.holdoutFrac > 0 && idx.length >= 4 * o.nMin) {
      const s = rng.splitIndices(idx.length, 1 - o.holdoutFrac);
      fitIdx = Array.from(s.first, (k) => idx[k]);
      const hold = Array.from(s.second, (k) => idx[k]);
      proposeIdx = hold;
      scoreIdx = o.protocol === 'conditional' ? hold : idx;
    }

    const cands = [];
    for (const g of gens) {
      cands.push(...g.propose({ points, idx: fitIdx, region, d: o.d }));
    }
    const numFamilies = new Set(cands.map((c) => c.family)).size || 1;

    const states = [];
    for (const c of cands) {
      if (c.special === 'contract') {
        states.push(contractionState(c, {
          region, idx, nScore: scoreIdx.length, vEps: o.vEps, numFamilies,
          protocol: o.protocol, measureOpts: o.measureOpts,
          complexityMultiplier: o.complexityMultiplier,
        }));
      } else {
        const st = prepareCandidate({
          cand: c, points, idx, scoreIdx, proposeIdx, region, d: o.d,
          vEps: o.vEps, numFamilies, protocol: o.protocol,
          treeOpts: o.treeOpts, maxThresholds: o.maxThresholds,
          slabs: o.slabs, complexityMultiplier: o.complexityMultiplier,
        });
        if (st) states.push(st);
      }
    }

    const r = race(states, {
      budget: o.raceBudget,
      step: o.raceStep,
      onStep: (snap) =>
        o.onEvent && o.onEvent({ type: 'raceStep', depth, ...snap }),
    });
    stats.raceBoxes += r.boxesSpent;
    stats.raceNodes++;
    const best = r.winner;
    o.onEvent && o.onEvent({ type: 'sweepDone', depth, best });

    if (!best || best.gain.lo <= 0) {
      o.onEvent && o.onEvent({ type: 'leaf', depth, n: idx.length });
      return asLeaf();
    }

    stats.splits++;
    stats.modelBits += best.cost;
    o.onEvent && o.onEvent({ type: 'accepted', depth, best });

    if (best.special === 'contract') {
      const left = build(best.childRegion, idx, depth + 1);
      const right = makeLeaf({
        region, idx: [], measure: best.VR, depth: depth + 1,
      });
      return makeNode({
        constraint: {
          field: null, kind: 'contract', t: 0, constraints: best.constraints,
        },
        cost: best.cost, gain: best.gain, left, right, depth,
        family: 'tightBox', label: best.label,
        VL: best.VL, VR: best.VR,
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
      VL: best.VL,
      VR: best.VR,
    });
  };

  const tree = build(root, allIdx, 0);
  return { tree, stats, root };
}