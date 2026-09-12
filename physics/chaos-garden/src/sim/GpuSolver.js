import { CpuSolver } from './CpuSolver.js';
import { GpuContext } from './gpu/GpuContext.js';

const WG = 64;

/**
 * WebGPU backend (§7.4). Same interface and stencils as CpuSolver; the CPU arrays become *mirrors*
 * of the device state. `step()` submits one Δt synchronously; `sync()` resolves once the mirrors
 * (u,v,w,p,ω,∇·u, tracer outlet plane — or all tracers when `wantTracers`) reflect every submitted step.
 * Differences from the CPU: the pressure solve runs exactly `pIters` SOR sweeps (no residual early exit,
 * which would need a mid-step readback); the last sweep's max correction is reported as `report.residual`.
 */
export class GpuSolver extends CpuSolver {
  constructor(grid, params, opts = {}) {
    super(grid, params, opts);
     // Red-black is only a valid 2-colouring across a periodic wrap when Ny is even; on the device an odd Ny would
     // let same-colour neighbours update concurrently (data race). Refuse so Solver.create falls back to the CPU.
     if (this.periodicY && (grid.Ny & 1)) throw new Error(`GpuSolver: periodic span requires even Ny (got ${grid.Ny})`);
    const ctx = opts.context || GpuContext.current;
    if (!ctx) throw new Error('WebGPU device unavailable');
    this.ctx = ctx; this.device = ctx.device;
    this.wantTracers = false; this._dirty = false; this._inflight = null; this._epoch = 0; this._dead = false;
    const cx = 1 / (grid.hx * grid.hx), cy = 1 / (grid.hy * grid.hy), cz = 1 / (grid.hz * grid.hz);
    this._diag = 2 * (cx + cy + cz); this._explicit = this.dt * this.nu * this._diag < 0.25;
    this.report.diffusion = this._explicit ? 'explicit' : 'jacobi'; this.report.residual = 0;
    this._wgN = Math.ceil(grid.N / WG); this._wgRows = Math.ceil(grid.Ny * grid.Nz / WG); this._wgOut = Math.ceil(this.K * grid.Ny * grid.Nz / WG);
    this._alloc(opts.geometryFrom || null);
    this._build();
    this._writeSim();
    this._uploadGeometry();
    this.upload();
  }
  get backend() { return 'webgpu'; }
  get isAsync() { return true; }

