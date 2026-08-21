/**
 * simulation.js — one discrete timestep per invocation + playback scheduling (§7.5, §8).
 *
 * Guarantees synchronous update semantics: every cell reads only the frozen
 * previous-step buffers, and all writes land in the "next" buffers, which are
 * swapped atomically at the end of the step.
 */

import { SCHEMA, targetAt, isTargetSpatiallyUniform, TEXT_FIELD_KEYS } from './config.js';
import {
  Grid,
  populate,
  populateMembrane,
  neighborOffsets,
  countActiveNeighbors,
  sumNeighborStates,
  sumNeighborVoltageDelta,
  makeActivePredicate,
  createRng,
  makeGaussianSampler,
} from './grid.js';
import { pidStep } from './controller.js';
import { expressState, expressBioelectrical } from './stateExpression.js';
import { membraneStep, makeMembraneInput, makeMembraneOutput } from './membrane.js';
import { forEachLineCell, rasterizeText, fitTextBlock, fontStack } from './raster.js';

export class Simulation {
  constructor(config) {
    this.config = config;
    const cfg = config.all();

    this.grid = new Grid(cfg.gridWidth, cfg.gridHeight);
    this.time = 0;
    this.running = false;
    this.measuredRate = 0;
    this.stats = {
      step: 0,
      activeFraction: 0,
      meanAbsError: 0,
      energy: 0,
      meanIntegral: 0,
      firingFraction: 0,
      refractoryFraction: 0,
      meanV: 0,
    };

    this._listeners = Object.create(null);
    this._out = { p: 0, i: 0, d: 0, u: 0, error: 0 };
    this._mIn = makeMembraneInput();
    this._mOut = makeMembraneOutput();
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
    if (changed.includes('stateMin') || changed.includes('stateMax')) {
      this.grid.clampStates(this.config.get('stateMin'), this.config.get('stateMax'));
    }
    this._refreshDerived();
    if (structural) {
      this.reset();
      return;
    }
    // Live re-rasterisation of the text target field (§3.2).
    if (
      this.config.get('targetMode') === 'text' &&
      changed.some((k) => TEXT_FIELD_KEYS.includes(k))
    ) {
      this.renderTextField();
    }
    this.emit('change', changed);
  }

  _refreshDerived() {
    const cfg = this.config.all();
    this.offsets = neighborOffsets(cfg.neighborhood, cfg.radius, cfg.neighborhoodMask);
    this.isActive = makeActivePredicate(cfg.activePredicate, cfg);
    this.sumMode = cfg.neighborMetric === 'sum';
    this.maxNeighbors = this.offsets.length / 2;
  }
  /** N_t(c): either the active-neighbour count or the signed neighbour sum. */
  _neighborMeasure(states, x, y, boundary) {
    return this.sumMode
      ? sumNeighborStates(this.grid, states, x, y, this.offsets, boundary)
      : countActiveNeighbors(this.grid, states, x, y, this.offsets, boundary, this.isActive);
  }

  // -------------------------------------------------------------- lifecycle
  reset() {
    const cfg = this.config.all();
    if (this.grid.width !== cfg.gridWidth || this.grid.height !== cfg.gridHeight) {
      this.grid.resize(cfg.gridWidth, cfg.gridHeight);
    }
    this._refreshDerived();
    this.rng = createRng(cfg.seed);
    this.gaussian = makeGaussianSampler(this.rng);
    this.grid.clearControllerState();
    if (cfg.targetMode === 'text') this.renderTextField();
    else this.ensureTargetField();
    if (cfg.mode === 'pid') {
      populate(this.grid, cfg, this.rng);
      this._seedControllerState();
    } else {
      populateMembrane(this.grid, cfg, this.rng);
      this._seedMembraneState();
    }
    this.time = 0;
    this._accumulator = 0;
    this._measure();
    this.emit('reset');
  }

  /** Empty the grid and its controller memory without touching the config. */
  clear() {
    const cfg = this.config.all();
    this.grid.clearStates();
    this.grid.clearControllerState();
    if (cfg.mode === 'pid') {
      this._seedControllerState();
    } else {
      this.grid.clearMembrane(cfg.vRest);
      this._seedMembraneState();
    }
    this.time = 0;
    this._measure();
    this.emit('reset');
  }

