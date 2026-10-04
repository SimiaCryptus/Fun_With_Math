// Rigid-cluster integrator in the rotating frame (physics.md §A.6.3).
import { v3, m3, quat, cayleySolve } from './math.js';

const _t = new Float64Array(3);

// Translation (point mass or COM) at offsets xo/uo of SoA arrays.
//   W = U + Ω×X;  W += dt·a;  X' = X + dt·W;  X⁺ = C(b)X';  W⁺ = C(b)W;  U⁺ = W⁺ − Ω×X⁺
// a = acceleration from real forces, frame axes. C(b) = R_stepᵀ, b = ½·dt·Ω.
export function translateAt(x, xo, u, uo, ax, ay, az, Om, b, dt) {
  const O0 = Om[0], O1 = Om[1], O2 = Om[2], b0 = b[0], b1 = b[1], b2 = b[2];
  const X0 = x[xo], X1 = x[xo + 1], X2 = x[xo + 2];
  const W0 = u[uo] + (O1 * X2 - O2 * X1) + dt * ax;
  const W1 = u[uo + 1] + (O2 * X0 - O0 * X2) + dt * ay;
  const W2 = u[uo + 2] + (O0 * X1 - O1 * X0) + dt * az;
  const Y0 = X0 + dt * W0, Y1 = X1 + dt * W1, Y2 = X2 + dt * W2;
  _t[0] = Y0 - (b1 * Y2 - b2 * Y1); _t[1] = Y1 - (b2 * Y0 - b0 * Y2); _t[2] = Y2 - (b0 * Y1 - b1 * Y0);
  cayleySolve(x, xo, b, _t);
  _t[0] = W0 - (b1 * W2 - b2 * W1); _t[1] = W1 - (b2 * W0 - b0 * W2); _t[2] = W2 - (b0 * W1 - b1 * W0);
  cayleySolve(_t, 0, b, _t);
  const N0 = x[xo], N1 = x[xo + 1], N2 = x[xo + 2];
  u[uo] = _t[0] - (O1 * N2 - O2 * N1);
  u[uo + 1] = _t[1] - (O2 * N0 - O0 * N2);
  u[uo + 2] = _t[2] - (O0 * N1 - O1 * N0);
}

const _tb = v3.create(), _a = v3.create(), _w0 = v3.create(), _Iw = v3.create(), _f = v3.create();
const _wold = v3.create(), _J = m3.create(), _S = m3.create(), _dq = new Float64Array(4);

// Rotation: explicit torque, one Newton step of implicit gyroscopics (Catto), Cayley orientation.
// qstepConj = q_step⁻¹ undoes the frame increment on the left.
export function rotateStep(c, dt, qstepConj) {
  quat.rotateInv(_tb, c.q, c.T);                 // τ_b = Rᵀ τ
  m3.mulV(_a, c.IbInv, _tb);
  v3.addScaled(_w0, c.wb, _a, dt);               // ω₀
  m3.mulV(_Iw, c.Ib, _w0);
  v3.cross(_f, _w0, _Iw); v3.scale(_f, _f, dt);  // f(ω₀) = dt ω₀ × I ω₀
  m3.skew(_S, _w0); m3.mul(_J, _S, c.Ib);
  m3.skew(_S, _Iw);
  for (let k = 0; k < 9; k++) _J[k] = c.Ib[k] + dt * (_J[k] - _S[k]);
  m3.solve(_a, _J, _f);
  v3.copy(_wold, c.wb);
  v3.sub(c.wb, _w0, _a);
  // absolute angular acceleration, frame coords (for the stress solver)
  v3.sub(_a, c.wb, _wold); v3.scale(_a, _a, 1 / dt);
  quat.rotate(c.alpha, c.q, _a);
  // q⁺ = normalize(q_step⁻¹ ⊗ q ⊗ normalize([1, ½dt ω_b⁺]))
  _dq[0] = 1; _dq[1] = 0.5 * dt * c.wb[0]; _dq[2] = 0.5 * dt * c.wb[1]; _dq[3] = 0.5 * dt * c.wb[2];
  quat.normalize(_dq, _dq);
  quat.mul(c.q, c.q, _dq);
  quat.mul(c.q, qstepConj, c.q);
  quat.normalize(c.q, c.q);
}

const _qc = new Float64Array(4);
export function integrateClusters(world) {
  const f = world.frame, dt = world.params.dt;
  quat.conj(_qc, f.qstep);
  for (const c of world.clusters) {
    if (!c.alive || !(c.M > 0)) continue;
    v3.scale(c.A, c.F, 1 / c.M);
    translateAt(c.X, 0, c.U, 0, c.A[0], c.A[1], c.A[2], f.Om, f.b, dt);
    rotateStep(c, dt, _qc);
  }
}