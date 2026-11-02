// Run orchestration. Holds core state; the UI only reads it.
import { SCENARIOS } from './data/scenarios.js';
import { corrupt } from './data/corrupt.js';
import { resolvePreset } from './presets.js';
import { mulberry32 } from './core/rng.js';
import { buildTree } from './core/tree.js';
import { compileAll } from './core/compile.js';
import { supportSolve } from './core/support.js';
import { solveWithRestarts } from './core/solve.js';
import { challenge, predGridLeaves } from './core/challenge.js';
import { bounds } from './core/bounds.js';
import { classify, STATUS } from './core/status.js';
import { checkInvariants } from './core/invariants.js';
import { computeMetrics, iterationMetrics } from './eval/metrics.js';
import { learnTree } from './core/learn.js';
import { logVolume } from './core/box.js';

export const DEFAULT_PARAMS = {
  scenario: 'S1', seed: 1, N: 600, width: 0.1, asym: false, anchorFloor: 0.15, partial: 0, noise: 0,
  corr: 0.9, offDiag: 0.08, widen: 'both', spanFrac: 0.3, control: false, herd: false,
  preset: 'balanced', overrides: {}, loo: true, alternating: false, leak: false,
   dMax: 4, crit: 'S1', fragBudget: 4, rebuild: true,
};

export function paramsForScenario(id, seed = 1) {
  const scn = SCENARIOS[id];
  const d = scn.defaults || {};
  return { ...DEFAULT_PARAMS, ...d, overrides: { ...(d.overrides || {}) }, scenario: id, seed };
}

export class Run {
  constructor(params) {
    this.p = { ...DEFAULT_PARAMS, ...params };
    this.scn = SCENARIOS[this.p.scenario];
    this.prm = resolvePreset(this.p.preset, this.p.overrides);
    const rng = mulberry32(this.p.seed * 7919 + 1);
    const gen = this.scn.generate(rng, this.p);
    const obs = corrupt(gen, this.scn.C, this.scn.corruption(this.p), rng);
    this.prob = { d: this.scn.d, C: this.scn.C, obs };
    this.evalRec = { xStar: gen.X, yStar: gen.y, spanning: gen.spanning || null, info: gen.info || {} };
     this.base = null;
     this.rebuildLog = null;
     this.tree = this.scn.learned ? this.learnFrom(obs) : buildTree(this.scn.tree(this.p), this.scn.d);
    this.rng = mulberry32(this.p.seed * 104729 + 7);
    this.envMode = 'local';
    this.violations = [];
    this.safe = false;
    this.compile();
  }

  get broken() { return !this.p.loo || this.p.alternating || this.p.leak; }
   learnCfg() {
     const p = this.p, prm = this.prm;
     return { crit: p.crit, dMax: p.dMax, mLeaf: prm.mLeaf, minGain: prm.minGain, gamma: prm.gamma,
       fragBudget: p.fragBudget * this.prob.obs.length, mMin: prm.mMin, maxCand: prm.maxCand };
   }
   // Learns from supports only (P6). `obs` entries supply current lo/hi.
   learnFrom(obs) {
     const { spec, stats } = learnTree(obs, this.scn.d, this.scn.C, this.learnCfg());
     this.learnStats = stats;
     this.gridLeaves = null;
     return buildTree(spec, this.scn.d);
   }
   tightening() {
     let s = 0;
     for (const o of this.prob.obs) s += 1 - Math.exp(logVolume(o.lo, o.hi) - logVolume(o.lo0, o.hi0));
     return s;
   }
   // §5.9 support-driven rebuild loop: learn, contract, relearn from contracted supports.
   rebuild() {
     if (!this.scn.learned) return;
     const obs = this.prob.obs;
     for (const o of obs) { o.lo = o.lo0.slice(); o.hi = o.hi0.slice(); }
     this.tree = this.learnFrom(obs);
     this.rebuildLog = [];
     let v = 0;
     for (let k = 0; k < this.prm.maxRebuilds; k++) {
       supportSolve(this.tree, obs, this.prob.C, this.prm);
       const v2 = this.tightening();
       this.rebuildLog.push({ iter: k, tree: this.tree.id, leaves: this.tree.leaves.length, tightening: v2 });
       if (Math.abs(v2 - v) < this.prm.deltaV) break;
       v = v2;
       this.tree = this.learnFrom(obs);
     }
     this.base = obs.map(o => [o.lo.slice(), o.hi.slice()]);
     this.oracle = null;
     this.compile();
   }


  opts() {
    if (this.safe) return { loo: true, alternating: false, leak: false };
    return { loo: this.p.loo, alternating: this.p.alternating, leak: this.p.leak };
  }

  reset(from) {
    const order = ['sup', 'sol', 'ch', 'bnd'];
    for (const k of order.slice(order.indexOf(from))) this[k] = null;
    if (order.indexOf(from) <= 1) this.theories = null;
    this.status = null;
    this._iter = null;
  }

