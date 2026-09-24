import { RESOLUTION } from '../core/registry.js';

// §15.6 — per-PATCH zero padding to an octet boundary (not per-chunk) exists so
// that a patch is randomly addressable by index arithmetic alone. This module
// is the proof that the property is real.
export function buildLayout(eps) {
  const ragged = eps.resolution === RESOLUTION.RAGGED;
  const J = eps.J, L = eps.L, G = eps.G, C = eps.C, bits = eps.quant.bits;
  const widths = new Uint32Array(J);
  const counts = new Uint32Array(J);
  const bodyBytes = new Uint32Array(J);
  const strides = new Uint32Array(J);
  const prefix = new Uint32Array(J + 1);
  for (let j = 0; j < J; j++) {
    widths[j] = ragged ? (eps.bandEdges[j + 1] - eps.bandEdges[j]) : eps.Kp;
    counts[j] = G * widths[j] * C;
    bodyBytes[j] = Math.ceil(counts[j] * bits / 8);
    strides[j] = 8 + bodyBytes[j];
    prefix[j + 1] = prefix[j] + strides[j];
  }
  const perLane = prefix[J];
  const perGroup = perLane * L;
  return {
    widths, counts, bodyBytes, strides, prefix, perLane, perGroup,
    // patch index i enumerates (g, l, j) in the §10.4 canonical order
    patchOffset(i) {
      const j = i % J, l = Math.floor(i / J) % L, g = Math.floor(i / (J * L));
      return g * perGroup + l * perLane + prefix[j];
    },
    patchCoord(i) {
      const j = i % J, l = Math.floor(i / J) % L, g = Math.floor(i / (J * L));
      return { s: 0, l, g, j, segment: 0 };
    },
    totalBytes(nPatches) { return (nPatches / (J * L)) * perGroup; },
  };
}