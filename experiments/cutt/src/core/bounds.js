// §5.6 BOUNDS: ensemble envelope (inner) and local convex envelope
// (per-observation budget, exponential tilt + bisection on nu).
// Neither is a certified global bound.
import { leafStats, fragLik, labelPriors } from './solve.js';
import { maxFrags } from './compile.js';

export function bounds(T, prob, prm, opts, ens) {
  const n = T.n, C = prob.C, beta = prm.beta, loo = opts.loo !== false;
  const eLo = new Float64Array(n).fill(1), eHi = new Float64Array(n);
  for (const th of ens) for (let f = 0; f < n; f++) {
    if (th.w[f] < eLo[f]) eLo[f] = th.w[f];
    if (th.w[f] > eHi[f]) eHi[f] = th.w[f];
  }
  const lLo = eLo.slice(), lHi = eHi.slice();
  const evidence = new Float64Array(T.N);
  const pri = labelPriors(prob.obs, C);
  const M = maxFrags(T), lg = new Float64Array(M), u = new Float64Array(M), tw = new Float64Array(M);
  const fin = Number.isFinite(beta);
  for (const th of ens) {
    const st = leafStats(T, th.w, pri, C);
    for (let i = 0; i < T.N; i++) {
      const s = T.start[i], e = T.start[i + 1], m = e - s;
      fragLik(T, st, i, th.w, pri, prob.obs[i].Y, C, prm.dirAlpha, loo, lg, null);
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k < m; k++) { mn = Math.min(mn, lg[k]); mx = Math.max(mx, lg[k]); }
      evidence[i] = Math.max(evidence[i], mx - mn);
      if (m === 1 || !fin) continue;
      for (let k = 0; k < m; k++) u[k] = Math.log(T.pi[s + k]) + lg[k] / beta;
      const J = wv => {
        let v = 0;
        for (let k = 0; k < m; k++) if (wv[k] > 0) v += wv[k] * (-lg[k]) + beta * wv[k] * Math.log(wv[k] / T.pi[s + k]);
        return v;
      };
      const budget = J(th.w.subarray(s, e)) + prm.epsBar;
      const tilt = (kk, nu) => {
        let mx2 = -Infinity;
        for (let k = 0; k < m; k++) { tw[k] = u[k] + (k === kk ? nu : 0); if (tw[k] > mx2) mx2 = tw[k]; }
        let z = 0;
        for (let k = 0; k < m; k++) { tw[k] = Math.exp(tw[k] - mx2); z += tw[k]; }
        for (let k = 0; k < m; k++) tw[k] /= z;
        return tw;
      };
      const ext = (kk, sign) => {
        const B = 60 * sign;
        if (J(tilt(kk, B)) <= budget) return tw[kk];
        let a = 0, b = B;
        for (let it = 0; it < 50; it++) {
          const mid = 0.5 * (a + b);
          if (J(tilt(kk, mid)) <= budget) a = mid; else b = mid;
        }
        tilt(kk, a);
        return tw[kk];
      };
      for (let k = 0; k < m; k++) {
        const f = s + k;
        const hv = ext(k, 1), lv = ext(k, -1);
        if (hv > lHi[f]) lHi[f] = hv;
        if (lv < lLo[f]) lLo[f] = lv;
      }
    }
  }
  for (let f = 0; f < n; f++) {
    lLo[f] = Math.max(0, lLo[f]); lHi[f] = Math.min(1, lHi[f]);
  }
  return { eLo, eHi, lLo, lHi, evidence, certified: false };
}