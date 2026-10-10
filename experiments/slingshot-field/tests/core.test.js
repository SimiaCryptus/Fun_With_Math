import test from 'node:test';
import assert from 'node:assert/strict';
import { jacobi, inertialEnergy, angMom } from '../src/core/cr3bp.js';
import { lagrangePoints } from '../src/core/lagrange.js';
import { Dopri5, integrateTo } from '../src/core/dopri5.js';
import { makeAugRhs } from '../src/core/variational.js';
import { seed, seedJacobian, propagate } from '../src/core/encounter.js';
import { computeFields, mapJacobian } from '../src/core/fields.js';
import { NF, F } from '../src/core/grid.js';
import { hillRadius } from '../src/core/conventions.js';
import { polar2 } from '../src/core/linalg.js';

const MU = 1.215058e-2;

test('C = −2(E − h) on random states', () => {
  for (let n = 0; n < 200; n++) {
    const s = [Math.random() * 2 - 0.8, Math.random() * 2 - 1, Math.random() - 0.5, Math.random() - 0.5];
    const C = jacobi(s, MU), E = inertialEnergy(s, MU), h = angMom(s);
    assert.ok(Math.abs(C + 2 * (E - h)) < 1e-11 * (1 + Math.abs(C)));
  }
});

test('Earth–Moon Lagrange Jacobi values', () => {
  const L = lagrangePoints(MU);
  assert.ok(Math.abs(L[0].C - 3.1883) < 1e-3, `C_L1=${L[0].C}`);
  assert.ok(Math.abs(L[1].C - 3.1722) < 1e-3, `C_L2=${L[1].C}`);
});

test('STM matches finite differences of the flow', () => {
  const s0 = [0.8, 0.1, 0.05, 0.3], t1 = 1;
  const rhsA = makeAugRhs(MU, { withSTM: true });
  const y = new Float64Array(21); y.set(s0); y[4] = y[9] = y[14] = y[19] = 1;
  integrateTo(new Dopri5(21, rhsA, { rtol: 1e-13, atol: 1e-13, nerr: 4 }), y, t1);
  const h = 1e-6;
  for (let j = 0; j < 4; j++) {
    const run = (d) => {
      const z = new Float64Array(21); z.set(s0); z[j] += d;
      return integrateTo(new Dopri5(21, makeAugRhs(MU, { withSTM: false }), { rtol: 1e-13, atol: 1e-13, nerr: 4 }), z, t1);
    };
    const zp = run(h), zm = run(-h);
    for (let i = 0; i < 4; i++) {
      const fd = (zp[i] - zm[i]) / (2 * h), st = y[4 + i * 4 + j];
      assert.ok(Math.abs(fd - st) < 1e-6 * (1 + Math.abs(st)), `Φ[${i}][${j}] ${st} vs ${fd}`);
    }
  }
  const P = (i, j) => y[4 + i * 4 + j];
  // det Φ = 1 (cheap check via the symplectic form ΦᵀJΦ = J is omitted here)
  const m = [[P(0, 0), P(0, 1), P(0, 2), P(0, 3)], [P(1, 0), P(1, 1), P(1, 2), P(1, 3)], [P(2, 0), P(2, 1), P(2, 2), P(2, 3)], [P(3, 0), P(3, 1), P(3, 2), P(3, 3)]];
  const det = (a) => a.length === 1 ? a[0][0] : a[0].reduce((s, v, c) => s + (c % 2 ? -1 : 1) * v * det(a.slice(1).map((r) => r.filter((_, k) => k !== c))), 0);
  assert.ok(Math.abs(det(m) - 1) < 1e-8);
});

test('seed Jacobian vs finite differences, and C1 sign convention', () => {
  const rho = hillRadius(MU), C = 3.18, a = 1.3, b = 0.4, h = 1e-7;
  const J = seedJacobian(a, b, C, MU, rho);
  for (let k = 0; k < 2; k++) {
    const sp = k ? seed(a, b + h, C, MU, rho) : seed(a + h, b, C, MU, rho);
    const sm = k ? seed(a, b - h, C, MU, rho) : seed(a - h, b, C, MU, rho);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs((sp[i] - sm[i]) / (2 * h) - J[i * 2 + k]) < 1e-6);
  }
  const s = seed(a, 0.5, C, MU, rho), rx = s[0] - (1 - MU), ry = s[1];
  assert.ok(rx * s[3] - ry * s[2] > 0, 'β>0 must be prograde about P2');
});

test('polar decomposition round trip', () => {
  const A = [1.2, -0.7, 0.4, 0.9], pol = polar2(A), c = Math.cos(pol.theta), s = Math.sin(pol.theta), S = pol.S;
  const QS = [c * S[0] - s * S[2], c * S[1] - s * S[3], s * S[0] + c * S[2], s * S[1] + c * S[3]];
  QS.forEach((v, i) => assert.ok(Math.abs(v - A[i]) < 1e-12));
  assert.ok(Math.abs(S[1] - S[2]) < 1e-12);
});

test('encounters: Jacobi drift, ΔE = Δh, DΦ vs FD', () => {
  const L = lagrangePoints(MU), rho = hillRadius(MU);
  const p = { mu: MU, C: (L[0].C + L[1].C) / 2, rho, rhoFar: 2 * rho, Rbody: 0.0045, T: 20, rtol: 1e-12, atol: 1e-12 };
  let tested = 0;
  for (const b of [-0.6, -0.2, 0.2, 0.6]) for (const a of [0.5, 2.0, 3.5, 5.0]) {
    const r = propagate(a, b, p);
    if (!r.exitY) continue;
    const out = new Float64Array(NF); computeFields(r, p, out, 0);
    assert.ok(out[F.jacobiDrift] < 1e-9, `drift ${out[F.jacobiDrift]}`);
    assert.ok(out[F.errEH] < 1e-9, `|ΔE-Δh| ${out[F.errEH]}`);
    if (tested++ === 0) {
      const { DP } = mapJacobian(r, MU), h = 1e-7;
      const rp = propagate(a + h, b, p), rm = propagate(a - h, b, p);
      if (rp.exitY && rm.exitY && rp.nPasses === r.nPasses && rm.nPasses === r.nPasses) {
        let nrm = 0, err = 0;
        for (let i = 0; i < 4; i++) {
          const fd = (rp.exitY[i] - rm.exitY[i]) / (2 * h);
          nrm += DP[i * 2] ** 2; err += (fd - DP[i * 2]) ** 2;
        }
        assert.ok(Math.sqrt(err) < 1e-3 * Math.sqrt(nrm) + 1e-6, `DΦ rel err ${Math.sqrt(err / nrm)}`);
      }
    }
  }
  assert.ok(tested > 0, 'no exit samples found');
});