/**
 * Composite score (§6.8). Normalizers are published constants, NOT session ranges.
 * Bump WEIGHTS_VERSION whenever any constant here changes.
 */
export const WEIGHTS_VERSION = 'v2';
export const WEIGHTS = { lyapunov: 0.25, entropy: 0.15, infoLoss: 0.20, rewind: 0.20, breadth: 0.20 };
export const NORMALIZERS = {
  lyapunov: 2.0,          // λ reference, units of U₀/Ly
  entropy: 1.0,           // √(Ĥ_ω · Ĥ_angle), both already ∈ [0,1]
  infoLoss: 1.0,          // 1 − Î
  rewind: 1.0,            // D_rev relative L2 (1 = fully decorrelated)
  breadth: 1.5,           // decades of k with |Π| > 10% of max, +0.5 if both signs present
  Qmin: 0.3,              // throughput gate: mean outlet u / U₀
  epsDiv: 5e-2,           // ‖∇·u‖∞·hx/U₀ above this invalidates the run
  resolutionRatio: 0.5,   // P·hx²/Z above this ⇒ under-resolved flag (calibration constant)
};
export const DEFINITIONS = {
  lyapunov: 'Finite-time Lyapunov exponent λ from a twin solver perturbed by δ₀=1e-6, renormalized every T_r=32 steps; normalized by ' + NORMALIZERS.lyapunov + ' U₀/Ly.',
  entropy: 'Geometric mean of the Shannon entropy of log|ω| (256 bins, fixed range) and of the velocity-direction histogram (64 bins), analysis window only.',
  infoLoss: '1 − Î, where Î is inlet-band→outlet-band mutual information (16 bands, flux-weighted, bits / log₂16).',
  rewind: 'D_rev = ‖u_rewound − u₀‖₂/‖u₀‖₂ after N forward steps, velocity negation with 1/Re→0, and N reversed steps.',
  breadth: 'Decades of wavenumber over which |Π(k)| exceeds 10% of its maximum, plus 0.5 when forward and inverse flux coexist (split cascade).',
};
export function breadthFromFlux(k, Pi) {
  let m = 0; for (let i = 1; i < Pi.length; i++) m = Math.max(m, Math.abs(Pi[i]));
  if (!(m > 0)) return 0;
  let kmin = Infinity, kmax = 0, cnt = 0, pos = false, neg = false;
  for (let i = 1; i < Pi.length; i++) if (Math.abs(Pi[i]) > 0.1 * m) { cnt++; kmin = Math.min(kmin, k[i]); kmax = Math.max(kmax, k[i]); if (Pi[i] > 0) pos = true; else neg = true; }
  return (cnt > 1 ? Math.log10(kmax / kmin) : 0) + (pos && neg ? 0.5 : 0);
}
/** @returns {{score:number, parts:Record<string,number>, weights:Record<string,number>, flags:string[], valid:boolean, gate:number}} */
export function composite(raw, opts = {}) {
  const N = NORMALIZERS, parts = {}, c01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x), fin = (x) => x != null && Number.isFinite(x);
  if (fin(raw.lambda)) parts.lyapunov = c01(raw.lambda / N.lyapunov);
  if (fin(raw.Hw)) parts.entropy = c01(Math.sqrt(Math.max(0, raw.Hw) * Math.max(0, fin(raw.Hang) ? raw.Hang : raw.Hw)) / N.entropy);
  if (fin(raw.I)) parts.infoLoss = c01((1 - raw.I) / N.infoLoss);
  if (fin(raw.Drev)) parts.rewind = c01(raw.Drev / N.rewind);
  if (fin(raw.breadth)) parts.breadth = c01(raw.breadth / N.breadth);
  let wsum = 0; for (const k in parts) wsum += WEIGHTS[k];
  const weights = {}; let s = 0;
  for (const k in parts) { weights[k] = wsum > 0 ? WEIGHTS[k] / wsum : 0; s += weights[k] * parts[k]; }
  const Q = fin(raw.Q) ? raw.Q : 1, gate = Math.min(1, Q / N.Qmin);
  const flags = [];
  if (opts.settled === false) flags.push('settling');
  if (!('lyapunov' in parts)) flags.push('noTwin');
  if (!('rewind' in parts)) flags.push('noRewind');
  if (fin(raw.divNorm) && raw.divNorm > N.epsDiv) flags.push('diverged');
  if (fin(raw.P) && raw.Z > 0 && fin(raw.hx) && raw.P * raw.hx * raw.hx / raw.Z > N.resolutionRatio) flags.push('unresolved');
  if (Q < N.Qmin) flags.push('lowThroughput');
  return { score: wsum > 0 ? 100 * s * gate : 0, parts, weights, gate, flags, valid: !flags.includes('diverged') && !flags.includes('settling'), weightsVersion: WEIGHTS_VERSION };
}
export function scoreString(res, meta = {}) {
  return `S=${res.score.toFixed(1)} (w:${WEIGHTS_VERSION}, solver:${meta.solverVersion || '?'}, tier:${meta.tier || '?'}${meta.tierOverride ? '*' : ''}, precision:${meta.precision || 'f32'})`;
}