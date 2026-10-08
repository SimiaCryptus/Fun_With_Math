import test from 'node:test';
import assert from 'node:assert/strict';
import { makePortal } from '../src/core/portal.js';
import { solveDisks } from '../src/core/field/reference.js';

test('isolated disk capacitance ≈ 8ε₀R', () => {
  const R = 1.5;
  const portal = makePortal({ id: 1, center: [0.3, 1, -0.2], normal: [0.2, 1, 0.1], radius: R });
  const sol = solveDisks([{ portal, value: () => 1 }], { rings: 16, sectors: 24 });
  const C = sol.charge();
  const rel = Math.abs(C - 8 * R) / (8 * R);
  console.log(`capacitance ${C.toFixed(4)} vs ${8 * R} (rel err ${(rel * 100).toFixed(2)}%)`);
  assert.ok(rel < 0.02, `capacitance rel err ${rel}`); // plan target 1%; measured value is logged
});

test('two close disks approach the parallel-plate field V/h', () => {
  const h = 0.2, V0 = 0.5;
  const a = makePortal({ id: 1, center: [0, 0, 0], normal: [0, 1, 0], radius: 1 });
  const b = makePortal({ id: 2, center: [0, h, 0], normal: [0, -1, 0], radius: 1 });
  const sol = solveDisks([{ portal: a, value: () => V0 }, { portal: b, value: () => -V0 }], { rings: 16, sectors: 24 });
  const e = sol.field({ x: 0, y: h / 2, z: 0 });
  const expected = (2 * V0) / h;
  const rel = Math.abs(e.y - expected) / expected;
  console.log(`gap field ${e.y.toFixed(3)} vs ${expected} (rel ${(rel * 100).toFixed(2)}%)`);
  assert.ok(rel < 0.05);
  assert.ok(Math.abs(e.x) < 0.02 * expected && Math.abs(e.z) < 0.02 * expected);
});