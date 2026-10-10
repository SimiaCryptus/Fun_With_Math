import { seed } from './encounter.js';
import { inertialVel } from './cr3bp.js';
import { rot2 } from './linalg.js';

/** §4.2: sin(δ/2) = 1/√(1 + b²u⁴/μ²). */
export const deflection = (b, u, mu) => 2 * Math.asin(1 / Math.sqrt(1 + (b * b * u ** 4) / (mu * mu)));

/** v_out = R v_in + (I − R) V_P. */
export function affineMap(vIn, VP, delta) {
  const Rv = rot2(delta, vIn), RV = rot2(delta, VP);
  return [Rv[0] + VP[0] - RV[0], Rv[1] + VP[1] - RV[1]];
}

/** Patched-conic prediction for the same seed (C3: V_P at the entry instant). */
export function patchedConicPredict(alpha, beta, p) {
  const s = seed(alpha, beta, p.C, p.mu, p.rho);
  if (!s) return null;
  const VP = [0, 1 - p.mu];
  const vI = inertialVel(s);
  const u = [vI[0] - VP[0], vI[1] - VP[1]];
  const rel = [s[0] - (1 - p.mu), s[1]];
  const um = Math.hypot(u[0], u[1]);
  const cr = rel[0] * u[1] - rel[1] * u[0];
  const b = Math.abs(cr) / um;
  const delta = Math.sign(cr) * deflection(b, um, p.mu);
  const vOut = affineMap(vI, VP, delta);
  const dv = [vOut[0] - vI[0], vOut[1] - vI[1]];
  return { b, u: um, delta, dv, dE: VP[0] * dv[0] + VP[1] * dv[1] };
}