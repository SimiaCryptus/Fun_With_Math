import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/core/vec3.js';
import { createTabulatedModel } from '../src/core/field/tabulated.js';
import { makeMeta, buildTable, encodeTable, decodeTable, tabulateRange } from '../src/core/field/table.js';
import { solveReferencePairs } from '../src/core/field/reference.js';
import { samplePoints, relativeRmsError, distanceToDisk } from '../src/core/field/compare.js';
import { createRng } from '../src/core/rng.js';
import { FieldSystem } from '../src/core/field/fieldSystem.js';
import { bg, G, floorCeilingPair, floorCeilingPortals, tiltedPortals, TEST_COEF } from './fixtures.js';

const awayFrom = (pair, s) => (p) => distanceToDisk(pair.a, p) > s && distanceToDisk(pair.b, p) > s;

test('boundary condition exact at disk centres (collocation), coaxial and tilted', () => {
  for (const portals of [floorCeilingPortals(2, 1), tiltedPortals()]) {
    const fs = new FieldSystem(bg, portals, { coef: TEST_COEF, terms: { gap: false } });
    const [a, b] = fs.portals;
    const dPhi = Math.abs(fs.pairs[0].dPhi);
    const mismatch = fs.totalPotential(a.center) - fs.totalPotential(b.center);
    assert.ok(Math.abs(mismatch) < 1e-6 * dPhi, `mismatch ${mismatch}`);
  }
});

test('floor–ceiling gap: |g_eff| < 0.05 g at the centre (design term)', () => {
  const fs = new FieldSystem(bg, floorCeilingPortals(2, 1), { coef: TEST_COEF });
  const g = V.length(fs.geff({ x: 0, y: 1, z: 0 }));
  assert.ok(g < 0.05 * G, `|g_eff| = ${g}`);
});

test('reference shows only partial gap cancellation at h = 2R (plan R8, informational)', () => {
  const pair = floorCeilingPair(2, 1);
  const ref = solveReferencePairs([pair], bg, { rings: 14, sectors: 24 });
  const ratio = ref.field({ x: 0, y: 1, z: 0 }).y / G;
  console.log(`reference cancellation at gap centre: ${(ratio * 100).toFixed(1)}% of g`);
  assert.ok(ratio > 0 && ratio < 1.05);
});

test('E_CF is curl-free (numerically)', () => {
  const fs = new FieldSystem(bg, floorCeilingPortals(2, 1), { coef: TEST_COEF });
  const [a, b] = fs.portals;
  const pts = samplePoints(createRng(21), { x: 0, y: 1, z: 0 }, 3, 60,
    (p) => distanceToDisk(a, p) > 0.1 && distanceToDisk(b, p) > 0.1);
  const h = 1e-3;
  for (const p of pts) {
    const d = (axis, sgn) => fs.field({ x: p.x + (axis === 0 ? sgn * h : 0), y: p.y + (axis === 1 ? sgn * h : 0), z: p.z + (axis === 2 ? sgn * h : 0) });
    const J = [0, 1, 2].map((ax) => V.scale(V.sub(d(ax, 1), d(ax, -1)), 1 / (2 * h)));
    const curl = { x: J[1].z - J[2].y, y: J[2].x - J[0].z, z: J[0].y - J[1].x };
    const norm = Math.sqrt(J.reduce((s, v) => s + V.lengthSq(v), 0));
    assert.ok(V.length(curl) <= 1e-3 * norm + 1e-6, `curl ${V.length(curl)} vs |J| ${norm}`);
  }
});

test('physical field vs high-resolution reference (coaxial and tilted)', () => {
  for (const [name, pair] of [['coaxial', floorCeilingPair(2, 1)], ['tilted', (() => {
    const [a, b] = tiltedPortals();
    return createTabulatedPairFrom(a, b);
  })()]]) {
    const ref = solveReferencePairs([pair], bg, { rings: 16, sectors: 24 });
    const model = createTabulatedModel([pair], bg, { terms: { gap: false } });
    const mid = V.lerp(pair.a.center, pair.b.center, 0.5);
    const pts = samplePoints(createRng(5), mid, 3, 300, awayFrom(pair, 0.15));
    const rms = relativeRmsError(model.field, ref.field, pts);
    console.log(`${name}: relative RMS vs reference ${(rms * 100).toFixed(1)}%`);
    assert.ok(rms < 0.15, `${name} rms ${rms}`);
  }
});

import { createPair } from '../src/core/portalMap.js';
function createTabulatedPairFrom(a, b) { return createPair(a, b, bg); }

test('table: node ≈ direct solve, between nodes close, out of range falls back', () => {
  const meta = makeMeta({ axes: { d: [1.5, 2, 2.5], psi: [0], theta: [Math.PI / 2], phiN: 4, lambda: [1] } });
  const table = buildTable(meta);
  for (const [h, tol] of [[2, 2e-3], [2.25, 0.05]]) {
    const pair = floorCeilingPair(h, 1);
    const direct = createTabulatedModel([pair], bg, { terms: { gap: false } });
    const tab = createTabulatedModel([pair], bg, { table, terms: { gap: false } });
    assert.equal(tab.info[0].source, 'table');
    const pts = samplePoints(createRng(9), { x: 0, y: h / 2, z: 0 }, 2.5, 200, awayFrom(pair, 0.1));
    const rms = relativeRmsError(tab.field, direct.field, pts);
    console.log(`table vs direct at h=${h}: ${(rms * 100).toFixed(2)}%`);
    assert.ok(rms < tol, `h=${h} rms ${rms}`);
  }
  const far = createTabulatedModel([floorCeilingPair(4, 1)], bg, { table, terms: { gap: false } });
  assert.equal(far.info[0].source, 'solve');
});

test('table binary round-trip', () => {
  const meta = makeMeta({ axes: { d: [2], psi: [0], theta: [Math.PI / 2], phiN: 2, lambda: [1] } });
  const r = tabulateRange(meta, 0, meta.configs);
  const t = decodeTable(encodeTable(meta, r.scales, r.data));
  assert.deepEqual(t.meta, meta);
  const coef = Float64Array.of(1, 0, 0, -1, 0, 0, 0);
  const p = { d: 2, psi: 0, theta: Math.PI / 2, phi: -Math.PI, lambda: 1 };
  assert.deepEqual(Array.from(t.interpolate(p, coef)), Array.from(buildTable(meta).interpolate(p, coef)));
});