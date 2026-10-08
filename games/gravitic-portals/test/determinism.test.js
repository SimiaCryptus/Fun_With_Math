import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldFromLevel } from '../src/core/level.js';
import { PRESETS } from '../src/core/presets.js';

function runPreset(name, steps, seed) {
  const level = structuredClone(PRESETS[name]);
  if (seed != null) level.emitter.seed = seed;
  const { world, emitter } = createWorldFromLevel(level);
  for (let i = 0; i < steps; i++) { emitter.step(world); world.step(); }
  return world.dump();
}

test('same seed + level ⇒ byte-identical state', () => {
  for (const name of ['tilt-45', 'floor-ceiling']) {
    assert.equal(runPreset(name, 400), runPreset(name, 400));
  }
});

test('different seed ⇒ different state', () => {
  assert.notEqual(runPreset('tilt-45', 200, 1), runPreset('tilt-45', 200, 2));
});