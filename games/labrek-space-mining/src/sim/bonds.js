import { A_FACE, compat } from './voxels.js';
export const BT = { COHESION: 0, SINTER: 1, WELD: 2, CLAMP: 3, ESTAT: 4, ADHESIVE: 5, CABLE: 6 };

export class BondStore {
  constructor(vox, cap = 262144) {
    this.vox = vox; this.cap = cap;
    this.a = new Int32Array(cap); this.b = new Int32Array(cap); this.type = new Uint8Array(cap);
    this.T = new Float32Array(cap); this.S = new Float32Array(cap); this.C = new Float32Array(cap);
    this.ratio = new Float32Array(cap); this.damage = new Float32Array(cap); this.alive = new Uint8Array(cap);
    this.restLen = new Float32Array(cap);
    this.free = []; this.top = 0; this.count = 0;
  }
  add(a, b, type, T, S, C) {
    const id = this.free.length ? this.free.pop() : this.top++;
    if (id >= this.cap) { this.top = this.cap; return -1; }
    this.a[id] = a; this.b[id] = b; this.type[id] = type;
    this.T[id] = T; this.S[id] = S; this.C[id] = C;
    this.ratio[id] = 0; this.damage[id] = 0; this.alive[id] = 1;
    this.vox.adj[a].push(id); this.vox.adj[b].push(id);
    this.count++;
    return id;
  }
  kill(id) {
    if (!this.alive[id]) return;
    this.alive[id] = 0;
    for (const v of [this.a[id], this.b[id]]) {
      const l = this.vox.adj[v]; if (!l) continue;
      const k = l.indexOf(id); if (k >= 0) l.splice(k, 1);
    }
    this.free.push(id); this.count--;
  }
  other(id, v) { return this.a[id] === v ? this.b[id] : this.a[id]; }
}

const hm = (a, b) => (a + b > 0 ? (2 * a * b) / (a + b) : 0);
export function addCohesion(vox, bonds, i, j) {
  const k = compat(vox.mat[i], vox.mat[j]);
  const f = Math.min(vox.fill[i], vox.fill[j]);
  const T = hm(vox.tens[i], vox.tens[j]) * k * A_FACE * f;
  const S = hm(vox.shear[i], vox.shear[j]) * k * A_FACE * f;
  return bonds.add(i, j, BT.COHESION, T, S, Math.max(1e5, T * 50));
}

export class UnionFind {
  constructor(n) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
  find(x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
  union(a, b) { a = this.find(a); b = this.find(b); if (a === b) return false; if (a < b) this.p[b] = a; else this.p[a] = b; return true; }
}