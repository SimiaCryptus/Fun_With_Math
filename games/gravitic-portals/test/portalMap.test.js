import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/core/vec3.js';
import { makePortal, toLocal } from '../src/core/portal.js';
import { createPortalMap } from '../src/core/portalMap.js';
import { createRng } from '../src/core/rng.js';

function randomPortal(rng, id) {
  return makePortal({
    id,
    center: [rng.range(-5, 5), rng.range(-5, 5), rng.range(-5, 5)],
    normal: [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)],
    up: [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)],
    radius: rng.range(0.3, 3),
  });
}

test('T(T⁻¹(y)) = y and T⁻¹(T(x)) = x', () => {
  const rng = createRng(11);
  for (let k = 0; k < 50; k++) {
    const a = randomPortal(rng, 1), b = randomPortal(rng, 2);
    const T = createPortalMap(a, b), Ti = createPortalMap(b, a);
    const x = { x: rng.range(-5, 5), y: rng.range(-5, 5), z: rng.range(-5, 5) };
    assert.ok(V.approxEqual(Ti.point(T.point(x)), x, 1e-9));
    assert.ok(V.approxEqual(T.point(Ti.point(x)), x, 1e-9));
  }
});

test('rim maps to rim, disk plane maps to disk plane', () => {
  const rng = createRng(12);
  for (let k = 0; k < 50; k++) {
    const a = randomPortal(rng, 1), b = randomPortal(rng, 2);
    const T = createPortalMap(a, b);
    const th = rng.range(0, 2 * Math.PI);
    const rimA = V.add(a.center, V.add(V.scale(a.right, a.radius * Math.cos(th)), V.scale(a.up, a.radius * Math.sin(th))));
    const l = toLocal(b, T.point(rimA));
    assert.ok(Math.abs(Math.hypot(l.x, l.y) - b.radius) < 1e-9);
    assert.ok(Math.abs(l.z) < 1e-9);
  }
});

test('frame handedness preserved; entering −n_a exits +n_b', () => {
  const rng = createRng(13);
  for (let k = 0; k < 50; k++) {
    const a = randomPortal(rng, 1), b = randomPortal(rng, 2);
    const T = createPortalMap(a, b);
    const r = T.dir(a.right), u = T.dir(a.up), n = T.dir(a.normal);
    assert.ok(V.approxEqual(V.cross(r, u), n, 1e-9));
    assert.ok(V.approxEqual(T.dir(V.negate(a.normal)), b.normal, 1e-9));
  }
});