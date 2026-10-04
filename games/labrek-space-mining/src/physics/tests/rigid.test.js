import test from 'node:test';
import assert from 'node:assert/strict';
import { v3, m3, quat } from '../math.js';
import { step } from '../world.js';
import { MAT } from '../materials.js';
import { inertialVelocity, toInertial } from '../frame.js';
import { measure } from '../ledger.js';
import { hashState } from '../hash.js';
import { testWorld, box, setInertialVelocity } from './helpers/scenes.js';
import { relClose, closeVec } from './helpers/close.js';

const rotKE = (c) => 0.5 * v3.dot(c.wb, m3.mulV(v3.create(), c.Ib, c.wb));
const absL = (c) => v3.len(m3.mulV(v3.create(), c.Ib, c.wb));

function ellipK(k2) {
  let a = 1, b = Math.sqrt(1 - k2);
  for (let i = 0; i < 40; i++) { const an = 0.5 * (a + b); b = Math.sqrt(a * b); a = an; }
  return Math.PI / (2 * a);
}

test('Ω = 0 and Ω ≠ 0 runs are the same inertial motion', () => {
  const make = (Omega) => {
    const w = testWorld({ Omega });
    const c = box(w, 4, 3, 2, MAT.SIL);
    v3.set(c.X, 20, 5, -3); v3.set(c.wb, 1e-3, 2e-3, -3e-3);
    setInertialVelocity(w, c, [0.01, -0.02, 0.005]);
    return { w, c };
  };
  const A = make([0, 0, 0]), B = make([3e-3, -1e-3, 2e-3]);
  for (let i = 0; i < 5000; i++) { step(A.w); step(B.w); }
  assert.deepEqual([...A.c.wb], [...B.c.wb], 'absolute body spin is frame-independent');
  closeVec(toInertial(v3.create(), B.w.frame, B.c.X), A.c.X, 1e-9, 'X');
  const WB = toInertial(v3.create(), B.w.frame, inertialVelocity(v3.create(), B.w.frame, B.c.X, B.c.U));
  closeVec(WB, A.c.U, 1e-12, 'W');
  const qI = quat.mul(quat.create(), B.w.frame.qf, B.c.q);
  const sg = Math.sign(qI[0] * A.c.q[0] + qI[1] * A.c.q[1] + qI[2] * A.c.q[2] + qI[3] * A.c.q[3]);
  closeVec(qI.map((x) => sg * x), A.c.q, 1e-10, 'q');
});

test('Dzhanibekov: intermediate-axis flip interval matches 2K(k)/λ (±5%)', () => {
  const w = testWorld({ Omega: [0, 0, 0] });
  const c = box(w, 6, 3, 1, MAT.NFE);
  const I1 = c.Ib[0], I2 = c.Ib[4], I3 = c.Ib[8];
  assert.ok(I1 < I2 && I2 < I3);
  v3.set(c.wb, 2e-3, 0.02, 6e-3);
  const [a, b, d] = c.wb;
  const E2 = I1 * a * a + I2 * b * b + I3 * d * d;           // 2E
  const L2 = I1 * I1 * a * a + I2 * I2 * b * b + I3 * I3 * d * d;
  let lam, k2;
  if (L2 > E2 * I2) {
    lam = Math.sqrt((I3 - I2) * (L2 - E2 * I1) / (I1 * I2 * I3));
    k2 = (I2 - I1) * (E2 * I3 - L2) / ((I3 - I2) * (L2 - E2 * I1));
  } else {
    lam = Math.sqrt((I2 - I1) * (E2 * I3 - L2) / (I1 * I2 * I3));
    k2 = (I3 - I2) * (L2 - E2 * I1) / ((I2 - I1) * (E2 * I3 - L2));
  }
  const half = 2 * ellipK(k2) / lam;
  const dt = w.params.dt, crossings = [];
  let prev = c.wb[1];
  for (let i = 0; i < 150000 && crossings.length < 2; i++) {
    step(w);
    const cur = c.wb[1];
    if (prev * cur < 0) crossings.push(i * dt + dt * prev / (prev - cur));
    prev = cur;
  }
  assert.equal(crossings.length, 2, 'expected two flips');
  relClose(crossings[1] - crossings[0], half, 0.05, 'flip interval');
});

test('torque-free tumble: |L| conserved, rotational KE never grows', () => {
  const w = testWorld({ Omega: [0, 0, 0] });
  const c = box(w, 6, 3, 1, MAT.NFE);
  v3.set(c.wb, 3e-4, 5e-4, 2e-4);
  const L0 = absL(c), K0 = rotKE(c);
  for (let i = 0; i < 10000; i++) step(w);
  relClose(absL(c), L0, 1e-6, '|L|');
  assert.ok(rotKE(c) <= K0 * (1 + 1e-12), 'KE non-increasing');
  relClose(rotKE(c), K0, 1e-6, 'KE drift');
});

test('constant gravity-like torque: precession rate κ/(I₃ω_s) (±2%)', () => {
  const w = testWorld({ Omega: [0, 0, 0] });
  const c = box(w, 3, 3, 1, MAT.SIL);
  const th = 0.5, ws = 0.5, Wp = 0.005, I3 = c.Ib[8], kappa = Wp * I3 * ws;
  c.q.set([Math.cos(th / 2), Math.sin(th / 2), 0, 0]);
  v3.set(c.wb, 0, 0, ws);
  const ez = v3.create(0, 0, 1), ax = v3.create(), Lb = v3.create(), L = v3.create();
  const azimuth = () => { m3.mulV(Lb, c.Ib, c.wb); quat.rotate(L, c.q, Lb); return Math.atan2(L[1], L[0]); };
  let phi = azimuth(), total = 0;
  const N = 12000;
  for (let i = 0; i < N; i++) {
    quat.rotate(ax, c.q, ez);
    v3.cross(c.T, ez, ax); v3.scale(c.T, c.T, kappa);
    step(w);
    const p = azimuth();
    let d = p - phi; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
    total += d; phi = p;
  }
  relClose(total / (N * w.params.dt), kappa / (I3 * ws), 0.02, 'precession rate');
});

test('ledger: P and L constant in 𝓘 for a free body in a rotating frame', () => {
  const w = testWorld({ Omega: [0, 0, 2e-3] });
  const c = box(w, 4, 3, 2, MAT.SIL);
  v3.set(c.X, 20, 0, 0); v3.set(c.wb, 1e-3, -2e-3, 3e-3);
  setInertialVelocity(w, c, [0, 0.02, 0.003]);
  const m0 = measure(w), P0 = v3.copy(v3.create(), m0.PI), L0 = v3.copy(v3.create(), m0.LI), K0 = m0.K;
  for (let i = 0; i < 6000; i++) step(w);
  const m1 = measure(w);
  closeVec(m1.PI, P0, 1e-12 * v3.len(P0), 'P');
  closeVec(m1.LI, L0, 1e-6 * v3.len(L0), 'L');
  relClose(m1.K, K0, 1e-6, 'K');
});

test('determinism: identical runs give identical hashState', () => {
  const run = () => {
    const w = testWorld(); // auto re-basing on
    const c = box(w, 4, 3, 2, MAT.SIL);
    v3.set(c.wb, 1e-3, 2e-3, 5e-4); v3.set(c.U, 1e-3, 0, 0);
    for (let i = 0; i < 2000; i++) step(w);
    return hashState(w);
  };
  assert.equal(run(), run());
});