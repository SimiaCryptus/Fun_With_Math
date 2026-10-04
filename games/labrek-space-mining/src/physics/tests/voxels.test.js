import test from 'node:test';
import assert from 'node:assert/strict';
import { packKey, createVoxelPool, allocVoxel, freeVoxel } from '../voxels.js';

test('packKey: bounds, clamping, injectivity', () => {
  assert.equal(packKey(-512, -512, -512), 0);
  assert.equal(packKey(511, 511, 511), (1 << 30) - 1);
  assert.equal(packKey(-600, 0, 0), packKey(-512, 0, 0));
  assert.equal(packKey(0, 900, 0), packKey(0, 511, 0));
  const keys = new Set();
  for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) {
    const k = packKey(x, y, z);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 1 << 30);
    keys.add(k);
  }
  assert.equal(keys.size, 729);
});

test('alloc/free: sequential ids, LIFO recycling, counts', () => {
  const p = createVoxelPool(8);
  const ids = [allocVoxel(p), allocVoxel(p), allocVoxel(p)];
  assert.deepEqual(ids, [0, 1, 2]);
  assert.equal(p.count, 3); assert.equal(p.hi, 3);
  freeVoxel(p, 0); freeVoxel(p, 2);
  assert.equal(p.count, 1);
  assert.equal(p.alive[0], 0); assert.equal(p.alive[2], 0);
  assert.equal(allocVoxel(p), 2);
  assert.equal(allocVoxel(p), 0);
  assert.equal(allocVoxel(p), 3);
  assert.equal(p.hi, 4); assert.equal(p.count, 4);
});

test('double free is a no-op', () => {
  const p = createVoxelPool(4);
  const v = allocVoxel(p);
  freeVoxel(p, v); freeVoxel(p, v);
  assert.equal(p.count, 0);
  assert.deepEqual(p.free, [v]);
});

test('pool full throws', () => {
  const p = createVoxelPool(2);
  allocVoxel(p); allocVoxel(p);
  assert.throws(() => allocVoxel(p), /voxel pool full/);
  freeVoxel(p, 1);
  assert.equal(allocVoxel(p), 1);
});

test('recycled voxel is fully reset', () => {
  const p = createVoxelPool(4);
  const v = allocVoxel(p);
  p.cluster[v] = 5; p.fill[v] = 0.3; p.mass[v] = 12; p.temp[v] = 300; p.vol[v] = 1;
  p.damage[v] = 0.5; p.module[v] = 7; p.nextOcc[v] = 2; p.heat[v] = 9; p.qmod[v] = 4;
  for (let k = 0; k < 3; k++) { p.fext[3 * v + k] = 1; p.fcon[3 * v + k] = 2; p.fjet[3 * v + k] = 3; p.thrust[3 * v + k] = 4; }
  freeVoxel(p, v);
  assert.equal(p.cluster[v], -1); assert.equal(p.mass[v], 0);
  const w = allocVoxel(p);
  assert.equal(w, v);
  assert.equal(p.alive[v], 1); assert.equal(p.cluster[v], -1); assert.equal(p.fill[v], 1);
  assert.equal(p.mass[v], 0); assert.equal(p.temp[v], 0); assert.equal(p.vol[v], 0);
  assert.equal(p.damage[v], 0); assert.equal(p.module[v], -1); assert.equal(p.nextOcc[v], -1);
  assert.equal(p.heat[v], 0); assert.equal(p.qmod[v], 0);
  for (let k = 0; k < 3; k++) {
    assert.equal(p.fext[3 * v + k], 0); assert.equal(p.fcon[3 * v + k], 0);
    assert.equal(p.fjet[3 * v + k], 0); assert.equal(p.thrust[3 * v + k], 0);
  }
});

test('id sequence is deterministic for identical op sequences', () => {
  const run = () => {
    const p = createVoxelPool(64), out = [];
    for (let i = 0; i < 20; i++) out.push(allocVoxel(p));
    for (const v of [3, 17, 5, 11]) freeVoxel(p, v);
    for (let i = 0; i < 6; i++) out.push(allocVoxel(p));
    return out;
  };
  assert.deepEqual(run(), run());
});