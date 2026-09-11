import test from 'node:test';
import assert from 'node:assert/strict';
import { obbOverlap, pointDistance } from '../src/sim/collision.js';

const box = (x, z, heading = 0, length = 4.6, width = 1.8) => ({ x, z, heading, length, width });

test('aligned boxes overlap / separate', () => {
  const R = {};
  assert.equal(obbOverlap(box(0, 0), box(4, 0), R), true);
  assert.ok(Math.abs(R.depth - 0.6) < 1e-9);
  assert.ok(R.nx > 0.99, 'normal points from A toward B');
  assert.equal(obbOverlap(box(0, 0), box(5, 0)), false);
  assert.equal(obbOverlap(box(0, 0), box(0, 1.9)), false);
  assert.equal(obbOverlap(box(0, 0), box(0, 1.7)), true);
});

test('rotated box clips a corner that an AABB test would miss', () => {
  // B is laterally clear when aligned but its rotated nose sweeps into A
  assert.equal(obbOverlap(box(0, 0), box(3.5, 2.0)), false);
  assert.equal(obbOverlap(box(0, 0), box(3.5, 2.0, Math.PI / 4)), true);
});

test('pointDistance is 0 inside and euclidean outside', () => {
  const v = box(0, 0, Math.PI);          // westbound, same footprint
  assert.equal(pointDistance(v, 0, 0), 0);
  assert.equal(pointDistance(v, 2.3, 0.9), 0);
  assert.ok(Math.abs(pointDistance(v, 3.3, 0) - 1.0) < 1e-9);
  assert.ok(Math.abs(pointDistance(v, 0, 1.9) - 1.0) < 1e-9);
});