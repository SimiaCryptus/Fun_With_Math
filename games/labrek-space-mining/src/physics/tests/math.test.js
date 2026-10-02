import test from 'node:test';
import assert from 'node:assert/strict';
import {
  v3, m3, quat, cayleySolve, cayleyRotate, clampDisk2, sqrtSafe, hypot3, clamp, nextPow2,
} from '../src/sim/math.js';
import { createRng } from '../src/sim/rng.js';
import { close, relClose, closeVec } from './helpers/close.js';

const rng = createRng('math-test');
const rv = (s = 1) => v3.create(rng.range(-s, s), rng.range(-s, s), rng.range(-s, s));
const rq = () => quat.normalize(quat.create(), [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
const rm = () => {
  const m = new Float64Array(9);
  for (let i = 0; i < 9; i++) m[i] = rng.range(-1, 1);
  m[0] += 3; m[4] += 3; m[8] += 3; // keep well-conditioned
  return m;
};
const rsym = () => {
  const s = new Float64Array(9);
  s[0] = rng.range(-1, 1); s[4] = rng.range(-1, 1); s[8] = rng.range(-1, 1);
  s[1] = s[3] = rng.range(-1, 1); s[2] = s[6] = rng.range(-1, 1); s[5] = s[7] = rng.range(-1, 1);
  return s;
};
const I3 = m3.identity(m3.create());

test('scalar helpers', () => {
  assert.equal(sqrtSafe(-1), 0);
  assert.equal(sqrtSafe(0), 0);
  assert.equal(sqrtSafe(4), 2);
  assert.equal(hypot3(2, 3, 6), 7);
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(2, 0, 1), 1);
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.deepEqual([1, 2, 3, 5, 64, 65].map(nextPow2), [1, 2, 4, 8, 64, 128]);
});

test('v3 basics', () => {
  const a = v3.create(1, 2, 3), b = v3.create(-4, 5, 0.5);
  assert.deepEqual([...v3.add(v3.create(), a, b)], [-3, 7, 3.5]);
  assert.deepEqual([...v3.sub(v3.create(), a, b)], [5, -3, 2.5]);
  assert.deepEqual([...v3.addScaled(v3.create(), a, b, 2)], [-7, 12, 4]);
  assert.equal(v3.dot(a, b), -4 + 10 + 1.5);
  assert.deepEqual([...v3.normalize(v3.create(), v3.create())], [0, 0, 0]);
  close(v3.len(v3.normalize(v3.create(), b)), 1, 1e-15);
  for (let k = 0; k < 100; k++) {
    const x = rv(), y = rv();
    const c = v3.cross(v3.create(), x, y), d = v3.cross(v3.create(), y, x);
    closeVec(c, v3.scale(v3.create(), d, -1), 0, 'anticommute');
    close(v3.dot(c, x), 0, 1e-15, 'orthogonal');
    // aliasing: o === a
    const xa = v3.copy(v3.create(), x);
    v3.cross(xa, xa, y);
    closeVec(xa, c, 0, 'alias');
  }
});

test('m3: mul, transpose, mulTV, skew', () => {
  for (let k = 0; k < 50; k++) {
    const A = rm(), B = rm(), v = rv();
    closeVec(m3.mul(m3.create(), A, I3), A, 0, 'A·I');
    closeVec(m3.transpose(m3.create(), m3.transpose(m3.create(), A)), A, 0, 'Aᵀᵀ');
    const At = m3.transpose(m3.create(), A);
    closeVec(m3.mulTV(v3.create(), A, v), m3.mulV(v3.create(), At, v), 1e-15, 'mulTV');
    // (AB)v = A(Bv)
    const ABv = m3.mulV(v3.create(), m3.mul(m3.create(), A, B), v);
    const A_Bv = m3.mulV(v3.create(), A, m3.mulV(v3.create(), B, v));
    closeVec(ABv, A_Bv, 1e-13, 'assoc');
    // aliasing o === a
    const Aa = m3.copy(m3.create(), A);
    m3.mul(Aa, Aa, B);
    closeVec(Aa, m3.mul(m3.create(), A, B), 0, 'alias');
    // transpose in place
    const T = m3.copy(m3.create(), A);
    closeVec(m3.transpose(T, T), At, 0, 'transpose in place');
    // skew(a) v = a × v
    const a = rv();
    closeVec(m3.mulV(v3.create(), m3.skew(m3.create(), a), v), v3.cross(v3.create(), a, v), 1e-15, 'skew');
  }
});

test('m3.invert / solve', () => {
  for (let k = 0; k < 50; k++) {
    const A = rm(), Ai = m3.create();
    assert.equal(m3.invert(Ai, A), true);
    closeVec(m3.mul(m3.create(), A, Ai), I3, 1e-13, 'A·A⁻¹');
    closeVec(m3.mul(m3.create(), Ai, A), I3, 1e-13, 'A⁻¹·A');
    const b = rv(), x = m3.solve(v3.create(), A, b);
    closeVec(m3.mulV(v3.create(), A, x), b, 1e-13, 'solve');
  }
  const sing = new Float64Array([1, 2, 3, 2, 4, 6, 1, 1, 1]);
  const o = new Float64Array(9).fill(7);
  assert.equal(m3.invert(o, sing), false);
  assert.deepEqual([...o], [...I3]);
  const nan = new Float64Array(9).fill(NaN);
  assert.equal(m3.invert(o, nan), false);
});

test('m3.rotSym = R S Rᵀ and stays symmetric', () => {
  for (let k = 0; k < 50; k++) {
    const R = m3.fromQuat(m3.create(), rq()), S = rsym();
    const out = m3.rotSym(m3.create(), R, S);
    const ref = m3.mul(m3.create(), m3.mul(m3.create(), R, S), m3.transpose(m3.create(), R));
    closeVec(out, ref, 1e-14);
    close(out[1], out[3], 1e-14); close(out[2], out[6], 1e-14); close(out[5], out[7], 1e-14);
    // trace invariant
    close(out[0] + out[4] + out[8], S[0] + S[4] + S[8], 1e-14, 'trace');
  }
});

test('quat: direction convention, rotate/rotateInv, fromQuat, composition', () => {
  const s = Math.sqrt(0.5);
  const qz = new Float64Array([s, 0, 0, s]); // +90° about z
  closeVec(quat.rotate(v3.create(), qz, [1, 0, 0]), [0, 1, 0], 1e-15, 'z90');
  assert.deepEqual([...quat.normalize(quat.create(), [0, 0, 0, 0])], [1, 0, 0, 0]);

  for (let k = 0; k < 100; k++) {
    const q1 = rq(), q2 = rq(), v = rv();
    const w = quat.rotate(v3.create(), q1, v);
    relClose(v3.len(w), v3.len(v), 1e-15, 'rotate preserves length');
    closeVec(quat.rotateInv(v3.create(), q1, w), v, 1e-15, 'rotateInv');
    const qc = quat.conj(quat.create(), q1);
    closeVec(quat.rotate(v3.create(), qc, v), quat.rotateInv(v3.create(), q1, v), 1e-15, 'conj');
    const R = m3.fromQuat(m3.create(), q1);
    closeVec(m3.mulV(v3.create(), R, v), w, 1e-15, 'fromQuat');
    closeVec(m3.mul(m3.create(), R, m3.transpose(m3.create(), R)), I3, 1e-15, 'orthonormal');
    const neg = new Float64Array([-q1[0], -q1[1], -q1[2], -q1[3]]);
    closeVec(quat.rotate(v3.create(), neg, v), w, 1e-15, 'q ~ -q');
    // q1 ⊗ q2 applies q2 first
    const q12 = quat.mul(quat.create(), q1, q2);
    close(Math.hypot(...q12), 1, 1e-15, 'unit product');
    closeVec(quat.rotate(v3.create(), q12, v), quat.rotate(v3.create(), q1, quat.rotate(v3.create(), q2, v)), 1e-14, 'compose');
    closeVec(m3.fromQuat(m3.create(), q12),
      m3.mul(m3.create(), m3.fromQuat(m3.create(), q1), m3.fromQuat(m3.create(), q2)), 1e-14, 'fromQuat hom');
  }
});

test('cayleySolve solves (𝟙 + [b]×) w = v, aliasing safe', () => {
  for (let k = 0; k < 100; k++) {
    const b = rv(2), v = rv();
    const w = new Float64Array(5);
    cayleySolve(w, 1, b, v);
    const ww = w.subarray(1, 4);
    const lhs = v3.add(v3.create(), ww, v3.cross(v3.create(), b, ww));
    closeVec(lhs, v, 1e-14, 'identity');
    assert.equal(w[0], 0); assert.equal(w[4], 0);
    const va = v3.copy(v3.create(), v);
    cayleySolve(va, 0, b, va);
    closeVec(va, ww, 0, 'alias');
  }
});

test('cayleyRotate: norm-preserving implicit midpoint, exact inverse, angle 2·atan|b|', () => {
  for (let k = 0; k < 100; k++) {
    const b = rv(0.5), v = rv();
    const w = cayleyRotate(v3.create(), b, v);
    relClose(v3.len(w), v3.len(v), 2e-15, 'norm');
    // implicit midpoint of v̇ = −2b/dt × v:  w − v = −b × (w + v)
    const lhs = v3.sub(v3.create(), w, v);
    const rhs = v3.scale(v3.create(), v3.cross(v3.create(), b, v3.add(v3.create(), w, v)), -1);
    closeVec(lhs, rhs, 1e-15, 'midpoint');
    const nb = v3.scale(v3.create(), b, -1);
    closeVec(cayleyRotate(v3.create(), nb, w), v, 1e-15, 'inverse');
  }
  // angle for v ⟂ b: cosθ = (1 − |b|²)/(1 + |b|²)
  for (const bz of [1e-6, 1e-3, 0.1, 0.7, 3]) {
    const w = cayleyRotate(v3.create(), [0, 0, bz], [1, 0, 0]);
    close(w[0], (1 - bz * bz) / (1 + bz * bz), 1e-15, `cos bz=${bz}`);
    assert.ok(w[1] < 0, 'rotates by −angle about b');
  }
});

test('frame self-consistency: quat step (§A.2.4) and Cayley(−Ω dt) are exact inverses', () => {
  const dt = 1 / 60;
  for (const Om of [[1e-4, -2e-5, 7e-5], [0.3, 0.8, -0.5], [0, 0, 2.5]]) {
    const b = v3.scale(v3.create(), Om, 0.5 * dt);
    const qs = quat.normalize(quat.create(), [1, b[0], b[1], b[2]]);
    for (let k = 0; k < 20; k++) {
      const v = rv();
      const w = quat.rotate(v3.create(), qs, v);
      closeVec(cayleyRotate(v3.create(), b, w), v, 1e-15, `Om=${Om}`);
    }
  }
});

test('Coriolis Cayley step is energy-neutral over 1e5 steps', () => {
  const dt = 1 / 60, Om = [2e-4, -1e-4, 3e-4];
  const b = v3.scale(v3.create(), Om, dt);
  const u = v3.create(0.3, -1.2, 0.05), L0 = v3.len(u);
  for (let i = 0; i < 100000; i++) cayleyRotate(u, b, u);
  relClose(v3.len(u), L0, 1e-10);
});

test('clampDisk2', () => {
  const a = [3, 4];
  close(clampDisk2(a, 2.5), 0.5, 1e-15);
  closeVec(a, [1.5, 2], 1e-15);
  const b = [0.1, 0.2];
  assert.equal(clampDisk2(b, 1), 1);
  assert.deepEqual(b, [0.1, 0.2]);
  const z = [0, 0];
  assert.equal(clampDisk2(z, 0), 1);
  assert.deepEqual(z, [0, 0]);
});