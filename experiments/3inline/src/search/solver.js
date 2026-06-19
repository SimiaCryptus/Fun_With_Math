import { Config } from '../core/config.js';
import { parabolaWarmStart } from '../constructions/parabola.js';
import { mutate } from './mutation.js';
import { fitness, lexFitness, diagonalConcentration } from './fitness.js';
import { accept } from './annealing.js';
import { EntropyMonitor } from './entropy.js';
import { TabuList } from '../core/tabu.js';

// Orchestrates the search loop. Event callbacks set via on(name, fn).
export class Solver {
  constructor(n, opts = {}) {
    this.n = n;
    this.temperature = opts.temperature || 1.0;
    this.cooling = opts.cooling || 0.999;
    this.subSize = opts.subSize || 3;
    this.config = opts.config || new Config(n);
    this.best = this.config.clone();
    this.step = 0;
    this.stagnation = 0;
    this.entropy = new EntropyMonitor(20);
    this.listeners = {};
    this.acceptCount = 0;
    this.totalCount = 0;
    this.tabu = new TabuList(n, opts.tabuCapacity || 512);
    this.tabu.add(this.config.selected);
    this.deepStagnation = 0;
  }

  on(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }
  emit(name, payload) {
    (this.listeners[name] || []).forEach((fn) => fn(payload));
  }

  setConfig(cfg) {
    this.config = cfg;
    if (cfg.pointCount > this.best.pointCount) this.best = cfg.clone();
    this.emit('best', this.best);
  }

  stepOnce() {
    const cur = fitness(this.config);
    const curLex = lexFitness(this.config);
    const res = mutate(this.config, { size: this.subSize, biasFrontier: true });
    this.step++;
    this.totalCount++;
    if (res && res.accepted) {
      const next = fitness(res.config);
      const nextLex = lexFitness(res.config);
      // Primary delta drives annealing acceptance (3-in-line fitness =
      // point count). The lexicographic delta only refines tie-breaks:
      // when point count is unchanged (delta === 0) we still prefer moves
      // that improve diagonal concentration, and we never accept a move
      // that would reduce point count purely for concentration's sake.
      const delta = next - cur;
      const lexDelta = nextLex - curLex;
      // Use the lexicographic delta for the acceptance test only when the
      // primary count is preserved or improved; this guarantees the
      // diagonal-concentrating term cannot reduce the 3-in-line fitness.
      const effectiveDelta = delta === 0 ? lexDelta : delta;
      // Reject moves that land on a tabu (recently-visited) configuration
      // unless they set a new best (aspiration criterion).
      const isTabu = this.tabu.has(res.config.selected);
      const aspires = next > this.best.pointCount;
      if ((aspires || !isTabu) && accept(effectiveDelta, this.temperature)) {
        this.config = res.config;
        this.acceptCount++;
        this.tabu.add(this.config.selected);
        if (next > this.best.pointCount) {
          this.best = res.config.clone();
          this.stagnation = 0;
          this.deepStagnation = 0;
          this.emit('best', this.best);
        } else {
          this.stagnation++;
        }
        this.emit('accept', res);
      } else {
        this.stagnation++;
      }
    } else {
      this.stagnation++;
    }
    this.deepStagnation++;

    // Cooling
    this.temperature *= this.cooling;
    if (this.temperature < 0.01) this.temperature = 0.01;

    this.entropy.push(this.config.selected);

    // Escape
    if (this.stagnation > 200 || this.entropy.collapsed()) {
      this.escape();
    }
    // Deep restart: if we've gone very long without a new best, jump back
    // to the best-known configuration and re-heat to explore around it.
    if (this.deepStagnation > 1500) {
      this.config = this.best.clone();
      this.temperature = Math.min(this.temperature * 8 + 2, 100);
      this.tabu.clear();
      this.tabu.add(this.config.selected);
      this.deepStagnation = 0;
      this.stagnation = 0;
      this.emit('restart', { best: this.best.pointCount });
    }

    this.emit('step', {
      step: this.step,
      count: this.config.pointCount,
      best: this.best.pointCount,
      temperature: this.temperature,
      entropy: this.entropy.value(),
      acceptRate: this.totalCount ? this.acceptCount / this.totalCount : 0,
      saturated: this.config.isSaturated(),
      diagonal: diagonalConcentration(this.config),
    });
  }

  escape() {
    // Promote sublattice size temporarily and kick.
    this.subSize = this.subSize >= 7 ? 3 : this.subSize + 2;
    this.temperature = Math.min(this.temperature * 5 + 1, 100);
    this.stagnation = 0;
    this.acceptCount = 0;
    this.totalCount = 0;
    this.emit('escape', { subSize: this.subSize });
  }

  run(steps) {
    for (let i = 0; i < steps; i++) this.stepOnce();
  }

  reset(useWarmStart) {
    this.config = useWarmStart ? parabolaWarmStart(this.n) : new Config(this.n);
    this.best = this.config.clone();
    this.step = 0;
    this.stagnation = 0;
    this.emit('best', this.best);
  }
}