  compile() {
     this.prob.obs.forEach((o, i) => {
       const b = this.base ? this.base[i] : null;
       o.lo = (b ? b[0] : o.lo0).slice(); o.hi = (b ? b[1] : o.hi0).slice();
     });
    this.rawTable = compileAll(this.tree, this.prob.obs);
    this.table = this.rawTable;
     const raw = compileAll(this.tree, this.prob.obs.map(o => ({ lo: o.lo0, hi: o.hi0 })));
    this.rawSingle = new Uint8Array(this.table.N);
     for (let i = 0; i < raw.N; i++) this.rawSingle[i] = raw.start[i + 1] - raw.start[i] === 1 ? 1 : 0;
    this.reset('sup');
    this.stage = 'compiled';
    this.guard();
  }

  support(single = false) {
    if (single && this.sup && this.sup.converged) return;
    if (!single) this.compile();
    const res = supportSolve(this.tree, this.prob.obs, this.prob.C, this.prm, { singleSweep: single });
    if (single && this.sup) {
      // accumulate single-sweep stepping into one history
      res.prov = this.sup.prov.concat(res.prov.map(p => ({ ...p, sweep: p.sweep + this.sup.sweeps })));
      res.snaps = this.sup.snaps.concat(res.snaps.slice(1));
      res.sweeps += this.sup.sweeps;
      res.excl = res.excl.map((v, l) => v | this.sup.excl[l]);
    }
    this.sup = res;
    this.table = res.table;
    this.reset('sol');
    this.stage = 'support';
    this.guard();
  }

  solve() {
    const opts = this.opts();
    if (this.p.herd && this.scn.herdInit) opts.init = this.scn.herdInit(this.table, this.prob.obs);
    this.sol = solveWithRestarts(this.table, this.prob, this.prm, opts, this.rng);
    this.theories = [this.sol.theta0];
    this.reset('ch');
    this.stage = 'solved';
    this.guard();
  }

  challenge() {
    if (!this.sol) this.solve();
    this.gridLeaves ||= predGridLeaves(this.tree, this.prob.d);
    this.ch = challenge(this.table, this.prob, this.prm, this.opts(), this.sol, this.rng, { gridLeaves: this.gridLeaves });
    this.theories = this.ch.ensemble;
    this.bnd = null; this.status = null;
    this.stage = 'challenged';
    this.guard();
  }

  bounds() {
    if (!this.theories) this.solve();
    this.bnd = bounds(this.table, this.prob, this.prm, this.opts(), this.theories);
    this.classify();
    this.stage = 'bounded';
  }

  classify() {
    if (this.bnd) this.status = classify(this.table, this.rawSingle, this.theories, this.bnd, this.prm, this.envMode);
  }

  runAll() {
    this.safe = true; // broken ablations are excluded from Run all
     try {
       if (this.scn.learned && this.p.rebuild && !this.base) this.rebuild();
       this.compile(); this.support(); this.solve(); this.challenge(); this.bounds();
     }
    finally { this.safe = false; }
    return this;
  }

  metrics(mask = null) { return computeMetrics(this, mask); }
  iterMetrics() { return this._iter || (this._iter = iterationMetrics(this)); }
  checks() { return this.scn.checks(this); }

  guard() {
    this.violations.push(...checkInvariants({ table: this.table, obs: this.prob.obs, theories: this.theories }));
  }

  statusFractions() {
    if (!this.status) return null;
    const c = new Array(STATUS.length).fill(0);
    for (const s of this.status.obs) c[s]++;
    return c.map(v => v / this.status.obs.length);
  }

  exportJSON() {
    const T = this.table, a = x => (x ? Array.from(x) : null);
    return {
      params: this.p, preset: this.p.preset, resolved: { ...this.prm, beta: String(this.prm.beta) },
      topology: this.tree.id,
       rebuild: this.rebuildLog, learnStats: this.learnStats || null,
      tree: this.tree.nodes.map(n => ({ id: n.id, dim: n.dim, t: n.t, left: n.left, right: n.right, leaf: n.leaf })),
      observations: this.prob.obs.map((o, i) => ({
        raw: [o.lo0, o.hi0], support: [o.lo, o.hi], Y: o.Y,
        fragments: Array.from({ length: T.start[i + 1] - T.start[i] }, (_, k) => {
          const f = T.start[i] + k;
          return { leaf: T.leaf[f], lo: T.lo[f], hi: T.hi[f], pi: T.pi[f], w: this.theories ? this.theories[0].w[f] : null,
            env: this.bnd ? { ensemble: [this.bnd.eLo[f], this.bnd.eHi[f]], local: [this.bnd.lLo[f], this.bnd.lHi[f]] } : null,
            status: this.status ? STATUS[this.status.frag[f]] : null };
        }),
        status: this.status ? STATUS[this.status.obs[i]] : null,
      })),
      provenance: this.sup ? this.sup.prov : [],
      contradictions: this.sup ? this.sup.contradictions : [], exclusionInconsistencies: this.sup ? this.sup.inconsistencies : [],
      theories: (this.theories || []).map(t => ({ F: t.F, L: t.L, source: t.source, phi: a(t.phi) })),
      diversityFit: this.ch ? this.ch.curve : [],
      envelopesCertified: false,
      metrics: this.metrics(),
    };
  }
}

export function widthSweep(params, widths) {
  return widths.map(width => {
    const r = new Run({ ...params, width });
    r.runAll();
    return { width, ...r.metrics(), statusFrac: r.statusFractions() };
  });
}