// Special functions and log-domain helpers. All "bit" quantities use log2.

export const LN2 = Math.LN2;

export function log2(x) {
  return Math.log(x) / LN2;
}

const LANCZOS_G = 7;
const LANCZOS_P = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Natural log of the gamma function, for x > 0. Lanczos approximation. */
export function lgamma(x) {
  if (x < 0.5) {
    // reflection: Γ(x)Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS_P[0];
  const t = z + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_P[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** log2 of the gamma function. */
export function lgamma2(x) {
  return lgamma(x) / LN2;
}

/** log2 C(n, k), stable for large n. */
export function log2Binom(n, k) {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return (lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)) / LN2;
}

/** log2(2^a + 2^b) without overflow. */
export function logsumexp2(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + log2(Math.pow(2, a - m) + Math.pow(2, b - m));
}

/** Binary entropy in bits; H2(0) = H2(1) = 0. */
export function h2(p) {
  if (p <= 0 || p >= 1) return 0;
  return -(p * log2(p) + (1 - p) * log2(1 - p));
}

/** KL(p || q) in bits for two discrete vectors of equal length. */
export function klBits(p, q) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] <= 0) continue;
    if (q[i] <= 0) return Infinity;
    s += p[i] * log2(p[i] / q[i]);
  }
  return s;
}