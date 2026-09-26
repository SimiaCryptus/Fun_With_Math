import { L } from './voxels.js';
import { I3, add, sub, cross, mv, mm, mt, inv3, quatToMat } from './math.js';

export const key = (x, y, z) => ((x + 32768) * 65536 + (y + 32768)) * 65536 + (z + 32768);
export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function makeCluster(id) {
  return {
    id, X: [0, 0, 0], V: [0, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0],
    M: 0, com: [0, 0, 0], Ib: I3(), IbInv: I3(), rad: L, aabb: [0, 0, 0, 0, 0, 0],
    voxels: new Set(), occ: new Map(),
    grid: null, gridJob: null, gridM: 0,
    init: false, massDirty: true, dirty: true, topoChanged: true,
    F: [0, 0, 0], T: [0, 0, 0], gExt: [0, 0, 0], A: [0, 0, 0], alpha: [0, 0, 0],
    V0: [0, 0, 0], w0: [0, 0, 0], contactF: [], lastStress: -1, stressActive: false, sleeping: false,
  };
}

export const latticePos = (vox, id) => [vox.x[id] * L, vox.y[id] * L, vox.z[id] * L];
export const bodyPos = (vox, c, id) => sub(latticePos(vox, id), c.com);
export const worldPos = (vox, c, id, R) => add(c.X, mv(R || quatToMat(c.q), bodyPos(vox, c, id)));
export function worldInvInertia(c, R) { R = R || quatToMat(c.q); return mm(mm(R, c.IbInv), mt(R)); }
export function worldInertia(c, R) { R = R || quatToMat(c.q); return mm(mm(R, c.Ib), mt(R)); }
export function angMom(c) { return add(mv(worldInertia(c), c.w), cross(c.X, scaleV(c.V, c.M))); }
const scaleV = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

export function applyImpulse(c, p, J) {
  c.V = add(c.V, scaleV(J, 1 / c.M));
  c.w = add(c.w, mv(worldInvInertia(c), cross(sub(p, c.X), J)));
}

// Recompute M, COM, inertia. O(N). Keeps world placement consistent when COM shifts.
export function updateMassProps(world, c) {
  const v = world.vox;
  let M = 0, cx = 0, cy = 0, cz = 0;
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
  for (const id of c.voxels) {
    const m = v.mass[id]; M += m;
    cx += m * v.x[id] * L; cy += m * v.y[id] * L; cz += m * v.z[id] * L;
    mnx = Math.min(mnx, v.x[id]); mny = Math.min(mny, v.y[id]); mnz = Math.min(mnz, v.z[id]);
    mxx = Math.max(mxx, v.x[id]); mxy = Math.max(mxy, v.y[id]); mxz = Math.max(mxz, v.z[id]);
  }
  if (M <= 0) { c.M = 0; return; }
  const com = [cx / M, cy / M, cz / M];
  const Ib = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let rad2 = 0; const cube = (L * L) / 6;
  for (const id of c.voxels) {
    const m = v.mass[id];
    const rx = v.x[id] * L - com[0], ry = v.y[id] * L - com[1], rz = v.z[id] * L - com[2];
    const r2 = rx * rx + ry * ry + rz * rz; if (r2 > rad2) rad2 = r2;
    Ib[0] += m * (r2 - rx * rx + cube); Ib[4] += m * (r2 - ry * ry + cube); Ib[8] += m * (r2 - rz * rz + cube);
    Ib[1] -= m * rx * ry; Ib[2] -= m * rx * rz; Ib[5] -= m * ry * rz;
  }
  Ib[3] = Ib[1]; Ib[6] = Ib[2]; Ib[7] = Ib[5];
  if (c.init) {
    const dw = mv(quatToMat(c.q), sub(com, c.com));
    c.X = add(c.X, dw); c.V = add(c.V, cross(c.w, dw));
  }
  c.com = com; c.M = M; c.Ib = Ib; c.IbInv = inv3(Ib);
  c.rad = Math.sqrt(rad2) + L; c.aabb = [mnx, mny, mnz, mxx, mxy, mxz];
  c.init = true; c.massDirty = false; c.dirty = true;
  if (c.voxels.size >= world.gridThreshold) {
    if (!c.grid || c.topoChanged || Math.abs(M - c.gridM) / M > 0.005) world.scheduleGrid(c);
  } else { c.grid = null; c.gridJob = null; }
  c.topoChanged = false;
}