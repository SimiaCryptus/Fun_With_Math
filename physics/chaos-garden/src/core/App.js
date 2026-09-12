import { Clock } from './Clock.js';
import { log } from './Log.js';
import { Rng } from './Rng.js';
import { TIERS } from './Tiers.js';
import { applyPreset } from './Presets.js';
import { encodeState, decodeState, encodeMask, decodeMask, runHash, fnv1a } from './HashCodec.js';
import { saveSlot, loadSlot, listSlots, exportJSON, importJSON, download } from './Storage.js';
import { JobRunner } from './JobRunner.js';
import { Grid } from '../sim/Grid.js';
import { BarrierField } from '../sim/BarrierField.js';
import { Solver } from '../sim/Solver.js';
import { GpuContext } from '../sim/gpu/GpuContext.js';
import { TwinSolver } from '../sim/TwinSolver.js';
import { rewindProbe } from '../sim/Rewinder.js';
import { MetricsSuite } from '../metrics/Suite.js';
import { Recorder } from '../metrics/Recorder.js';
import { scoreString, DEFINITIONS, NORMALIZERS, WEIGHTS_VERSION } from '../metrics/Score.js';
import { Renderer } from '../render/Renderer.js';
import { TopDownView } from '../render/TopDownView.js';
import { Toolbar } from '../ui/Toolbar.js';
import { BrushTool, forDisk } from '../ui/BrushTool.js';
import { DepthSlider } from '../ui/DepthSlider.js';
import { Notify } from '../ui/Notify.js';
import { MetricsPanel } from '../ui/Panels/MetricsPanel.js';

const MODES = ['paint', 'run', 'sweep', 'rewind', 'evolve', 'scope'];
const SIM_KEYS = ['H', 'Re', 'inflow', 'spanwise', 'walls', 'seed', 'twin', 'perturb'];
const TIER_ORDER = ['G', 'A', 'B', 'C', 'D'];
const logspace = (a, b, n) => Array.from({ length: n }, (_, i) => +Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * i / (n - 1)).toPrecision(4));

/** Lifecycle, mode switching and the main loop (§7.1). UI is a projection of Params + Solver state. */
export class App {
  constructor({ bus, params, tierInfo, dom }) {
    Object.assign(this, { bus, params, tierInfo, dom });
    this.mode = null; this.task = null; this._lastUi = 0; this._hashTimer = 0; this._prevLayer = 'vorticity';
    this._metricsDirtyAt = -1; // barrier edits re-solidify at once; the metric suite (twin re-perturb) re-arms after the stroke settles
    this._gpuBusy = false; // an asynchronous-backend batch is awaiting its readback
    this._sweeping = false; this._evolving = false; this.sweepResults = null; this.lastScore = null; this.lastLabel = '';
    this._frame = this._frame.bind(this);
  }
  /** WebGPU is used whenever a device exists and the `backend` param does not opt out. */
  get gpu() { return this.params.get('backend') !== 'cpu' && !!GpuContext.current; }
  get tierName() {
    let t = this.params.get('tier'); if (t === 'auto') t = this.tierInfo.tier;
    if (TIERS[t]?.gpu && !this.gpu) t = 'A'; // the GPU tier is CPU-hostile; degrade to the largest CPU tier
    return t;
  }
  get tierOverride() { return this.params.get('tier') !== 'auto'; }
  /** Batch evaluations (sweep / evolve) run on the CPU reference solver, one tier smaller than the live view, so they finish in seconds. */
  get evalTier() { return TIER_ORDER[Math.max(TIER_ORDER.indexOf(this.tierName), TIER_ORDER.indexOf('C'))]; }
  /** Solver version string for run hashes; the GPU vendor/architecture is folded in (§5.6). */
  get solverVersion() { const s = this.solver; return s.backend === 'webgpu' ? `${s.version}@${GpuContext.current?.label || 'gpu'}` : s.version; }