  /* ---------------- resources ---------------- */
  _alloc(shared) {
    const d = this.device, g = this.grid, N = g.N, K = this.K, M = g.Ny * g.Nz, U = GPUBufferUsage;
    const mk = (size, usage) => d.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage });
    const st = (size) => mk(size, U.STORAGE | U.COPY_SRC | U.COPY_DST);
    const un = (size) => mk(size, U.UNIFORM | U.COPY_DST);
    this._geomShared = !!shared;
    const b = this.b = {
      sim: un(96), passFwd: un(16), passBwd: un(16), passC0: un(16), passC1: un(16), passScale: un(16),
      vel: st(16 * N), velA: st(16 * N), velB: st(16 * N), mn: st(16 * N), mx: st(16 * N), vort: st(16 * N),
      p: st(4 * (N + 1)), div: st(4 * N), tr: st(4 * K * N), trOut: st(4 * K * N), outlet: st(4 * K * M), noise: st(4 * M), atom: st(8),
      solid: shared ? shared.b.solid : st(4 * N), pNb: shared ? shared.b.pNb : st(24 * N), pInv: shared ? shared.b.pInv : st(4 * N),
      stage: mk(40 * N + 4 * K * N + 8, U.MAP_READ | U.COPY_DST),
    };
    this._own = Object.entries(b).filter(([k]) => !(shared && (k === 'solid' || k === 'pNb' || k === 'pInv'))).map(([, v]) => v);
    this._writePass(b.passFwd, 1, 0, 1); this._writePass(b.passBwd, -1, 0, 0); this._writePass(b.passC0, 0, 0, 0); this._writePass(b.passC1, 0, 1, 0);
    this._simBuf = new ArrayBuffer(96); this._simU = new Uint32Array(this._simBuf); this._simF = new Float32Array(this._simBuf);
    this._pack4 = new Float32Array(4 * N); this._packT = K ? new Float32Array(K * N) : null;
  }
  _writePass(buf, dir, color = 0, mode = 0) {
    const ab = new ArrayBuffer(16); new Float32Array(ab, 0, 1)[0] = dir; new Uint32Array(ab, 4, 2).set([color, mode]);
    this.device.queue.writeBuffer(buf, 0, ab);
  }
  _writeSim() {
    const g = this.grid, u = this._simU, f = this._simF, a = this.dt * this.nu;
    u[0] = g.Nx; u[1] = g.Ny; u[2] = g.Nz; u[3] = g.N;
    f[4] = g.hx; f[5] = g.hy; f[6] = g.hz; f[7] = this.dt;
    f[8] = this.U0; f[9] = this.perturb; f[10] = a; f[11] = this.sor;
    u[12] = this.periodicY ? 1 : 0; u[13] = this.params.inflow === 'parabolic' ? 1 : 0; u[14] = this.K; u[15] = this.reverse ? 1 : 0;
    f[16] = this.zsT; f[17] = 1 / this.dt; f[18] = this._diag; f[19] = 1 / (1 + a * this._diag);
    f[20] = this.forcing?.amp || 0; f[21] = this.forcing?.k || 0; f[22] = 0; f[23] = 0;
    this.device.queue.writeBuffer(this.b.sim, 0, this._simBuf);
  }
  _bg(pipeline, map) {
    return this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: Object.entries(map).map(([k, buffer]) => ({ binding: +k, resource: { buffer } })) });
  }
  _build() {
    const d = this.device, b = this.b, mod = this.ctx.module;
    const pl = (entryPoint) => d.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint } });
    const P = this._P = {};
    for (const k of ['boundaries', 'advect', 'combine', 'advectTracers', 'diffuse', 'jacobi', 'forces', 'divergence', 'sor', 'project', 'curl', 'gatherOutlet', 'zeroSolid', 'addVel', 'blend', 'scaleVel']) P[k] = pl(k);
    // Binding numbers follow the table in gpu/shaders.js. Auto layouts only accept the bindings each entry point actually uses.
    const spec = {
      boundaries: [P.boundaries, { 0: b.sim, 8: b.vel, 15: b.tr, 16: b.noise }],
      advectFwd: [P.advect, { 0: b.sim, 1: b.passFwd, 2: b.vel, 3: b.vel, 4: b.velA, 5: b.mn, 6: b.mx, 7: b.solid }],
      advectBwd: [P.advect, { 0: b.sim, 1: b.passBwd, 2: b.vel, 3: b.velA, 4: b.velB, 5: b.mn, 6: b.mx, 7: b.solid }],
      combine: [P.combine, { 0: b.sim, 2: b.vel, 3: b.velA, 4: b.velB, 5: b.mn, 6: b.mx, 7: b.solid }],
      advectTracers: [P.advectTracers, { 0: b.sim, 2: b.vel, 7: b.solid, 14: b.tr, 15: b.trOut }],
      diffuse: [P.diffuse, { 0: b.sim, 3: b.vel, 4: b.velA, 7: b.solid }],
      jacobi0: [P.jacobi, { 0: b.sim, 2: b.vel, 3: b.vel, 4: b.velA, 7: b.solid }],
      jacobiA: [P.jacobi, { 0: b.sim, 2: b.vel, 3: b.velA, 4: b.velB, 7: b.solid }],
      jacobiB: [P.jacobi, { 0: b.sim, 2: b.vel, 3: b.velB, 4: b.velA, 7: b.solid }],
      forces: [P.forces, { 0: b.sim, 7: b.solid, 8: b.vel }],
      divergence: [P.divergence, { 0: b.sim, 2: b.vel, 7: b.solid, 10: b.div, 13: b.atom }],
      sor0: [P.sor, { 0: b.sim, 1: b.passC0, 9: b.p, 10: b.div, 11: b.pNb, 12: b.pInv, 13: b.atom }],
      sor1: [P.sor, { 0: b.sim, 1: b.passC1, 9: b.p, 10: b.div, 11: b.pNb, 12: b.pInv, 13: b.atom }],
      project: [P.project, { 0: b.sim, 7: b.solid, 8: b.vel, 9: b.p }],
      curl: [P.curl, { 0: b.sim, 2: b.vel, 7: b.solid, 17: b.vort }],
      gatherOutlet: [P.gatherOutlet, { 0: b.sim, 14: b.tr, 18: b.outlet }],
      zeroSolid: [P.zeroSolid, { 0: b.sim, 7: b.solid, 8: b.vel, 9: b.p, 15: b.tr }],
      addVel: [P.addVel, { 0: b.sim, 3: b.velA, 8: b.vel }],
      scaleVel: [P.scaleVel, { 0: b.sim, 1: b.passScale, 8: b.vel }],
    };
    this.pl = {}; this.bg = {};
    for (const [k, [pipe, map]] of Object.entries(spec)) { this.pl[k] = pipe; this.bg[k] = this._bg(pipe, map); }
    this.pl.blend = P.blend;
  }
  _uploadGeometry() {
    if (this._geomShared) return;
    const q = this.device.queue, b = this.b;
    const s32 = this._solid32 || (this._solid32 = new Uint32Array(this.grid.N)); s32.set(this.solid);
    q.writeBuffer(b.solid, 0, s32); q.writeBuffer(b.pNb, 0, this.pNb); q.writeBuffer(b.pInv, 0, this.pInv);
  }
  _pack(a, b, c) { const o = this._pack4, N = this.grid.N; for (let n = 0, m = 0; n < N; n++, m += 4) { o[m] = a[n]; o[m + 1] = b[n]; o[m + 2] = c[n]; o[m + 3] = 0; } return o; }
  /** Run one kernel outside step() (geometry / twin / rewind helpers). */
  _kernel(key, wg, bg = this.bg[key]) {
    if (this._dead) return;
    const enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.pl[key]); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(wg); pass.end();
    this.device.queue.submit([enc.finish()]); this._dirty = true;
  }

  /* ---------------- CPU ↔ GPU state ---------------- */
  /** Push the mirror arrays to the device (after reset / restore / geometry change). */
  upload() {
    if (!this.b || this._dead) return;
    const q = this.device.queue, b = this.b, N = this.grid.N, K = this.K;
    q.writeBuffer(b.vel, 0, this._pack(this.u, this.v, this.w));
    q.writeBuffer(b.vort, 0, this._pack(this.wx, this.wy, this.wz));
    q.writeBuffer(b.p, 0, this.p);
    if (K) { for (let c = 0; c < K; c++) this._packT.set(this.tracers[c], c * N); q.writeBuffer(b.tr, 0, this._packT); }
    q.writeBuffer(b.noise, 0, this.inletNoise);
    this._epoch++; this._dirty = false; // a readback issued before this upload must not overwrite the mirrors
  }
  setBarriers(bf) {
    super.setBarriers(bf);
    if (!this.b) return;
    this._uploadGeometry();
    this._kernel('zeroSolid', this._wgN); // zero solids on the device rather than pushing (possibly stale) mirrors
  }
  reset(seed = this.params.seed) { super.reset(seed); if (this.b) this.upload(); }
  restore(s) { super.restore(s); this.upload(); }
  /** Device-side copy of another GpuSolver's state (twin initialisation). */
  copyStateFrom(m) {
    if (!(m instanceof GpuSolver) || this._dead) return;
    const enc = this.device.createCommandEncoder(), N = this.grid.N, M = this.grid.Ny * this.grid.Nz;
    enc.copyBufferToBuffer(m.b.vel, 0, this.b.vel, 0, 16 * N); enc.copyBufferToBuffer(m.b.vort, 0, this.b.vort, 0, 16 * N);
    enc.copyBufferToBuffer(m.b.p, 0, this.b.p, 0, 4 * (N + 1)); enc.copyBufferToBuffer(m.b.noise, 0, this.b.noise, 0, 4 * M);
    if (this.K && this.K === m.K) enc.copyBufferToBuffer(m.b.tr, 0, this.b.tr, 0, 4 * this.K * N);
    this.device.queue.submit([enc.finish()]); this._dirty = true;
  }
  /** u += sc·zu, v += sc·zv on both mirrors and device (twin perturbation). */
  addVelocity(zu, zv, sc) {
    const N = this.grid.N, pk = this._pack4;
    for (let n = 0, m = 0; n < N; n++, m += 4) { const du = sc * zu[n], dv = sc * zv[n]; this.u[n] += du; this.v[n] += dv; pk[m] = du; pk[m + 1] = dv; pk[m + 2] = 0; pk[m + 3] = 0; }
    if (this._dead) return;
    this.device.queue.writeBuffer(this.b.velA, 0, pk); this._kernel('addVel', this._wgN);
  }
  /** u = other.u + sc·(u − other.u) on the device (twin renormalisation; mirrors are updated by the caller). */
  blendToward(other, sc) {
    if (!(other instanceof GpuSolver) || this._dead) return;
    if (this._blendFor !== other) { this._blendFor = other; this._blendBg = this._bg(this._P.blend, { 0: this.b.sim, 1: this.b.passScale, 3: other.b.vel, 8: this.b.vel }); }
    this._writePass(this.b.passScale, sc); this._kernel('blend', this._wgN, this._blendBg);
  }
  /** u *= f on the device (mirrors are scaled by the caller). */
  scaleVelocity(f) { if (this._dead) return; this._writePass(this.b.passScale, f); this._kernel('scaleVel', this._wgN); }

  /* ---------------- one Δt ---------------- */
  step() {
    if (this._dead) return this.report;
    const d = this.device, b = this.b, N = this.grid.N, K = this.K, wgN = this._wgN;
    this._writeSim();
    const enc = d.createCommandEncoder();
    let pass;
    const run = (key, wg = wgN) => { pass.setPipeline(this.pl[key]); pass.setBindGroup(0, this.bg[key]); pass.dispatchWorkgroups(wg); };
    pass = enc.beginComputePass();
    run('boundaries', this._wgRows);
    run('advectFwd'); run('advectBwd'); run('combine');
    pass.end(); enc.copyBufferToBuffer(b.velB, 0, b.vel, 0, 16 * N);
    if (K) { pass = enc.beginComputePass(); run('advectTracers'); pass.end(); enc.copyBufferToBuffer(b.trOut, 0, b.tr, 0, 4 * K * N); }
    if (this.viscous) {
      pass = enc.beginComputePass();
      if (this._explicit) { run('diffuse'); pass.end(); enc.copyBufferToBuffer(b.velA, 0, b.vel, 0, 16 * N); }
      else {
        run('jacobi0'); for (let it = 1; it < this.jacobiIters; it++) run(it & 1 ? 'jacobiA' : 'jacobiB');
        pass.end(); enc.copyBufferToBuffer(this.jacobiIters & 1 ? b.velA : b.velB, 0, b.vel, 0, 16 * N);
      }
    }
    enc.clearBuffer(b.atom);
    pass = enc.beginComputePass();
    if (this.forcing) run('forces');
    run('divergence');
     const sweeps = Math.max(1, this.pIters | 0); // the final sweep below always runs, so never fewer than one
     for (let it = 0; it < sweeps - 1; it++) { run('sor0'); run('sor1'); }
    pass.end(); enc.clearBuffer(b.atom, 4, 4); // residual slot reports the *last* sweep only
    pass = enc.beginComputePass();
    run('sor0'); run('sor1'); run('project'); run('boundaries', this._wgRows);
    pass.end(); enc.clearBuffer(b.atom, 0, 4);
    pass = enc.beginComputePass(); run('divergence'); run('curl'); pass.end();
    d.queue.submit([enc.finish()]);
    this.t += this.dt; this.stepCount++; this._dirty = true;
     const r = this.report; r.t = this.t; r.pIters = sweeps;
    return r;
  }

  /* ---------------- readback ---------------- */
  sync() {
    if (this._dead) return Promise.resolve();
    if (this._inflight) return this._dirty ? this._inflight.then(() => this.sync()) : this._inflight;
    if (!this._dirty) return Promise.resolve();
    this._dirty = false;
    const d = this.device, b = this.b, g = this.grid, N = g.N, K = this.K, M = g.Ny * g.Nz, want = this.wantTracers && K > 0;
    const enc = d.createCommandEncoder();
    if (K && !want) { const pass = enc.beginComputePass(); pass.setPipeline(this.pl.gatherOutlet); pass.setBindGroup(0, this.bg.gatherOutlet); pass.dispatchWorkgroups(this._wgOut); pass.end(); }
    let off = 0; const lay = {};
    const cp = (key, buf, bytes) => { enc.copyBufferToBuffer(buf, 0, b.stage, off, bytes); lay[key] = off; off += bytes; };
    cp('vel', b.vel, 16 * N); cp('vort', b.vort, 16 * N); cp('p', b.p, 4 * N); cp('div', b.div, 4 * N);
    if (want) cp('tr', b.tr, 4 * K * N); else if (K) cp('outlet', b.outlet, 4 * K * M);
    cp('atom', b.atom, 8);
    d.queue.submit([enc.finish()]);
    const epoch = this._epoch;
    this._inflight = b.stage.mapAsync(GPUMapMode.READ, 0, off).then(() => {
      try { if (epoch === this._epoch && !this._dead) this._readback(b.stage.getMappedRange(0, off), lay, want); }
      finally { try { b.stage.unmap(); } catch { /* destroyed */ } this._inflight = null; }
    }, (err) => { this._inflight = null; if (!this._dead) throw err; });
    return this._inflight;
  }
  _readback(ab, lay, want) {
    const f = new Float32Array(ab), g = this.grid, N = g.N, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, K = this.K;
    const { u, v, w, wx, wy, wz } = this;
    let o = lay.vel >> 2; for (let n = 0; n < N; n++, o += 4) { u[n] = f[o]; v[n] = f[o + 1]; w[n] = f[o + 2]; }
    o = lay.vort >> 2; for (let n = 0; n < N; n++, o += 4) { wx[n] = f[o]; wy[n] = f[o + 1]; wz[n] = f[o + 2]; }
    o = lay.p >> 2; this.p.set(f.subarray(o, o + N)); o = lay.div >> 2; this.div.set(f.subarray(o, o + N));
    if (want) { o = lay.tr >> 2; for (let c = 0; c < K; c++) this.tracers[c].set(f.subarray(o + c * N, o + (c + 1) * N)); }
    else if (K) { // only the outlet plane (what MutualInfo reads) — the rest of the tracer mirrors stay stale
      o = lay.outlet >> 2; const M = Ny * Nz;
      for (let c = 0; c < K; c++) { const T = this.tracers[c]; for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) T[(Nx - 2) + j * Nx + k * Nx * Ny] = f[o + c * M + j + Ny * k]; }
    }
    const a = new Float32Array(ab, lay.atom, 2); // atomicMax on positive-float bit patterns ⇒ reinterpret as f32
    const r = this.report; r.divMax = a[0]; r.divNorm = a[0] * g.hx / this.U0; r.residual = a[1];
  }
  dispose() { this._dead = true; for (const buf of this._own) { try { buf.destroy(); } catch { /* ignore */ } } }
}