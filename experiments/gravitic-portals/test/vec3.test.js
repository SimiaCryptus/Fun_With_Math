import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/core/vec3.js';
import { qFromAxisAngle, qRotate, qMul, qConj } from '../src/core/quat.js';

test('cross of basis vectors is right-handed', () => {
  assert.deepEqual(V.cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 });
});

test('normalize gives unit length and handles zero', () => {
  assert.ok(Math.abs(V.length(V.normalize({ x: 3, y: 4, z: 12 })) - 1) < 1e-12);
  assert.deepEqual(V.normalize({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
});

test('lerp and addScaled', () => {
  assert.ok(V.approxEqual(V.lerp({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 0.5), { x: 1, y: 2, z: 3 }));
  assert.ok(V.approxEqual(V.addScaled({ x: 1, y: 1, z: 1 }, { x: 1, y: 0, z: 0 }, 2), { x: 3, y: 1, z: 1 }));
});

test('quat: +90° about y maps z to x', () => {
  const q = qFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
  assert.ok(V.approxEqual(qRotate(q, { x: 0, y: 0, z: 1 }), { x: 1, y: 0, z: 0 }, 1e-12));
});

test('quat: q·q* rotation round-trips', () => {
  const q = qFromAxisAngle({ x: 1, y: 2, z: 3 }, 0.7);
  const v = { x: 0.3, y: -1.2, z: 2 };
  assert.ok(V.approxEqual(qRotate(qConj(q), qRotate(q, v)), v, 1e-12));
  const id = qMul(q, qConj(q));
  assert.ok(Math.abs(id.w - 1) < 1e-12);
});