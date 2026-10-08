import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/core/vec3.js';
import { makePortal } from '../src/core/portal.js';
import { createAnalyticModel, diskUnitPotential } from '../src/core/field/analytic.js';
import { solveDisks, solveReferencePairs } from '../src/core/field/reference.js';
import { samplePoints, relativeRmsError, distanceToDisk } from '../src/core/field/compare.js';
import { createRng } from '../src/core/rng.js';
import { FieldSystem } from '../src/core/field/fieldSystem.js';
import { bg, G, floorCeilingPair, floorCeilingPortals, TEST_COEF } from './fixtures.js';

test('closed-form disk potential agrees with the reference solver', () => {
  const portal = makePortal({ id: 1, center: [0, 0, 0], normal: [0, 1, 0], radius: 1 });
  const ref = solveDisks([{ portal, value: () => 1 }], { rings: 16, sectors: 24 });
  const pts = samplePoints(createRng(3), { x: 0, y: 0, z: 0 }, 3, 100, (p) => distanceToDisk(portal, p) > 0.1);
  let worst = 0;
  for (const p of pts) {
    const exact = diskUnitPotential(portal, p, 0);
    worst = Math.max(worst, Math.abs(ref.potential(p) - exact) / exact);
  }
  console.log(`worst rel potential error ${(worst * 100).toFixed(2)}%`);
  assert.ok(worst < 0.03);
});

test('floor–ceiling gap: |g_eff| < 0.05 g at the centre', () => {
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
  const rng = createRng(21);
  const pts = samplePoints(rng, { x: 0, y: 1, z: 0 }, 3, 60,
    (p) => distanceToDisk(a, p) > 0.1 && distanceToDisk(b, p) > 0.1);
  const h = 1e-3;
  const E = (x) => fs.field(x);
  for (const p of pts) {
    const d = (axis, sgn) => E({ x: p.x + (axis === 0 ? sgn * h : 0), y: p.y + (axis === 1 ? sgn * h : 0), z: p.z + (axis === 2 ? sgn * h : 0) });
    const J = [0, 1, 2].map((ax) => V.scale(V.sub(d(ax, 1), d(ax, -1)), 1 / (2 * h))); // J[ax] = ∂E/∂ax
    const curl = { x: J[1].z - J[2].y, y: J[2].x - J[0].z, z: J[0].y - J[1].x };
    const norm = Math.sqrt(J.reduce((s, v) => s + V.lengthSq(v), 0));
    assert.ok(V.length(curl) <= 1e-3 * norm + 1e-6, `curl ${V.length(curl)} vs |J| ${norm}`);
  }
});

test('physical analytic model vs reference: RMS error (gap design term off)', () => {
  const pair = floorCeilingPair(2, 1);
  const ref = solveReferencePairs([pair], bg, { rings: 16, sectors: 24 });
  const model = createAnalyticModel([pair], { terms: { gap: false }, coef: TEST_COEF });
  const pts = samplePoints(createRng(5), { x: 0, y: 1, z: 0 }, 3, 300,
    (p) => distanceToDisk(pair.a, p) > 0.15 && distanceToDisk(pair.b, p) > 0.15);
  const rms = relativeRmsError(model.field, ref.field, pts);
  console.log(`relative RMS (analytic vs reference): ${(rms * 100).toFixed(1)}% (plan target 10%)`);
  assert.ok(rms < 0.2, `rms ${rms}`);
});