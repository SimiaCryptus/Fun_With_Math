/** d_eff(k) = 2 + β(k), β = baroclinic energy fraction (§5.3). Diagnostic, not fractal. */
export function effectiveDimension(E, E0) {
  const out = new Float64Array(E.length);
  for (let i = 0; i < E.length; i++) { const b = E[i] > 0 ? 1 - E0[i] / E[i] : 0; out[i] = 2 + (b < 0 ? 0 : b > 1 ? 1 : b); }
  return out;
}