  /** Seed e_(t-1) from the initial neighbourhood so the first D_t term is 0. */
  _seedControllerState() {
    const cfg = this.config.all();
    const g = this.grid;
    const uniform = isTargetSpatiallyUniform(cfg) ? targetAt(cfg, 0, 0, 0) : null;
    const painted = this._targetBuffer(cfg);
    const gaussian = cfg.perturbInit === 'normal' ? makeGaussianSampler(this.rng) : null;
    for (let y = 0; y < g.height; y++) {
      const row = y * g.width;
      for (let x = 0; x < g.width; x++) {
        const idx = row + x;
        const n = this._neighborMeasure(g.states, x, y, cfg.boundary);
        const T = painted ? painted[idx] : uniform !== null ? uniform : targetAt(cfg, x, y, 0);
        const e = T - n;
        let prevError = e;
        let integral = 0;
        if (gaussian) {
          prevError += gaussian() * cfg.perturbSigma;
          integral += gaussian() * cfg.perturbSigma;
        }
        g.prevError[idx] = prevError;
        g.error[idx] = e;
        g.integral[idx] = integral;
        g.u[idx] = 0;
      }
    }
  }
  /**
   * Derive the initial display state from (V, gate), and — in pid-homeostat
   * mode — seed e_(t-1) so the first derivative term is zero.
   */
  _seedMembraneState() {
    const cfg = this.config.all();
    const g = this.grid;
    const homeostat = cfg.mode === 'pid-homeostat';
    for (let i = 0; i < g.size; i++) {
      g.states[i] = expressBioelectrical(g.V[i], g.gate[i]);
      g.nextStates[i] = g.states[i];
      if (homeostat) {
        const e = cfg.vTarget - g.V[i];
        g.prevError[i] = e;
        g.nextPrevError[i] = e;
        g.error[i] = e;
        g.integral[i] = 0;
        g.nextIntegral[i] = 0;
        g.u[i] = 0;
      }
    }
  }

