/**
 * simulation.js — one discrete timestep per invocation + playback scheduling (§7.5, §8).
 *
 * Guarantees synchronous update semantics: every cell reads only the frozen
 * previous-step buffers, and all writes land in the "next" buffers, which are
 * swapped atomically at the end of the step.
 */

import { SCHEMA, targetAt, isTargetSpatiallyUniform } from './config.js';
import {
  Grid,
  populate,
  neighborOffsets,
  countActiveNeighbors,
  makeActivePredicate,
  createRng,
} from './grid.js';
import { pidStep } from './controller.js';
import { expressState } from './stateExpression.js';

export class Simulation {
  constructor(config) {
    this.config = config;
    const cfg = config.all();

    this.grid = new Grid(cfg.gridWidth, cfg.gridHeight);
    this.time = 0;
    this.running = false;
    this.measuredRate = 0;
    this.stats = { step: 0, activeFraction: 0, meanAbsError: 0, energy: 0, meanIntegral: 0 };

    this._listeners = Object.create(null);
    this._out = { p: 0, i: 0, d: 0, u: 0, error: 0 };
    this._accumulator = 0;
    this._lastFrame = 0;
    this._raf = null;
    this._rateSteps = 0;
    this._rateT0 = 0;
    this._tick = this._tick.bind(this);

    this._unsubscribe = config.subscribe((changed) => this._onConfigChange(changed));
    this.reset();
  }

