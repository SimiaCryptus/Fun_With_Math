import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWord, delta, inverse } from '../src/algebra/braid.js';
import { permOfWord, cycles } from '../src/algebra/perm.js';
import { normalForm, nfToWord } from '../src/algebra/garside.js';
import { analyze } from '../src/algebra/analyze.js';
import { cascade, parseCuts } from '../src/algebra/wreath.js';
import { braidToPD } from '../src/export/pd.js';

const A = (n, word, m = 0, cuts = '') => {
  const r = analyze({ n, word, m, cuts });
  if (r.error) throw new Error(r.error);
  return r;
};

test('parser', () => {
  assert.deepEqual(parseWord('(s1 s2^-1)^2', 3), [1, -2, 1, -2]);
  assert.deepEqual(parseWord('σ1 σ2⁻¹', 3), [1, -2]);
  assert.deepEqual(parseWord('D', 3), [1, 2, 1]);
  assert.deepEqual(parseWord('D^-1', 3), [-1, -2, -1]);
  assert.deepEqual(parseWord('1 -2', 3), [1, -2]);
  assert.throws(() => parseWord('s3', 3));
  assert.throws(() => parseWord('(s1', 3));
});

test('taxonomy table (theory.md §7)', () => {
  assert.equal(A(4, '').k, 4); // trivial cylinder
  const ot = A(3, '', 2); // orientable twist
  assert.equal(ot.k, 3); assert.ok(ot.pure);
  const mb = A(2, '', 3); // Möbius bisection → trefoil
  assert.equal(mb.k, 1); assert.equal(mb.tauStr, '(1 2)');
  assert.deepEqual(A(4, '', 1).cycleType, [2, 2]); // Möbius multi-cut
  assert.deepEqual(A(5, '', 1).cycleType, [2, 2, 1]);
  const tri = A(3, '', 3);
  assert.equal(tri.tauStr, '(1 3)(2)'); assert.equal(tri.k, 2);
  const bor = A(3, '(s1 s2^-1)^3'); // Borromean
  assert.ok(bor.pure); assert.equal(bor.k, 3);
  const f8 = A(3, '(s1 s2^-1)^2'); // figure-eight
  assert.equal(f8.k, 1); assert.deepEqual(f8.cycleType, [3]);
  const th = A(3, '(s1 s2^-1)^2', 1); // twisted hyperbolic
  assert.equal(th.k, 2); assert.deepEqual(th.cycleType, [2, 1]);
  assert.equal(A(2, '', 2).k, 2); // Hopf
});

test('switching law: one generator changes k by exactly ±1', () => {
  let seed = 12345;
  const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k; };
  for (let trial = 0; trial < 500; trial++) {
    const n = 2 + rnd(9);
    const L = rnd(20);
    const w = Array.from({ length: L }, () => (1 + rnd(n - 1)) * (rnd(2) ? 1 : -1));
    const k0 = cycles(permOfWord(w, n)).length;
    const pos = rnd(L + 1);
    const g = (1 + rnd(n - 1)) * (rnd(2) ? 1 : -1);
    const w2 = [...w.slice(0, pos), g, ...w.slice(pos)];
    assert.equal(Math.abs(cycles(permOfWord(w2, n)).length - k0), 1);
  }
});

test('Garside normal form', () => {
  const eq = (n, a, b) => assert.deepEqual(normalForm(a, n), normalForm(b, n));
  eq(3, [1, 2, 1], [2, 1, 2]);
  assert.deepEqual(normalForm(delta(3), 3), { p: 1, factors: [] });
  eq(4, [...delta(4), ...delta(4), 1], [1, ...delta(4), ...delta(4)]);
  assert.deepEqual(normalForm([-1], 2), { p: -1, factors: [] });
  let seed = 7;
  const rnd = (k) => { seed = (seed * 48271) % 2147483647; return seed % k; };
  for (let t = 0; t < 200; t++) {
    const n = 2 + rnd(6);
    const w = Array.from({ length: rnd(15) }, () => (1 + rnd(n - 1)) * (rnd(2) ? 1 : -1));
    const nf = normalForm(w, n);
    assert.deepEqual(permOfWord(nfToWord(nf, n), n), permOfWord(w, n));
    assert.deepEqual(normalForm([...w, ...inverse(w)], n), { p: 0, factors: [] });
    assert.deepEqual(normalForm(nfToWord(nf, n), n), nf);
  }
});

test('wreath cascade', () => {
  const a = A(2, '', 3);
  const lv = cascade(a.n, a.m, a.cycles, parseCuts('2:'));
  assert.equal(lv[0].blocks[0].framing, 8);
  assert.equal(lv[0].k, 2); // trefoil bisection → 2-component cable link
  const b = A(3, '(s1 s2^-1)^2');
  const lv2 = cascade(b.n, b.m, b.cycles, parseCuts('3: s1 s2'));
  assert.equal(lv2[0].k, 1); // 3-cycle engine stays a single component
  assert.throws(() => parseCuts('2:\n2:\n2:'));
});

test('PD export has one X per crossing', () => {
  const { pd } = braidToPD([1, -2, 1, -2], 3);
  assert.equal(pd.length, 4);
  const labels = pd.flat();
  for (const l of new Set(labels)) assert.equal(labels.filter((x) => x === l).length, 2);
});