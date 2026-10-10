import { rhs4, inertialVel, inertialEnergy, angMom, keplerE1, gradEnergy, jacobi } from './cr3bp.js';
import { rot2, polar2, eigSym2 } from './linalg.js';
import { F } from './grid.js';

/** Crossing-corrected map Jacobian (§8.2 step 5). */
export function mapJacobian(r, mu) {
  const y = r.exitY, sOut = [y[0], y[1], y[2], y[3]];
  const f = rhs4(sOut, mu);
  const dx = sOut[0] - (1 - mu), dy = sOut[1], r2 = Math.hypot(dx, dy);
  const gs0 = dx / r2, gs1 = dy / r2;
  const gf = gs0 * f[0] + gs1 * f[1];
  const gP = [0, 0, 0, 0];
  for (let j = 0; j < 4; j++) gP[j] = gs0 * y[4 + j] + gs1 * y[8 + j];
  const D = new Float64Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) D[i * 4 + j] = y[4 + i * 4 + j] - f[i] * gP[j] / gf;
  const dtau = gP.map((v) => -v / gf);
  const DP = new Float64Array(8);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) {
    let s = 0; for (let m = 0; m < 4; m++) s += D[i * 4 + m] * r.sJac[m * 2 + k];
    DP[i * 2 + k] = s;
  }
  return { D, dtau, DP, sOut };
}

/** Write all per-sample fields of an exit sample into out[o + F.*]. */
export function computeFields(r, p, out, o) {
  const { mu, rho } = p;
  const sIn = r.sIn, tau = r.exitY[20];
  const { D, dtau, DP, sOut } = mapJacobian(r, mu);

  const vIin = inertialVel(sIn), vR = inertialVel(sOut), vIout = rot2(tau, vR);
  const Ein = inertialEnergy(sIn, mu), Eout = inertialEnergy(sOut, mu);
  const dE = Eout - Ein, dH = angMom(sOut) - angMom(sIn);

  // A = R(τ) ( [ω× I] D[:, 2:4] + (ω× w_out) ⊗ ∂τ/∂v_in )
  const M = [0, 0, 0, 0];
  const wv = [-vR[1], vR[0]];
  for (let c = 0; c < 2; c++) {
    const col = 2 + c;
    M[c] = -D[4 + col] + D[8 + col] + wv[0] * dtau[col];
    M[2 + c] = D[col] + D[12 + col] + wv[1] * dtau[col];
  }
  const co = Math.cos(tau), si = Math.sin(tau);
  const A = [co * M[0] - si * M[2], co * M[1] - si * M[3], si * M[0] + co * M[2], si * M[1] + co * M[3]];
  const bx = vIout[0] - (A[0] * vIin[0] + A[1] * vIin[1]);
  const by = vIout[1] - (A[2] * vIin[0] + A[3] * vIin[1]);
  const pol = polar2(A);

  const geO = gradEnergy(sOut, mu), geI = gradEnergy(sIn, mu);
  let gA = 0, gB = 0;
  for (let i = 0; i < 4; i++) {
    gA += geO[i] * DP[i * 2] - geI[i] * r.sJac[i * 2];
    gB += geO[i] * DP[i * 2 + 1] - geI[i] * r.sJac[i * 2 + 1];
  }

  // Sensitivity metric with K = diag(1/ρ², 1/ρ², 1/vc², 1/vc²), vc² = μ/ρ
  const K = [1 / (rho * rho), 1 / (rho * rho), rho / mu, rho / mu];
  let g00 = 0, g01 = 0, g11 = 0;
  for (let i = 0; i < 4; i++) {
    g00 += K[i] * DP[i * 2] ** 2;
    g01 += K[i] * DP[i * 2] * DP[i * 2 + 1];
    g11 += K[i] * DP[i * 2 + 1] ** 2;
  }
  const lam = eigSym2(g00, g01, g11);
  const ftle = tau > 0 ? Math.log(Math.sqrt(Math.max(lam[0], 1e-300))) / tau : NaN;

  const dx = sOut[0] - (1 - mu), dy = sOut[1], r2 = Math.hypot(dx, dy);
  const nx = dx / r2, ny = dy / r2;
  let aOut = Math.atan2(dy, dx); if (aOut < 0) aOut += 2 * Math.PI;

  out[o + F.dE] = dE;
  out[o + F.dH] = dH;
  out[o + F.errEH] = Math.abs(dE - dH);
  out[o + F.dE1] = keplerE1(sOut, mu) - keplerE1(sIn, mu);
  out[o + F.dvx] = vIout[0] - vIin[0];
  out[o + F.dvy] = vIout[1] - vIin[1];
  out[o + F.dvRx] = sOut[2] - sIn[2];
  out[o + F.dvRy] = sOut[3] - sIn[3];
  out[o + F.A00] = A[0]; out[o + F.A01] = A[1]; out[o + F.A10] = A[2]; out[o + F.A11] = A[3];
  out[o + F.bx] = bx; out[o + F.by] = by;
  out[o + F.deltaEff] = pol.theta;
  out[o + F.s1] = pol.s1; out[o + F.s2] = pol.s2;
  out[o + F.flip] = pol.flip ? 1 : 0;
  out[o + F.tau] = tau;
  out[o + F.rPeri] = r.rPeri;
  out[o + F.ftle] = ftle;
  out[o + F.kappaE] = (gA * gA + gB * gB) / (g00 + g11);
  out[o + F.gA] = gA; out[o + F.gB] = gB;
  out[o + F.alphaOut] = aOut;
  out[o + F.betaOut] = Math.atan2(-sOut[2] * ny + sOut[3] * nx, sOut[2] * nx + sOut[3] * ny);
  out[o + F.jacobiDrift] = Math.abs(jacobi(sOut, mu) - p.C);
  out[o + F.nPasses] = r.nPasses;
}