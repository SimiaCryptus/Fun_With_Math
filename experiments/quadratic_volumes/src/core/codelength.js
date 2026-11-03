// Residual-volume code length: branch codes, model-bit prices, split gain,
// and the convexity-based gain interval of idea.md §6.1. All units are bits.

import { log2, log2Binom, lgamma, h2, LN2 } from './special.js';

export const TOPOLOGY_BIT = 1;

/**
 * Krichevsky-Trofimov code length for a binary branch sequence.
 * -log2[ Γ(nL+1/2) Γ(nR+1/2) / ( π Γ(n+1) ) ]
 * Finite for nR = 0, which removes the empty-child pathology (§3.4).
 */
export function kt(nL, nR) {
  const n = nL + nR;
  if (n === 0) return 0;
  const ln =
    lgamma(nL + 0.5) + lgamma(nR + 0.5) - Math.log(Math.PI) - lgamma(n + 1);
  return -ln / LN2;
}

/** Plug-in branch cost n * H2(nL/n). Zero when a side is empty. */
export function h2plug(nL, nR) {
  const n = nL + nR;
  if (n === 0) return 0;
  return n * h2(nL / n);
}

/** Asymptotic MDL price of k real parameters estimated from n points. */
export function paramBits(n, k) {
  if (k <= 0) return 0;
  return (k / 2) * log2(Math.max(n, 2));
}

/** Price of naming one threshold out of m candidates. */
export function thresholdBits(m) {
  return m > 1 ? log2(m) : 0;
}

/** Price of naming an ordered-free pair of thresholds (a slab). */
export function slabBits(m) {
  return m > 1 ? log2Binom(m, 2) : 0;
}

/** Centers encoded as pointers into data the decoder already holds. */
export function pointerBits(n, k) {
  return log2Binom(n, k) + paramBits(n, k); // set of indices + one weight each
}

/** Sparse quadratic: k nonzeros out of p=10 monomials in 3D. */
export function sparseQuadBits(n, k, p = 10) {
  return log2Binom(p, k) + paramBits(n, k);
}

export function familyBits(numFamilies) {
  return numFamilies > 1 ? log2(numFamilies) : 0;
}

export function gridBits(gridSize) {
  return gridSize > 1 ? log2(gridSize) : 0;
}

/**
 * Net gain as a function of the left child's share of measure qL,
 * holding the point counts fixed (§6.1).
 */
export function gainAtShare(qL, nL, nR, branchBits, cSplit) {
  if (qL <= 0) return nL > 0 ? Infinity : -branchBits - cSplit;
  if (qL >= 1) return nR > 0 ? Infinity : -branchBits - cSplit;
  return (
    nL * log2(1 / qL) + nR * log2(1 / (1 - qL)) - branchBits - cSplit
  );
}

/**
 * Direct (point-valued) gain from measures, as written in §3.3.
 * G = n log2 VP - nL log2 VL - nR log2 VR - branchBits - cSplit
 */
export function gainFromVolumes({ nL, nR, VL, VR, branchBits, cSplit }) {
  const n = nL + nR;
  const VP = VL + VR;
  return (
    n * log2(VP) - nL * log2(VL) - nR * log2(VR) - branchBits - cSplit
  );
}

/**
 * Interval bounds on the gain, given interval bounds on the child measures.
 * Uses the share parameterization plus strict convexity of G in qL, and the
 * resolution floor v_eps to keep G+ finite at cold start.
 */
export function gainInterval({
  nL,
  nR,
  VL,
  VR,
  vEps = 0,
  branchBits,
  cSplit = 0,
}) {
  const n = nL + nR;
  const pL = n > 0 ? nL / n : 0;

  const VLlo = Math.max(VL.lo, vEps);
  const VRlo = Math.max(VR.lo, vEps);
  const VLhi = Math.max(VL.hi, VLlo);
  const VRhi = Math.max(VR.hi, VRlo);

  const qLo = VLlo / (VLlo + VRhi);
  const qHi = VLhi / (VLhi + VRlo);

  const gLoEnd = gainAtShare(qLo, nL, nR, branchBits, cSplit);
  const gHiEnd = gainAtShare(qHi, nL, nR, branchBits, cSplit);

  const hi = Math.max(gLoEnd, gHiEnd);
  let lo;
  if (pL >= qLo && pL <= qHi) {
    lo = gainAtShare(pL, nL, nR, branchBits, cSplit);
  } else {
    lo = Math.min(gLoEnd, gHiEnd);
  }

  const kind =
    VL.kind === 'probabilistic' || VR.kind === 'probabilistic'
      ? 'probabilistic'
      : 'certified';
  return { lo, hi, kind, qLo, qHi, pL };
}

/** Per-point cost with no model: log2(mu(D)/v_eps). */
export function baselineBits(muD, vEps) {
  return log2(muD / vEps);
}

/**
 * Code length of a fixed partition, dropping the common -N log2 v_eps term.
 * leaves: [{ n, V }]. Uses ideal (plug-in) leaf codes.
 */
export function partitionCodeLength(leaves, N) {
  let s = 0;
  for (const { n, V } of leaves) {
    if (n === 0) continue;
    s += -n * log2(n / N) + n * log2(V);
  }
  return s;
}

/** Negative log-likelihood (bits) of the piecewise-uniform density (§3.2). */
export function piecewiseUniformNLL(leaves, N) {
  let s = 0;
  for (const { n, V } of leaves) {
    if (n === 0) continue;
    s += -n * log2(n / N / V);
  }
  return s;
}