  /** Live intervention / painting (§7.7). Controller memory is preserved. */
  paintCell(x, y, value) {
    this.grid.setState(x, y, value);
    this.emit('paint', { x, y, value });
  }
  // ------------------------------------------------ painted target field T(c)
  /** Per-cell target buffer for the field-backed modes, else null. */
  _targetBuffer(cfg) {
    return cfg.targetMode === 'painted' || cfg.targetMode === 'text' ? this.grid.targetField : null;
  }
  /** Lazily initialise the field to the scalar T so it is never all-zero. */
  ensureTargetField() {
    if (!this.grid.targetInitialized) this.grid.fillTargetField(this.config.get('target'));
  }
  /**
   * Rasterise the configured text block into T(c): the background is the
   * scalar T, the glyph ink is `textFieldValue`. The block is auto-centred and
   * auto-fitted so that the *greater* of its effective width % / height %
   * equals `textFieldFit` percent of the grid.
   */
  renderTextField() {
    const cfg = this.config.all();
    const g = this.grid;
    g.fillTargetField(cfg.target);
    const text = String(cfg.textFieldText == null ? '' : cfg.textFieldText);
    if (!text.replace(/\s/g, '')) {
      this.emit('paint', { target: true, text: true });
      return;
    }
    const frac = Math.max(0.01, Math.min(1, cfg.textFieldFit / 100));
    const glyph = fitTextBlock(text, g.width * frac, g.height * frac, {
      family: fontStack(cfg.textFieldFont),
      bold: cfg.textFieldBold,
      italic: cfg.textFieldItalic,
      lineHeight: cfg.textFieldLineHeight,
      align: cfg.textFieldAlign,
    });
    if (!glyph.width) {
      this.emit('paint', { target: true, text: true });
      return;
    }
    const x0 = Math.round((g.width - glyph.width) / 2 + (cfg.textFieldOffsetX / 100) * g.width);
    const y0 = Math.round((g.height - glyph.height) / 2 + (cfg.textFieldOffsetY / 100) * g.height);
    for (let gy = 0; gy < glyph.height; gy++) {
      const row = gy * glyph.width;
      for (let gx = 0; gx < glyph.width; gx++) {
        if (glyph.mask[row + gx]) g.setTarget(x0 + gx, y0 + gy, cfg.textFieldValue);
      }
    }
    this.textFieldMetrics = {
      fontSize: glyph.fontSize,
      width: glyph.width,
      height: glyph.height,
      widthPercent: (glyph.width / g.width) * 100,
      heightPercent: (glyph.height / g.height) * 100,
    };
    this.emit('paint', { target: true, text: true });
  }
  /** Flood the whole field with a single value. */
  fillTargetField(value) {
    this.grid.fillTargetField(value);
    this.emit('paint', { target: true, value });
  }
  /** Square stamp, no event (internal building block for the tools). */
  _brushTarget(cx, cy, value, size) {
    const s = Math.max(1, size | 0);
    const half = (s - 1) / 2;
    const x0 = Math.round(cx - half);
    const y0 = Math.round(cy - half);
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) this.grid.setTarget(x0 + dx, y0 + dy, value);
    }
  }
  /** Freehand dab. */
  paintTargetBrush(x, y, value, size) {
    this.ensureTargetField();
    this._brushTarget(x, y, value, size);
    this.emit('paint', { x, y, value, target: true });
  }
  /** Stroke a line of brush stamps (also used to interpolate freehand drags). */
  paintTargetLine(x0, y0, x1, y1, value, size) {
    this.ensureTargetField();
    forEachLineCell(x0, y0, x1, y1, (x, y) => this._brushTarget(x, y, value, size));
    this.emit('paint', { target: true, value });
  }
  /** Filled rectangle between two corners (inclusive). */
  paintTargetRect(a, b, value) {
    this.ensureTargetField();
    const g = this.grid;
    const x0 = Math.max(0, Math.min(a.x, b.x));
    const x1 = Math.min(g.width - 1, Math.max(a.x, b.x));
    const y0 = Math.max(0, Math.min(a.y, b.y));
    const y1 = Math.min(g.height - 1, Math.max(a.y, b.y));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) g.setTarget(x, y, value);
    }
    this.emit('paint', { target: true, value });
  }
  /** Rasterise `text` at `fontSize` cells and stamp it centred on (x, y). */
  stampTargetText(x, y, text, fontSize, value, bold) {
    const label = String(text == null ? '' : text);
    if (!label.trim()) return;
    this.ensureTargetField();
    const glyph = rasterizeText(label, fontSize, { bold: Boolean(bold) });
    const g = this.grid;
    const x0 = Math.round(x - glyph.width / 2);
    const y0 = Math.round(y - glyph.height / 2);
    for (let gy = 0; gy < glyph.height; gy++) {
      const row = gy * glyph.width;
      for (let gx = 0; gx < glyph.width; gx++) {
        if (glyph.mask[row + gx]) g.setTarget(x0 + gx, y0 + gy, value);
      }
    }
    this.emit('paint', { x, y, value, target: true });
  }

  // ------------------------------------------- membrane-domain interventions
  /** Write into the stimulus field (bioelectrical.md §7 "paint stimulus"). */
  paintStimulus(x, y, amount) {
    const g = this.grid;
    if (!g.inBounds(x, y)) return;
    g.stimulus[g.index(x, y)] = amount;
    this.emit('paint', { x, y, value: amount });
  }
  /** Directly set a cell's membrane potential (manual excitation). */
  paintVoltage(x, y, V) {
    const cfg = this.config.all();
    const g = this.grid;
    if (!g.inBounds(x, y)) return;
    const idx = g.index(x, y);
    g.V[idx] = V < cfg.vMin ? cfg.vMin : V > cfg.vMax ? cfg.vMax : V;
    this.emit('paint', { x, y, value: g.V[idx] });
  }
  /** Pin / unpin a cell's potential — pacemakers, boundaries, conduction block. */
  paintClamp(x, y, on, V) {
    const cfg = this.config.all();
    const g = this.grid;
    if (!g.inBounds(x, y)) return;
    const idx = g.index(x, y);
    if (on) {
      const v = V < cfg.vMin ? cfg.vMin : V > cfg.vMax ? cfg.vMax : V;
      g.clamped[idx] = 1;
      g.clampV[idx] = v;
      g.V[idx] = v;
    } else {
      g.clamped[idx] = 0;
      g.clampV[idx] = cfg.vRest;
    }
    this.emit('paint', { x, y, value: g.clamped[idx] });
  }

  // -------------------------------------------------------------- one step
  step() {
    const cfg = this.config.all();
    if (cfg.mode === 'pid') this._stepPid(cfg);
    else this._stepMembrane(cfg);
    this.time++;
    this._measure();
    this._trackRate();
    this.emit('step');
  }
  _stepPid(cfg) {
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
    const sumMode = this.sumMode;
    const boundary = cfg.boundary;
    const expression = cfg.expression;
    const out = this._out;
    const rng = this.rng;
    const t = this.time;
    const uniformTarget = isTargetSpatiallyUniform(cfg) ? targetAt(cfg, 0, 0, t) : null;
    const painted = this._targetBuffer(cfg);

    for (let y = 0; y < g.height; y++) {
      const row = y * g.width;
      for (let x = 0; x < g.width; x++) {
        const idx = row + x;

        // (a) neighbour count from the frozen snapshot
        const n = sumMode
          ? sumNeighborStates(g, st, x, y, offsets, boundary)
          : countActiveNeighbors(g, st, x, y, offsets, boundary, isActive);

        // (b) error + PID terms
        const T = painted
          ? painted[idx]
          : uniformTarget !== null
            ? uniformTarget
            : targetAt(cfg, x, y, t);
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
  }
  /**
   * Bioelectrical membrane step (bioelectrical.md §4). Neighbour voltages are
   * read from the frozen snapshot only; no cell observes another cell's gate.
   */
  _stepMembrane(cfg) {
    const g = this.grid;
    const V = g.V,
      gate = g.gate,
      ot = g.openTicks,
      rt = g.restTicks;
    const nV = g.nextV,
      nGate = g.nextGate,
      nOt = g.nextOpenTicks,
      nRt = g.nextRestTicks;
    const offsets = this.offsets;
    const boundary = cfg.boundary;
    const input = this._mIn;
    const out = this._mOut;
    const pidOut = this._out;
    const homeostat = cfg.mode === 'pid-homeostat';
    const noisy = cfg.noiseAmplitude > 0;
    const gaussian = this.gaussian;
    const pulse = cfg.stimulusMode === 'pulse';
    for (let y = 0; y < g.height; y++) {
      const row = y * g.width;
      for (let x = 0; x < g.width; x++) {
        const idx = row + x;
        // 1. SENSE
        input.V = V[idx];
        input.gate = gate[idx];
        input.openTicks = ot[idx];
        input.restTicks = rt[idx];
        input.neighborSum = sumNeighborVoltageDelta(g, V, x, y, offsets, boundary);
        input.stimulus = g.stimulus[idx];
        input.noise = noisy ? gaussian() * cfg.noiseAmplitude : 0;
        input.clamp = g.clamped[idx] ? g.clampV[idx] : null;
        // optional homeostat: u_t replaces the fixed leak term (§6.3)
        if (homeostat) {
          const e = cfg.vTarget - input.V;
          pidStep(g.prevError[idx], g.integral[idx], e, cfg, pidOut);
          input.leak = pidOut.u;
          g.nextPrevError[idx] = e;
          g.nextIntegral[idx] = pidOut.i;
          g.error[idx] = e;
          g.u[idx] = pidOut.u;
        } else {
          input.leak = null;
        }
        // 2. INTEGRATE + 3. ADVANCE GATE
        membraneStep(input, cfg, out);
        nV[idx] = out.V;
        nGate[idx] = out.gate;
        nOt[idx] = out.openTicks;
        nRt[idx] = out.restTicks;
        // 4. EXPRESS
        g.nextStates[idx] = expressBioelectrical(out.V, out.gate);
        // painted stimulus is consumed unless explicitly held
        if (pulse && input.stimulus !== 0) g.stimulus[idx] = 0;
      }
    }
    g.commit();
  }

  _measure() {
    if (this.config.get('mode') !== 'pid') {
      this._measureMembrane();
      return;
    }
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
      firingFraction: 0,
      refractoryFraction: 0,
      meanV: 0,
    };
  }
  _measureMembrane() {
    const g = this.grid;
    let open = 0,
      refractory = 0,
      sumV = 0,
      sumI = 0;
    for (let i = 0; i < g.size; i++) {
      const gate = g.gate[i];
      if (gate === 1) open++;
      else if (gate === 2) refractory++;
      sumV += g.V[i];
      sumI += g.integral[i];
    }
    this.stats = {
      step: this.time,
      activeFraction: open / g.size,
      firingFraction: open / g.size,
      refractoryFraction: refractory / g.size,
      meanV: sumV / g.size,
      meanAbsError: 0,
      energy: 0,
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
