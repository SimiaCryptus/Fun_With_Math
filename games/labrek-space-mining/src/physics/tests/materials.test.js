import test from 'node:test';
import assert from 'node:assert/strict';
import { MAT, createMaterials, compatibility, pairProps } from '../materials.js';
import { relClose } from './helpers/close.js';

const ids = Object.values(MAT);

test('material table order matches MAT and overrides do not leak', () => {
  assert.ok(Object.isFrozen(MAT));
  const mats = createMaterials();
  assert.equal(mats.length, ids.length);
  for (const [name, id] of Object.entries(MAT)) assert.equal(mats[id].name, name);
  const o = createMaterials({ REG: { rho: 1 }, BOGUS: { rho: 2 } });
  assert.equal(o[MAT.REG].rho, 1);
  assert.equal(createMaterials()[MAT.REG].rho, 1500);
  for (const m of mats) for (const k of ['rho', 'ten', 'shear', 'mu', 'E', 'kth', 'cp']) assert.ok(m[k] > 0, `${m.name}.${k}`);
});

test('compatibility rules', () => {
  for (const a of ids) for (const b of ids) {
    assert.equal(compatibility(a, b), compatibility(b, a), `symmetric ${a},${b}`);
    const k = compatibility(a, b);
    assert.ok(k > 0 && k <= 1);
  }
  for (const a of ids) if (a !== MAT.ICE) assert.equal(compatibility(a, a), 1);
  assert.equal(compatibility(MAT.ICE, MAT.ICE), 0.5);
  assert.equal(compatibility(MAT.ICE, MAT.SIL), 0.5);
  assert.equal(compatibility(MAT.NFE, MAT.CMP), 1);
  assert.equal(compatibility(MAT.REG, MAT.SIL), 0.8);
});

test('pairProps: symmetric, harmonic/arithmetic means, compatibility scaling', () => {
  const mats = createMaterials();
  const ab = {}, ba = {};
  for (const a of ids) for (const b of ids) {
    pairProps(mats, a, b, ab); pairProps(mats, b, a, ba);
    assert.deepEqual(ab, ba, `symmetric ${a},${b}`);
    const A = mats[a], B = mats[b];
    assert.ok(ab.E >= Math.min(A.E, B.E) * (1 - 1e-15) && ab.E <= Math.max(A.E, B.E) * (1 + 1e-15));
    assert.ok(ab.E <= 2 * Math.min(A.E, B.E));
    relClose(ab.mus, 0.5 * (A.mu + B.mu), 1e-15);
  }
  pairProps(mats, MAT.SIL, MAT.SIL, ab);
  relClose(ab.coh, mats[MAT.SIL].shear, 1e-15);
  relClose(ab.ten, mats[MAT.SIL].ten, 1e-15);
  pairProps(mats, MAT.REG, MAT.SIL, ab);
  const h = (x, y) => (2 * x * y) / (x + y);
  relClose(ab.coh, h(525, 2e7) * 0.8, 1e-15);
  relClose(ab.ten, h(262, 1e7) * 0.8, 1e-15);
  // weak partner dominates: interface is never stronger than 2× the weaker side
  assert.ok(ab.coh < 2 * 525);
});

test('pairProps: zero strength gives zero (no division by zero)', () => {
  const mats = createMaterials({ REG: { ten: 0 } });
  const out = pairProps(mats, MAT.REG, MAT.SIL, {});
  assert.equal(out.ten, 0);
  assert.ok(Number.isFinite(out.coh));
});