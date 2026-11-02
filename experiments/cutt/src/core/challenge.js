// §5.5 CHALLENGE: nearest-theory repulsion inside T_eps.
import { solveRun, meanTV, perturbed } from './solve.js';
import { leafOfPoint } from './tree.js';

export function predGridLeaves(tree, d) {
  const res = d === 2 ? 24 : 8;
  const out = [];
  const rec = (j, x) => {
    if (j === d) { out.push(leafOfPoint(tree, x)); return; }
    for (let k = 0; k < res; k++) rec(j + 1, [...x, (k + 0.5) / res]);
  };
  rec(0, []);
  return Int32Array.from(out);
}

export function predictArgmax(phi, C, leaves) {
  const out = new Int8Array(leaves.length);
  leaves.forEach((l, q) => {
    let b = 0;
    for (let c = 1; c < C; c++) if (phi[l * C + c] > phi[l * C + b]) b = c;
    out[q] = b;
  });
  return out;
}

function predDisagree(a, b) {
  let n = 0;
  for (let q = 0; q < a.length; q++) if (a[q] !== b[q]) n++;
  return n / a.length;
}

export function challenge(T, prob, prm, opts, solveRes, rng, ctx) {
  const { theta0, candidates } = solveRes;
  const F0 = theta0.F, L0 = theta0.L, budget = F0 + T.N * prm.epsBar;
  const C = prob.C, leaves = ctx.gridLeaves;
  const predOf = th => (th.pred ||= predictArgmax(th.phi, C, leaves));
  const minD = (w, ens) => {
    let best = Infinity, near = null;
    for (const th of ens) { const dd = meanTV(T, w, th.w); if (dd < best) { best = dd; near = th; } }
    return { D: best, near };
  };
  const ens = [theta0];
  // distinct restart fixed points within tolerance are candidate theories
  for (const c of candidates) {
    if (c === theta0 || c.F > budget) continue;
    if (minD(c.w, ens).D >= prm.deltaD) ens.push(c);
  }
  const lo = Float64Array.from(theta0.w), hi = Float64Array.from(theta0.w);
  const widen = (w, apply) => {
    let mx = 0;
    for (let f = 0; f < T.n; f++) {
      mx = Math.max(mx, w[f] - hi[f], lo[f] - w[f]);
      if (apply) { if (w[f] > hi[f]) hi[f] = w[f]; if (w[f] < lo[f]) lo[f] = w[f]; }
    }
    return mx;
  };
  for (const th of ens) widen(th.w, true);
  const curve = [];
  let stopReason = 'maxTheories';
  while (ens.length < prm.maxTheories) {
    let best = null;
    for (const lambda of prm.lambdaGrid) {
      for (const s of [0, 1]) {
        const init = s === 0 ? theta0.w : perturbed(T, rng, theta0.w);
        const th = solveRun(T, prob, prm, { ...opts, init, repel: { lambda, ens } });
        const { D, near } = minD(th.w, ens);
        const pd = predDisagree(predOf(th), predOf(near));
        const rec = { round: ens.length, lambda, start: s, D, pd, dF: th.F - F0, dL: th.L - L0, accepted: false, feasible: th.F <= budget };
        curve.push(rec);
        if (th.F <= budget && (!best || D > best.D)) best = { th, D, rec, pd };
      }
    }
    if (!best || best.D < prm.deltaD) { stopReason = 'D below deltaD'; break; }
    if (widen(best.th.w, false) < prm.deltaEnv) { stopReason = 'no envelope widened'; break; }
    best.rec.accepted = true;
    best.th.source = `challenge λ=${best.rec.lambda}`;
    best.th.pd = best.pd;
    ens.push(best.th);
    widen(best.th.w, true);
  }
  return { ensemble: ens, curve, budget, stopReason };
}