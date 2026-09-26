import { range } from './rng.js';
export const L = 2.0, A_FACE = 4.0, V_VOX = 8.0;
export const MAT = { REG: 0, SIN: 1, SIL: 2, NFE: 3, ICE: 4, CAR: 5, CMP: 6, SAL: 7 };
export const MATERIALS = [
  { id: 'REG', rho: [1300, 1700], T: [25, 500], S: [50, 1000], mu: 0.6, vol: [0, 50], color: 0x8a7f70 },
  { id: 'SIN', rho: [2000, 2400], T: [2e6, 1e7], S: [3e6, 1.5e7], mu: 0.7, vol: [0, 0], color: 0xb0764a },
  { id: 'SIL', rho: [2800, 3200], T: [5e6, 1.5e7], S: [1e7, 3e7], mu: 0.7, vol: [0, 5], color: 0x5f6166 },
  { id: 'NFE', rho: [7600, 8000], T: [3e8, 5e8], S: [2e8, 3.5e8], mu: 0.4, vol: [0, 0], color: 0x9aa7b5 },
  { id: 'ICE', rho: [900, 1600], T: [5e5, 1.5e6], S: [5e5, 1e6], mu: 0.2, vol: [500, 900], color: 0xcfe8ff },
  { id: 'CAR', rho: [1500, 1900], T: [1e5, 1e6], S: [2e5, 1.5e6], mu: 0.6, vol: [100, 300], color: 0x2e2a26 },
  { id: 'CMP', rho: [1600, 1600], T: [5e8, 5e8], S: [3e8, 3e8], mu: 0.5, vol: [0, 0], color: 0xe0d060 },
  { id: 'SAL', rho: [4500, 4500], T: [8e8, 8e8], S: [5e8, 5e8], mu: 0.4, vol: [0, 0], color: 0x60c0e0 },
];
export function compat(a, b) {
  if (a === MAT.ICE || b === MAT.ICE) return 0.5;
  if (a === b && (a === MAT.REG || a === MAT.NFE)) return 1.0;
  if ((a === MAT.NFE && b === MAT.CMP) || (a === MAT.CMP && b === MAT.NFE)) return 1.0;
  return 0.8;
}

export class VoxelStore {
  constructor(cap = 65536) {
    this.cap = cap;
    this.x = new Int16Array(cap); this.y = new Int16Array(cap); this.z = new Int16Array(cap);
    this.mat = new Uint8Array(cap); this.mass = new Float32Array(cap); this.fill = new Float32Array(cap);
    this.temp = new Float32Array(cap); this.volatile = new Float32Array(cap); this.damage = new Float32Array(cap);
    this.tens = new Float32Array(cap); this.shear = new Float32Array(cap);
    this.cluster = new Int32Array(cap); this.module = new Int32Array(cap).fill(-1);
    this.alive = new Uint8Array(cap); this.stress = new Float32Array(cap);
    this.adj = new Array(cap);
    this.free = []; this.top = 0; this.count = 0;
  }
  alloc(x, y, z, mat, rng, fill = 1, strengthScale = 1) {
    const id = this.free.length ? this.free.pop() : this.top++;
    if (id >= this.cap) { this.top = this.cap; return -1; }
    const m = MATERIALS[mat], r = rng || (() => 0.5);
    this.x[id] = x; this.y[id] = y; this.z[id] = z; this.mat[id] = mat;
    this.fill[id] = fill;
    this.mass[id] = range(r, m.rho[0], m.rho[1]) * V_VOX * fill;
    this.tens[id] = range(r, m.T[0], m.T[1]) * strengthScale;
    this.shear[id] = range(r, m.S[0], m.S[1]) * strengthScale;
    this.volatile[id] = range(r, m.vol[0], m.vol[1]) * V_VOX * fill;
    this.temp[id] = 200; this.damage[id] = 0; this.stress[id] = 0;
    this.alive[id] = 1; this.adj[id] = []; this.module[id] = -1;
    this.count++;
    return id;
  }
  release(id) { this.alive[id] = 0; this.adj[id] = null; this.cluster[id] = -1; this.free.push(id); this.count--; }
}