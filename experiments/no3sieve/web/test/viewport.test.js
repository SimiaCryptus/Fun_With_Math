import test from 'node:test';
import assert from 'node:assert/strict';
import { setLevel } from '../js/util/log.js';
import { Viewport } from '../js/viewport.js';

setLevel('silent');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

function vpAt(zoom = 10) {
  const vp = new Viewport();
  vp.resize(800, 600, 2);
  vp.zoom = zoom;
  vp.cx = 0;
  vp.cy = 0;
  return vp;
}

test('resize ignores degenerate sizes instead of poisoning the camera', () => {
  const vp = vpAt();
  assert.equal(vp.w, 800);
  assert.equal(vp.h, 600);
  assert.equal(vp.dpr, 2);
  vp.resize(0, 100, 1);
  vp.resize(NaN, 100, 1);
  assert.equal(vp.w, 800, 'a zero/NaN size must not be applied');
  vp.resize(400, 300, 0);
  assert.equal(vp.dpr, 1, 'a non-positive dpr falls back to 1');
});

test('world <-> screen transforms are inverse, with +y up', () => {
  const vp = vpAt(10);
  close(vp.toScreenX(0), 400);
  close(vp.toScreenY(0), 300);
  close(vp.toScreenY(1), 290, 1e-9);
  for (const v of [-13.5, 0, 7, 1234.25]) {
    close(vp.toWorldX(vp.toScreenX(v)), v, 1e-9);
    close(vp.toWorldY(vp.toScreenY(v)), v, 1e-9);
  }
});

test('cellAt rounds to a lattice cell and refuses nonsense', () => {
  const vp = vpAt(10);
  assert.deepEqual(vp.cellAt(400, 300), [0, 0]);
  assert.deepEqual(vp.cellAt(404, 300), [0, 0]);
  assert.deepEqual(vp.cellAt(410, 290), [1, 1]);
  assert.equal(vp.cellAt(NaN, 0), null);
  assert.equal(vp.cellAt(0, undefined), null);
});

test('panPixels moves the camera and rejects NaN', () => {
  const vp = vpAt(10);
  vp.panPixels(10, -20);
  close(vp.cx, -1);
  close(vp.cy, -2);
  vp.panPixels(NaN, 0);
  close(vp.cx, -1, 1e-9);
});

test('zoomAt keeps the cell under the cursor fixed, and clamps', () => {
  const vp = vpAt(10);
  vp.cx = 3;
  vp.cy = -4;
  const wx = vp.toWorldX(123),
    wy = vp.toWorldY(456);
  vp.zoomAt(123, 456, 1.7);
  close(vp.toWorldX(123), wx, 1e-9);
  close(vp.toWorldY(456), wy, 1e-9);
  vp.zoomAt(400, 300, 1e9);
  assert.equal(vp.zoom, 64);
  vp.zoomAt(400, 300, 1e-9);
  assert.equal(vp.zoom, 1 / 64);
  const before = vp.zoom;
  vp.zoomAt(400, 300, -1);
  assert.equal(vp.zoom, before, 'a non-positive factor is ignored');
});

test('fitRing centres the origin and fits (2R+1) cells', () => {
  const vp = vpAt();
  vp.fitRing(10);
  assert.equal(vp.cx, 0);
  assert.equal(vp.cy, 0);
  close(vp.zoom, Math.min(64, 600 / (21 * 1.08)), 1e-9);
  vp.fitRing(1e9);
  assert.equal(vp.zoom, 1 / 64, 'clamped, never zero');
  const z = vp.zoom;
  vp.fitRing(-1);
  assert.equal(vp.zoom, z, 'negative R ignored');
});

test('a non-finite camera is detected and reset instead of blanking every frame', () => {
  const vp = vpAt();
  vp.zoom = NaN;
  const box = vp.visibleBox();
  assert.equal(vp.zoom, 12);
  assert.equal(vp.cx, 0);
  for (const v of Object.values(box)) assert.ok(Number.isFinite(v));
});

test('visibleBox returns integral, inclusive, ordered bounds', () => {
  const vp = vpAt(10);
  const b = vp.visibleBox();
  for (const v of [b.x0, b.x1, b.y0, b.y1]) assert.ok(Number.isInteger(v));
  assert.ok(b.x0 < b.x1 && b.y0 < b.y1);
  assert.ok(b.x0 <= -40 && b.x1 >= 40, `x span too small: ${b.x0}..${b.x1}`);
  assert.ok(b.y0 <= -30 && b.y1 >= 30);
});
