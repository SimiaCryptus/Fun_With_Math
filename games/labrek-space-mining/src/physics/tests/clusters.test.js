import test from 'node:test';
import assert from 'node:assert/strict';
import { v3, quat } from '../math.js';
import { MAT } from '../materials.js';
import {
  createCluster, addVoxel, removeVoxel, setVoxelMass, recomputeMassProps, worldPos, voxelVelocity, primaryCluster,
} from '../clusters.js';
import { testWorld, box } from './helpers/scenes.js';
import { relClose, closeVec, close } from './helpers/close.js';

test('box mass properties are exact (point masses + cube self-inertia)', () => {
  const w = testWorld(), h = w.params.h;
  const nx = 4, ny = 3, nz = 2, c = box(w, nx, ny, nz, MAT.SIL);
  const M = nx * ny * nz * w.mats[MAT.SIL].rho * h * h * h;
  relClose(c.M, M, 1e-14);
  closeVec(c.s, [(nx - 1) * h / 2, (ny - 1) * h / 2, (nz - 1) * h / 2], 1e-12);
  const Lx = nx * h, Ly = ny * h, Lz = nz * h;
  relClose(c.Ib[0], M * (Ly * Ly + Lz * Lz) / 12, 1e-12);
  relClose(c.Ib[4], M * (Lx * Lx + Lz * Lz) / 12, 1e-12);
  relClose(c.Ib[8], M * (Lx * Lx + Ly * Ly) / 12, 1e-12);
  for (const k of [1, 2, 3, 5, 6, 7]) close(c.Ib[k], 0, 1e-9 * c.Ib[0]);
  assert.ok(c.rad >= Math.hypot(Lx, Ly, Lz) / 2 - 1e-12);
});

test('duplicate lattice site rejected; out-of-range throws', () => {
  const w = testWorld(), c = createCluster(w);
  assert.ok(addVoxel(w, c, 0, 0, 0, MAT.REG) >= 0);
  assert.equal(addVoxel(w, c, 0, 0, 0, MAT.REG), -1);
  assert.throws(() => addVoxel(w, c, 600, 0, 0, MAT.REG), /out of range/);
});

test('incremental mass properties match exact rebuild', () => {
  const w = testWorld(), c = box(w, 5, 4, 3, MAT.SIL);
  const vs = c.voxels.slice();
  for (const v of [vs[0], vs[7], vs[22], vs[59]]) removeVoxel(w, v);
  setVoxelMass(w, vs[10], 0.3 * w.voxels.mass[vs[10]]);
  recomputeMassProps(w, c);
  const inc = { M: c.M, s: v3.copy(v3.create(), c.s), I: c.Ib.slice() };
  recomputeMassProps(w, c, true);
  relClose(inc.M, c.M, 1e-13);
  closeVec(inc.s, c.s, 1e-12);
  for (let k = 0; k < 9; k++) close(inc.I[k], c.Ib[k], 1e-10 * c.Ib[0]);
  assert.equal(c.voxels.length, 56);
  for (const [i, v] of c.voxels.entries()) assert.equal(w.voxels.slot[v], i);
});

test('removing a voxel keeps remaining material positions and velocities fixed', () => {
  const w = testWorld({ Omega: [1e-3, 0, 2e-3] }), c = box(w, 4, 3, 2, MAT.SIL);
  v3.set(c.X, 12, -7, 3); v3.set(c.U, 0.01, 0, -0.02); v3.set(c.wb, 1e-3, -2e-3, 5e-4);
  quat.normalize(c.q, [0.9, 0.1, -0.3, 0.2]);
  const victim = c.voxels[0], keep = c.voxels.slice(1);
  const before = keep.map((v) => [worldPos(w, c, v, v3.create()), voxelVelocity(w, c, v, v3.create())]);
  removeVoxel(w, victim);
  recomputeMassProps(w, c);
  keep.forEach((v, i) => {
    closeVec(worldPos(w, c, v, v3.create()), before[i][0], 1e-12, 'pos');
    closeVec(voxelVelocity(w, c, v, v3.create()), before[i][1], 1e-15, 'vel');
  });
});

test('primaryCluster: heaviest, lowest id on ties', () => {
  const w = testWorld();
  const a = box(w, 2, 2, 2, MAT.REG), b = box(w, 2, 2, 2, MAT.NFE), c = box(w, 2, 2, 2, MAT.NFE);
  assert.equal(primaryCluster(w), b);
  b.alive = false;
  assert.equal(primaryCluster(w), c);
  assert.ok(a.M < c.M);
});