// Hyperparameter presets (plan §4.9).
// Tuning note: with the family-wise level alpha/(L*C), the Clopper–Pearson
// upper bound for 0 observed counts is 1 - (alpha')^(1/n). With tau = 0.05 a
// leaf needs ~100 anchors before it can exclude anything, which makes the
// hard layer inert on demo-sized data. tau_excl was raised accordingly;
// robustness to label noise is still governed by tau and m_min (E9).
const COMMON = {
  maxIter: 300, tol: 1e-6, deltaD: 0.02, deltaEnv: 0.01, maxTheories: 6,
  leakThr: 0.05, G: 0, maxSweeps: 50,
   // structural learning (M8)
   mLeaf: 5, minGain: 0.5, gamma: 0.05, maxCand: 64, deltaV: 0.5, maxRebuilds: 5,
};

export const PRESETS = {
  strict: { ...COMMON, mMin: 8, alphaExcl: 0.01, tauExcl: 0.15, kProp: 1, beta: 2, epsBar: 0.01,
    lambdaGrid: [0.5, 1, 2, 4, 8], kappaF: 0.05, kappaR: 0.05, kappaU: 0.3, dirAlpha: 1, eta: 0.5, restarts: 8 },
  balanced: { ...COMMON, mMin: 5, alphaExcl: 0.05, tauExcl: 0.3, kProp: 2, beta: 1, epsBar: 0.02,
    lambdaGrid: [0.5, 1, 2, 4, 8, 16], kappaF: 0.1, kappaR: 0.1, kappaU: 0.2, dirAlpha: 1, eta: 0.5, restarts: 8 },
  exploratory: { ...COMMON, mMin: 3, alphaExcl: 0.1, tauExcl: 0.4, kProp: 3, beta: 1, epsBar: 0.05,
    lambdaGrid: [0.5, 1, 2, 4, 8, 16, 32], kappaF: 0.15, kappaR: 0.15, kappaU: 0.1, dirAlpha: 0.5, eta: 0.7, restarts: 16 },
};

export function resolvePreset(name, overrides = {}) {
  const p = { ...(PRESETS[name] || PRESETS.balanced) };
  for (const [k, v] of Object.entries(overrides || {})) {
    if (v === '' || v === null || v === undefined) continue;
    p[k] = v === 'inf' ? Infinity : v;
  }
  return p;
}