  async init() {
    const { dom, bus, params } = this;
    this.notify = new Notify(dom.notify);
    if (GpuContext.current) GpuContext.current.onFail = (reason) => this._gpuFailed(reason);
    const saved = decodeState(location.hash);
    if (saved) params.set(saved.params, { silent: true });
    const tier = TIERS[this.tierName], [Nx, Ny] = tier.grid;
    this.barrier = new BarrierField(Nx, Ny);
    if (saved) this.barrier.resampleFrom(saved.mask, saved.w, saved.h); else applyPreset(this.barrier, 'one-cylinder');
    this.grid = Grid.forTier(tier, params.get('H'));
    this.toolbar = new Toolbar(dom.toolbar, bus);
    this.renderer = new Renderer(dom.canvas, Nx, Ny);
    this.view = new TopDownView(this.grid, this.barrier);
    this.brush = new BrushTool({ canvas: dom.canvas, panel: dom.tools, barrier: this.barrier, params, bus, notify: this.notify, view: this.view });
    this.depth = new DepthSlider(dom.depth, { params, bus, barrier: this.barrier });
    this.panel = new MetricsPanel(dom.side, { notify: this.notify });
    this.recorder = new Recorder();
    this.clock = new Clock({ maxStepsPerFrame: 4 });
    this.jobs = new JobRunner(new URL('../../workers/evolve.worker.js', import.meta.url).href);
    this._buildHud();
    this._buildSim();
    this._wire();
    this.setMode('paint');
    this.notify.show(`Tier ${tier.label} — ${this.tierInfo.reason} · solver ${this.solver.backend}${this.tierInfo.caps.webgl2 ? '' : ' · no WebGL2'}`);
    if (saved) this.notify.show('Design and parameters restored from URL');
    requestAnimationFrame(this._frame);
  }

  _buildSim() {
    const tier = TIERS[this.tierName], p = this.params.all;
    this.grid = Grid.forTier(tier, p.H);
    this.solver?.dispose(); this.twin?.dispose(); this._gpuBusy = false;
    this.solver = Solver.create(this.grid, p, { pIters: tier.pIters, gpu: this.gpu });
    this.solver.setBarriers(this.barrier);
    this.twin = p.twin && tier.twin ? new TwinSolver(this.solver) : null;
    this.metrics = new MetricsSuite(this.solver, this.twin);
    this.clock.setDt(this.solver.dt);
    this.view.setGrid(this.grid);
    this.depth.setGrid(this.grid);
    this.depth.setInfo({ grid: this.grid, solver: this.solver, tierName: this.tierName });
    this.recorder.reset();
    this.task = null;
    log.info('sim built', { grid: [this.grid.Nx, this.grid.Ny, this.grid.Nz], dt: this.solver.dt, twin: !!this.twin, tier: this.tierName, backend: this.solver.backend });
  }

  _buildHud() {
    this.hud = this.dom.hud;
    this.hud.innerHTML = `<span data-v="t"></span><span data-v="div" title="‖∇·u‖∞·hx/U₀ after projection (solver trust)"></span><span data-v="task"></span>
      <span class="lock" data-v="lock" title="color range locked" hidden>🔒</span>
      <span class="scope">band <input type="range" min="0" max="100" value="15" data-k="k1" aria-label="scope band low"><input type="range" min="0" max="100" value="50" data-k="k2" aria-label="scope band high"><span data-v="band"></span></span>`;
    this.hud.addEventListener('input', (e) => {
      if (!e.target.dataset.k) return;
      const a = +this.hud.querySelector('[data-k=k1]').value / 100, b = +this.hud.querySelector('[data-k=k2]').value / 100;
      const lo = Math.min(a, b); this.view.scopeBand = [lo, Math.max(a, b, lo + 0.02)];
    });
  }

  _wire() {
    const { bus } = this;
    bus.on('ui:mode', (m) => this.setMode(m));
    bus.on('ui:action', (a) => this.action(a));
    bus.on('params:change', ({ changed }) => {
      if (changed.includes('tier') || changed.includes('backend')) { this._writeHash(); this.notify.show('Tier / backend changed — reloading with the new grid'); setTimeout(() => location.reload(), 150); return; }
      if (changed.some((k) => SIM_KEYS.includes(k))) { this._buildSim(); this.notify.show(`Solver rebuilt (${changed.join(', ')}); re-settling`); }
      if (changed.includes('inkBudget')) this.brush.updateInk();
      this._scheduleHash();
    });
    bus.on('design:change', () => this._scheduleHash());
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('keydown', (e) => this._key(e));
  }

