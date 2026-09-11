import { clamp } from '../core/math.js';

/**
 * Intelligent Driver Model (SPEC §7.3).
 * @param p   params: { aMax, bComf, bMax, T, s0 }
 * @param v   own speed (m/s)
 * @param v0  desired speed (m/s)
 * @param s   bumper-to-bumper gap to leader (m); Infinity for free flow
 * @param dv  v - vLeader
 */
export function idmAccel(p, v, v0, s, dv, delta = 4) {
  const vv = v < 0 ? 0 : v;
  const aFree = p.aMax * (1 - Math.pow(vv / Math.max(v0, 0.1), delta));
  if (s === Infinity || s === null || s === undefined) return clamp(aFree, -p.bMax, p.aMax);
  const sStar = p.s0 + Math.max(0, vv * p.T + (vv * dv) / (2 * Math.sqrt(p.aMax * p.bComf)));
  const ratio = sStar / Math.max(s, 0.1);
  const aInt = -p.aMax * ratio * ratio;
  return clamp(aFree + aInt, -p.bMax, p.aMax);
}

/** Analytic equilibrium gap for a follower at speed v behind a leader at the same speed. */
export function idmEquilibriumGap(p, v, v0, delta = 4) {
  return (p.s0 + v * p.T) / Math.sqrt(Math.max(1e-6, 1 - Math.pow(v / v0, delta)));
}