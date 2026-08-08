import test from 'node:test';
import assert from 'node:assert/strict';
import { ringOrder } from '../js/order.js';
import { ringLength, perimeterToCell } from '../js/lattice.js';

test('clockwise order is the identity permutation of perimeter indices', () => {
  for (const R of [0, 1, 5, 17]) {
    const o = ringOrder(R, 'clockwise');
    assert.equal(o.length, ringLength(R));
    for (let i = 0; i < o.length; i++) assert.equal(o[i], i);
  }
});

test('nearest_first is a permutation, ordered by |p|^2 then lexicographically', () => {
  for (const R of [1, 4, 9]) {
    const o = ringOrder(R, 'nearest_first');
    const n = ringLength(R);
    assert.equal(o.length, n);
    assert.equal(new Set(Array.from(o)).size, n, 'not a permutation');
    let prev = null;
    for (let i = 0; i < n; i++) {
      const c = perimeterToCell(R, o[i], [0, 0]);
      const r2 = c[0] * c[0] + c[1] * c[1];
      if (prev) {
        assert.ok(r2 >= prev.r2, `radius decreased at ${i} on ring ${R}`);
        if (r2 === prev.r2) {
          const lex = c[0] !== prev.c[0] ? c[0] - prev.c[0] : c[1] - prev.c[1];
          assert.ok(lex >= 0, `lex tie-break violated at ${i} on ring ${R}`);
        }
      }
      prev = { r2, c: c.slice() };
    }
  }
});

test('orders are memoised (identical object) and per-mode', () => {
  const a = ringOrder(6, 'clockwise');
  assert.equal(ringOrder(6, 'clockwise'), a);
  assert.notEqual(ringOrder(6, 'nearest_first'), a);
});
