// Body states in canonical heliocentric units (AU, AU/TU), from the tables
// in data/bodies.js.

import { BODY_BY_ID } from '../data/bodies.js';
import { elementsToState } from '../core/kepler.js';
import { DEG, TWO_PI, daysToTU, tuToDays, wrapAngle } from '../core/units.js';

const cache = new Map();      // key: `${id}|${quantizedDays}` -> {r,v}
const CACHE_Q = 1 / 64;       // day quantum for memoisation

/** Osculating elements (radians) for body `id` at time `tDays` (since J2000). */
export function bodyElements(id, tDays) {
  const b = BODY_BY_ID[id];
  if (!b) throw new Error(`unknown body ${id}`);

  if (b.kind === 'jpl') {
    const T = tDays / 36525;
    const [a0, e0, I0, L0, P0, O0] = b.el;
    const [ad, ed, Id, Ld, Pd, Od] = b.rate;
    const a = a0 + ad * T;
    const e = e0 + ed * T;
    const I = (I0 + Id * T) * DEG;
    const L = (L0 + Ld * T) * DEG;
    const P = (P0 + Pd * T) * DEG;   // longitude of perihelion
    const O = (O0 + Od * T) * DEG;   // longitude of ascending node
    return { a, e, i: I, Om: O, w: wrapAngle(P - O), M: wrapAngle(L - P) };
  }

  // fixed osculating elements + mean motion (canonical mu = 1)
  const { a, e, i, Om, w, M0 } = b.el;
  const n = Math.sqrt(1 / (a * a * a));                 // rad / TU
  const M = wrapAngle(M0 * DEG + n * daysToTU(tDays));  // epoch = J2000
  return { a, e, i: i * DEG, Om: Om * DEG, w: w * DEG, M };
}

/** @returns {{r:number[], v:number[]}} canonical heliocentric state. */
export function bodyState(id, tDays) {
  const key = `${id}|${Math.round(tDays / CACHE_Q)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const st = elementsToState(bodyElements(id, tDays), 1);
  if (cache.size > 40000) cache.clear();
  cache.set(key, st);
  return st;
}

/** Orbital period in days. */
export function bodyPeriod(id, tDays = 0) {
  const { a } = bodyElements(id, tDays);
  return tuToDays(TWO_PI * Math.sqrt(a * a * a));
}

/** Synodic period between two bodies, in days. */
export function synodicPeriod(idA, idB, tDays = 0) {
  const pa = bodyPeriod(idA, tDays);
  const pb = bodyPeriod(idB, tDays);
  const d = Math.abs(1 / pa - 1 / pb);
  return d < 1e-9 ? 1e5 : 1 / d;
}

/** N sample points around the body's current osculating orbit (for drawing). */
export function orbitSamples(id, tDays, n = 256) {
  const el = bodyElements(id, tDays);
  const out = new Array(n + 1);
  for (let k = 0; k <= n; k++) {
    const M = -Math.PI + (TWO_PI * k) / n;
    out[k] = elementsToState({ ...el, M }, 1).r;
  }
  return out;
}