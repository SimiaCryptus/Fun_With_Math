// Vallado's universal-variable Lambert solver (single revolution),
// bisection on psi over [-4pi^2, 4pi^2].

import { cross, dot, norm, scale, sub } from './vec3.js';
import { stumpff } from './kepler.js';

/**
 * @param {number[]} r1 departure position (canonical AU)
 * @param {number[]} r2 arrival position
 * @param {number} dt  time of flight (canonical TU, > 0)
 * @param {number} mu
 * @param {boolean} prograde
 * @returns {{v1:number[], v2:number[]}|null}
 */
export function lambert(r1, r2, dt, mu = 1, prograde = true) {
  if (!(dt > 0)) return null;
  const r1m = norm(r1), r2m = norm(r2);
  if (r1m === 0 || r2m === 0) return null;

  let cosdnu = dot(r1, r2) / (r1m * r2m);
  cosdnu = Math.max(-1, Math.min(1, cosdnu));
  let dnu = Math.acos(cosdnu);
  const k = cross(r1, r2)[2];
  if (prograde ? k < 0 : k >= 0) dnu = 2 * Math.PI - dnu;

  // Degenerate (collinear) geometry: plane is undefined.
  if (Math.abs(1 - cosdnu) < 1e-12) return null;

  const A = Math.sin(dnu) * Math.sqrt((r1m * r2m) / (1 - cosdnu));
  if (!isFinite(A) || Math.abs(A) < 1e-12) return null;

  const sq = Math.sqrt(mu);
  let lo = -4 * Math.PI * Math.PI;
  let hi = 4 * Math.PI * Math.PI;
  let psi = 0, c2 = 0.5, c3 = 1 / 6, y = 0, chi = 0, ok = false;

  for (let iter = 0; iter < 240; iter++) {
    ({ c2, c3 } = stumpff(psi));
    y = r1m + r2m + (A * (psi * c3 - 1)) / Math.sqrt(c2);

    if (A > 0 && y < 0) {
      // Push psi up until y becomes positive (Vallado's "readjust" step).
      let guard = 0;
      while (y < 0 && guard++ < 200) {
        psi += 0.05;
        ({ c2, c3 } = stumpff(psi));
        y = r1m + r2m + (A * (psi * c3 - 1)) / Math.sqrt(c2);
      }
      lo = psi;
      if (y < 0) return null;
    }

    chi = Math.sqrt(y / c2);
    const dtn = (chi * chi * chi * c3 + A * Math.sqrt(y)) / sq;

    if (Math.abs(dtn - dt) < 1e-9 * dt) { ok = true; break; }
    if (dtn <= dt) lo = psi; else hi = psi;
    psi = 0.5 * (lo + hi);
    // Bracket exhausted: only accept if the last evaluation actually fits.
    if (hi - lo < 1e-13) { ok = Math.abs(dtn - dt) < 1e-6 * dt; break; }
  }
  if (!ok || !(y > 0) || !isFinite(y)) return null;

  const f = 1 - y / r1m;
  const g = A * Math.sqrt(y / mu);
  const gdot = 1 - y / r2m;
  if (Math.abs(g) < 1e-14) return null;

  return {
    v1: scale(sub(r2, scale(r1, f)), 1 / g),
    v2: scale(sub(scale(r2, gdot), r1), 1 / g),
  };
}