// @ts-check
// Canonical two-disk solver (used by the batch tabulator and as the runtime fallback).
import { diskLayout, kernelSystem } from './panels.js';
import { PRIMARY_FRAME, MODES, geometryFromParams, modeRow } from './canonical.js';
import { luFactor, luSolve } from '../linalg.js';

const primaryCache = new Map();
export function primaryLayout(o) {
  const key = `${o.rings}/${o.sectors}/${o.sub}/${o.epsRel}`;
  let L = primaryCache.get(key);
  if (!L) { L = diskLayout(PRIMARY_FRAME, o); primaryCache.set(key, L); }
  return L;
}

function modeRows(P, S, B) {
  const n = P.count + S.count;
  const rows = new Float64Array(n * MODES);
  P.coll.forEach((c, i) => modeRow(true, c, B, rows, i));
  S.coll.forEach((c, i) => modeRow(false, c, B, rows, P.count + i));
  return rows;
}

/** σ for each of the 7 modes, laid out [mode][panel]. One LU, seven back-substitutions. */
export function solveModes(params, layout) {
  const geom = geometryFromParams(params);
  const P = primaryLayout(layout);
  const S = diskLayout(geom.secondary, layout);
  const { A, n } = kernelSystem([P, S]);
  const lu = luFactor(A, n);
  const rows = modeRows(P, S, geom.B);
  const sigma = new Float64Array(MODES * n);
  const rhs = new Float64Array(n);
  for (let m = 0; m < MODES; m++) {
    for (let i = 0; i < n; i++) rhs[i] = rows[i * MODES + m];
    sigma.set(luSolve(lu, rhs), m * n);
  }
  return { sigma, n };
}

/** Direct solve for an already-mixed boundary condition (runtime fallback). */
export function solveCombined(P, S, B, coefs) {
  const { A, n } = kernelSystem([P, S]);
  const rows = modeRows(P, S, B);
  const rhs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let m = 0; m < MODES; m++) s += rows[i * MODES + m] * coefs[m];
    rhs[i] = s;
  }
  return luSolve(luFactor(A, n), rhs);
}