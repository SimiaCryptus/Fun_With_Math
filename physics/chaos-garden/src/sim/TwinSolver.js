import { CpuSolver } from './CpuSolver.js';
/**
 * Perturbed twin sharing barriers and parameters; used by the Lyapunov estimator (§6.4).
 * Built with the same backend class as the main solver; on the GPU it shares the geometry buffers and
 * is copied / perturbed / renormalised device-side so it tracks the main solver's *device* state.
 */
export class TwinSolver {
  constructor(main, opts = {}) {
    this.main = main; this.cadence = opts.cadence ?? 1; this.count = 0;
    const Ctor = typeof main.constructor === 'function' ? main.constructor : CpuSolver;
    this.solver = new Ctor(main.grid, main.params, { pIters: main.pIters, tracerCount: 0, geometryFrom: main });
    this.copyFrom();
  }
  copyFrom() {
    const s = this.solver, m = this.main;
    s.solid = m.solid; s.hasSolid = m.hasSolid;
    s.pNb = m.pNb; s.pInv = m.pInv; // share the Poisson gather tables; main rebuilds them in place on setBarriers
    s.u.set(m.u); s.v.set(m.v); s.w.set(m.w); s.p.set(m.p); s.inletNoise.set(m.inletNoise);
    s.t = m.t; s.stepCount = m.stepCount;
    s.copyStateFrom?.(m); // async backend: device-side copy, so the twin starts from the current state, not the last readback
  }
  /** Add δ₀·ζ with ζ a horizontally divergence-free (streamfunction) field of unit rms. */
  perturb(rng, delta0) {
    const s = this.solver, g = s.grid, modes = [];
    for (let m = 0; m < 6; m++) modes.push({ a: rng.gauss(), kx: 2 * Math.PI * (1 + rng.int(4)) / g.Lx, ky: 2 * Math.PI * (1 + rng.int(4)) / g.Ly, px: rng.next() * 6.283, py: rng.next() * 6.283 });
    const zu = new Float32Array(g.N), zv = new Float32Array(g.N); let ss = 0, n2 = 0;
    for (let n = 0; n < g.N; n++) {
      if (s.solid[n]) continue; const i = n % g.Nx, j = Math.floor(n / g.Nx) % g.Ny;
      if (i === 0 || i === g.Nx - 1) continue;
      const x = (i + 0.5) * g.hx, y = (j + 0.5) * g.hy; let du = 0, dv = 0;
      for (const q of modes) { du += q.a * q.ky * Math.sin(q.kx * x + q.px) * Math.cos(q.ky * y + q.py); dv -= q.a * q.kx * Math.cos(q.kx * x + q.px) * Math.sin(q.ky * y + q.py); }
      zu[n] = du; zv[n] = dv; ss += du * du + dv * dv; n2++;
    }
    const sc = delta0 / Math.sqrt(ss / Math.max(1, n2));
    if (s.addVelocity) s.addVelocity(zu, zv, sc);
    else for (let n = 0; n < g.N; n++) { s.u[n] += sc * zu[n]; s.v[n] += sc * zv[n]; }
  }
  step() { if (++this.count % this.cadence === 0) this.solver.step(); }
  /** Promise (or null on the CPU) that resolves when the twin's arrays are current. */
  sync() { return this.solver.sync(); }
  /** rms separation over fluid cells */
  diffNorm() {
    const s = this.solver, m = this.main; let ss = 0, n2 = 0;
    for (let n = 0; n < m.grid.N; n++) { if (m.solid[n]) continue; const du = s.u[n] - m.u[n], dv = s.v[n] - m.v[n], dw = s.w[n] - m.w[n]; ss += du * du + dv * dv + dw * dw; n2++; }
    return Math.sqrt(ss / Math.max(1, n2));
  }
  renormalize(delta0) {
    const d = this.diffNorm(); if (!(d > 0)) return; const sc = delta0 / d, s = this.solver, m = this.main;
    for (let n = 0; n < m.grid.N; n++) { s.u[n] = m.u[n] + sc * (s.u[n] - m.u[n]); s.v[n] = m.v[n] + sc * (s.v[n] - m.v[n]); s.w[n] = m.w[n] + sc * (s.w[n] - m.w[n]); }
    s.blendToward?.(m, sc);
  }
  dispose() { this.solver.dispose(); }
}