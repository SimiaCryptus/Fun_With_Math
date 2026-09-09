// Two-body mechanics: Stumpff functions, universal-variable propagation,
// and element <-> state conversion. All default to canonical mu = 1.

import { add, cross, dot, norm, scale, sub } from './vec3.js';
import { TWO_PI } from './units.js';

/** Stumpff functions C2(z), C3(z) with series fallback near z = 0. */
export function stumpff(z) {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return { c2: (1 - Math.cos(s)) / z, c3: (s - Math.sin(s)) / (s * s * s) };
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return { c2: (1 - Math.cosh(s)) / z, c3: (Math.sinh(s) - s) / (s * s * s) };
  }
  return {
    c2: 0.5 - z / 24 + (z * z) / 720,
    c3: 1 / 6 - z / 120 + (z * z) / 5040,
  };
}

/** Solve M = E - e sinE (elliptic) by Newton with a good initial guess. */
export function solveKepler(M, e, tol = 1e-12) {
  let m = M % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  if (m < -Math.PI) m += TWO_PI;
  let E = e < 0.8 ? m : Math.PI * Math.sign(m || 1);
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < tol) break;
  }
  return E;
}

/**
 * Universal-variable Kepler propagation (Vallado alg. 8).
 * @param {number[]} r0 position
 * @param {number[]} v0 velocity
 * @param {number} dt   time step (same time unit as v0)
 * @returns {{r:number[], v:number[]}}
 */
export function propagate(r0, v0, dt, mu = 1) {
  if (dt === 0) return { r: [...r0], v: [...v0] };
  const sq = Math.sqrt(mu);
  const r0m = norm(r0);
  const v0m = norm(v0);
  const rdv = dot(r0, v0);
  const alpha = 2 / r0m - (v0m * v0m) / mu; // 1/a

  let chi;
  if (alpha > 1e-9) {                          // ellipse
    chi = sq * dt * alpha;
  } else if (alpha < -1e-9) {                  // hyperbola
    const a = 1 / alpha;
    const s = Math.sign(dt) || 1;
    chi = s * Math.sqrt(-a) *
      Math.log((-2 * mu * alpha * dt) /
        (rdv + s * Math.sqrt(-mu * a) * (1 - r0m * alpha)));
  } else {                                     // near-parabolic
    const h = norm(cross(r0, v0));
    const p = (h * h) / mu;
    const s = 0.5 * Math.atan(1 / (3 * Math.sqrt(mu / (p * p * p)) * dt));
    const w = Math.atan(Math.cbrt(Math.tan(s)));
    chi = Math.sqrt(p) * 2 / Math.tan(2 * w);
  }

  let psi = 0, c2 = 0.5, c3 = 1 / 6, r = r0m;
  for (let i = 0; i < 200; i++) {
    psi = chi * chi * alpha;
    ({ c2, c3 } = stumpff(psi));
    r = chi * chi * c2 + (rdv / sq) * chi * (1 - psi * c3) + r0m * (1 - psi * c2);
    const dtn = (chi * chi * chi * c3 + (rdv / sq) * chi * chi * c2 +
                 r0m * chi * (1 - psi * c3)) / sq;
    const dchi = (sq * dt - sq * dtn) / r;
    chi += dchi;
    if (Math.abs(dchi) < 1e-11) break;
  }

  psi = chi * chi * alpha;
  ({ c2, c3 } = stumpff(psi));
  const f = 1 - (chi * chi * c2) / r0m;
  const g = dt - (chi * chi * chi * c3) / sq;
  const rv = add(scale(r0, f), scale(v0, g));
  const rm = norm(rv);
  const gdot = 1 - (chi * chi * c2) / rm;
  const fdot = (sq / (r0m * rm)) * chi * (psi * c3 - 1);
  return { r: rv, v: add(scale(r0, fdot), scale(v0, gdot)) };
}

/**
 * Classical elements -> state vector.
 * @param {{a:number,e:number,i:number,Om:number,w:number,M:number}} el radians
 */
export function elementsToState(el, mu = 1) {
  const { a, e, i, Om, w, M } = el;
  const E = solveKepler(M, e);
  const cE = Math.cos(E), sE = Math.sin(E);
  const b = a * Math.sqrt(Math.max(0, 1 - e * e));
  const xp = a * (cE - e), yp = b * sE;
  const n = Math.sqrt(mu / (a * a * a));
  const Edot = n / (1 - e * cE);
  const vxp = -a * sE * Edot, vyp = b * cE * Edot;

  const cO = Math.cos(Om), sO = Math.sin(Om);
  const cw = Math.cos(w),  sw = Math.sin(w);
  const ci = Math.cos(i),  si = Math.sin(i);

  const m11 = cO * cw - sO * sw * ci, m12 = -cO * sw - sO * cw * ci;
  const m21 = sO * cw + cO * sw * ci, m22 = -sO * sw + cO * cw * ci;
  const m31 = sw * si,                m32 = cw * si;

  return {
    r: [m11 * xp + m12 * yp, m21 * xp + m22 * yp, m31 * xp + m32 * yp],
    v: [m11 * vxp + m12 * vyp, m21 * vxp + m22 * vyp, m31 * vxp + m32 * vyp],
  };
}

/** State vector -> classical elements (elliptic-friendly, for HUD readout). */
export function stateToElements(r, v, mu = 1) {
  const rm = norm(r), vm = norm(v);
  const h = cross(r, v), hm = norm(h);
  const nvec = [-h[1], h[0], 0];
  const nm = norm(nvec);
  const evec = scale(
    sub(scale(r, vm * vm - mu / rm), scale(v, dot(r, v))), 1 / mu);
  const e = norm(evec);
  const energy = (vm * vm) / 2 - mu / rm;
  const a = Math.abs(energy) < 1e-12 ? Infinity : -mu / (2 * energy);
  const i = Math.acos(Math.min(1, Math.max(-1, h[2] / hm)));
  let Om = nm > 1e-12 ? Math.acos(Math.min(1, Math.max(-1, nvec[0] / nm))) : 0;
  if (nvec[1] < 0) Om = TWO_PI - Om;
  let w = 0;
  if (nm > 1e-12 && e > 1e-12) {
    w = Math.acos(Math.min(1, Math.max(-1, dot(nvec, evec) / (nm * e))));
    if (evec[2] < 0) w = TWO_PI - w;
  }
  let nu = 0;
  if (e > 1e-12) {
    nu = Math.acos(Math.min(1, Math.max(-1, dot(evec, r) / (e * rm))));
    if (dot(r, v) < 0) nu = TWO_PI - nu;
  }
  const period = a > 0 && isFinite(a) ? TWO_PI * Math.sqrt((a * a * a) / mu) : Infinity;
  return { a, e, i, Om, w, nu, period, peri: a * (1 - e), apo: a * (1 + e) };
}