  /* ---------------- modes ---------------- */
  setMode(m) {
    if (!MODES.includes(m) || m === this.mode) return;
    const prev = this.mode;
    if (prev === 'scope') { this.view.layer = this._prevLayer; this.hud.classList.remove('scope-on'); }
    if (prev === 'sweep' || prev === 'evolve') this.jobs.cancelAll();
    this.mode = m; this.toolbar.setMode(m); this.brush.setEnabled(m === 'paint'); this.panel.setMode(m);
    switch (m) {
      case 'run': this.clock.play(); break;
      case 'sweep': this.clock.pause(); this.runSweep(); break;
      case 'rewind': this.clock.pause(); this.startRewind(); break;
      case 'evolve': this.clock.pause(); this.runEvolve(); break;
      case 'scope': this._prevLayer = this.view.layer; this.view.layer = 'scope'; this.hud.classList.add('scope-on'); break;
    }
    this.toolbar.setRunning(this.clock.running);
  }

  action(a) {
    switch (a) {
      case 'toggle': this.clock.toggle(); this.toolbar.setRunning(this.clock.running); break;
      case 'step': this.clock.requestSteps(1); break;
      case 'reset': this.resetFlow(); break;
      case 'share': this.share(); break;
      case 'save': this.save(); break;
      case 'load': this.load(); break;
      case 'export': download(`chaos-garden-${this.designHash()}.json`, exportJSON(this.designState()), 'application/json'); break;
      case 'import': this.importFile(); break;
      case 'csv': download(`cg-run-${this.runHash()}.csv`, this.recorder.toCSV(), 'text/csv'); break;
      case 'about': this.about(); break;
    }
  }

  resetFlow() { this.solver.reset(this.params.get('seed')); this.metrics.reset(); this.recorder.reset(); this.notify.show('Flow reset from seed (design kept)'); }

  /* ---------------- main loop ---------------- */
  _frame(now) {
    requestAnimationFrame(this._frame);
    try {
      if (this.barrier.version !== this.solver.barrierVersion) { this.solver.setBarriers(this.barrier); this._metricsDirtyAt = now; }
      if (this._metricsDirtyAt >= 0 && now - this._metricsDirtyAt > 250 && !this._gpuBusy) { this._metricsDirtyAt = -1; this.metrics.reset(); }
      this.solver.wantTracers = this.view.layer === 'dye'; // async backend reads all tracers back only when drawn (the outlet plane for Î is always read)
      if (this.task) this._pumpTask();
      else if (this.solver.isAsync) this._stepAsync(now);
      else { const n = this.clock.tick(now); for (let s = 0; s < n; s++) this._step(); }
      this.renderer.upload(this.view.compose(this.solver));
      this.renderer.render();
      if (now - this._lastUi > 250) { this._lastUi = now; this._updateUi(); }
    } catch (err) { this._onError(err); }
  }
  _onError(err) {
    log.error('frame', String(err?.stack || err)); this.clock.pause(); this.task = null; this.toolbar.setRunning(false);
    this.notify.show('Simulation error: ' + (err?.message || err), { kind: 'bad', timeout: 8000 });
  }
  /** Synchronous (CPU) step: measure after every Δt. */
  _step() { const r = this.solver.step(); this.twin?.step(); this._afterSteps(1, r); }
  /**
   * Asynchronous (WebGPU) stepping: submit this frame's steps, then measure once the readback lands.
   * While a batch is in flight the clock keeps accumulating, so a slow readback shows up as the usual
   * spiral-of-death slowdown rather than a Δt change (§10.3).
   */
  _stepAsync(now) {
    if (this._gpuBusy) return;
    const n = this.clock.tick(now); if (!n) return;
    let r; for (let s = 0; s < n; s++) { r = this.solver.step(); this.twin?.step(); }
    const solver = this.solver; this._gpuBusy = true;
    Promise.all([solver.sync(), this.twin?.sync()])
      .then(() => { if (solver === this.solver) this._afterSteps(n, r); }, (err) => { if (solver === this.solver) this._onError(err); })
      .finally(() => { if (solver === this.solver) this._gpuBusy = false; });
  }
  _afterSteps(n, r) {
    this.metrics.tick(n);
    const sc = this.solver.stepCount;
    if (Math.floor(sc / 4) > Math.floor((sc - n) / 4)) {
      const b = this.metrics.bulk, raw = this.metrics.raw();
      this.recorder.push({ t: r.t, E: b.E, Z: b.Z, P: b.P, eps: b.eps, divNorm: b.divNorm, Q: b.Q, lambda: raw.lambda, Hw: raw.Hw, Hang: raw.Hang, I: raw.I, breadth: raw.breadth, settled: this.metrics.settled ? 1 : 0 });
    }
  }
  /** Cooperative pump for on-demand generators (rewind) — ~14 ms per frame keeps the UI live. A yielded promise (GPU readback) pauses the pump until it settles. */
  _pumpTask() {
    const task = this.task;
    if (task.error) { const e = task.error; this.task = null; throw e; }
    if (task.waiting) return;
    const t0 = performance.now(); let r;
    do {
      r = task.gen.next();
      if (!r.done && r.value) {
        if (typeof r.value.then === 'function') { task.waiting = true; r.value.then(() => { task.waiting = false; }, (err) => { task.error = err; task.waiting = false; }); return; }
        task.progress = r.value;
      }
    } while (!r.done && performance.now() - t0 < 14);
    if (r.done) { this.task = null; task.done(r.value); }
  }

