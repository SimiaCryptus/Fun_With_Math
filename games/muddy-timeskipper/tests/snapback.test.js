import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleBody } from '../src/physics/VehicleBody.js';
import { VelocityHistory } from '../src/temporal/VelocityHistory.js';
import { applySnapback, SnapbackController } from '../src/temporal/SnapbackController.js';
import { gearById } from '../src/temporal/gears.js';
import { SIM_DT, V88 } from '../src/core/constants.js';
import { EventBus } from '../src/core/EventBus.js';
import { RNG } from '../src/core/RNG.js';

const mkVehicle = () => {
  const body = new VehicleBody({ x: 5, z: -7, yaw: 0.9 });
  return { id: 'p', body, history: new VelocityHistory(40) };
};

test('snapback never moves the vehicle or rewinds mud', () => {
  const v = mkVehicle();
  v.body.mudLoad = 0.42;
  // build 10 s of history at 20 m/s forward
  for (let i = 0; i < 10 / SIM_DT; i++) {
    v.body.vel.x = 0; v.body.vel.z = 20;
    v.history.advance(SIM_DT, v.body);
  }
  const snapshot = { ...v.body.pos, yaw: v.body.yaw, mudLoad: v.body.mudLoad };
  v.body.vel.z = 45;
  applySnapback(v.body, v.history.sample(8), gearById('T2'), 1, true);

  assert.equal(v.body.pos.x, snapshot.x);
  assert.equal(v.body.pos.z, snapshot.z);
  assert.equal(v.body.yaw, snapshot.yaw);
  assert.equal(v.body.mudLoad, snapshot.mudLoad);
});

test('velocity is pulled toward the past vector', () => {
  const v = mkVehicle();
  v.body.yaw = 0;
  for (let i = 0; i < 25 / SIM_DT; i++) {
    v.body.vel.x = 0; v.body.vel.z = 12;
    v.history.advance(SIM_DT, v.body);
  }
  v.body.vel.z = 42;
  applySnapback(v.body, v.history.sample(20), gearById('T3'), 1, true);
  assert.ok(Math.abs(v.body.vel.z - 12) < 0.2, `got ${v.body.vel.z}`);
});

test('forward gain is capped for the player (no free boost loop)', () => {
  const v = mkVehicle();
  v.body.yaw = 0;
  for (let i = 0; i < 25 / SIM_DT; i++) {
    v.body.vel.z = 40;                    // fast past
    v.history.advance(SIM_DT, v.body);
  }
  v.body.vel.z = 10;                      // slow now
  applySnapback(v.body, v.history.sample(20), gearById('T3'), 1, true);
  assert.ok(v.body.vel.z <= 10 * 1.15 + 1e-3, `uncapped: ${v.body.vel.z}`);
  assert.ok(v.body.fx.deniedBoost > 0);
});

test('short history clamps and flags TOO YOUNG', () => {
  const v = mkVehicle();
  for (let i = 0; i < 2 / SIM_DT; i++) { v.body.vel.z = 9; v.history.advance(SIM_DT, v.body); }
  const s = v.history.sample(40);
  assert.equal(s.clamped, true);
  assert.ok(s.age <= 2.1);
});

test('arming requires 88 mph and cooldown gates activation', () => {
  const player = mkVehicle();
  const ctl = new SnapbackController({ player, ais: [], bus: new EventBus(), rng: new RNG(1) });
  ctl.selectGear('T1');
  ctl.switchLockout = 0;

  player.body.vel.z = 10;
  ctl.fixedUpdate(SIM_DT);
  assert.equal(ctl.activate(), null, 'must not fire below 88');

  player.body.vel.z = V88 + 1;
  ctl.fixedUpdate(SIM_DT);
  assert.ok(ctl.activate(), 'should fire when armed');
  assert.ok(ctl.cooldown > 0);
  assert.equal(ctl.activate(), null, 'cooldown must block');
});