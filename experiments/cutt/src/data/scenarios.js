// Scenario registry (plan §6). Generators know the truth; herdInit uses only supports.
import { gridSpec, split } from '../core/tree.js';
import { normal } from '../core/rng.js';
import { ST } from '../core/status.js';

const Q = [0.25, 0.5, 0.75];
const xor2 = x => ((x[0] > 0.5) !== (x[1] > 0.5) ? 1 : 0);
const parity3 = x => ((x[0] > 0.5) + (x[1] > 0.5) + (x[2] > 0.5)) % 2;
const circle = x => ((x[0] - 0.5) ** 2 + (x[1] - 0.5) ** 2 < 0.09 ? 1 : 0);
const noisy = (t, c, C, r) => (c === t ? 1 - r : r / (C - 1));
const clip01 = v => Math.min(1, Math.max(0, v));
const unifGen = (d, lab) => (rng, p) => {
  const X = [], y = [];
  for (let i = 0; i < p.N; i++) { const x = Array.from({ length: d }, () => rng()); X.push(x); y.push(lab(x)); }
  return { X, y };
};
const gauss = (v, m, s) => Math.exp(-0.5 * ((v - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

function xorChecks(run) {
  const m = run.metrics(), p = run.p, out = [];
  if (p.noise === 0) out.push(['M4 = 0 (no false exclusion)', m.falseExcl === 0]);
  out.push(['M2b > 0 (latent information gain)', m.ig > 0]);
  out.push(['true-cell mass above B5', m.m2a > m.b5]);
  out.push(['true-cell mass ≤ B6-T + tol', m.m2a <= m.oracle + 0.15]);
  if (p.width <= 0.15) out.push(['one theory at small width', m.nTheories === 1]);
  out.push(['M5 (fitted) low', m.m5fit < 0.05]);
  return out;
}
function learnedChecks(run) {
   const m = run.metrics(), out = [];
   if (run.p.noise === 0) out.push(['M4 = 0 (no false exclusion)', m.falseExcl === 0]);
   out.push(['M2b > 0 (latent information gain)', m.ig > 0]);
   out.push(['fragment budget respected', run.table.n <= run.p.fragBudget * run.table.N + 1e-9]);
   out.push(['§7 invariants hold', run.violations.length === 0]);
   return out;
}


function xorBase(id, name, maps, extra = {}) {
  return {
    id, name, maps, d: 2, C: 2,
    defaults: { N: 600, width: 0.1, anchorFloor: 0.15 },
    tree: () => gridSpec(2, [Q, Q]),
    generate: unifGen(2, xor2),
    density: () => 1,
    labelProb: (x, c, p) => noisy(xor2(x), c, 2, p.noise),
    corruption: p => ({ widths: p.asym ? [p.width, p.width * 0.25] : [p.width, p.width], anchorFloor: p.anchorFloor, partial: p.partial, noise: p.noise }),
    checks: xorChecks,
    ...extra,
  };
}

function spanningHerd(T, obs) {
  const w = Float64Array.from(T.pi);
  for (let i = 0; i < T.N; i++) {
    const o = obs[i];
    if (!(o.lo[0] <= 0.25 && o.hi[0] >= 0.75)) continue;
    let z = 0;
    for (let f = T.start[i]; f < T.start[i + 1]; f++) { w[f] = T.pi[f] * (T.hi[f][0] <= 0.5 ? 1 : 1e-6); z += w[f]; }
    for (let f = T.start[i]; f < T.start[i + 1]; f++) w[f] /= z;
  }
  return w;
}

const modes = {
  d: 2, C: 2,
  tree: () => split(0, 0.5, split(1, 0.5), split(1, 0.5)),
  generate(rng, p) {
    const X = [], y = [], spanning = [];
    for (let i = 0; i < p.N; i++) {
      const mode = rng() < 0.5 ? 0.25 : 0.75;
      const x = [clip01(mode + 0.06 * normal(rng)), rng()];
      X.push(x);
      y.push(p.control ? xor2(x) : (x[1] > 0.5 ? 1 : 0));
      spanning.push(rng() < p.spanFrac);
    }
    return { X, y, spanning };
  },
  density: x => 0.5 * (gauss(x[0], 0.25, 0.06) + gauss(x[0], 0.75, 0.06)),
  labelProb: (x, c, p) => noisy(p.control ? xor2(x) : (x[1] > 0.5 ? 1 : 0), c, 2, p.noise),
  corruption: p => ({
    widths: [p.width, p.width], anchorFloor: p.anchorFloor, partial: p.partial, noise: p.noise,
    override: (i, gen, rng) => {
      if (!gen.spanning[i]) return null;
      const x = gen.X[i];
      const lo1 = x[1] - 0.04 * rng();
      return [[Math.min(x[0], 0.05 + 0.1 * rng()), lo1], [Math.max(x[0], 0.85 + 0.1 * rng()), lo1 + 0.04]];
    },
  }),
  herdInit: spanningHerd,
};

export const SCENARIOS = {
  S0: xorBase('S0', 'Exact data', 'E0', {
    defaults: { N: 300, width: 0, anchorFloor: 0, partial: 0, noise: 0 },
    narrative: 'Degenerate intervals, singleton labels. Everything must reduce to an ordinary tree: one fragment per observation, no contraction, one theory.',
    checks(run) {
      const T = run.table;
      let one = true;
      for (let i = 0; i < T.N; i++) if (T.start[i + 1] - T.start[i] !== 1) one = false;
      return [
        ['one fragment per observation', one],
        ['SUPPORT SOLVE is a no-op', !run.sup || run.sup.prov.length === 0],
        ['one theory', !run.theories || run.theories.length === 1],
        ['§7 invariants hold', run.violations.length === 0],
      ];
    },
  }),
  S1: xorBase('S1', 'Uncertain XOR', 'E1(a)', {
    narrative: 'XOR with a hand tree at the true thresholds (plus quarter splits). Small widths: faces erode toward the correct quadrant, mass rises there, one theory. Sweep the width to see identifiable → ambiguous → unknowable.',
  }),
  S2: {
    id: 'S2', name: 'Redundant features', maps: 'E2(a)', d: 2, C: 2,
    defaults: { N: 600, width: 0.3, anchorFloor: 0.15, corr: 0.9, offDiag: 0.08, widen: 'both' },
    narrative: 'Label = x > 0.5; y is correlated with x. The tree can express both explanations. In the redundant regime CHALLENGE should find theories that predict alike but put straddling points in different places.',
    tree: () => split(0, 0.5, split(1, 0.5), split(1, 0.5)),
    generate(rng, p) {
      const X = [], y = [];
      const sd = Math.max(0.01, (1 - p.corr) * 0.4);
      let off = 0;
      for (let i = 0; i < p.N; i++) {
        const x = rng();
        const yy = rng() < p.offDiag ? rng() : clip01(x + sd * normal(rng));
        X.push([x, yy]); y.push(x > 0.5 ? 1 : 0);
        if ((x > 0.5) !== (yy > 0.5)) off++;
      }
      return { X, y, info: { occupancy: off / p.N } };
    },
    density(x, p) { const sd = Math.max(0.01, (1 - p.corr) * 0.4); return p.offDiag + (1 - p.offDiag) * gauss(x[1], x[0], sd); },
    labelProb: (x, c, p) => noisy(x[0] > 0.5 ? 1 : 0, c, 2, p.noise),
    corruption: p => ({ widths: p.widen === 'x' ? [p.width, 0.02] : p.widen === 'y' ? [0.02, p.width] : [p.width, p.width], anchorFloor: p.anchorFloor, partial: p.partial, noise: p.noise }),
    checks(run) {
      const m = run.metrics(), out = [];
      if (run.p.corr >= 0.8) {
        out.push(['≥ 2 theories (redundant regime)', m.nTheories >= 2]);
        out.push(['low predictive disagreement', m.maxPd < 0.1]);
      } else out.push(['1 theory (non-redundant regime)', m.nTheories === 1]);
      if (run.status) {
        const T = run.table;
        let a = 0, an = 0, b = 0, bn = 0;
        for (let f = 0; f < T.n; f++) {
          const strad = T.start[T.obs[f] + 1] - T.start[T.obs[f]] > 1;
          const td = run.status.frag[f] === ST.THEORY ? 1 : 0;
          if (strad) { a += td; an++; } else { b += td; bn++; }
        }
        out.push(['Theory-dependent concentrated on straddling fragments', a / Math.max(1, an) >= b / Math.max(1, bn)]);
      }
      return out;
    },
  },
  S3: {
    id: 'S3', name: 'Unidentifiable modes', maps: 'E3', ...modes,
    defaults: { N: 500, width: 0.05, anchorFloor: 0.15, spanFrac: 0.3 },
    narrative: 'Two modes in x. Some boxes span both modes and nothing distinguishes them. The honest answer is: keep mass on both, wide envelopes, Underdetermined. Toggle Control to make x informative.',
    checks(run) {
      const span = run.evalRec.spanning, m = run.metrics(span), out = [];
      out.push(['M5 ≈ 0 for spanning observations', m.m5fit < 0.02]);
      if (run.p.control) out.push(['control set resolves (spanning beat B5)', m.m2a > m.b5]);
      if (run.p.herd) out.push(['herd init: spanning observations not falsely certain', m.m5fit < 0.02]);
      return out;
    },
  },
  S4: {
    id: 'S4', name: 'Self-reinforcement', maps: 'E6 (subset)', ...modes,
    defaults: { N: 400, width: 0.05, anchorFloor: 0.15, spanFrac: 0.4, partial: 0.3, overrides: { maxIter: 400, beta: 0.5 } },
    narrative: 'Long SOLVE runs. Use the stage button "Solve run" with safeguards toggled off (Run all always uses the safe configuration). Watch M5 rise while true-cell mass stays flat: manufactured confidence.',
    checks(run) {
      const it = run.iterMetrics();
      if (!it || it.length < 5) return [['run Solve first', false]];
      const a = it[Math.floor(it.length * 0.8)], b = it[it.length - 1];
      const safe = run.p.loo && !run.p.alternating && !run.p.leak;
      if (safe) return [['safeguarded run plateaus (M5)', Math.abs(b.m5 - a.m5) < 0.02]];
      return [['broken mode: confidence rises without true-cell gain (diagnostic)', b.conf - it[0].conf > b.truth - it[0].truth]];
    },
  },
  S5: {
     id: 'S5', name: 'Circle & fragment blowup', maps: 'E4', d: 2, C: 2, learned: true,
     defaults: { N: 400, width: 0.1, anchorFloor: 0.15, dMax: 5, crit: 'S1', fragBudget: 4, rebuild: true },
     narrative: 'Circular boundary with a learned tree. Deeper trees fit the circle better but shatter boundary observations into more fragments. Compare S1 and S3 (S3 charges for new fragments) and watch fragments/obs.',
     tree: () => null,
     generate: unifGen(2, circle),
     density: () => 1,
     labelProb: (x, c, p) => noisy(circle(x), c, 2, p.noise),
     corruption: p => ({ widths: [p.width, p.width], anchorFloor: p.anchorFloor, partial: p.partial, noise: p.noise }),
     checks: learnedChecks,
  },
  S6: {
    id: 'S6', name: '3D parity', maps: 'E1 in 3D', d: 3, C: 2,
    defaults: { N: 400, width: 0.1, anchorFloor: 0.15 },
    narrative: 'Parity of three half-tests. Observations compile into up to 8 fragments; faces erode in 3D.',
    tree: () => gridSpec(3, [[0.5], [0.5], [0.5]]),
    generate: unifGen(3, parity3),
    density: () => 1,
    labelProb: (x, c, p) => noisy(parity3(x), c, 2, p.noise),
    corruption: p => ({ widths: p.asym ? [p.width, p.width, p.width * 0.25] : [p.width, p.width, p.width], anchorFloor: p.anchorFloor, partial: p.partial, noise: p.noise }),
    checks: xorChecks,
  },
  S7: xorBase('S7', 'Mixed observation types', 'E8 (light)', {
    defaults: { N: 600, width: 0.15, anchorFloor: 0.15 },
    narrative: 'Exact, noisy, censored and missing coordinates in one representation. Inspect a missing coordinate to see its feature-level credible interval.',
    corruption: p => ({ widths: [p.width, p.width], mixed: true, anchorFloor: p.anchorFloor, partial: p.partial, noise: p.noise }),
    checks(run) {
      const m = run.metrics();
      return [['M4 = 0', run.p.noise > 0 || m.falseExcl === 0], ['M2b > 0', m.ig > 0]];
    },
  }),
   S8: xorBase('S8', 'Uncertain XOR (learned tree)', 'E1(b)', {
     learned: true,
     tree: () => null,
     defaults: { N: 600, width: 0.1, anchorFloor: 0.15, dMax: 4, crit: 'S1', fragBudget: 4, rebuild: true },
     narrative: 'XOR with a tree learned from supports (rebuild loop: learn → contract → relearn from contracted supports only, P6).',
     checks: learnedChecks,
   }),
};