  _updateUi() {
    const m = this.metrics, res = m.currentScore(), raw = m.raw(), s = this.solver, b = m.bulk;
    const label = scoreString(res, { solverVersion: s.version, tier: this.tierName, tierOverride: this.tierOverride, precision: s.precision });
    this.lastScore = res; this.lastLabel = label;
    this.toolbar.setScore(res, label);
    this.depth.setSettled(m.settled, m.settleProgress);
    this.depth.setInfo({ grid: this.grid, solver: s, tierName: this.tierName });
    const q = (k) => this.hud.querySelector(`[data-v=${k}]`);
    q('t').textContent = `t ${s.t.toFixed(2)} · step ${s.stepCount} · ${this.clock.running ? 'running' : 'paused'}${this.clock.slowdowns ? ` · slowed ×${this.clock.slowdowns}` : ''}`;
    const dv = q('div'); dv.textContent = `∇·u ${b ? b.divNorm.toExponential(1) : '—'}`; dv.classList.toggle('warn', !!b && b.divNorm > NORMALIZERS.epsDiv);
    const t = this.task; q('task').textContent = t ? `${t.label} ${t.progress?.phase || ''} ${((t.progress?.progress || 0) * 100).toFixed(0)}%` : '';
    q('lock').hidden = !this.view.lockRange;
    const sc = this.view.lastScope; q('band').textContent = sc && this.mode === 'scope' ? `k ∈ [${sc.k1.toFixed(1)}, ${sc.k2.toFixed(1)}] · k_h ${this.grid.kh.toFixed(1)}` : '';
    this.panel.update({ raw, res, spectra: m.spectra, kh: this.grid.kh, label, hash: this.runHash(), recorder: this.recorder });
  }

  /* ---------------- rewind (§6.6) ---------------- */
  startRewind(N = 200) {
    if (this.task) return;
    const gen = rewindProbe(this.solver, N);
    this.task = { label: 'rewind', progress: { phase: 'forward', progress: 0 }, gen, waiting: false, error: null, done: (res) => {
      this.metrics.setRewind(res.D_rev); this.lastRewind = res; this.panel.setRewind(res); this.bus.emit('rewind:done', res);
      this.notify.show(`Rewind: D_rev = ${res.D_rev.toExponential(2)} over ${N} steps (${res.flowThroughs.toFixed(2)} flow-throughs)`);
    } };
    this.notify.show(`Rewind probe: ${N} steps forward, negate u, 1/Re→0, ${N} steps back…`);
  }

