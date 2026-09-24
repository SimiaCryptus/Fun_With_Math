import { fail } from '../core/errors.js';

export const BAND_SCHEME = Object.freeze({
  LINEAR: 0x01, DYADIC: 0x02, LOG: 0x03, MEL: 0x04, ERB: 0x05, RADIAL: 0x06, EXPLICIT: 0x07,
});

export function bandEdges(scheme, { K, J, kMin = 0, kMax = K, explicit }) {
  let e;
  switch (scheme) {
    case BAND_SCHEME.LINEAR:
      e = Array.from({ length: J + 1 }, (_, j) => Math.floor(j * K / J));
      break;
    case BAND_SCHEME.DYADIC:
      // k_0 = 0, k_1 = 1, k_j = 2^(j-1), clipped to K  (§10.1)
      e = [0];
      for (let j = 1; j <= J; j++) e.push(Math.min(K, Math.pow(2, j - 1)));
      if (e[e.length - 1] !== K) e.push(K);
      break;
    case BAND_SCHEME.LOG: {
      const lo = Math.max(1, kMin);
      e = [kMin];
      for (let j = 1; j <= J; j++) e.push(Math.floor(lo * Math.pow(kMax / lo, j / J)));
       e[e.length - 1] = kMax;                 // pow() may land at kMax - 1e-13; the last edge is kMax by definition
      break;
    }
    case BAND_SCHEME.EXPLICIT:
      e = Array.from(explicit);
      break;
    default:
      fail('FDDP_E_PARAM', `band scheme 0x${scheme.toString(16)} not implemented`);
  }
  return mergeDegenerate(Uint32Array.from(e));
}

// §10.1 — "Degenerate bands arising from rounding MUST be merged with their
// successor, and the merged edge array -- not the generating rule -- MUST be
// what the BAND chunk carries." This is applied ONCE, at EPS resolution.
export function mergeDegenerate(edges) {
  const out = [edges[0]];
  for (let i = 1; i < edges.length; i++) if (edges[i] > out[out.length - 1]) out.push(edges[i]);
  return Uint32Array.from(out);
}

export function validateEdges(edges, K, kMin = 0, kMax = K) {
  if (edges.length < 2) fail('FDDP_E_BAND_DEGENERATE', 'fewer than one band');
  if (edges[0] !== kMin) fail('FDDP_E_BAND_DEGENERATE', `first edge ${edges[0]} != kMin ${kMin}`);
  if (edges[edges.length - 1] !== kMax)
    fail('FDDP_E_BAND_DEGENERATE', `last edge ${edges[edges.length - 1]} != kMax ${kMax}`);
  for (let i = 1; i < edges.length; i++)
    if (edges[i] <= edges[i - 1]) fail('FDDP_E_BAND_DEGENERATE', `non-monotone at ${i}`);
  return edges.length - 1;                 // J
}