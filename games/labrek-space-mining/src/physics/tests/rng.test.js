import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, fnv1a, mulberry32, sfc32 } from '../src/sim/rng.js';

test('fnv1a reference values', () => {
  assert.equal(fnv1a(''), 0x811c9dc5);
  assert.equal(fnv1a('a'), 0xe40c292c);
  assert.equal(fnv1a('labrek-001'), fnv1a('labrek-001'));
  assert.notEqual(fnv1a('labrek-001'), fnv1a('labrek-002'));
});

test('createRng: same seed → same sequence; different seeds diverge', () => {
  const a = createRng('labrek-001'), b = createRng('labrek-001'), c = createRng('labrek-002');
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 1000; i++) { sa.push(a()); sb.push(b()); sc.push(c()); }
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  const n1 = createRng(42), n2 = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(n1(), n2());
});

test('createRng: range [0,1), roughly uniform', () => {
  const r = createRng('uniform');
  const N = 100000, buckets = new Array(10).fill(0);
  let sum = 0, min = 1, max = 0;
  for (let i = 0; i < N; i++) {
    const x = r();
    sum += x; if (x < min) min = x; if (x > max) max = x;
    buckets[Math.floor(x * 10)]++;
  }
  assert.ok(min >= 0 && max < 1);
  assert.ok(Math.abs(sum / N - 0.5) < 0.005, `mean ${sum / N}`);
  for (const k of buckets) assert.ok(Math.abs(k - N / 10) < 600, `bucket ${k}`);
});

test('createRng: int and range helpers', () => {
  const r = createRng('helpers');
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const k = r.int(7);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 7);
    seen.add(k);
    const x = r.range(-3, 5);
    assert.ok(x >= -3 && x < 5);
  }
  assert.equal(seen.size, 7);
});

test('raw generators are deterministic and in [0,1)', () => {
  const m1 = mulberry32(123), m2 = mulberry32(123);
  const s1 = sfc32(1, 2, 3, 4), s2 = sfc32(1, 2, 3, 4);
  for (let i = 0; i < 1000; i++) {
    const a = m1(), b = s1();
    assert.equal(a, m2()); assert.equal(b, s2());
    assert.ok(a >= 0 && a < 1 && b >= 0 && b < 1);
  }
});