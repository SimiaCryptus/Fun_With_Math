import test from 'node:test';
import assert from 'node:assert/strict';
import { RingBuffer } from '../src/core/RingBuffer.js';
import { VelocityHistory } from '../src/temporal/VelocityHistory.js';
import { HISTORY_DT } from '../src/core/constants.js';

test('RingBuffer survives wraparound', () => {
  const rb = new RingBuffer(4, 2);
  for (let i = 0; i < 11; i++) rb.push([i, -i]);
  const out = new Float32Array(2);
  assert.deepEqual([...rb.read(0, out)], [10, -10]);
  assert.deepEqual([...rb.read(3, out)], [7, -7]);
  assert.equal(rb.count, 4);
  assert.equal(rb.total, 11);
});

test('history interpolates between ticks', () => {
  const h = new VelocityHistory(2);
  const body = { vel: { x: 0, y: 0, z: 0 }, yaw: 0, yawRate: 0 };
  for (let i = 0; i < 60; i++) { body.vel.z = i; h.record(body); }
  // newest = 59, one tick ago = 58 => halfway = 58.5
  const s = h.sample(HISTORY_DT * 0.5);
  assert.ok(Math.abs(s.vz - 58.5) < 1e-4, `got ${s.vz}`);
});

test('yaw interpolation takes the short arc across pi', () => {
  const h = new VelocityHistory(2);
  const body = { vel: { x: 0, y: 0, z: 0 }, yaw: -3.1, yawRate: 0 };
  h.record(body);
  body.yaw = 3.1; h.record(body);
  const s = h.sample(HISTORY_DT * 0.5);
  assert.ok(Math.abs(Math.abs(s.yaw) - Math.PI) < 0.06, `got ${s.yaw}`);
});