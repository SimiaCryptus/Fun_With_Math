// Held-out code length of a trained tree (idea.md §3.6, §7.5).

import { log2 } from '../core/special.js';
import { walkLeaves } from './node.js';
import { constraintHolds } from '../geometry/region.js';

function descend(node, x) {
  while (node.type !== 'leaf') {
    let goLeft;
    if (node.constraint.kind === 'contract') {
      goLeft = node.constraint.constraints.every((c) => constraintHolds(c, x));
    } else {
      goLeft = constraintHolds(node.constraint, x);
    }
    node = goLeft ? node.left : node.right;
  }
  return node;
}

/**
 * Test bits per point. Leaf probabilities use add-1/2 (KT-style) smoothing,
 * leaf measure uses the requested estimator, floored at v_eps.
 */
export function evaluate(tree, points, idx, { d = 3, vEps, estimator = 'mid', modelBits = 0, nTrain = 1 } = {}) {
  const leaves = [...walkLeaves(tree)];
  let nTrainTotal = 0;
  for (const L of leaves) nTrainTotal += L.n;
  const denom = nTrainTotal + 0.5 * leaves.length;
  const info = new Map();
  for (const L of leaves) {
    const V = estimator === 'upper' ? L.measure.hi
      : estimator === 'lower' ? Math.max(L.measure.lo, vEps)
      : 0.5 * (L.measure.lo + L.measure.hi);
    info.set(L, {
      p: (L.n + 0.5) / denom,
      V: Math.max(V, vEps),
    });
  }
  let bits = 0;
  const x = new Float64Array(d);
  for (const i of idx) {
    for (let k = 0; k < d; k++) x[k] = points[i * d + k];
    const L = descend(tree, x);
    const { p, V } = info.get(L);
    bits += -log2(p) + log2(V / vEps);
  }
  const perPoint = bits / Math.max(1, idx.length);
  return {
    bitsPerPoint: perPoint,
    totalBits: bits,
    modelBitsPerTrainPoint: modelBits / Math.max(1, nTrain),
    leaves: leaves.length,
  };
}

/** Piecewise-uniform density at x (midpoint leaf measure). */
export function density(tree, x, { vEps }) {
  const leaves = [...walkLeaves(tree)];
  let N = 0;
  for (const L of leaves) N += L.n;
  const L = descend(tree, x);
  const V = Math.max(0.5 * (L.measure.lo + L.measure.hi), vEps);
  return L.n / N / V;
}

export { descend };