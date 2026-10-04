import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, makeParams } from '../params.js';

test('defaults match §A.11 and are frozen', () => {
  assert.ok(Object.isFrozen(DEFAULTS));
  const p = makeParams();
  assert.equal(p.h, 2.0); assert.equal(p.ng, 2); assert.equal(p.dt, 1 / 60);
  assert.equal(p.uRebase, 1e-3); assert.equal(p.kappaMu, 0.8);
  assert.equal(p.vStick, 1e-3); assert.equal(p.tStick, 2);
  assert.equal(p.kappaHeal, 0.1); assert.equal(p.tHeal, 3600);
  assert.equal(p.Nbreak, 256); assert.equal(p.Kc, 8);
  assert.equal(p.e, 0.2); assert.equal(p.vBounce, 5e-3);
  assert.equal(p.beta, 0.2); assert.equal(p.slopFrac, 0.01); assert.equal(p.vPush, 5e-3);
  assert.equal(p.Ks, 40); assert.equal(p.Ku, 2);
  assert.equal(p.Ngrid, 2000); assert.equal(p.Smax, 4); assert.equal(p.epsM, 0.005);
  assert.equal(p.Nth, 4);
});

test('makeParams: overrides, Geff, no aliasing of DEFAULTS', () => {
  const p = makeParams({ Gmult: 100, h: 4 });
  assert.equal(p.h, 4);
  assert.equal(p.Geff, DEFAULTS.G * 100);
  assert.notEqual(p, DEFAULTS);
  assert.notEqual(p.sunDir, DEFAULTS.sunDir);
  p.sunDir[0] = 99;
  assert.equal(DEFAULTS.sunDir[0], 1);
  assert.equal(DEFAULTS.h, 2.0);
  assert.equal(makeParams({ sunDir: new Float64Array([0, 1, 0]) }).sunDir[1], 1);
});

test('makeParams: accepts valid options', () => {
  assert.doesNotThrow(() => makeParams({ gradientOrder: 4, greenFunction: 'integrated' }));
  assert.doesNotThrow(() => makeParams({ Omega: [0, 0, 1e-4] }));
  assert.doesNotThrow(() => makeParams({ Omega: new Float64Array([0, 0, 1e-4]) }));
  assert.doesNotThrow(() => makeParams({ vcap: 1 << 22 }));
});

test('makeParams: rejects invalid options', () => {
  for (const k of ['h', 'dt', 'vcap', 'fcap', 'Kc', 'Ks', 'Nth', 'stressEvery', 'gravityWorkQuantum']) {
    assert.throws(() => makeParams({ [k]: 0 }), new RegExp(`param ${k}`));
    assert.throws(() => makeParams({ [k]: -1 }), new RegExp(`param ${k}`));
    assert.throws(() => makeParams({ [k]: NaN }), new RegExp(`param ${k}`));
  }
  assert.throws(() => makeParams({ ng: 1.5 }), /ng/);
  assert.throws(() => makeParams({ ng: 0 }), /ng/);
  assert.throws(() => makeParams({ gradientOrder: 3 }), /gradientOrder/);
  assert.throws(() => makeParams({ greenFunction: 'spectral' }), /greenFunction/);
  assert.throws(() => makeParams({ Omega: 'fast' }), /Omega/);
  assert.throws(() => makeParams({ Omega: 1e-4 }), /Omega/);
  assert.throws(() => makeParams({ vcap: (1 << 22) + 1 }), /vcap too large/);
});