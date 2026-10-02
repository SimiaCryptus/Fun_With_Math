import test from 'node:test';
import assert from 'node:assert/strict';
import { hashState } from '../src/sim/hash.js';
import { createVoxelPool, allocVoxel } from '../src/sim/voxels.js';

function cluster(id, alive = true) {
  return {
    id, alive, M: 10 * id + 1, voxels: [0, 1],
    X: new Float64Array([id, 2, 3]), U: new Float64Array([0.1, 0, 0]),
    q: new Float64Array([1, 0, 0, 0]), wb: new Float64Array([0, 0, 1e-4]),
  };
}

function fakeWorld() {
  const V = createVoxelPool(16);
  for (let i = 0; i < 3; i++) { const v = allocVoxel(V); V.mass[v] = 1000 + v; V.temp[v] = 200; V.px[v] = 2 * v; }
  const F = { hi: 2, alive: new Uint8Array(8).fill(1), state: new Uint8Array(8), dmg: new Float32Array(8) };
  const P = { hi: 1, alive: new Uint8Array(8), x: new Float64Array(24), u: new Float64Array(24) };
  P.alive[0] = 1; P.x[0] = 5;
  return {
    tick: 7, voxels: V, faces: F, particles: P,
    frame: { Om: new Float64Array([0, 0, 1e-4]), qf: new Float64Array([1, 0, 0, 0]) },
    clusters: [cluster(0), cluster(1)],
  };
}

test('hash is an 8-digit hex string and deterministic', () => {
  const h = hashState(fakeWorld());
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.equal(hashState(fakeWorld()), h);
});

test('hash is sensitive to every hashed field', () => {
  const base = hashState(fakeWorld());
  const edits = [
    (w) => { w.tick++; },
    (w) => { w.frame.Om[2] *= 2; },
    (w) => { w.frame.qf[1] = 1e-12; },
    (w) => { w.clusters[1].X[0] += 1e-9; },
    (w) => { w.clusters[0].wb[2] = 0; },
    (w) => { w.clusters[0].voxels.push(2); },
    (w) => { w.voxels.mass[1] = 1001 + 2 ** -42; },
    (w) => { w.voxels.temp[2] = 201; },
    (w) => { w.voxels.pz[0] = 1; },
    (w) => { w.voxels.cluster[0] = 0; },
    (w) => { w.faces.state[1] = 2; },
    (w) => { w.faces.dmg[0] = 0.1; },
    (w) => { w.particles.u[2] = 1; },
  ];
  for (const [i, e] of edits.entries()) {
    const w = fakeWorld(); e(w);
    assert.notEqual(hashState(w), base, `edit ${i}`);
  }
});

test('hash ignores dead clusters and pool data beyond hi', () => {
  const base = hashState(fakeWorld());
  let w = fakeWorld(); w.voxels.mass[10] = 123; w.faces.dmg[5] = 1; w.particles.x[9] = 4;
  assert.equal(hashState(w), base);
  w = fakeWorld(); w.clusters.push(cluster(9, false));
  assert.equal(hashState(w), base);
});