// World state and step pipeline (physics.md §A.9). Implemented so far: steps 0, 3 (mass props),
// 6 (clusters + particles). Gravity, contacts, stress, topology and thermal slot in as they land.
// External forces: accumulate into c.F / c.T (frame coords, torque about X) or particles.a before
// calling step(); accumulators are cleared at the end of the step.
import { makeParams } from './params.js';
import { createMaterials } from './materials.js';
import { createRng } from './rng.js';
import { createVoxelPool } from './voxels.js';
import { createFrame, advanceFrame, maybeRebase } from './frame.js';
import { createParticlePool, stepParticles } from './particles.js';
import { recomputeMassProps } from './clusters.js';
import { integrateClusters } from './rigid.js';
import { v3 } from './math.js';

export function createWorld(overrides = {}, opts = {}) {
  const params = makeParams(overrides);
  return {
    params,
    mats: createMaterials(opts.materials || {}),
    rng: createRng(opts.seed ?? 'labrek'),
    tick: 0, time: 0,
    frame: createFrame(params),
    voxels: createVoxelPool(params.vcap),
    // faces.js pending (§B.3); empty stub keeps hashState and tooling stable
    faces: { hi: 0, alive: new Uint8Array(0), state: new Uint8Array(0), dmg: new Float32Array(0) },
    particles: createParticlePool(params.particleCap),
    clusters: [],
    events: [],
    escapedP: v3.create(), escapedM: 0, escapedE: 0, Eheat: 0,
  };
}

export function step(world) {
  const p = world.params;
  // 3. pending mass-property updates (before re-basing, which reads X)
  for (const c of world.clusters) if (c.alive && c.massDirty) recomputeMassProps(world, c);
  // 0. frame
  if (p.Omega === null) maybeRebase(world);
  advanceFrame(world.frame);
  // 6. integrate
  integrateClusters(world);
  stepParticles(world);
  for (const c of world.clusters) { v3.zero(c.F); v3.zero(c.T); }
  world.tick++;
  world.time = world.tick * p.dt; // no accumulated drift
}