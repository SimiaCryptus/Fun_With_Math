// Expression AST node types + construction helpers.
//
// Node kinds:
//   Num   - { kind: 'num',   id, value }
//   BinOp - { kind: 'op',    id, op, left, right }
//   Group - { kind: 'group', id, child }
//
// All nodes are treated as immutable. Transformations produce new trees;
// ids are preserved where a node is conceptually "the same" so the UI can
// animate transitions.

import { nextId } from '../util/id.js';

export const OPS = ['+', '-', '*', '/'];
export const COMMUTATIVE = new Set(['+', '*']);

// Inverse pairing used by cancellation and split hints.
export const INVERSE = { '+': '-', '-': '+', '*': '/', '/': '*' };

export function num(value, id = nextId('num')) {
  if (!Number.isFinite(value)) {
    throw new Error(`num() requires a finite value, got ${value}`);
  }
  return { kind: 'num', id, value };
}

export function op(operator, left, right, id = nextId('op')) {
  if (!OPS.includes(operator)) {
    throw new Error(`Unknown operator: ${operator}`);
  }
  return { kind: 'op', id, op: operator, left, right };
}

export function group(child, id = nextId('grp')) {
  return { kind: 'group', id, child };
}

export function isNum(node) {
  return node && node.kind === 'num';
}

export function isOp(node) {
  return node && node.kind === 'op';
}

export function isGroup(node) {
  return node && node.kind === 'group';
}

// Deep-clone a subtree, assigning fresh ids. Useful when duplicating a
// sub-expression during a transformation would otherwise collide.
export function cloneWithFreshIds(node) {
  if (isNum(node)) return num(node.value);
  if (isGroup(node)) return group(cloneWithFreshIds(node.child));
  if (isOp(node)) {
    return op(node.op, cloneWithFreshIds(node.left), cloneWithFreshIds(node.right));
  }
  throw new Error(`cloneWithFreshIds: unknown node kind`);
}

// Find a node (and its parent + which side it hangs from) by id.
// Returns { node, parent, side } or null.
export function findNode(root, id, parent = null, side = null) {
  if (!root) return null;
  if (root.id === id) return { node: root, parent, side };
  if (isGroup(root)) {
    return findNode(root.child, id, root, 'child');
  }
  if (isOp(root)) {
    return findNode(root.left, id, root, 'left') || findNode(root.right, id, root, 'right');
  }
  return null;
}

// Return a new tree where the node with `id` is replaced by `replacement`.
// Non-matching subtrees are structurally shared (immutability preserved).
export function replaceNode(root, id, replacement) {
  if (!root) return root;
  if (root.id === id) return replacement;
  if (isGroup(root)) {
    const child = replaceNode(root.child, id, replacement);
    return child === root.child ? root : { ...root, child };
  }
  if (isOp(root)) {
    const left = replaceNode(root.left, id, replacement);
    const right = replaceNode(root.right, id, replacement);
    if (left === root.left && right === root.right) return root;
    return { ...root, left, right };
  }
  return root;
}

// Collect every node id present in the tree (for validation / debugging).
export function collectIds(root, acc = new Set()) {
  if (!root) return acc;
  acc.add(root.id);
  if (isGroup(root)) collectIds(root.child, acc);
  if (isOp(root)) {
    collectIds(root.left, acc);
    collectIds(root.right, acc);
  }
  return acc;
}
