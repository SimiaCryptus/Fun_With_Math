import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, advanceFrame, rebase, toInertial, inertialVelocity } from '../frame.js';
import { translateAt } from '../rigid.js';
import { makeParams } from '../params.js';
import { v3, m3, quat } from '../math.js';
import { step } from '../world.js';
import { spawnParticle } from '../particles.js';
import { MAT } from '../materials.js';
import { testWorld, box, setInertialVelocity } from './helpers/scenes.js';
import { close, relClose, closeVec } from './helpers/close.js';

test('advanceFrame: rate 2·atan(½|Ω|dt)/dt, sun = R_fᵀ ŝ_I, unit', () => {
  const p = makeParams({ Omega: [0.01, -0.02, 0.03], sunDir: [1, 2, 2] });
  const f = createFrame(p);
  const s0 = v3.copy(v3.create(), f.sun);
  const N = 2000;
  for (let i = 0; i < N; i++) advanceFrame(f);
  const W = v3.len(p.Omega);
  const ang = 2 * Math.atan2(Math.hypot(f.qf[1], f.qf[2], f.qf[3]), f.qf[0]);
  relClose(ang, N * 2 * Math.atan(0.5 * W * p.dt), 1e-10, 'angle');
  const ax = v3.normalize(v3.create(), [f.qf[1], f.qf[2], f.qf[3]]);
  closeVec(ax, v3.scale(v3.create(), p.Omega, 1 / W), 1e-12, 'axis');
  closeVec(toInertial(v3.create(), f, f.sun), s0, 1e-12, 'sun');
  close(v3.len(f.sun), 1, 1e-15);
});

test('free particle in 𝓕 maps to a straight line in 𝓘', () => {
  const p = makeParams({ Omega: [0.01, -0.02, 0.03] });
  const f = createFrame(p);
  const x = v3.create(10, -5, 3), u = v3.create(0.05, 0.02, -0.03);
  const x0 = v3.copy(v3.create(), x), vI = inertialVelocity(v3.create(), f, x, u);
  const N = 100000;
  for (let i = 0; i < N; i++) { advanceFrame(f); translateAt(x, 0, u, 0, 0, 0, 0, f.Om, f.b, p.dt); }
  const xI = toInertial(v3.create(), f, x);
  const ref = v3.addScaled(v3.create(), x0, vI, N * p.dt);
  const dist = v3.len(v3.sub(v3.create(), ref, x0));
  // roundoff of 1e5 rotations; spec target 1e-9 m at game Ω (here Ω is ~100× larger)
  closeVec(xI, ref, 1e-10 * dist + 1e-9);
  closeVec(toInertial(v3.create(), f, inertialVelocity(v3.create(), f, x, u)), vI, 1e-12, 'velocity');
});

test('Jacobi constant bounded in a static point-mass potential', () => {
  const dt = 5e-4, p = makeParams({ Omega: [0, 0, 0.3], dt });
  const f = createFrame(p);
  const GM = 1, x = v3.create(1, 0, 0), u = v3.create(0, 0.8, 0); // inertial speed 1.1
  const CJ = () => {
    const r = v3.len(x), oc = v3.cross(v3.create(), f.Om, x);
    return 0.5 * v3.dot(u, u) - GM / r - 0.5 * v3.dot(oc, oc);
  };
  const C0 = CJ();
  let worst = 0;
  for (let i = 0; i < 40000; i++) {
    const r = v3.len(x), s = -GM / (r * r * r);
    translateAt(x, 0, u, 0, s * x[0], s * x[1], s * x[2], f.Om, f.b, dt);
    worst = Math.max(worst, Math.abs(CJ() - C0));
  }
  assert.ok(worst / Math.abs(C0) < 2e-3, `C_J drift ${worst / Math.abs(C0)}`);
});

function rebaseScene() {
  const w = testWorld({ Omega: [0, 0, 1e-3] });
  const c = box(w, 4, 3, 2, MAT.SIL);
  v3.set(c.X, 30, -10, 5); v3.set(c.wb, 2e-3, -1e-3, 5e-3);
  setInertialVelocity(w, c, [0.01, 0.02, -0.005]);
  const px = [5, 6, 7], t = v3.cross(v3.create(), w.frame.Om, px);
  spawnParticle(w.particles, px, v3.sub(v3.create(), [0.03, 0, 0.01], t), 1, MAT.REG);
  return { w, c };
}

test('re-basing mid-run does not change 𝓘 trajectories', () => {
  const A = rebaseScene(), B = rebaseScene();
  for (let i = 0; i < 600; i++) {
    if (i === 300) rebase(A.w, [3e-4, -2e-4, 8e-4]);
    step(A.w); step(B.w);
  }
  assert.equal(A.w.frame.rebases, 1);
  const inert = (S) => ({
    X: toInertial(v3.create(), S.w.frame, S.c.X),
    W: toInertial(v3.create(), S.w.frame, inertialVelocity(v3.create(), S.w.frame, S.c.X, S.c.U)),
    q: quat.mul(quat.create(), S.w.frame.qf, S.c.q),
    px: toInertial(v3.create(), S.w.frame, S.w.particles.x.subarray(0, 3)),
  });
  const a = inert(A), b = inert(B);
  closeVec(a.X, b.X, 1e-9, 'X'); closeVec(a.W, b.W, 1e-12, 'W'); closeVec(a.px, b.px, 1e-9, 'particle');
  const sg = Math.sign(a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3]);
  closeVec(a.q, b.q.map((x) => sg * x), 1e-10, 'q');
});

test('auto re-base locks Ω to a principal spin, then stays put', () => {
  const w = testWorld(); // Omega: null → auto
  const c = box(w, 4, 3, 2, MAT.SIL);
  v3.set(c.wb, 0, 0, 1e-3);
  step(w);
  assert.equal(w.frame.rebases, 1);
  closeVec(w.frame.Om, [0, 0, 1e-3], 1e-18);
  for (let i = 0; i < 1000; i++) step(w);
  assert.equal(w.frame.rebases, 1);
});

test('tumbling primary: Ω = component of ω along L, rate-limited', () => {
  const w = testWorld();
  const c = box(w, 6, 3, 1, MAT.SIL);
  v3.set(c.wb, 1e-3, 1e-3, 1e-3);
  step(w);
  assert.equal(w.frame.rebases, 1);
  const Lb = m3.mulV(v3.create(), c.Ib, c.wb), L = quat.rotate(v3.create(), c.q, Lb);
  const Om = w.frame.Om;
  close(v3.len(v3.cross(v3.create(), Om, L)) / (v3.len(Om) * v3.len(L)), 0, 1e-6, 'Ω ∥ L');
  for (let i = 0; i < 600; i++) step(w);
  assert.equal(w.frame.rebases, 1, 'no re-base within t_rebase');
});