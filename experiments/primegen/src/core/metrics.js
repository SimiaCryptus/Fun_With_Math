export const LOG2 = Math.log(2);
const GAMMA = 0.5772156649015329;

/** Marginal entropy (bits) of one prime's alive/dead indicator on Z/pZ. */
export function entropyBits(p) {
  const q = 1 / p, r = 1 - q;
  return -(q * Math.log(q) + r * Math.log(r)) / LOG2;
}

/** Mertens' third theorem: prod_{p<=x}(1-1/p) ~ e^{-gamma}/log x. */
export function mertensAsymptotic(x) {
  return Math.exp(-GAMMA) / Math.log(x);
}

/** Asymptotic size of the marginal entropy increment, log2(p)/p (bits). */
export function entropyIncrementAsymptotic(p) {
  return Math.log2(p) / p;
}