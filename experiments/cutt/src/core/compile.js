// §5.1 compilation of observations into point-trees, stored as a flat fragment table.
import { splitLeaf } from './tree.js';

// Strict-inequality routing; pi computed incrementally from 1-D length ratios.
export function descend(tree, nid, lo, hi, mass, out) {
  const n = tree.nodes[nid];
  if (n.leaf >= 0) { out.push({ leaf: n.leaf, node: nid, pi: mass, lo: lo.slice(), hi: hi.slice() }); return; }
  const j = n.dim, t = n.t, A = lo[j], B = hi[j];
  if (A >= t) descend(tree, n.right, lo, hi, mass, out);
  else if (B <= t) descend(tree, n.left, lo, hi, mass, out);
  else {
    const T = B - A;
    const lhi = hi.slice(); lhi[j] = t;
    descend(tree, n.left, lo, lhi, mass * (t - A) / T, out);
    const rlo = lo.slice(); rlo[j] = t;
    descend(tree, n.right, rlo, hi, mass * (B - t) / T, out);
  }
}

export function compileObs(tree, lo, hi) {
  const out = [];
  descend(tree, 0, lo.slice(), hi.slice(), 1, out);
  return out;
}

export function buildTable(tree, per) {
  let n = 0;
  for (const p of per) n += p.length;
  const N = per.length, L = tree.leaves.length;
  const T = {
    n, N, L, obs: new Int32Array(n), leaf: new Int32Array(n), node: new Int32Array(n),
    pi: new Float64Array(n), lo: new Array(n), hi: new Array(n), start: new Int32Array(N + 1), leafFrags: null,
  };
  let k = 0;
  per.forEach((p, i) => {
    T.start[i] = k;
    for (const f of p) {
      T.obs[k] = i; T.leaf[k] = f.leaf; T.node[k] = f.node; T.pi[k] = f.pi; T.lo[k] = f.lo; T.hi[k] = f.hi; k++;
    }
  });
  T.start[N] = k;
  const lf = Array.from({ length: L }, () => []);
  for (let f = 0; f < n; f++) lf[T.leaf[f]].push(f);
  T.leafFrags = lf.map(a => Int32Array.from(a));
  return T;
}

export function compileAll(tree, obs) {
  return buildTable(tree, obs.map(o => compileObs(tree, o.lo, o.hi)));
}

export function nFrags(T, i) { return T.start[i + 1] - T.start[i]; }

export function maxFrags(T) {
  let m = 1;
  for (let i = 0; i < T.N; i++) m = Math.max(m, T.start[i + 1] - T.start[i]);
  return m;
}

// Incremental recompilation: split one master leaf, touch only its fragments.
export function splitLeafIncremental(tree, T, leafId, dim, t) {
  const nid = splitLeaf(tree, leafId, dim, t);
  const per = [];
  for (let i = 0; i < T.N; i++) {
    const list = [];
    for (let f = T.start[i]; f < T.start[i + 1]; f++) {
      if (T.leaf[f] === leafId) descend(tree, nid, T.lo[f].slice(), T.hi[f].slice(), T.pi[f], list);
      else list.push({ leaf: T.leaf[f], node: T.node[f], pi: T.pi[f], lo: T.lo[f], hi: T.hi[f] });
    }
    per.push(list);
  }
  return buildTable(tree, per);
}