  /* ---------------- sweep (§9.3) ---------------- */
  _jobBase() { return { tierName: this.evalTier, params: this.params.all, w: this.barrier.Nx, h: this.barrier.Ny, settleTime: 3, measureTime: 1.5, rewindN: 80 }; }
  async runSweep(ladder = logspace(0.02, 0.6, 7)) {
    if (this._sweeping) return; this._sweeping = true;
    const base = { ...this._jobBase(), mask: Uint8Array.from(this.barrier.mask) }, n = ladder.length;
    const results = new Array(n).fill(null), prog = new Float64Array(n); let done = 0;
    const partial = () => results.filter(Boolean); // indexed by rung ⇒ always in ladder order regardless of completion order
    this.panel.showSweep([], ladder);
    this.notify.show(`Sweeping ${n} depths at tier ${base.tierName} (cpu) on ${this.jobs.concurrency} worker(s)…`);
    try {
      // All rungs are dispatched at once; JobRunner queues them across its pool. Leaving Sweep mode cancels them.
      await Promise.all(ladder.map((H, i) => this.jobs.run({ ...base, H }, (p) => {
        prog[i] = p; let s = 0; for (let q = 0; q < n; q++) s += prog[q];
        this.panel.setJobProgress(`sweep ${done}/${n} rungs done`, s / n);
      }).then((r) => { results[i] = r; done++; this.panel.showSweep(partial(), ladder); this.bus.emit('sweep:progress', { i, n, result: r }); })));
      this.sweepResults = results; this.bus.emit('sweep:done', results); this.notify.show('Sweep complete — fingerprint plotted in the Metrics panel');
    } catch (err) { if (err?.message !== 'cancelled') { log.error('sweep', String(err)); this.notify.show('Sweep failed: ' + err.message, { kind: 'bad' }); } }
    finally { this._sweeping = false; this.panel.setJobProgress(null); }
  }

  /* ---------------- evolve: (1+λ) hill-climb over the mask ---------------- */
  async runEvolve({ generations = 12, lambda = 2 } = {}) {
    if (this._evolving) return; this._evolving = true;
    const w = this.barrier.Nx, h = this.barrier.Ny, budget = this.brush.budgetCells, pc = this.barrier.protectedCols;
    const rng = new Rng((this.params.get('seed') ^ 0x5eed5eed) >>> 0), base = this._jobBase(), lineage = [];
    const evalMask = (mask, tag) => this.jobs.run({ ...base, mask }, (p) => this.panel.setJobProgress(`evolve ${tag}`, p));
    this.notify.show(`Evolve: (1+${lambda}) search at tier ${base.tierName} (cpu), ${generations} generations, ${this.jobs.concurrency} worker(s)`);
    try {
      let parentMask = Uint8Array.from(this.barrier.mask), parent = await evalMask(parentMask, 'parent');
      lineage.push({ gen: 0, score: parent.score, note: 'parent', flags: parent.flags }); this.panel.setEvolve(lineage);
      for (let gen = 1; gen <= generations && this.mode === 'evolve'; gen++) {
        // Draw all λ children first (sequential RNG ⇒ deterministic lineage), evaluate them concurrently, keep the best improver.
        const children = Array.from({ length: lambda }, () => mutateMask(parentMask, w, h, budget, pc, rng));
        const rs = await Promise.all(children.map((c, i) => evalMask(c, `g${gen}/${i + 1}`)));
        let best = -1;
        rs.forEach((r, i) => { if (r.valid && r.score > parent.score && (best < 0 || r.score > rs[best].score)) best = i; });
        rs.forEach((r, i) => lineage.push({ gen, score: r.score, note: i === best ? 'accepted' : 'rejected', flags: r.flags }));
        this.panel.setEvolve(lineage);
        if (best >= 0) { parent = rs[best]; parentMask = children[best]; this.brush.pushUndo(); this.barrier.setMask(parentMask); this.brush.commit(); }
      }
      this.notify.show(`Evolve finished: best S=${parent.score.toFixed(1)} (tier ${base.tierName})`);
    } catch (err) { if (err?.message !== 'cancelled') { log.error('evolve', String(err)); this.notify.show('Evolve failed: ' + err.message, { kind: 'bad' }); } }
    finally { this._evolving = false; this.panel.setJobProgress(null); }
  }

