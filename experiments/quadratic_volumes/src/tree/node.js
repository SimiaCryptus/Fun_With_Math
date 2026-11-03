// Tree node / leaf structures and serialization.

import { constraintText } from '../geometry/region.js';
import { fieldToJSON } from '../geometry/predicates/serialize.js';

export function makeLeaf({ region, idx, measure, depth }) {
  return { type: 'leaf', region, idx, n: idx.length, measure, depth };
}

export function makeNode({ constraint, cost, gain, left, right, depth, family, label }) {
  return {
    type: 'node', constraint, cost, gain, left, right, depth, family, label,
  };
}

export function* walkLeaves(node) {
  if (node.type === 'leaf') { yield node; return; }
  yield* walkLeaves(node.left);
  yield* walkLeaves(node.right);
}

export function countNodes(node) {
  if (node.type === 'leaf') return { leaves: 1, splits: 0 };
  const a = countNodes(node.left), b = countNodes(node.right);
  return { leaves: a.leaves + b.leaves, splits: a.splits + b.splits + 1 };
}

export function treeText(node, indent = '') {
  if (node.type === 'leaf') {
     const V = node.measure || { lo: 0, hi: 0 };
    return `${indent}leaf n=${node.n} V∈[${V.lo.toExponential(2)}, ${V.hi.toExponential(2)}]\n`;
  }
  const g = node.gain;
  const head =
    `${indent}${node.family}: ${constraintText(node.constraint)}  ` +
    `G∈[${g.lo.toFixed(2)}, ${g.hi.toFixed(2)}] C=${node.cost.toFixed(1)}\n`;
  return head + treeText(node.left, indent + '  ') + treeText(node.right, indent + '  ');
}
/** Plain-object description of every accepted split (worker-transferable). */
export function collectSplits(node, out = []) {
  if (node.type === 'leaf') return out;
  const c = node.constraint;
  out.push({
    kind: c.kind,
    t: c.t,
    t2: c.t2 ?? null,
    field: fieldToJSON(c.field),
    constraints:
      c.kind === 'contract'
        ? c.constraints.map((k) => ({
            kind: k.kind, t: k.t, field: fieldToJSON(k.field),
          }))
        : null,
    depth: node.depth,
    family: node.family,
    label: node.label,
    gain: { lo: node.gain.lo, hi: node.gain.hi },
    cost: node.cost,
  });
  collectSplits(node.left, out);
  collectSplits(node.right, out);
  return out;
}
/** Flattened certified-IN boxes of every leaf, tagged with the leaf index. */
export function collectLeafBoxes(node, maxBoxes = 150000) {
  const pos = [];
  const ids = [];
  let li = 0;
  for (const L of walkLeaves(node)) {
    const bs = (L.measure && L.measure.boxesIn) || [];
    for (const b of bs) {
      if (pos.length / 6 >= maxBoxes) break;
      pos.push(b.lo[0], b.lo[1], b.lo[2], b.hi[0], b.hi[1], b.hi[2]);
      ids.push(li);
    }
    li++;
  }
  return { boxes: Float32Array.from(pos), boxLeafIds: Int32Array.from(ids) };
}