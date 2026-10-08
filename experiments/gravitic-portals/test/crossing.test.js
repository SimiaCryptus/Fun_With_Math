import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/core/vec3.js';
import { makeWorld, tiltedPortals, floorCeilingPortals, bg } from './fixtures.js';
import { findCrossing } from '../src/core/sim/crossing.js';
import { FieldSystem } from '../src/core/field/fieldSystem.js';

function crossOnce(opts) {
  const world = makeWorld(tiltedPortals(), { energyCorrection: false, ...opts });
  const p = world.addParticle([0, 0.5, 0], [0, -2, 0]);
  for (let i = 0; i < 2000; i++) {
    const before = world.energy(p);
    world.step();
    if (p.crossings > 0) return { dE: world.energy(p) - before, world };
  }
  throw new Error('particle never crossed');
}

test('energy continuous across the seam (tilted pair, through the centre)', () => {
  const dPhi = bg.potential({ x: 3, y: 2, z: 0 }) - bg.potential({ x: 0, y: 0, z: 0 });
  const withCF = crossOnce({});
  const naive = crossOnce({ terms: { disks: false, gap: false } });
  console.log(`seam ΔE with CF ${withCF.dE.toFixed(5)}, naive ${naive.dE.toFixed(3)} (ΔΦ=${dPhi.toFixed(2)})`);
  assert.ok(Math.abs(withCF.dE) < 0.02 * dPhi);
  assert.ok(Math.abs(naive.dE) > 0.5 * dPhi);
});

test('exit point and velocity follow T', () => {
  const world = makeWorld(tiltedPortals(), { energyCorrection: false });
  const [, b] = world.fieldSystem.portals;
  const p = world.addParticle([0, 0.05, 0], [0, -1, 0]);
   for (let i = 0; i < 200 && p.crossings === 0; i++) world.step();
  assert.equal(p.crossings, 1);
  assert.ok(V.distance(p.pos, b.center) < 0.05);
  assert.ok(V.dot(V.normalize(p.vel), b.normal) > 0.99);
});

test('misses outside the disk and back→front passes through', () => {
  const fs = new FieldSystem(bg, floorCeilingPortals(2, 1));
  const entries = fs.crossingEntries;
  assert.equal(findCrossing({ x: 1.5, y: 0.1, z: 0 }, { x: 1.5, y: -0.1, z: 0 }, entries), null);
  assert.equal(findCrossing({ x: 0, y: -0.1, z: 0 }, { x: 0, y: 0.1, z: 0 }, entries), null);
  assert.ok(findCrossing({ x: 0, y: 0.1, z: 0 }, { x: 0, y: -0.1, z: 0 }, entries));
});