  // ------------------------------------------------------------- event bus
  on(event, fn) {
    const set = this._listeners[event] || (this._listeners[event] = new Set());
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(event, payload) {
    const set = this._listeners[event];
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload, this);
      } catch (err) {
        console.error('simulation listener failed', err);
      }
    }
  }

  // ------------------------------------------------------- config reaction
  _onConfigChange(changed) {
    const structural = changed.some((k) => SCHEMA[k] && SCHEMA[k].structural);
    if (changed.includes('stateCardinality')) {
      this.grid.clampStates(this.config.get('stateCardinality'));
    }
    this._refreshDerived();
    if (structural) this.reset();
    else this.emit('change', changed);
  }

  _refreshDerived() {
    const cfg = this.config.all();
    this.offsets = neighborOffsets(cfg.neighborhood, cfg.radius);
    this.isActive = makeActivePredicate(cfg.activePredicate, cfg.stateCardinality);
    this.maxNeighbors = this.offsets.length / 2;
  }

  // -------------------------------------------------------------- lifecycle
  reset() {
    const cfg = this.config.all();
    if (this.grid.width !== cfg.gridWidth || this.grid.height !== cfg.gridHeight) {
      this.grid.resize(cfg.gridWidth, cfg.gridHeight);
    }
    this._refreshDerived();
    this.rng = createRng(cfg.seed);
    this.grid.clearControllerState();
    populate(this.grid, cfg, this.rng);
    this._seedControllerState();
    this.time = 0;
    this._accumulator = 0;
    this._measure();
    this.emit('reset');
  }

  /** Empty the grid and its controller memory without touching the config. */
  clear() {
    this.grid.clearStates();
    this.grid.clearControllerState();
    this._seedControllerState();
    this.time = 0;
    this._measure();
    this.emit('reset');
  }

  /** Seed e_(t-1) from the initial neighbourhood so the first D_t term is 0. */
  _seedControllerState() {
    const cfg = this.config.all();
    const g = this.grid;
    const uniform = isTargetSpatiallyUniform(cfg) ? targetAt(cfg, 0, 0, 0) : null;
    for (let y = 0; y < g.height; y++) {
      const row = y * g.width;
      for (let x = 0; x < g.width; x++) {
        const idx = row + x;
        const n = countActiveNeighbors(
          g,
          g.states,
          x,
          y,
          this.offsets,
          cfg.boundary,
          this.isActive
        );
        const T = uniform !== null ? uniform : targetAt(cfg, x, y, 0);
        const e = T - n;
        g.prevError[idx] = e;
        g.error[idx] = e;
        g.integral[idx] = 0;
        g.u[idx] = 0;
      }
    }
  }

  /** Live intervention / painting (§7.7). Controller memory is preserved. */
  paintCell(x, y, value) {
    this.grid.setState(x, y, value);
    this.emit('paint', { x, y, value });
  }

  // -------------------------------------------------------------- one step
  step() {
    const cfg = this.config.all();
    const g = this.grid;

    const st = g.states,
      pe = g.prevError,
      ig = g.integral;
    const nst = g.nextStates,
      npe = g.nextPrevError,
      nig = g.nextIntegral;
    const uBuf = g.u,
      eBuf = g.error;

    const offsets = this.offsets;
    const isActive = this.isActive;
    const boundary = cfg.boundary;
    const expression = cfg.expression;
    const out = this._out;
    const rng = this.rng;
    const t = this.time;
    const uniformTarget = isTargetSpatiallyUniform(cfg) ? targetAt(cfg, 0, 0, t) : null;

    for (let y = 0; y < g.height; y++) {
      const row = y * g.width;
      for (let x = 0; x < g.width; x++) {
        const idx = row + x;

        // (a) neighbour count from the frozen snapshot
        const n = countActiveNeighbors(g, st, x, y, offsets, boundary, isActive);

        // (b) error + PID terms
        const T = uniformTarget !== null ? uniformTarget : targetAt(cfg, x, y, t);
        const e = T - n;
        pidStep(pe[idx], ig[idx], e, cfg, out);

        // (c) discretise u_t into the next expressed state
        nst[idx] = expressState(expression, out.u, out.p, out.i, out.d, cfg, rng);

        // carry forward controller memory + diagnostics
        npe[idx] = e;
        nig[idx] = out.i;
        uBuf[idx] = out.u;
        eBuf[idx] = e;
      }
    }

    // (d) atomic buffer swap
    g.commit();
    this.time++;
    this._measure();
    this._trackRate();
    this.emit('step');
  }

  _measure() {
    const g = this.grid;
    const isActive = this.isActive;
    let active = 0,
      sumAbs = 0,
      sumSq = 0,
      sumI = 0;
    for (let i = 0; i < g.size; i++) {
      if (isActive(g.states[i])) active++;
      const e = g.error[i];
      sumAbs += Math.abs(e);
      sumSq += e * e;
      sumI += g.integral[i];
    }
    this.stats = {
      step: this.time,
      activeFraction: active / g.size,
      meanAbsError: sumAbs / g.size,
      energy: sumSq,
      meanIntegral: sumI / g.size,
    };
  }

  _trackRate() {
    const now = performance.now();
    if (this._rateT0 === 0) {
      this._rateT0 = now;
      this._rateSteps = 0;
    }
    this._rateSteps++;
    const dt = now - this._rateT0;
    if (dt >= 500) {
      this.measuredRate = (this._rateSteps * 1000) / dt;
      this._rateSteps = 0;
      this._rateT0 = now;
    }
  }

  // --------------------------------------------------------------- playback
  play() {
    if (this.running) return;
    this.running = true;
    this._lastFrame = performance.now();
    this._accumulator = 0;
    this._rateT0 = 0;
    this._raf = requestAnimationFrame(this._tick);
    this.emit('running', true);
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.measuredRate = 0;
    this.emit('running', false);
  }

  toggle() {
    if (this.running) this.pause();
    else this.play();
  }

  _tick(now) {
    if (!this.running) return;
    const cfg = this.config.all();
    const dt = Math.min(0.25, (now - this._lastFrame) / 1000);
    this._lastFrame = now;
    this._accumulator += dt * cfg.stepsPerSecond;

    let steps = Math.floor(this._accumulator);
    if (steps > cfg.maxStepsPerFrame) {
      steps = cfg.maxStepsPerFrame;
      this._accumulator = 0;
    } else {
      this._accumulator -= steps;
    }
    for (let k = 0; k < steps; k++) this.step();

    this._raf = requestAnimationFrame(this._tick);
  }

  dispose() {
    this.pause();
    if (this._unsubscribe) this._unsubscribe();
    this._listeners = Object.create(null);
  }
}