  /* ---------------- persistence (§9.4) ---------------- */
  designHash() { return fnv1a(encodeMask(this.barrier.mask, this.barrier.Nx, this.barrier.Ny)); }
  runHash() { return runHash({ design: encodeMask(this.barrier.mask, this.barrier.Nx, this.barrier.Ny), params: this.params.all, solverVersion: this.solverVersion }); }
  designState() { return { params: this.params.all, w: this.barrier.Nx, h: this.barrier.Ny, design: encodeMask(this.barrier.mask, this.barrier.Nx, this.barrier.Ny), score: this.lastScore?.score ?? null, scoreString: this.lastLabel }; }
  applyDesignState(o) {
    if (o.design) { const d = decodeMask(o.design); this.brush.pushUndo(); this.barrier.resampleFrom(d.mask, d.w, d.h); this.brush.commit(); }
    if (o.params) { const { tier, backend, ...rest } = o.params; this.params.set(rest); } // tier/backend are machine choices, not design
  }
  _writeHash() { const h = '#' + encodeState({ params: this.params.all, mask: this.barrier.mask, w: this.barrier.Nx, h: this.barrier.Ny }); history.replaceState(null, '', h); return h; }
  _scheduleHash() { clearTimeout(this._hashTimer); this._hashTimer = setTimeout(() => this._writeHash(), 400); }
  share() {
    this._writeHash(); const url = location.href;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => this.notify.show('Shareable URL copied'), () => this.notify.popover('Shareable URL', url));
    else this.notify.popover('Shareable URL', url);
  }
  save() { const name = prompt('Save slot name:', `design-${this.designHash()}`); if (!name) return; saveSlot(name, this.designState()); this.notify.show(`Saved "${name}"`); }
  load() {
    const slots = listSlots(); if (!slots.length) { this.notify.show('No saved slots', { kind: 'warn' }); return; }
    const name = prompt('Load slot:\n' + slots.map((s) => `${s.name}${s.score != null ? `  (S=${Number(s.score).toFixed(1)})` : ''}`).join('\n'), slots[0].name);
    if (!name) return; const st = loadSlot(name); if (!st) { this.notify.show(`No slot "${name}"`, { kind: 'warn' }); return; }
    this.applyDesignState(st); this.notify.show(`Loaded "${name}"`);
  }
  importFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; try { this.applyDesignState(importJSON(await f.text())); this.notify.show(`Imported ${f.name}`); } catch (err) { this.notify.show('Import failed: ' + err.message, { kind: 'bad' }); } };
    inp.click();
  }
  /** The WebGPU device was lost or a kernel failed validation: fall back to the CPU solver (the session flag set by GpuContext keeps the reload on CPU). */
  _gpuFailed(reason) {
    this.notify.show('WebGPU backend failed — reloading on the CPU solver: ' + reason, { kind: 'bad', timeout: 8000 });
    this._writeHash(); setTimeout(() => location.reload(), 1500);
  }
  about() {
    const s = this.solver;
    const lines = [
      `Chaos Garden — solver ${s.version} (${s.backend}, ${s.precision}), weights ${WEIGHTS_VERSION}, tier ${this.tierName}${this.tierOverride ? ' (override)' : ''}`,
      '', 'The 2D mask is extruded through the slab; only the depth H changes. Incompressible 3D flow: clamped MacCormack advection, explicit/Jacobi viscosity, red-black SOR projection. No vorticity confinement, no artificial forcing.',
      '', 'Backends: the WebGPU solver runs the same stencils as the CPU reference with the same fixed Δt and iteration counts; its pressure solve performs exactly the tier\'s number of SOR sweeps (the CPU may exit early on residual), so scores are only comparable within one backend. Set backend = cpu to force the reference.',
      '', 'Score components (published normalizers, not session ranges):', ...Object.entries(DEFINITIONS).map(([k, v]) => `• ${k}: ${v}`),
      `• gate: min(1, Q/${NORMALIZERS.Qmin}); runs with ‖∇·u‖ > ${NORMALIZERS.epsDiv} are struck through.`,
      '', 'Keys: 1–6 modes · Space play/pause · . single step · [ ] depth (Shift = fine) · B/L/P brush/line/poly · Ctrl+Z / Ctrl+Shift+Z undo/redo · R reset flow · S sweep · W rewind · G overlays · ? this panel',
      'Keyboard painting: focus the canvas, arrows move the caret (Shift ×4), Enter stamps, Backspace erases.',
      '', 'Caveats: sweeps and evolution run the CPU reference solver at tier ' + this.evalTier + '. Scores are comparable only within the same solver version, backend and tier.',
    ];
    this.notify.popover('About / methodology', lines.join('\n'));
  }

  /* ---------------- hotkeys (§9.5) ---------------- */
  _key(e) {
    const t = e.target, tag = t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (t === this.dom.canvas && (e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === 'Backspace')) return; // BrushTool caret
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.ctrlKey || e.metaKey) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.brush.redoAction() : this.brush.undoAction(); } return; }
    const k = { '{': '[', '}': ']' }[e.key] || e.key; let handled = true;
    if (k >= '1' && k <= '6' && k.length === 1) this.setMode(MODES[+k - 1]);
    else if (k === ' ') this.action('toggle');
    else if (k === '.') this.action('step');
    else if (k === '[' || k === ']') { const f = e.shiftKey ? 1.02 : 1.12; this.params.set('H', +(this.params.get('H') * (k === ']' ? f : 1 / f)).toFixed(4)); }
    else switch (k.toLowerCase()) {
      case 'b': this.brush.setTool('brush'); break;
      case 'l': this.brush.setTool('line'); break;
      case 'p': this.brush.setTool('poly'); break;
      case 'r': this.resetFlow(); break;
      case 's': this.mode === 'sweep' ? this.runSweep() : this.setMode('sweep'); break;
      case 'w': this.mode === 'rewind' ? this.startRewind() : this.setMode('rewind'); break;
      case 'g': this.view.showOverlay = !this.view.showOverlay; break;
      case '?': this.about(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }
}

