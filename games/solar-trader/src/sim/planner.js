// Patched-conic transfer planning: Lambert arcs between station parking
// orbits, plus the porkchop grid search that drives the Nav UI.

import { lambert } from '../core/lambert.js';
import { propagate } from '../core/kepler.js';
import { norm, sub } from '../core/vec3.js';
import { bodyState, synodicPeriod, bodyElements } from './ephemeris.js';
import { BODY_BY_ID } from '../data/bodies.js';
import { STATION_BY_ID } from '../data/stations.js';
import { VU, daysToTU, tuToDays } from '../core/units.js';

/**
 * Δv (m/s) to go from a circular parking orbit of radius rPark around a body
 * of parameter mu, onto a hyperbola with excess speed vInf (m/s).
 * Same expression serves capture (time-reversed).
 */
export function wellDeltaV(mu, rPark, vInf) {
  if (!mu || mu < 1e3 || !rPark) return vInf;   // negligible gravity well
  const vCirc = Math.sqrt(mu / rPark);
  return Math.sqrt(vInf * vInf + 2 * mu / rPark) - vCirc;
}

/** Hohmann time of flight (days) between two circular radii in AU. */
export function hohmannTOF(a1, a2) {
  const at = (a1 + a2) / 2;
  return tuToDays(Math.PI * Math.sqrt(at * at * at));
}
/**
* Cheap coplanar-Hohmann estimate of a leg, for the port list. Ignores
* inclination and eccentricity so it is a lower bound on the real porkchop
* minimum, but it is O(1) and lets the UI show "reachable / not" for every
* station without 5 000 Lambert solves each.
* @returns {{dvDep:number, dvArr:number, dvTotal:number, tof:number}|null} m/s, days
*/
export function hohmannEstimate(fromStationId, toStationId, t, aeroFactor = 0) {
  const A = STATION_BY_ID[fromStationId];
  const B = STATION_BY_ID[toStationId];
  if (!A || !B) return null;
  if (A.body === B.body) {
    const l = localTransfer(fromStationId, toStationId);
    return { dvDep: l.dvTotal, dvArr: 0, dvTotal: l.dvTotal, tof: l.tof };
  }
  const bodyA = BODY_BY_ID[A.body];
  const bodyB = BODY_BY_ID[B.body];
  const a1 = bodyElements(A.body, t).a;
  const a2 = bodyElements(B.body, t).a;
  const at = (a1 + a2) / 2;
  // canonical mu = 1: circular speed 1/sqrt(a), vis-viva on the transfer ellipse
  const vInf1 = Math.abs(Math.sqrt(2 / a1 - 1 / at) - 1 / Math.sqrt(a1)) * VU;
  const vInf2 = Math.abs(1 / Math.sqrt(a2) - Math.sqrt(2 / a2 - 1 / at)) * VU;
  const dvDep = wellDeltaV(bodyA.mu, A.rPark, vInf1);
  const dvArr = wellDeltaV(bodyB.mu, B.rPark, vInf2) * (1 - (bodyB.atmo ? aeroFactor : 0));
  return { dvDep, dvArr, dvTotal: dvDep + dvArr, tof: hohmannTOF(a1, a2) };
}

/**
 * Solve one interplanetary leg.
 * @returns {null|{
 *   departT, arriveT, tof, r1, r2, v1, v2,
 *   vInfDep, vInfArr, dvDep, dvArr, dvTotal, c3, aeroSaved
 * }} Δv values in m/s, positions canonical.
 */
export function solveTransfer(fromStationId, toStationId, departT, tofDays, opts = {}) {
  const aeroFactor = opts.aeroFactor || 0;
  const A = STATION_BY_ID[fromStationId];
  const B = STATION_BY_ID[toStationId];
  if (!A || !B || tofDays <= 0.5) return null;

  const bodyA = BODY_BY_ID[A.body];
  const bodyB = BODY_BY_ID[B.body];
  const arriveT = departT + tofDays;

  const sa = bodyState(A.body, departT);
  const sb = bodyState(B.body, arriveT);
  const sol = lambert(sa.r, sb.r, daysToTU(tofDays), 1, true);
  if (!sol) return null;

  const vInfDep = norm(sub(sol.v1, sa.v)) * VU;    // m/s
  const vInfArr = norm(sub(sol.v2, sb.v)) * VU;
  if (!isFinite(vInfDep) || !isFinite(vInfArr)) return null;

  const dvDep = wellDeltaV(bodyA.mu, A.rPark, vInfDep);
  const rawArr = wellDeltaV(bodyB.mu, B.rPark, vInfArr);
  const aero = bodyB.atmo ? aeroFactor : 0;
  const dvArr = rawArr * (1 - aero);

  return {
    from: fromStationId, to: toStationId,
    departT, arriveT, tof: tofDays,
    r1: sa.r, r2: sb.r, v1: sol.v1, v2: sol.v2,
    vBody1: sa.v, vBody2: sb.v,
    vInfDep, vInfArr,
    c3: (vInfDep * vInfDep) / 1e6,             // km^2/s^2
    dvDep, dvArr, dvTotal: dvDep + dvArr,
    aeroSaved: rawArr - dvArr,
  };
}

