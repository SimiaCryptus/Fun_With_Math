import test from 'node:test';
import assert from 'node:assert/strict';
import { idmAccel, idmEquilibriumGap } from '../src/sim/idm.js';

const P = { aMax: 1.5, bComf: 2.0, bMax: 7.5, T: 1.6, s0: 3.0 };

test('free flow accelerates toward v0 and never exceeds aMax', () => {
  assert.equal(idmAccel(P, 0, 20, Infinity, 0), P.aMax);
  assert.ok(Math.abs(idmAccel(P, 20, 20, Infinity, 0)) < 1e-9);
  assert.ok(idmAccel(P, 30, 20, Infinity, 0) < 0);
});

test('equilibrium gap yields zero net acceleration', () => {
  for (const v of [5, 10, 15]) {
    const s = idmEquilibriumGap(P, v, 20);
    assert.ok(Math.abs(idmAccel(P, v, 20, s, 0)) < 1e-9, `v=${v}`);
  }
});

test('acceleration is clamped to [-bMax, aMax]', () => {
  assert.equal(idmAccel(P, 25, 20, 0.5, 25), -P.bMax);
  assert.ok(idmAccel(P, 0, 20, 100, -10) <= P.aMax);
});

test('follower converges onto a constant-speed leader without negative speed', () => {
  const dt = 1 / 120, vL = 12;
  let x = 0, v = 20, xL = 40;
  for (let i = 0; i < 120 * 60; i++) {
    const s = xL - x - 4.6;
    const a = idmAccel(P, v, 20, s, v - vL);
    v = Math.max(0, v + a * dt); x += v * dt; xL += vL * dt;
    assert.ok(v >= 0);
    assert.ok(s > 0, 'never collides');
  }
  assert.ok(Math.abs(v - vL) < 0.05 * vL);
});