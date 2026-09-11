import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/data/tuning.js';
import { DRIVERS } from '../src/data/drivers.js';
import { LEVELS, endlessLevel } from '../src/data/levels.js';
import { validateAll, validateLevel } from '../src/core/config.js';
import { EventBus } from '../src/core/events.js';
import { BODY_TYPES } from '../src/sim/vehicle.js';
import { createDriverRegistry } from '../src/sim/drivers/index.js';
import { World, EMPTY_INTENT } from '../src/sim/world.js';

const dt = TUNING.dt;

/** Empty road with the player standing in the first lane and one hand-placed car 40 m upstream. */
function duel(driverId, seed = 7) {
  const level = LEVELS[0];
  const events = new EventBus();
  const world = new World({ level, drivers: createDriverRegistry(DRIVERS), tuning: TUNING, seed, events });
  world.vehicles.length = 0;
  const lane = world.road.lanes[0];
  const p = world.player;
  p.x = 0; p.z = lane.zCenter; p.row = lane.row.index; p.prevX = p.x; p.prevZ = p.z;
  const car = world.spawnVehicle({ lane, driverId, bodyType: 'sedan', x: -40 * lane.dir, v: 15, v0: 15 });
  return { world, events, car };
}

test('shipped data validates, including generated endless levels', () => {
  validateAll(DRIVERS, LEVELS, TUNING, Object.keys(BODY_TYPES));
  for (let n = 1; n <= 30; n++) validateLevel(endlessLevel(n), DRIVERS, n);
});

test('Red locks onto a player standing in its lane', () => {
  const { world, events } = duel('red');
  let locked = false;
  events.on('red:lock', () => { locked = true; });
  for (let i = 0; i < 240 && !locked; i++) world.step(dt);
  assert.ok(locked);
  assert.ok(world.stats.locks >= 1);
});
test('Red swerves toward a squirrel standing in the neighbouring lane', () => {
   const { world, car } = duel('red');
   const lane1 = world.road.lanes[1];
   const p = world.player;
   p.z = lane1.zCenter; p.prevZ = p.z; p.row = lane1.row.index;
   for (let i = 0; i < 240; i++) world.step(dt);                 // 2 s: still ~10 m short of the player
   assert.equal(car.lane, lane1, 'hunts into the player lane');
   assert.ok(Math.abs(car.z - lane1.zCenter) < 1.5, `should be nearly on top of the squirrel's lane, z=${car.z}`);
   assert.ok(car.mode === 'LOCKED' || car.mode === 'COMMIT');
});


test('White brakes to a stop for the player and never changes lane', () => {
  const { world, events, car } = duel('white');
  let laneChanges = 0;
  events.on('lanechange', ({ vehicle }) => { if (vehicle === car) laneChanges++; });
  for (let i = 0; i < 600; i++) world.step(dt);
  assert.ok(car.v < 0.5, `white should stop, v=${car.v}`);
  assert.equal(laneChanges, 0);
  assert.ok(world.player.alive, 'player survives behind a braking White');
});

test('Purple does not see the player from 40 m', () => {
  const { world, car } = duel('purple');
  for (let i = 0; i < 120; i++) world.step(dt);
  assert.equal(car.percept.player.visible, false);
  assert.ok(car.v > 13, 'no braking yet');
});

test('property: no NaN, vehicles stay inside the carriageway (5 seeds × 20 s, Rush Hour)', () => {
  const level = LEVELS[3];
  for (let seed = 1; seed <= 5; seed++) {
    const world = new World({ level, drivers: createDriverRegistry(DRIVERS, level.modifiers), tuning: TUNING, seed, events: new EventBus() });
    const zMax = world.road.laneZMax + 0.5, zMin = world.road.laneZMin - 0.5;
    for (let i = 0; i < 20 * 120; i++) {
      world.step(dt, EMPTY_INTENT);
      for (const v of world.vehicles) {
        assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.v), 'finite state');
        assert.ok(v.z <= zMax && v.z >= zMin, `vehicle ${v.id} left the carriageway (z=${v.z})`);
        if (v.state !== 'wrecked') assert.ok(v.v >= 0);
      }
    }
    assert.ok(world.vehicles.length > 5, 'traffic persists');
  }
});