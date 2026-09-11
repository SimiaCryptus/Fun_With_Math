import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/data/tuning.js';
import { DRIVERS } from '../src/data/drivers.js';
import { LEVELS } from '../src/data/levels.js';
import { EventBus } from '../src/core/events.js';
import { createDriverRegistry } from '../src/sim/drivers/index.js';
import { World, EMPTY_INTENT } from '../src/sim/world.js';

function run(seed, seconds, intentFn = () => EMPTY_INTENT) {
  const level = LEVELS[3];
  const world = new World({ level, drivers: createDriverRegistry(DRIVERS, level.modifiers), tuning: TUNING, seed, events: new EventBus() });
  const hashes = [];
  const n = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < n; i++) {
    world.step(TUNING.dt, intentFn(i));
    if (i % 60 === 0) hashes.push(world.hash());
  }
  return { world, hashes };
}

const scripted = (i) => (i % 240 === 0 ? { ...EMPTY_INTENT, up: true } : i % 240 === 120 ? { ...EMPTY_INTENT, taunt: true } : EMPTY_INTENT);

test('same seed + same inputs ⇒ identical state hash at every 60th step', () => {
  const a = run(1234, 20, scripted), b = run(1234, 20, scripted);
  assert.deepEqual(a.hashes, b.hashes);
  assert.ok(a.world.vehicles.length > 0, 'traffic exists');
});

test('different seeds diverge', () => {
  const a = run(1, 8), b = run(2, 8);
  assert.notDeepEqual(a.hashes, b.hashes);
});