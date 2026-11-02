// §5.4 SOLVE: leave-one-out variational EM over a fixed partition.
import { dirichlet } from './rng.js';
import { maxFrags } from './compile.js';

export function labelPriors(obs, C) {
  return obs.map(o => {
    const r = new Float64Array(C);
    let s = 0;
    for (let c = 0; c < C; c++) if ((o.Y >> c) & 1) { r[c] = o.rho ? o.rho[c] : 1; s += r[c]; }
    for (let c = 0; c < C; c++) r[c] /= s;
    return r;
  });
}

export function leafStats(T, w, lab, C) {
  const num = new Float64Array(T.L * C), den = new Float64Array(T.L);
  for (let i = 0; i < T.N; i++) {
    const r = lab[i];
    for (let f = T.start[i]; f < T.start[i + 1]; f++) {
      const l = T.leaf[f], wf = w[f];
      den[l] += wf;
      for (let c = 0; c < C; c++) num[l * C + c] += wf * r[c];
    }
  }
  return { num, den };
}

// log g_{il} (rho-weighted LOO likelihood) and sum_{c in Y} phi^{-i}_l(c).
export function fragLik(T, st, i, w, lab, Y, C, alpha, loo, outLogG, outSum) {
  const s = T.start[i], e = T.start[i + 1], r = lab[i];
  for (let f = s; f < e; f++) {
    const l = T.leaf[f], wf = loo ? w[f] : 0;
    const den = C * alpha + st.den[l] - wf;
    let g = 0, sp = 0;
    for (let c = 0; c < C; c++) {
      if (!((Y >> c) & 1)) continue;
      const ph = (alpha + st.num[l * C + c] - wf * r[c]) / den;
      g += r[c] * ph; sp += ph;
    }
    outLogG[f - s] = Math.log(Math.max(g, 1e-300));
    if (outSum) outSum[f - s] = sp;
  }
}

function updateInto(T, st, i, w, lab, Y, C, prm, loo, rep, lamB, dead, lg, u, out) {
  const s = T.start[i], e = T.start[i + 1], m = e - s;
  if (m === 1) { out[s] = 1; return; }
  fragLik(T, st, i, w, lab, Y, C, prm.dirAlpha, loo, lg, null);
  const fin = Number.isFinite(prm.beta);
  let mx = -Infinity;
  for (let k = 0; k < m; k++) {
    const f = s + k;
    const v = dead && dead[f] ? -Infinity
      : Math.log(T.pi[f]) + (fin ? lg[k] / prm.beta : 0) - (rep ? lamB * rep[f] : 0);
    u[k] = v;
    if (v > mx) mx = v;
  }
  if (mx === -Infinity) { for (let k = 0; k < m; k++) out[s + k] = T.pi[s + k]; return; }
  let z = 0;
  for (let k = 0; k < m; k++) { u[k] = Math.exp(u[k] - mx); z += u[k]; }
  for (let k = 0; k < m; k++) out[s + k] = u[k] / z;
}

// Undamped update for a single observation (used by the LOO-correctness test).
export function updateOne(T, prob, prm, w, i, loo = true) {
  const lab = labelPriors(prob.obs, prob.C);
  const st = leafStats(T, w, lab, prob.C);
  const M = maxFrags(T), out = new Float64Array(T.n);
  updateInto(T, st, i, w, lab, prob.obs[i].Y, prob.C, prm, loo, null, 0, null, new Float64Array(M), new Float64Array(M), out);
  return out.slice(T.start[i], T.start[i + 1]);
}

export function phiFull(T, w, lab, C, alpha) {
  const st = leafStats(T, w, lab, C);
  const phi = new Float64Array(T.L * C);
  for (let l = 0; l < T.L; l++) for (let c = 0; c < C; c++) phi[l * C + c] = (alpha + st.num[l * C + c]) / (C * alpha + st.den[l]);
  return phi;
}

export function meanTV(T, a, b) {
  let s = 0;
  for (let f = 0; f < T.n; f++) s += Math.abs(a[f] - b[f]);
  return s / (2 * T.N);
}

// Post-hoc label read-off (also the alternating-ablation update).
export function readQ(T, prob, prm, w, lab, loo, priors) {
  const C = prob.C, alpha = prm.dirAlpha, st = leafStats(T, w, lab, C), fin = Number.isFinite(prm.beta);
  return prob.obs.map((o, i) => {
    const acc = new Float64Array(C);
    for (let f = T.start[i]; f < T.start[i + 1]; f++) {
      const l = T.leaf[f], wf = loo ? w[f] : 0, den = C * alpha + st.den[l] - wf;
      for (let c = 0; c < C; c++) if ((o.Y >> c) & 1) acc[c] += w[f] * (alpha + st.num[l * C + c] - wf * lab[i][c]) / den;
    }
    const q = new Float64Array(C);
    let z = 0;
    for (let c = 0; c < C; c++) {
      if (!((o.Y >> c) & 1)) continue;
      q[c] = priors[i][c] * (fin ? Math.pow(Math.max(acc[c], 1e-300), 1 / prm.beta) : 1);
      z += q[c];
    }
    for (let c = 0; c < C; c++) q[c] /= z;
    return q;
  });
}

