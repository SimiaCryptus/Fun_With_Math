// Evaluation metrics (§8.2) on fixed evaluation cells, and oracle B6-T.
// This module reads latent truth; src/core never does.
import { logVolume, containsPoint } from '../core/box.js';
import { compileObs } from '../core/compile.js';
import { spreadBox, cellIndexOf } from '../core/cells.js';

const gridOf = run => run.prm.G || (run.prob.d === 2 ? 8 : 6);

function cellMasses(T, i, w, G, d) {
  const cm = new Map();
  for (let f = T.start[i]; f < T.start[i + 1]; f++) {
    if (w[f] <= 0) continue;
    spreadBox(T.lo[f], T.hi[f], w[f], G, d, (c, v) => cm.set(c, (cm.get(c) || 0) + v));
  }
  return cm;
}

export function oracleB6T(run) {
  const { prob, tree, evalRec, scn, p } = run;
  const d = prob.d, G = gridOf(run), k = d === 2 ? 10 : 5;
  const res = new Float64Array(prob.obs.length);
  prob.obs.forEach((o, i) => {
    const frs = compileObs(tree, o.lo0, o.hi0);
    const tc = cellIndexOf(evalRec.xStar[i], G);
    let tot = 0, tcm = 0;
    for (const fr of frs) {
      const nd = [];
      for (let j = 0; j < d; j++) if (fr.hi[j] - fr.lo[j] > 1e-12) nd.push(j);
      let acc = 0, cnt = 0;
      const x = fr.lo.slice();
      const rec = q => {
        if (q === nd.length) {
          let lik = 0;
          for (let c = 0; c < prob.C; c++) if ((o.Y >> c) & 1) lik += scn.labelProb(x, c, p);
          acc += scn.density(x, p) * lik; cnt++;
          return;
        }
        const j = nd[q];
        for (let s = 0; s < k; s++) { x[j] = fr.lo[j] + (s + 0.5) / k * (fr.hi[j] - fr.lo[j]); rec(q + 1); }
      };
      rec(0);
      const mass = (acc / cnt) * Math.exp(logVolume(fr.lo, fr.hi));
      tot += mass;
      spreadBox(fr.lo, fr.hi, mass, G, d, (c, v) => { if (c === tc) tcm += v; });
    }
    res[i] = tot > 0 ? tcm / tot : 0;
  });
  return res;
}

export function computeMetrics(run, mask = null) {
  const { table: T, prob, evalRec } = run;
  const d = prob.d, G = gridOf(run);
  const th = run.theories ? run.theories[0] : null;
  const w = th ? th.w : T.pi;
  const env = run.bnd ? (run.envMode === 'ensemble' ? run.bnd.eHi : run.bnd.lHi) : null;
  const oracle = run.oracle || (run.oracle = oracleB6T(run));
  let n = 0, sumLog = 0, frac = 0, b5 = 0, b5f = 0, orc = 0, orf = 0, fe = 0, igS = 0, igW = 0, igN = 0, tight = 0, m5f = 0, m5e = 0;
  const feDepth = {};
  const bins = Array.from({ length: 10 }, () => ({ m: 0, h: 0, n: 0 }));
  for (let i = 0; i < T.N; i++) {
    if (mask && !mask[i]) continue;
    n++;
    const o = prob.obs[i], x = evalRec.xStar[i], tc = cellIndexOf(x, G);
    const cm = cellMasses(T, i, w, G, d);
    const m = cm.get(tc) || 0;
    sumLog += Math.log(Math.max(m, 1e-12));
    if (m >= 0.5) frac++;
    let pb = 0;
    spreadBox(o.lo0, o.hi0, 1, G, d, (c, v) => { if (c === tc) pb += v; });
    b5 += Math.log(Math.max(pb, 1e-12)); if (pb >= 0.5) b5f++;
    orc += Math.log(Math.max(oracle[i], 1e-12)); if (oracle[i] >= 0.5) orf++;
    let best = -1, bv = -1;
    for (const [c, v] of cm) {
      const b = Math.min(9, Math.floor(v * 10));
      bins[b].m += v; bins[b].h += c === tc ? 1 : 0; bins[b].n++;
      if (v > bv) { bv = v; best = c; }
    }
    if (bv >= 0.9 && best !== tc) m5f++;
    if (env) {
      let ub = 0;
      for (let f = T.start[i]; f < T.start[i + 1]; f++) spreadBox(T.lo[f], T.hi[f], env[f], G, d, (c, v) => { if (c === tc) ub += v; });
      if (ub < 0.1) m5e++;
    }
    const s0 = logVolume(o.lo0, o.hi0), s1 = logVolume(o.lo, o.hi);
    tight += 1 - Math.exp(s1 - s0);
    if (!containsPoint(o.lo, o.hi, x)) {
      fe++;
      const dp = run.sup ? run.sup.provDepth[i] : -1;
      const key = dp >= 0 ? `depth ≤ ${dp}` : 'none';
      feDepth[key] = (feDepth[key] || 0) + 1;
    } else {
      let wf = 0, lv = 0;
      for (let f = T.start[i]; f < T.start[i + 1]; f++) {
        if (containsPoint(T.lo[f], T.hi[f], x)) { wf = w[f]; lv = logVolume(T.lo[f], T.hi[f]); break; }
      }
      igS += s0 - s1;
      igW += Math.log(Math.max(wf, 1e-12)) - lv + s1;
      igN++;
    }
  }
  let ece = 0, tot = 0;
  for (const b of bins) tot += b.n;
  for (const b of bins) if (b.n) ece += (b.n / tot) * Math.abs(b.m / b.n - b.h / b.n);
  const accepted = run.ch ? run.ch.curve.filter(r => r.accepted) : [];
  return {
    n, m2a: sumLog / n, m2aFrac: frac / n, b5: b5 / n, b5Frac: b5f / n, oracle: orc / n, oracleFrac: orf / n,
    ig: (igS + igW) / Math.max(1, igN), igS: igS / Math.max(1, igN), igW: igW / Math.max(1, igN),
    tight: tight / n, falseExcl: fe / n, feDepth, m5fit: m5f / n, m5env: env ? m5e / n : NaN, ece,
    rel: bins.map((b, k) => ({ x: (k + 0.5) / 10, mean: b.n ? b.m / b.n : NaN, freq: b.n ? b.h / b.n : NaN, n: b.n })),
    nTheories: run.theories ? run.theories.length : 0,
    maxPd: accepted.length ? Math.max(...accepted.map(r => r.pd)) : 0,
  };
}

// Confidence / M5 / true-cell mass along the SOLVE trajectory of theta0 (E6).
export function iterationMetrics(run) {
  const th = run.theories && run.theories[0];
  if (!th || !th.snaps) return null;
  const { table: T, prob, evalRec } = run;
  const d = prob.d, G = gridOf(run);
  const step = Math.max(1, Math.ceil(th.snaps.length / 80));
  const out = [];
  for (let s = 0; s < th.snaps.length; s += step) {
    const w = th.snaps[s].w;
    let truth = 0, conf = 0, m5 = 0;
    for (let i = 0; i < T.N; i++) {
      const cm = cellMasses(T, i, w, G, d), tc = cellIndexOf(evalRec.xStar[i], G);
      let bv = -1, best = -1;
      for (const [c, v] of cm) if (v > bv) { bv = v; best = c; }
      truth += cm.get(tc) || 0; conf += bv;
      if (bv >= 0.9 && best !== tc) m5++;
    }
    out.push({ iter: th.snaps[s].iter, truth: truth / T.N, conf: conf / T.N, m5: m5 / T.N });
  }
  return out;
}