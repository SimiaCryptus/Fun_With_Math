// Master tree: axis-aligned binary tests x_dim < t. Every node owns a box region.
import { hashStr } from './rng.js';

export function split(dim, t, left = null, right = null) { return { dim, t, left, right }; }

// Full grid tree: balanced splits over thresholds[0], then thresholds[1], ...
export function gridSpec(d, thresholds) {
  const bal = (k, arr) => {
    if (arr.length === 0) return k + 1 < d ? bal(k + 1, thresholds[k + 1]) : null;
    const m = Math.floor(arr.length / 2);
    return split(k, arr[m], bal(k, arr.slice(0, m)), bal(k, arr.slice(m + 1)));
  };
  return bal(0, thresholds[0]);
}

export function buildTree(spec, d, domLo = null, domHi = null) {
  domLo = domLo || new Array(d).fill(0);
  domHi = domHi || new Array(d).fill(1);
  const tree = { d, nodes: [], leaves: [], domLo, domHi, id: 'T-' + hashStr(JSON.stringify(spec)) };
  const rec = (s, lo, hi, depth, parent) => {
    const id = tree.nodes.length;
    const n = { id, lo, hi, depth, parent, dim: -1, t: 0, left: -1, right: -1, leaf: -1 };
    tree.nodes.push(n);
    if (!s) { n.leaf = tree.leaves.length; tree.leaves.push(id); return id; }
    n.dim = s.dim; n.t = s.t;
    const lhi = hi.slice(); lhi[s.dim] = s.t;
    const rlo = lo.slice(); rlo[s.dim] = s.t;
    n.left = rec(s.left, lo.slice(), lhi, depth + 1, id);
    n.right = rec(s.right, rlo, hi.slice(), depth + 1, id);
    return id;
  };
  rec(spec, domLo.slice(), domHi.slice(), 0, -1);
  return tree;
}

// Mutating split of a leaf. Left child keeps the leaf id; right child gets a new id.
export function splitLeaf(tree, leafId, dim, t) {
  const nid = tree.leaves[leafId];
  const n = tree.nodes[nid];
  const mk = (lo, hi, leaf) => {
    const id = tree.nodes.length;
    tree.nodes.push({ id, lo, hi, depth: n.depth + 1, parent: nid, dim: -1, t: 0, left: -1, right: -1, leaf });
    return id;
  };
  const lhi = n.hi.slice(); lhi[dim] = t;
  const rlo = n.lo.slice(); rlo[dim] = t;
  const newLeaf = tree.leaves.length;
  n.left = mk(n.lo.slice(), lhi, leafId);
  n.right = mk(rlo, n.hi.slice(), newLeaf);
  n.dim = dim; n.t = t; n.leaf = -1;
  tree.leaves[leafId] = n.left;
  tree.leaves.push(n.right);
  return nid;
}

export function leafOfPoint(tree, x) {
  let n = tree.nodes[0];
  while (n.leaf < 0) n = tree.nodes[x[n.dim] < n.t ? n.left : n.right];
  return n.leaf;
}