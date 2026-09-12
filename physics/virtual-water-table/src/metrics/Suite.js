import { Rng } from '../core/Rng.js';
import { bulkInvariants } from './Reducer.js';
import { vorticityEntropy } from './Entropy.js';
import { computeSpectra } from './Spectra.js';
import { MutualInfo } from './MutualInfo.js';
import { Lyapunov } from './Lyapunov.js';
import { composite, breadthFromFlux } from './Score.js';

/** Orchestrates the measurement schedule of §6.7 and time-averaging after settling. */
export class MetricsSuite {
  constructor(solver, twin = null, opts = {}) {
    this.solver = solver; this.twin = twin;
    this.settleTime = opts.settleTime ?? 4 * solver.grid.Lx / solver.U0;
    this.win = solver.grid.analysisWindow();
    this.mi = new MutualInfo(solver.K);
    this.lyap = twin ? new Lyapunov(opts.lyap) : null;
    this.cadence = { entropy: 4, spectra: 16, mi: 32, average: 4 };
    this.reset();
  }
  reset() {
    this.n = 0; this.bulk = null; this.entropy = null; this.spectra = null; this.miValue = null; this.rewind = null;
    this.sum = {}; this.cnt = {}; this.avg = {}; this.tStart = this.solver.t; this.mi.reset();
    if (this.lyap) this.lyap.init(this.solver, this.twin, new Rng((this.solver.params.seed ^ 0xa5a5a5a5) >>> 0));
  }
  get settled() { return this.solver.t - this.tStart >= this.settleTime; }
  get settleProgress() { return Math.min(1, (this.solver.t - this.tStart) / this.settleTime); }
  tick() {
    this.n++;
    this.bulk = bulkInvariants(this.solver);
    if (this.lyap) this.lyap.tick(this.solver, this.twin);
    this.mi.accumulate(this.solver);
    if (this.n % this.cadence.entropy === 0) this.entropy = vorticityEntropy(this.solver, this.win);
    if (this.n % this.cadence.spectra === 0) { this.spectra = computeSpectra(this.solver, this.win); this.spectra.breadth = breadthFromFlux(this.spectra.k, this.spectra.Pi); }
    if (this.n % this.cadence.mi === 0) this.miValue = this.mi.compute();
    if (this.settled && this.n % this.cadence.average === 0) {
      this._acc('lambda', this.lyap?.lambda); this._acc('Hw', this.entropy?.Hw); this._acc('Hang', this.entropy?.Hang);
      this._acc('I', this.miValue); this._acc('breadth', this.spectra?.breadth); this._acc('Q', this.bulk.Q);
    }
  }
  _acc(k, v) { if (v == null || !Number.isFinite(v)) return; this.sum[k] = (this.sum[k] || 0) + v; this.cnt[k] = (this.cnt[k] || 0) + 1; this.avg[k] = this.sum[k] / this.cnt[k]; }
  setRewind(D) { this.rewind = D; }
  raw() {
    const a = this.avg, b = this.bulk || {};
    return {
      lambda: this.lyap ? (a.lambda ?? this.lyap.lambda) : null,
      Hw: a.Hw ?? this.entropy?.Hw ?? null, Hang: a.Hang ?? this.entropy?.Hang ?? null,
      I: a.I ?? this.miValue ?? null, Drev: this.rewind, breadth: a.breadth ?? this.spectra?.breadth ?? null,
      Q: a.Q ?? b.Q, divNorm: b.divNorm, divMax: b.divMax, P: b.P, Z: b.Z, E: b.E, eps: b.eps, cfl: b.cfl, hx: this.solver.grid.hx,
    };
  }
  currentScore() { return composite(this.raw(), { settled: this.settled }); }
  summary() {
    const raw = this.raw(), res = composite(raw, { settled: this.settled }), s = this.spectra;
    return { raw, ...res, spectra: s ? { k: Array.from(s.k), E: Array.from(s.E), E0: Array.from(s.E0), Pi: Array.from(s.Pi), dEff: Array.from(s.dEff) } : null };
  }
}