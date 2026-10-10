import { omega, gradOmega } from './cr3bp.js';
import { LABEL } from './conventions.js';
import { Dopri5, stepFactor } from './dopri5.js';
import { makeAugRhs } from './variational.js';

/** Entry state on Σ_in (convention C1), or null if the point is in the forbidden region. */
export function seed(alpha, beta, C, mu, rho) {
  const ca = Math.cos(alpha), sa = Math.sin(alpha);
  const x = 1 - mu + rho * ca, y = rho * sa;
  const v2 = 2 * omega(x, y, mu) - C;
  if (!(v2 > 0)) return null;
  const v = Math.sqrt(v2), cb = Math.cos(beta), sb = Math.sin(beta);
  // n̂ = (−ca, −sa), t̂ = (−sa, ca)
  return [x, y, v * (-cb * ca - sb * sa), v * (-cb * sa + sb * ca)];
}

/** ∂s_in/∂(α, β), returned as a 4×2 row-major Float64Array. */
export function seedJacobian(alpha, beta, C, mu, rho) {
  const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta);
  const x = 1 - mu + rho * ca, y = rho * sa;
  const v = Math.sqrt(2 * omega(x, y, mu) - C);
  const n = [-ca, -sa], t = [-sa, ca];
  const drda = [rho * t[0], rho * t[1]];
  const g = gradOmega(x, y, mu);
  const dvda = (g[0] * drda[0] + g[1] * drda[1]) / v;
  const J = new Float64Array(8);
  J[0] = drda[0]; J[2] = drda[1];
  for (let c = 0; c < 2; c++) {
    // dn̂/dα = −t̂, dt̂/dα = n̂
    const dirc = cb * n[c] + sb * t[c];
    J[(2 + c) * 2] = dvda * dirc + v * (-cb * t[c] + sb * n[c]);
    J[(2 + c) * 2 + 1] = v * (-sb * n[c] + cb * t[c]);
  }
  return J;
}

/** Illinois root refinement of fn(y(θ)) on θ ∈ [0, h], with y(θ) from a single trial step. */
function refine(integ, y, h, fn, out) {
  let a = 0, fa = fn(y), b = h;
  integ.attempt(y, b, out); let fb = fn(out);
  for (let it = 0; it < 60; it++) {
    const c = b - fb * (b - a) / (fb - fa);
    integ.attempt(y, c, out); const fc = fn(out);
    if (fc * fb < 0) { a = b; fa = fb; } else { fa *= 0.5; }
    b = c; fb = fc;
    if (Math.abs(fc) < 1e-15 || Math.abs(b - a) < 1e-15 * Math.abs(h)) break;
  }
  integ.attempt(y, b, out); // ensure out = y(b)
}

/**
 * Propagate one encounter.
 * p: {mu, C, rho, rhoFar, Rbody, T, rtol, atol}
 */
export function propagate(alpha, beta, p, { withSTM = true, record = false, maxSteps = 200000 } = {}) {
  const { mu, C, rho, rhoFar, Rbody, T } = p;
  const sIn = seed(alpha, beta, C, mu, rho);
  if (!sIn) return { label: LABEL.FORBIDDEN, alpha, beta };
  const rhs = makeAugRhs(mu, { withSTM, e1: 0.01, e2: rho / 10 });
  const integ = new Dopri5(21, rhs, { rtol: p.rtol ?? 1e-12, atol: p.atol ?? 1e-12, nerr: 4 });
  const y = new Float64Array(21), yn = new Float64Array(21), yr = new Float64Array(21);
  y.set(sIn);
  if (withSTM) { y[4] = y[9] = y[14] = y[19] = 1; }
  rhs(y, integ.k1);
  const x2 = 1 - mu;
  const r2of = (v) => Math.hypot(v[0] - x2, v[1]);
  const r1of = (v) => Math.hypot(v[0] + mu, v[1]);
  const traj = record ? [y[0], y[1]] : null;
  let h = 1e-4, outside = false, passes = 1, exitY = null, rPeri = rho, label = null;

  for (let step = 0; step < maxSteps; step++) {
    if (y[20] >= T) break;
    const err = integ.attempt(y, h, yn);
    if (err <= 1) {
      const ra = r2of(y), rb = r2of(yn);
      let refined = false;
      if (rb < rPeri) rPeri = rb;
      if (rb <= Rbody || r1of(yn) < 1e-3) {
        label = LABEL.COLLISION; if (record) traj.push(yn[0], yn[1]); break;
      }
      if (!outside && ra < rho && rb >= rho) {
        refine(integ, y, h, (v) => r2of(v) - rho, yr);
        exitY = Float64Array.from(yr); outside = true; refined = true;
      } else if (outside && ra >= rho && rb < rho) {
        passes++; outside = false;
      }
      if (outside && ra < rhoFar && rb >= rhoFar) {
        label = passes === 1 ? LABEL.EXIT : LABEL.MULTIPASS;
        if (record) traj.push(yn[0], yn[1]);
        break;
      }
      y.set(yn);
      if (refined) rhs(y, integ.k1); else integ.k1.set(integ.k7);
      if (record) traj.push(y[0], y[1]);
    }
    h *= stepFactor(err);
  }
  if (label === null) label = outside && exitY ? (passes === 1 ? LABEL.EXIT : LABEL.MULTIPASS) : LABEL.CAPTURED;
  if (label !== LABEL.EXIT && label !== LABEL.MULTIPASS) exitY = null;
  return {
    label, alpha, beta, sIn, exitY, rPeri, nPasses: passes, traj,
    sJac: seedJacobian(alpha, beta, C, mu, rho),
  };
}