/**
 * Δv/time for moving between two stations orbiting the same body
 * (two-impulse coplanar Hohmann between circular parking orbits).
 */
export function localTransfer(fromStationId, toStationId) {
  const A = STATION_BY_ID[fromStationId];
  const B = STATION_BY_ID[toStationId];
  if (!A || !B || A.body !== B.body) return null;
  const mu = BODY_BY_ID[A.body].mu;
  const r1 = A.rPark, r2 = B.rPark;
  const at = (r1 + r2) / 2;
  const dv1 = Math.abs(Math.sqrt(mu * (2 / r1 - 1 / at)) - Math.sqrt(mu / r1));
  const dv2 = Math.abs(Math.sqrt(mu / r2) - Math.sqrt(mu * (2 / r2 - 1 / at)));
  const tof = (Math.PI * Math.sqrt((at * at * at) / mu)) / 86400; // days
  return { dvTotal: dv1 + dv2, tof: Math.max(0.15, tof) };
}

/**
 * Porkchop grid.
 * @returns {{
 *   nx, ny, dep0, depStep, tof0, tofStep, dv: Float32Array,
 *   min: {dv,ix,iy,departT,tof}, best: object|null
 * }}
 */
export function porkchop(fromStationId, toStationId, t0, opts = {}) {
  const nx = opts.nx || 84;
  const ny = opts.ny || 64;
  const aeroFactor = opts.aeroFactor || 0;
  const A = STATION_BY_ID[fromStationId];
  const B = STATION_BY_ID[toStationId];

  const a1 = bodyElements(A.body, t0).a;
  const a2 = bodyElements(B.body, t0).a;
  const hoh = hohmannTOF(a1, a2);
  const syn = Math.min(synodicPeriod(A.body, B.body, t0), 4000);

  const depSpan = opts.depSpan || Math.max(240, Math.min(syn * 1.15, 3000));
  const tofMin = opts.tofMin || Math.max(20, hoh * 0.35);
  const tofMax = opts.tofMax || hoh * 2.3;

  const depStep = depSpan / (nx - 1);
  const tofStep = (tofMax - tofMin) / (ny - 1);
  const dv = new Float32Array(nx * ny).fill(NaN);

  let min = { dv: Infinity, ix: -1, iy: -1, departT: t0, tof: hoh };
  for (let ix = 0; ix < nx; ix++) {
    const dep = t0 + ix * depStep;
    for (let iy = 0; iy < ny; iy++) {
      const tof = tofMin + iy * tofStep;
      const s = solveTransfer(fromStationId, toStationId, dep, tof, { aeroFactor });
      if (!s) continue;
      dv[iy * nx + ix] = s.dvTotal;
      if (s.dvTotal < min.dv) min = { dv: s.dvTotal, ix, iy, departT: dep, tof };
    }
  }

  return {
    nx, ny, dep0: t0, depStep, tof0: tofMin, tofStep, dv, min,
    hohmann: hoh, synodic: syn,
    best: min.ix >= 0
      ? solveTransfer(fromStationId, toStationId, min.departT, min.tof, { aeroFactor })
      : null,
  };
}

/** Sample the coast arc of a solved transfer for rendering (canonical AU). */
export function arcSamples(sol, n = 160) {
  if (!sol) return [];
  const pts = new Array(n + 1);
  const T = daysToTU(sol.tof);
  for (let k = 0; k <= n; k++) {
    pts[k] = propagate(sol.r1, sol.v1, (T * k) / n, 1).r;
  }
  return pts;
}