/** Mutation operator for Evolve mode: add / erase / move a small disk, respecting the ink budget and protected columns. */
export function mutateMask(src, w, h, budget, protectedCols, rng) {
  const m = Uint8Array.from(src); let count = 0; for (let n = 0; n < m.length; n++) count += m[n];
  const paint = (cx, cy, r, val) => forDisk(cx, cy, r)((i, j) => {
    if (i < protectedCols || i >= w - protectedCols || j < 0 || j >= h) return;
    const n = i + j * w; if (m[n] === val) return; if (val && count >= budget) return; m[n] = val; count += val ? 1 : -1;
  });
  const ops = 1 + rng.int(3);
  for (let o = 0; o < ops; o++) {
    const kind = rng.int(3), r = 1 + rng.next() * 3, cx = protectedCols + 1 + rng.next() * (w - 2 * protectedCols - 2), cy = rng.next() * h;
    if (kind === 0) paint(cx, cy, r, 1);
    else if (kind === 1) paint(cx, cy, r, 0);
    else {
      let n = -1; for (let tries = 0; tries < 32 && n < 0; tries++) { const c = rng.int(m.length); if (m[c]) n = c; }
      if (n < 0) { paint(cx, cy, r, 1); continue; }
      const sx = (n % w) + 0.5, sy = Math.floor(n / w) + 0.5;
      paint(sx, sy, r, 0); paint(sx + (rng.next() - 0.5) * 6, sy + (rng.next() - 0.5) * 6, r, 1);
    }
  }
  return m;
}