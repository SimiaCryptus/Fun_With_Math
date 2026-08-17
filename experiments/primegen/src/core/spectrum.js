/**
 * Fourier facts used here (all exact, on Z/pZ):
 *
 *   M_p(n) = 1 - [p|n]
 *   \hat M_p(0)   = 1 - 1/p                (the shared DC term)
 *   \hat M_p(m)   = -1/p     for m != 0    (amplitude 1/p on the whole comb)
 *
 * Lifted to Z/L_k Z the nonzero support of M_{p} is { multiples of L_k/p } \ {0},
 * i.e. exactly the rationals of denominator p inside Q/Z -- disjoint across primes.
 */

/** The nonzero comb of one prime: frequencies m/p in Q/Z with amplitude 1/p. */
export function primeComb(p, maxLines = 4096) {
  const step = Math.max(1, Math.ceil((p - 1) / maxLines));
  const freqs = [];
  for (let m = 1; m <= p - 1; m += step) freqs.push({ m, f: m / p });
  return { p, amp: 1 / p, freqs, lines: p - 1, power: (p - 1) / (p * p) };
}

/** DC coefficient of the product S_k = prod M_{p_i}, i.e. the survivor density. */
export function dcTerm(basis) {
  return basis.reduce((a, p) => a * (1 - 1 / p), 1);
}

/**
 * CRT-dual coefficient of S_k at a frequency tuple (m_1..m_k):
 *   C_(m) = prod_i \hat M_{p_i}(m_i)
 */
export function tupleCoefficient(basis, tuple) {
  let v = 1;
  for (let i = 0; i < basis.length; i++) {
    const p = basis[i];
    v *= (tuple[i] % p === 0) ? (1 - 1 / p) : (-1 / p);
  }
  return v;
}

/**
 * Truncated cosine expansion of the divisor indicator:
 *   [p|n] = (1/p) * sum_{m=0}^{p-1} cos(2 pi m n / p)
 * keeping H conjugate harmonic pairs. Exact once H >= floor(p/2).
 */
export function partialDivisorWave(p, n, H) {
  const M = Math.min(H, Math.floor((p - 1) / 2));
  let s = 1;
  const w = (2 * Math.PI * n) / p;
  for (let m = 1; m <= M; m++) s += 2 * Math.cos(w * m);
  if (p % 2 === 0 && H >= p / 2) s += Math.cos(Math.PI * n); // self-conjugate harmonic
  return s / p;
}

/**
 * Interference field over a window:
 *   U_H(n) = sum_{p in basis} partialDivisorWave(p, n, H)
 * plus the exact integer field U(n) = #{p in basis : p | n}.
 */
export function interferenceField(basis, start, count, H) {
  const total = new Float64Array(count);
  const exact = new Int32Array(count);
  const perPrime = basis.map(() => new Float64Array(count));

  for (let i = 0; i < basis.length; i++) {
    const p = basis[i];
    const row = perPrime[i];
    for (let j = 0; j < count; j++) {
      const n = start + j;
      const v = partialDivisorWave(p, n, H);
      row[j] = v;
      total[j] += v;
      if (n % p === 0) exact[j]++;
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < count; j++) { if (total[j] < lo) lo = total[j]; if (total[j] > hi) hi = total[j]; }
  return { total, exact, perPrime, lo, hi };
}

/** Number of harmonics needed for the whole basis to be exact. */
export function harmonicsForExactness(basis) {
  return basis.reduce((m, p) => Math.max(m, Math.floor(p / 2)), 1);
}