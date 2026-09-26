import test from 'node:test';
import assert from 'node:assert';
import { World } from '../src/sim/world.js';
import { MAT, L } from '../src/sim/voxels.js';
import { updateMassProps } from '../src/sim/clusters.js';
import { add, sub, len, scale } from '../src/sim/math.js';

function block(world, n, mat, X = [0, 0, 0]) {
  const c = world.newCluster();
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) world.addVoxel(c, x, y, z, mat, 1);
  for (const id of c.voxels) world.bondNeighbors(c, id);
  updateMassProps(world, c);
  c.X = X;
  return c;
}
function sphere(world, r, mat) {
  const c = world.newCluster();
  for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++)
    if (x * x + y * y + z * z <= r * r) world.addVoxel(c, x, y, z, mat, 1);
  for (const id of c.voxels) world.bondNeighbors(c, id);
  updateMassProps(world, c);
  return c;
}

test('two-body orbit conserves momentum', () => {
  const w = new World({ G: 6.674e-11 * 100 });
  const a = block(w, 4, MAT.NFE, [0, 0, 0]);
  const b = block(w, 2, MAT.NFE, [40, 0, 0]);
  const v = Math.sqrt(w.G * a.M / 40);
  b.V = [0, v, 0]; a.V = [0, -v * b.M / a.M, 0];
  const P0 = w.totals().P, L0 = w.totals().L;
  for (let i = 0; i < 3000; i++) w.step();
  const { P, L: L1 } = w.totals();
  const pScale = b.M * v;
  assert.ok(len(sub(P, P0)) / pScale < 1e-9, 'linear momentum');
  assert.ok(len(sub(L1, L0)) / len(L0) < 1e-6, 'angular momentum');
});

test('split conserves momentum', () => {
  const w = new World();
  const c = block(w, 3, MAT.SIL);
  c.w = [0, 0, 0.01]; c.V = [0.1, 0, 0];
  const before = w.totals();
  // sever the x=0 layer from the rest
  for (let b = 0; b < w.bonds.top; b++) {
    if (!w.bonds.alive[b]) continue;
    const xa = w.vox.x[w.bonds.a[b]], xb = w.vox.x[w.bonds.b[b]];
    if (Math.min(xa, xb) === 0 && Math.max(xa, xb) === 1) w.bonds.kill(b);
  }
  w.splitCluster(c);
  assert.strictEqual(w.clusters.size, 2);
  const after = w.totals();
  assert.ok(len(sub(after.P, before.P)) < 1e-9 * len(before.P) + 1e-9);
  assert.ok(len(sub(after.L, before.L)) < 1e-6 * len(before.L) + 1e-9);
});

test('body-frame gravity grid ~ GM/r² outside a sphere', () => {
  const w = new World({ gridThreshold: 1000 });
  const c = sphere(w, 8, MAT.SIL);
  w.buildGridSync(c);
  const r = 22;
  const { gAccel } = awaitGravity;
  const g = len(gAccel(w, c, add(c.X, [r, 0, 0])));
  const exact = w.G * c.M / (r * r);
  assert.ok(Math.abs(g - exact) / exact < 0.02, `grid ${g} vs ${exact}`);
});
import * as awaitGravity from '../src/sim/gravity.js';

test('Big Rocket: 50 kN on bare regolith tears off within 1 s', () => {
  const w = new World();
  const c = block(w, 6, MAT.REG);
  let mount = -1;
  for (const id of c.voxels) if (w.vox.x[id] === 5 && w.vox.y[id] === 3 && w.vox.z[id] === 3) mount = id;
  w.addForce(mount, [50000, 0, 0]);
  for (let i = 0; i < 60; i++) w.step();
  assert.notStrictEqual(w.vox.cluster[mount], c.id, 'mount voxel detached');
});

test('same engine on a composite block holds', () => {
  const w = new World();
  const c = block(w, 4, MAT.CMP);
  const mount = [...c.voxels][0];
  w.addForce(mount, [50000, 0, 0]);
  for (let i = 0; i < 120; i++) w.step();
  assert.strictEqual(w.clusters.size, 1);
});

test('determinism: same inputs -> same hash', () => {
  const run = () => {
    const w = new World({ G: 6.674e-11 * 100 });
    const a = block(w, 3, MAT.SIL); a.w = [0.001, 0.002, 0.0005];
    const b = block(w, 2, MAT.REG, [15, 1, 0]); b.V = [-0.05, 0, 0];
    for (let i = 0; i < 1500; i++) w.step();
    return w.stateHash();
  };
  assert.strictEqual(run(), run());
});

test('torque-free intermediate-axis spin is unstable (Dzhanibekov)', () => {
  const w = new World({ G: 0 });
  const c = w.newCluster();
  for (let x = 0; x < 6; x++) for (let y = 0; y < 3; y++) world1(w, c, x, y);
  for (const id of c.voxels) w.bondNeighbors(c, id);
  updateMassProps(w, c);
  // intermediate axis is y for a 6x3x1 slab
  c.w = [1e-4, 0.05, 1e-4];
  const wy0 = c.w[1]; let flipped = false;
  for (let i = 0; i < 20000 && !flipped; i++) { w.integrate(c, w.dt); if (c.w[1] * wy0 < 0) flipped = true; }
  assert.ok(flipped, 'expected a flip');
});
function world1(w, c, x, y) { w.addVoxel(c, x, y, 0, MAT.NFE, 1); }