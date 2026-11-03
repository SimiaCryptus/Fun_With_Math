// Tree node / leaf structures and serialization.

import { constraintText } from '../geometry/region.js';

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