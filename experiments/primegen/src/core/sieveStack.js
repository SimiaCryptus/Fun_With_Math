import { firstNPrimes } from './primes.js';
import { entropyBits, mertensAsymptotic, entropyIncrementAsymptotic } from './metrics.js';
import { primeColor } from '../util/colors.js';

/**
 * Build the whole stack of orthogonal periodic exclusion fields.
 *
 *   killer[idx]  = smallest basis prime dividing n = start + idx   (0 => survivor)
 *   stageOf[idx] = 1-based stage k of that prime                   (0 => survivor)
 *
 * The set { idx : stageOf[idx] === k } is exactly the orthogonal component C_k
 * of the paper: positions that p_k kills *for the first time*.
 */
export function buildStack({ k, windowLength, offset }) {
  const basis = firstNPrimes(k);
  const start = Math.max(1, Math.floor(offset || 1));
  const N = Math.max(32, Math.floor(windowLength));

  const killer = new Int32Array(N);
  const stageOf = new Int32Array(N);

  for (let i = 0; i < basis.length; i++) {
    const p = basis[i];
    const first = Math.ceil(start / p) * p;
    for (let n = first; n < start + N; n += p) {
      const idx = n - start;
      if (stageOf[idx] === 0) { stageOf[idx] = i + 1; killer[idx] = p; }
    }
  }

  // window tallies
  const newKills = new Array(basis.length).fill(0);
  const survivorPositions = [];
  for (let idx = 0; idx < N; idx++) {
    const s = stageOf[idx];
    if (s === 0) survivorPositions.push(start + idx);
    else newKills[s - 1]++;
  }

  // per-stage exact algebra
  const stages = [];
  let rho = 1, Hjoint = 0, log10L = 0, L = 1n, alive = N;

  for (let i = 0; i < basis.length; i++) {
    const p = basis[i];
    const rhoPrev = rho;
    rho = rhoPrev * (1 - 1 / p);
    const H = entropyBits(p);
    Hjoint += H;
    log10L += Math.log10(p);
    L *= BigInt(p);
    alive -= newKills[i];

    stages.push({
      index: i,
      stage: i + 1,
      p,
      color: primeColor(i),
      // ---- density (multiplicative attenuation) ----
      factor: 1 - 1 / p,
      rhoPrev,
      rho,
      killDensity: rhoPrev / p,               // natural density of C_k
      mertensAsym: mertensAsymptotic(p),
      // ---- entropy (additive information) ----
      H,
      Hjoint,
      HAsym: entropyIncrementAsymptotic(p),
      log10L,
      L,
      log10EntropyDensity: Math.log10(Hjoint) - log10L,   // h_k = H_joint / L_k
      outputEntropy: binEntropy(rho),
      // ---- window measurements ----
      newKills: newKills[i],
      aliveAfter: alive,
      windowKillDensity: newKills[i] / N,
      windowAliveDensity: alive / N,
      // ---- spectrum ----
      combLines: p - 1,
      amplitude: 1 / p,
      nonzeroPower: (p - 1) / (p * p),
    });
  }

  return {
    basis, start, N, killer, stageOf, stages,
    survivorPositions,
    survivors: survivorPositions.length,
    rho, Hjoint, log10L, L,
    pk: basis.length ? basis[basis.length - 1] : null,
  };
}

function binEntropy(r) {
  if (r <= 0 || r >= 1) return 0;
  return -(r * Math.log2(r) + (1 - r) * Math.log2(1 - r));
}

/** State of position idx after only the first `stage` primes have acted. */
export function aliveAtStage(stack, idx, stage) {
  const s = stack.stageOf[idx];
  return s === 0 || s > stage;
}