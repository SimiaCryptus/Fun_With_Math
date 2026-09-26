import { L } from './voxels.js';
import { BT, UnionFind } from './bonds.js';
import { add, sub, scale, cross, dot, len, mv, quatToMat } from './math.js';
import { sampleGrid } from './gravity.js';

const K_FATIGUE = 0.05;

// Spanning-tree load solver. Returns [{bond, ratio}] for over-limit bonds.
// v1 simplifications: no bending-moment shear, no parallel-bond cut sharing yet.
export function evaluateStress(world, c, extMap, dtSince) {
  const vox = world.vox, bonds = world.bonds;
  const ids = [...c.voxels]; const N = ids.length;
  if (N < 2) return [];
  const idx = new Map(); ids.forEach((id, i) => idx.set(id, i));
  const blist = [];
  for (const id of ids) for (const b of vox.adj[id]) {
    if (bonds.type[b] === BT.CABLE || bonds.a[b] !== id) continue;
    if (idx.has(bonds.b[b])) blist.push(b);
  }
  blist.sort((p, q) => (bonds.T[q] - bonds.T[p]) || (p - q));
  const uf = new UnionFind(N);
  const tadj = Array.from({ length: N }, () => []);
  for (const b of blist) {
    const i = idx.get(bonds.a[b]), j = idx.get(bonds.b[b]);
    if (uf.union(i, j)) { tadj[i].push([j, b]); tadj[j].push([i, b]); }
  }
  const R = quatToMat(c.q);
  const pos = new Array(N), f = new Array(N);
  let root = 0, best = 1e300;
  for (let i = 0; i < N; i++) {
    const id = ids[i];
    const bp = [vox.x[id] * L - c.com[0], vox.y[id] * L - c.com[1], vox.z[id] * L - c.com[2]];
    const r = mv(R, bp); pos[i] = r;
    const d2 = dot(r, r); if (d2 < best) { best = d2; root = i; }
    const a = add(add(c.A, cross(c.alpha, r)), cross(c.w, cross(c.w, r)));
    let gs;
    if (c.grid) {
      const s = sampleGrid(c.grid, [vox.x[id] * L, vox.y[id] * L, vox.z[id] * L]);
      gs = s ? mv(R, scale(s, world.G)) : [0, 0, 0];
    } else gs = scale(r, -world.G * c.M / (c.rad * c.rad * c.rad));
    const m = vox.mass[id];
    let fi = scale(sub(sub(a, c.gExt), gs), m);
    const fe = extMap.get(id); if (fe) fi = sub(fi, fe);
    f[i] = fi;
  }
  // BFS from root (per component, in case graph is disconnected)
  const parent = new Int32Array(N).fill(-2), pbond = new Int32Array(N).fill(-1), order = [];
  const seeds = [root, ...Array.from({ length: N }, (_, i) => i)];
  for (const s of seeds) {
    if (parent[s] !== -2) continue;
    parent[s] = -1; order.push(s);
    for (let h = order.length - 1; h < order.length; h++) {
      const u = order[h];
      for (const [w, b] of tadj[u]) if (parent[w] === -2) { parent[w] = u; pbond[w] = b; order.push(w); }
    }
  }
  const sum = f.map((x) => x.slice());
  const out = [];
   for (let i = 0; i < N; i++) vox.stress[ids[i]] = 0;
  for (let k = order.length - 1; k >= 0; k--) {
    const n = order[k], p = parent[n];
    if (p < 0) continue;
    sum[p][0] += sum[n][0]; sum[p][1] += sum[n][1]; sum[p][2] += sum[n][2];
    const b = pbond[n];
    const dv = sub(pos[n], pos[p]); const dl = len(dv); const d = scale(dv, 1 / dl);
    const fs = sum[n];
    const axial = -dot(fs, d);
    const shear = len(sub(fs, scale(d, -axial)));
    const dmg = 1 - bonds.damage[b];
    const ratio = Math.max(axial / bonds.T[b], -axial / bonds.C[b], shear / bonds.S[b]) / Math.max(dmg, 1e-3);
    bonds.ratio[b] = ratio;
    if (ratio > 0.6) bonds.damage[b] = Math.min(0.99, bonds.damage[b] + (ratio - 0.6) * dtSince * K_FATIGUE);
    if (ratio > vox.stress[ids[n]]) vox.stress[ids[n]] = ratio;
    if (ratio > vox.stress[ids[p]]) vox.stress[ids[p]] = ratio;
    if (ratio > 1) out.push({ bond: b, ratio });
  }
  return out;
}