// §5.9 structural learning (M8): greedy axis-aligned splits on uncertain supports.
// Consumes supports only (P6) — never fitted weights.
import { split } from './tree.js';
import { labelPriors } from './solve.js';

const gini = (v, M) => {
  if (!(M > 0)) return 0;
  let s = 0;
  for (const x of v) s += x * x;
  return M - s / M;
};

function sides(it, j, t) {
  const A = it.lo[j], B = it.hi[j];
  if (A >= t) return [0, it.m, false];
  if (B <= t) return [it.m, 0, false];
  const f = (t - A) / (B - A);
  return [it.m * f, it.m * (1 - f), true];
}

function subsample(arr, k) {
  if (arr.length <= k) return arr;
  const out = [];
  for (let q = 0; q < k; q++) out.push(arr[Math.floor(q * arr.length / k)]);
  return out;
}

function candidates(items, j, a, b, maxCand) {
  const v = new Set();
  for (const it of items) for (const x of [it.lo[j], it.hi[j]]) if (x >= a && x <= b) v.add(x);
  const s = [...v].sort((p, q) => p - q);
  const mids = [];
  for (let k = 0; k + 1 < s.length; k++) mids.push((s[k] + s[k + 1]) / 2);
  const ends = s.filter(x => x > a && x < b);
  const half = Math.max(1, Math.floor(maxCand / 2));
  // midpoints first: on exact ties the CART-style threshold wins
  return [...subsample(mids, half), ...subsample(ends, half)];
}

function argmax(v) { let b = 0; for (let c = 1; c < v.length; c++) if (v[c] > v[b]) b = c; return b; }

export function learnTree(obs, d, C, cfg = {}) {
  const crit = cfg.crit || 'S1', dMax = cfg.dMax ?? 6, mLeaf = cfg.mLeaf ?? 5, minGain = cfg.minGain ?? 0;
  const gamma = cfg.gamma ?? 0.05, budget = cfg.fragBudget ?? Infinity, mMin = cfg.mMin ?? 5;
  const maxCand = cfg.maxCand ?? Infinity;
  const domLo = cfg.domLo || new Array(d).fill(0), domHi = cfg.domHi || new Array(d).fill(1);
  const lab = labelPriors(obs, C);
  let frags = obs.length;
  const stats = { nodes: 1, leaves: 0, frags: 0 };

  const dominant = (anc, n, prior) => (n >= mMin ? argmax(anc) : argmax(prior));

  const scoreS1 = (items, j, t) => {
    const P = new Float64Array(C), Lv = new Float64Array(C), Rv = new Float64Array(C);
    let M = 0, ML = 0, MR = 0, ns = 0;
    for (const it of items) {
      const [l, r, s] = sides(it, j, t), v = lab[it.i];
      if (s) ns++;
      M += it.m; ML += l; MR += r;
      for (let c = 0; c < C; c++) { P[c] += it.m * v[c]; Lv[c] += l * v[c]; Rv[c] += r * v[c]; }
    }
    if (!(ML > 0) || !(MR > 0)) return null;
    return { score: gini(P, M) - gini(Lv, ML) - gini(Rv, MR), ns };
  };

  const scoreS3 = (items, j, t) => {
    const side = [0, 1].map(() => ({ anc: new Float64Array(C), n: 0, prior: new Float64Array(C), M: 0 }));
    const par = { anc: new Float64Array(C), n: 0, prior: new Float64Array(C) };
    const parts = [];
    let ns = 0;
    for (const it of items) {
      const [l, r, s] = sides(it, j, t), v = lab[it.i], Y = obs[it.i].Y, single = (Y & (Y - 1)) === 0;
      if (s) ns++;
      parts.push([l, r, Y]);
      if (it.whole && single) { par.anc[Math.log2(Y)]++; par.n++; }
      for (let c = 0; c < C; c++) par.prior[c] += it.m * v[c];
      [l, r].forEach((m, k) => {
        if (!(m > 0)) return;
        const S = side[k];
        S.M += m;
        for (let c = 0; c < C; c++) S.prior[c] += m * v[c];
        if (!s && it.whole && single) { S.anc[Math.log2(Y)]++; S.n++; }
      });
    }
    if (!(side[0].M > 0) || !(side[1].M > 0)) return null;
    const dp = dominant(par.anc, par.n, par.prior);
    const ds = side.map(S => dominant(S.anc, S.n, S.prior));
    let aP = 0, aL = 0, aR = 0;
    for (const [l, r, Y] of parts) {
      if (!(Y & (1 << dp))) aP += l + r;
      if (!(Y & (1 << ds[0]))) aL += l;
      if (!(Y & (1 << ds[1]))) aR += r;
    }
    return { score: (aP - aL - aR) / (1 + gamma * ns), ns };
  };
  const scoreFn = crit === 'S3' ? scoreS3 : scoreS1;

  const rec = (items, lo, hi, depth) => {
    let M = 0;
    for (const it of items) M += it.m;
    if (M < mLeaf || depth >= dMax) { stats.leaves++; return null; }
    let best = null;
    for (let j = 0; j < d; j++) {
      for (const t of candidates(items, j, lo[j], hi[j], maxCand)) {
        if (!(t > lo[j] && t < hi[j])) continue;
        const r = scoreFn(items, j, t);
        if (!r || frags + r.ns > budget) continue;
        if (!best || r.score > best.score) best = { j, t, score: r.score, ns: r.ns };
      }
    }
    if (!best || !(best.score > minGain)) { stats.leaves++; return null; }
    frags += best.ns;
    const { j, t } = best, L = [], R = [];
    for (const it of items) {
      const A = it.lo[j], B = it.hi[j];
      if (A >= t) R.push(it);
      else if (B <= t) L.push(it);
      else {
        const f = (t - A) / (B - A);
        const lh = it.hi.slice(); lh[j] = t;
        const rl = it.lo.slice(); rl[j] = t;
        L.push({ i: it.i, lo: it.lo, hi: lh, m: it.m * f, whole: false });
        R.push({ i: it.i, lo: rl, hi: it.hi, m: it.m * (1 - f), whole: false });
      }
    }
    stats.nodes += 2;
    const lhi = hi.slice(); lhi[j] = t;
    const rlo = lo.slice(); rlo[j] = t;
    return split(j, t, rec(L, lo, lhi, depth + 1), rec(R, rlo, hi, depth + 1));
  };

  const items = obs.map((o, i) => ({ i, lo: o.lo.slice(), hi: o.hi.slice(), m: 1, whole: true }));
  const spec = rec(items, domLo.slice(), domHi.slice(), 0);
  stats.frags = frags;
  return { spec, stats };
}