// Free energy F (§5.4) and explanatory loss L, both with LOO statistics.
export function energy(T, prob, prm, w, loo = true) {
  const C = prob.C, pri = labelPriors(prob.obs, C), st = leafStats(T, w, pri, C);
  const M = maxFrags(T), lg = new Float64Array(M), sp = new Float64Array(M);
  const fin = Number.isFinite(prm.beta);
  let F = 0, L = 0;
  for (let i = 0; i < T.N; i++) {
    fragLik(T, st, i, w, pri, prob.obs[i].Y, C, prm.dirAlpha, loo, lg, sp);
    let J = 0, P = 0;
    for (let f = T.start[i], k = 0; f < T.start[i + 1]; f++, k++) {
      const wf = w[f];
      if (wf > 0) {
        J += wf * (-lg[k]);
        if (fin) J += prm.beta * wf * Math.log(wf / T.pi[f]);
      }
      P += wf * sp[k];
    }
    F += J;
    L -= Math.log(Math.max(P, 1e-300));
  }
  return { F, L };
}

export function makeTheory(T, prob, prm, w, loo = true) {
  const { F, L } = energy(T, prob, prm, w, loo);
  return { w, F, L, phi: phiFull(T, w, labelPriors(prob.obs, prob.C), prob.C, prm.dirAlpha) };
}

export function perturbed(T, rng, base) {
  const w = new Float64Array(T.n);
  for (let i = 0; i < T.N; i++) {
    const s = T.start[i], e = T.start[i + 1];
    if (e - s === 1) { w[s] = 1; continue; }
    const a = [];
    for (let f = s; f < e; f++) a.push(2 * (e - s) * base[f] + 0.1);
    const x = dirichlet(rng, a);
    for (let k = 0; k < x.length; k++) w[s + k] = x[k];
  }
  return w;
}

export function solveRun(T, prob, prm, opts = {}) {
  const C = prob.C, eta = prm.eta, loo = opts.loo !== false;
  let w = opts.init ? Float64Array.from(opts.init) : Float64Array.from(T.pi);
  const priors = labelPriors(prob.obs, C);
  let lab = priors;
  const M = maxFrags(T), lg = new Float64Array(M), u = new Float64Array(M);
  const nw = new Float64Array(T.n), dead = opts.leak ? new Uint8Array(T.n) : null;
  const snaps = opts.snapshots ? [{ iter: 0, w: w.slice(), maxTV: NaN }] : null;
  const maxIter = opts.maxIter ?? prm.maxIter;
  const fin = Number.isFinite(prm.beta);
  let it, maxTV = Infinity;
  for (it = 1; it <= maxIter; it++) {
    const st = leafStats(T, w, lab, C);
    let rep = null;
    if (opts.repel) {
      let bd = Infinity;
      for (const th of opts.repel.ens) { const dd = meanTV(T, w, th.w); if (dd < bd) { bd = dd; rep = th.w; } }
    }
    const lamB = opts.repel && fin ? opts.repel.lambda / prm.beta : 0;
    for (let i = 0; i < T.N; i++) updateInto(T, st, i, w, lab, prob.obs[i].Y, C, prm, loo, rep, lamB, dead, lg, u, nw);
    maxTV = 0;
    for (let i = 0; i < T.N; i++) {
      let tv = 0;
      for (let f = T.start[i]; f < T.start[i + 1]; f++) {
        const v = (1 - eta) * w[f] + eta * nw[f];
        tv += Math.abs(v - w[f]);
        w[f] = v;
      }
      if (tv / 2 > maxTV) maxTV = tv / 2;
    }
    if (opts.alternating) lab = readQ(T, prob, prm, w, lab, loo, priors);
    if (opts.leak) {
      // DELIBERATELY BROKEN (violates P1): low fitted mass deletes the fragment.
      for (let i = 0; i < T.N; i++) {
        const s = T.start[i], e = T.start[i + 1];
        if (e - s === 1) continue;
        let z = 0, best = s;
        for (let f = s; f < e; f++) {
          if (w[f] > w[best]) best = f;
          if (!dead[f] && w[f] < prm.leakThr) { dead[f] = 1; w[f] = 0; }
        }
        if (dead[best]) { dead[best] = 0; w[best] = Math.max(w[best], 1e-6); }
        for (let f = s; f < e; f++) z += w[f];
        for (let f = s; f < e; f++) w[f] /= z;
      }
    }
    if (snaps) snaps.push({ iter: it, w: w.slice(), maxTV });
    if (maxTV < prm.tol) break;
  }
  const th = makeTheory(T, prob, prm, w, loo);
  th.iters = Math.min(it, maxIter);
  th.converged = maxTV < prm.tol;
  th.snaps = snaps;
  th.q = readQ(T, prob, prm, w, priors, loo, priors);
  return th;
}

export function solveWithRestarts(T, prob, prm, opts, rng) {
  const runs = [];
  for (let r = 0; r < prm.restarts; r++) {
    const init = r === 0 ? (opts.init || null) : perturbed(T, rng, opts.init || T.pi);
    const th = solveRun(T, prob, prm, { ...opts, init, snapshots: true });
    th.restart = r;
    th.source = 'restart';
    runs.push(th);
  }
  let theta0 = runs[0];
  for (const th of runs) if (th.F < theta0.F) theta0 = th;
  const sorted = [...runs].sort((a, b) => a.F - b.F);
  const candidates = [];
  for (const th of sorted) if (candidates.every(c => meanTV(T, c.w, th.w) > prm.deltaD)) candidates.push(th);
  for (const th of runs) if (th !== theta0) th.snaps = null;
  return { theta0, candidates, runs: runs.map(r => ({ restart: r.restart, F: r.F, L: r.L, iters: r.iters })) };
}