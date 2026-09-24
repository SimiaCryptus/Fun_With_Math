// §11.3 — "Rounding MUST be round-half-to-even."
// This is the ONLY rounding primitive in the codebase. Math.round is banned
// everywhere under src/{core,dsp,enc,dec,container}: it rounds half AWAY from
// zero for positives and TOWARD zero for negatives, which is neither
// half-even nor even symmetric.
export function roundHalfEven(x) {
  if (!Number.isFinite(x)) return x;
  const f = Math.floor(x);
  const d = x - f;
  let r;
  if (d > 0.5) r = f + 1;
  else if (d < 0.5) r = f;
  else r = (f % 2 === 0) ? f : f + 1;
  // preserve signed zero so that roundHalfEven(-0.5) === -0
  return r === 0 ? 0 * Math.sign(x) : r;
}