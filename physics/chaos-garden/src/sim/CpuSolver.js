import { Rng } from '../core/Rng.js';

export const SOLVER_VERSION = '0.4.0-cpu'; // 0.4: gather-table SOR with deterministic residual exit, shared-stencil tracer advection

/**
 * Reference incompressible solver on a thin slab (§5). Collocated grid, clamped
 * MacCormack advection, explicit/Jacobi viscosity, red-black SOR projection.
 * Fully deterministic: fixed Δt, fixed iteration counts, seeded RNG only.
 * No vorticity confinement, ever.
 */
export class CpuSolver {
  constructor(grid, params, opts = {}) {
    this.grid = grid; this.params = { ...params };
    this.U0 = 1; this.nu = 1 / params.Re;
    this.pIters = opts.pIters ?? 40; this.sor = opts.sor ?? 1.5; this.jacobiIters = 16;
     this.pTol = opts.pTol ?? 1e-6; // SOR stops when max|Δp| in a sweep drops below this (state-dependent ⇒ deterministic, §5.4)
    this.cfl = 0.5; this.dt = this.cfl * Math.min(grid.hx, grid.hy) / this.U0;
    this.K = opts.tracerCount ?? 16;
    this.periodicY = params.spanwise !== 'freeslip';
    this.zsT = params.walls === 'freeslip' ? 1 : -1; // ghost sign for tangential velocity at z walls
    this.perturb = params.perturb ?? 0.01;
    const N = grid.N, f = () => new Float32Array(N);
    this.u = f(); this.v = f(); this.w = f();
    this.ua = f(); this.va = f(); this.wa = f();
    this.ub = f(); this.vb = f(); this.wb = f();
    this.mn = [f(), f(), f()]; this.mx = [f(), f(), f()];
     this.p = new Float32Array(N + 1); // +1: sentinel cell (index N) that is always 0, gathered for missing/solid neighbours
     this.div = f(); this.wx = f(); this.wy = f(); this.wz = f();
    this.solid = new Uint8Array(N); this.hasSolid = false; this.barrierVersion = -1;
     this.pNb = new Int32Array(6 * N); this.pInv = new Float32Array(N); this._buildPressureCoeffs();
    this.tracers = []; this.tracerTmp = [];
    for (let c = 0; c < this.K; c++) { this.tracers.push(f()); this.tracerTmp.push(f()); }
    this.inletNoise = new Float32Array(grid.Ny * grid.Nz);
    this.reverse = false; this.viscous = true; this.forcing = null;
    this.t = 0; this.stepCount = 0; this._mm = [0, 0];
    this.report = { t: 0, substeps: 1, divMax: 0, divNorm: 0, pIters: this.pIters, diffusion: 'explicit' };
    this.reset(params.seed);
  }
  profile(k) { const z = (k + 0.5) / this.grid.Nz; return this.params.inflow === 'parabolic' ? 6 * z * (1 - z) : 1; }
   /** Backend identity folded into score strings and run hashes. */
   get backend() { return 'cpu'; }
   get precision() { return 'f32'; }
   get version() { return SOLVER_VERSION.replace(/cpu$/, this.backend); }
   /**
    * Asynchronous backends return a promise from sync() that resolves once the CPU-visible arrays reflect
    * every submitted step, and need upload() after the arrays are edited. The CPU solver *is* the state.
    */
   get isAsync() { return false; }
   sync() { return null; }
   upload() { /* CPU arrays are the state */ }
  setBarriers(bf) {
    bf.extrude(this.grid, this.solid);
    let any = 0;
    for (let n = 0; n < this.grid.N; n++) if (this.solid[n]) { any = 1; this.u[n] = this.v[n] = this.w[n] = this.p[n] = 0; for (const T of this.tracers) T[n] = 0; }
    this.hasSolid = !!any; this.barrierVersion = bf.version;
     this._buildPressureCoeffs();
   }
   /**
    * Poisson gather table + inverse diagonal. Missing or solid neighbours point at the sentinel zero
    * cell (index N) and are dropped from the diagonal (homogeneous Neumann); the outlet column keeps
    * p = 0 (Dirichlet reference). Depends only on geometry, so it is rebuilt only when barriers change.
    */
   _buildPressureCoeffs() {
     const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, N = g.N, sy = Nx, sz = Nx * Ny, per = this.periodicY, solid = this.solid;
     const cx = 1 / (g.hx * g.hx), cy = 1 / (g.hy * g.hy), cz = 1 / (g.hz * g.hz), nb = this.pNb, inv = this.pInv;
     nb.fill(N); inv.fill(0);
     for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) for (let i = 1; i < Nx - 1; i++) {
       const n = i + j * sy + k * sz; if (solid[n]) continue;
       const m = 6 * n; let d = 0;
       if (i > 1 && !solid[n - 1]) { nb[m] = n - 1; d += cx; }
       if (i === Nx - 2) d += cx; else if (!solid[n + 1]) { nb[m + 1] = n + 1; d += cx; }
       const jm = j === 0 ? (per ? n + (Ny - 1) * sy : -1) : n - sy, jp = j === Ny - 1 ? (per ? n - (Ny - 1) * sy : -1) : n + sy;
       if (jm >= 0 && !solid[jm]) { nb[m + 2] = jm; d += cy; }
       if (jp >= 0 && !solid[jp]) { nb[m + 3] = jp; d += cy; }
       if (k > 0 && !solid[n - sz]) { nb[m + 4] = n - sz; d += cz; }
       if (k < Nz - 1 && !solid[n + sz]) { nb[m + 5] = n + sz; d += cz; }
       inv[n] = d > 0 ? 1 / d : 0;
     }
  }
  reset(seed = this.params.seed) {
    const g = this.grid, rng = new Rng(seed); this.rng = rng;
    for (let n = 0; n < this.inletNoise.length; n++) this.inletNoise[n] = rng.next() * 2 - 1;
    const amp = 0.1 * this.perturb;
    for (let k = 0; k < g.Nz; k++) { const pr = this.profile(k); for (let j = 0; j < g.Ny; j++) for (let i = 0; i < g.Nx; i++) {
      const n = g.idx(i, j, k);
      if (this.solid[n]) { this.u[n] = this.v[n] = this.w[n] = 0; continue; }
      this.u[n] = this.U0 * pr * (1 + amp * (rng.next() - 0.5)); this.v[n] = amp * (rng.next() - 0.5); this.w[n] = 0;
    } }
    this.p.fill(0); for (const T of this.tracers) T.fill(0);
    this.t = 0; this.stepCount = 0; this.applyBoundaries();
  }
  applyBoundaries() {
    const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny;
    const dir = this.reverse ? -1 : 1, U = this.U0, c = this.dt * U / g.hx, amp = this.perturb;
    const { u, v, w, solid, tracers, K } = this;
    for (let k = 0; k < Nz; k++) { const pr = this.profile(k); for (let j = 0; j < Ny; j++) {
      const i0 = j * sy + k * sz, i1 = i0 + Nx - 1;
      u[i0] = dir * U * pr; v[i0] = amp * U * pr * this.inletNoise[j + Ny * k]; w[i0] = 0;
      if (!this.reverse) { u[i1] -= c * (u[i1] - u[i1 - 1]); v[i1] -= c * (v[i1] - v[i1 - 1]); w[i1] -= c * (w[i1] - w[i1 - 1]); }
      else { u[i1] = -U * pr; v[i1] = 0; w[i1] = 0; }
      const band = Math.floor(j * K / Ny);
      for (let ch = 0; ch < K; ch++) { const T = tracers[ch]; T[i0] = ch === band ? 1 : 0; if (!this.reverse) T[i1] -= c * (T[i1] - T[i1 - 1]); }
    } }
    if (this.hasSolid) for (let n = 0; n < g.N; n++) if (solid[n]) { u[n] = 0; v[n] = 0; w[n] = 0; }
  }
  /** Trilinear sample at cell coordinates (center of cell i is i+0.5). zs/ys are ghost signs. */
  sample(f, x, y, z, zs, ys, mm) {
    const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny;
    let fx = x - 0.5, fy = y - 0.5, fz = z - 0.5;
    if (fx < 0) fx = 0; else if (fx > Nx - 1) fx = Nx - 1;
    if (fz < -0.5) fz = -0.5; else if (fz > Nz - 0.5) fz = Nz - 0.5;
    let i0 = Math.floor(fx); if (i0 > Nx - 2) i0 = Nx - 2; const tx = fx - i0;
    const k0 = Math.floor(fz), tz = fz - k0;
    let ka = k0, kb = k0 + 1, sa = 1, sb = 1;
    if (ka < 0) { ka = 0; sa = zs; } if (kb > Nz - 1) { kb = Nz - 1; sb = zs; }
    let ja, jb, ra = 1, rb = 1, ty;
    if (this.periodicY) { const j0 = Math.floor(fy); ty = fy - j0; ja = ((j0 % Ny) + Ny) % Ny; jb = ja + 1; if (jb === Ny) jb = 0; }
    else { if (fy < -0.5) fy = -0.5; else if (fy > Ny - 0.5) fy = Ny - 0.5; const j0 = Math.floor(fy); ty = fy - j0; ja = j0; jb = j0 + 1; if (ja < 0) { ja = 0; ra = ys; } if (jb > Ny - 1) { jb = Ny - 1; rb = ys; } }
    const b00 = i0 + ja * sy + ka * sz, b10 = i0 + jb * sy + ka * sz, b01 = i0 + ja * sy + kb * sz, b11 = i0 + jb * sy + kb * sz;
    const c000 = f[b00] * ra * sa, c100 = f[b00 + 1] * ra * sa, c010 = f[b10] * rb * sa, c110 = f[b10 + 1] * rb * sa;
    const c001 = f[b01] * ra * sb, c101 = f[b01 + 1] * ra * sb, c011 = f[b11] * rb * sb, c111 = f[b11 + 1] * rb * sb;
    if (mm) {
      let lo = c000, hi = c000;
      // unrolled: this runs millions of times per step, an array literal here dominated the advection cost
      if (c100 < lo) lo = c100; else if (c100 > hi) hi = c100;
      if (c010 < lo) lo = c010; else if (c010 > hi) hi = c010;
      if (c110 < lo) lo = c110; else if (c110 > hi) hi = c110;
      if (c001 < lo) lo = c001; else if (c001 > hi) hi = c001;
      if (c101 < lo) lo = c101; else if (c101 > hi) hi = c101;
      if (c011 < lo) lo = c011; else if (c011 > hi) hi = c011;
      if (c111 < lo) lo = c111; else if (c111 > hi) hi = c111;
      this._mm[0] = lo; this._mm[1] = hi;
    }
    const x00 = c000 + tx * (c100 - c000), x10 = c010 + tx * (c110 - c010), x01 = c001 + tx * (c101 - c001), x11 = c011 + tx * (c111 - c011);
    const y0 = x00 + ty * (x10 - x00), y1 = x01 + ty * (x11 - x01);
    return y0 + tz * (y1 - y0);
  }
  _advectVel(SU, SV, SW, OU, OV, OW, dt, dir, mm) {
    const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny;
    const u = this.u, v = this.v, w = this.w, solid = this.solid, zsT = this.zsT;
    const ax = dt * dir / g.hx, ay = dt * dir / g.hy, az = dt * dir / g.hz;
    const [mn0, mn1, mn2] = this.mn, [mx0, mx1, mx2] = this.mx;
    for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) {
      const row = j * sy + k * sz, e = row + Nx - 1;
      OU[row] = SU[row]; OV[row] = SV[row]; OW[row] = SW[row]; OU[e] = SU[e]; OV[e] = SV[e]; OW[e] = SW[e];
      for (let i = 1; i < Nx - 1; i++) {
        const n = row + i;
        if (solid[n]) { OU[n] = 0; OV[n] = 0; OW[n] = 0; continue; }
        const x = i + 0.5, y = j + 0.5, z = k + 0.5;
        const xm = x - 0.5 * ax * u[n], ym = y - 0.5 * ay * v[n], zm = z - 0.5 * az * w[n];
        const um = this.sample(u, xm, ym, zm, zsT, 1, false), vm = this.sample(v, xm, ym, zm, zsT, -1, false), wm = this.sample(w, xm, ym, zm, -1, 1, false);
        const xb = x - ax * um, yb = y - ay * vm, zb = z - az * wm;
        OU[n] = this.sample(SU, xb, yb, zb, zsT, 1, mm); if (mm) { mn0[n] = this._mm[0]; mx0[n] = this._mm[1]; }
        OV[n] = this.sample(SV, xb, yb, zb, zsT, -1, mm); if (mm) { mn1[n] = this._mm[0]; mx1[n] = this._mm[1]; }
        OW[n] = this.sample(SW, xb, yb, zb, -1, 1, mm); if (mm) { mn2[n] = this._mm[0]; mx2[n] = this._mm[1]; }
      }
    }
  }
  _advectTracers(dt) {
    const K = this.K; if (!K) return;
     const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny, per = this.periodicY;
    const u = this.u, v = this.v, w = this.w, solid = this.solid, zsT = this.zsT, T = this.tracers, O = this.tracerTmp;
    const ax = dt / g.hx, ay = dt / g.hy, az = dt / g.hz;
    for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) {
      const row = j * sy + k * sz, e = row + Nx - 1;
      for (let c = 0; c < K; c++) { O[c][row] = T[c][row]; O[c][e] = T[c][e]; }
      for (let i = 1; i < Nx - 1; i++) {
        const n = row + i;
        if (solid[n]) { for (let c = 0; c < K; c++) O[c][n] = 0; continue; }
        const x = i + 0.5, y = j + 0.5, z = k + 0.5;
        const xm = x - 0.5 * ax * u[n], ym = y - 0.5 * ay * v[n], zm = z - 0.5 * az * w[n];
        const um = this.sample(u, xm, ym, zm, zsT, 1, false), vm = this.sample(v, xm, ym, zm, zsT, -1, false), wm = this.sample(w, xm, ym, zm, -1, 1, false);
         // Resolve the trilinear stencil of the back-traced point once; all K channels share it (was K full samples per cell).
         // Scalars use zero-gradient ghosts (sign +1), so clamping to the outermost cell centre reproduces sample()'s result.
         let fx = x - ax * um - 0.5, fy = y - ay * vm - 0.5, fz = z - az * wm - 0.5;
         if (fx < 0) fx = 0; else if (fx > Nx - 1) fx = Nx - 1;
         if (fz < 0) fz = 0; else if (fz > Nz - 1) fz = Nz - 1;
         let i0 = Math.floor(fx); if (i0 > Nx - 2) i0 = Nx - 2;
         let k0 = Math.floor(fz); if (k0 > Nz - 2) k0 = Nz - 2;
         const tx = fx - i0, tz = fz - k0;
         let ja, jb, ty;
         if (per) { const j0 = Math.floor(fy); ty = fy - j0; ja = ((j0 % Ny) + Ny) % Ny; jb = ja === Ny - 1 ? 0 : ja + 1; }
         else { if (fy < 0) fy = 0; else if (fy > Ny - 1) fy = Ny - 1; let j0 = Math.floor(fy); if (j0 > Ny - 2) j0 = Ny - 2; ty = fy - j0; ja = j0; jb = j0 + 1; }
         const b00 = i0 + ja * sy + k0 * sz, b10 = i0 + jb * sy + k0 * sz, b01 = b00 + sz, b11 = b10 + sz;
         for (let c = 0; c < K; c++) {
           const f = T[c];
           const x00 = f[b00] + tx * (f[b00 + 1] - f[b00]), x10 = f[b10] + tx * (f[b10 + 1] - f[b10]);
           const x01 = f[b01] + tx * (f[b01 + 1] - f[b01]), x11 = f[b11] + tx * (f[b11 + 1] - f[b11]);
           const y0 = x00 + ty * (x10 - x00), y1 = x01 + ty * (x11 - x01);
           O[c][n] = y0 + tz * (y1 - y0);
         }
      }
    }
    this.tracers = O; this.tracerTmp = T;
  }
  _nbSum(f, i, j, k, n, zs, ys) {
    const g = this.grid, Ny = g.Ny, Nz = g.Nz, sy = g.sy, sz = g.sz;
    const cx = this._cx, cy = this._cy, cz = this._cz;
    let s = cx * (f[n - 1] + f[n + 1]);
    if (this.periodicY) s += cy * (f[n + (j === 0 ? (Ny - 1) * sy : -sy)] + f[n + (j === Ny - 1 ? -(Ny - 1) * sy : sy)]);
    else s += cy * ((j === 0 ? ys * f[n] : f[n - sy]) + (j === Ny - 1 ? ys * f[n] : f[n + sy]));
    s += cz * ((k === 0 ? zs * f[n] : f[n - sz]) + (k === Nz - 1 ? zs * f[n] : f[n + sz]));
    return s;
  }
  _diffuse(dt) {
    const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny, a = dt * this.nu, solid = this.solid;
    const cx = this._cx = 1 / (g.hx * g.hx), cy = this._cy = 1 / (g.hy * g.hy), cz = this._cz = 1 / (g.hz * g.hz), diag = 2 * (cx + cy + cz);
    const comps = [[this.u, this.ua, this.ub, this.zsT, 1], [this.v, this.va, this.vb, this.zsT, -1], [this.w, this.wa, this.wb, -1, 1]];
    if (a * diag < 0.25) {
      this.report.diffusion = 'explicit';
      for (const [f, out, , zs, ys] of comps) {
        out.set(f);
        for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) { const row = j * sy + k * sz; for (let i = 1; i < Nx - 1; i++) { const n = row + i; if (solid[n]) continue; out[n] = f[n] + a * (this._nbSum(f, i, j, k, n, zs, ys) - diag * f[n]); } }
        f.set(out);
      }
    } else {
      this.report.diffusion = 'jacobi';
      const inv = 1 / (1 + a * diag);
      for (const [f, rhs, scratch, zs, ys] of comps) {
        rhs.set(f); let x = f, xn = scratch; xn.set(f);
        for (let it = 0; it < this.jacobiIters; it++) {
          for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) { const row = j * sy + k * sz; for (let i = 1; i < Nx - 1; i++) { const n = row + i; if (solid[n]) continue; xn[n] = (rhs[n] + a * this._nbSum(x, i, j, k, n, zs, ys)) * inv; } }
          const tmp = x; x = xn; xn = tmp;
        }
        if (x !== f) f.set(x);
      }
    }
  }
  _addForces(dt) {
    const g = this.grid, { amp, k } = this.forcing;
    for (let n = 0; n < g.N; n++) { if (this.solid[n]) continue; const i = n % g.Nx, j = Math.floor(n / g.Nx) % g.Ny; this.u[n] += dt * amp * Math.sin(2 * Math.PI * k * (j + 0.5) / g.Ny); this.v[n] += dt * amp * Math.sin(2 * Math.PI * k * (i + 0.5) / g.Nx * 2); }
  }
  _divergence(out) {
    const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny, per = this.periodicY;
    const u = this.u, v = this.v, w = this.w, solid = this.solid;
    const ix = 0.5 / g.hx, iy = 0.5 / g.hy, iz = 0.5 / g.hz; let mx = 0;
    for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) {
      const row = j * sy + k * sz; out[row] = 0; out[row + Nx - 1] = 0;
      for (let i = 1; i < Nx - 1; i++) {
        const n = row + i; if (solid[n]) { out[n] = 0; continue; }
        const vN = j === Ny - 1 ? (per ? v[n - (Ny - 1) * sy] : -v[n]) : v[n + sy];
        const vS = j === 0 ? (per ? v[n + (Ny - 1) * sy] : -v[n]) : v[n - sy];
        const wT = k === Nz - 1 ? -w[n] : w[n + sz], wB = k === 0 ? -w[n] : w[n - sz];
        const d = (u[n + 1] - u[n - 1]) * ix + (vN - vS) * iy + (wT - wB) * iz;
        out[n] = d; const ad = d < 0 ? -d : d; if (ad > mx) mx = ad;
      }
    }
    return mx;
  }
  _pressure() {
     const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny;
     const p = this.p, rhs = this.div, nb = this.pNb, inv = this.pInv, om = this.sor, idt = 1 / this.dt, tol = this.pTol;
    const cx = 1 / (g.hx * g.hx), cy = 1 / (g.hy * g.hy), cz = 1 / (g.hz * g.hz);
     let it = 0;
     for (; it < this.pIters; it++) {
       let maxUp = 0; // largest SOR correction this sweep, fixed order ⇒ deterministic
       for (let color = 0; color < 2; color++) for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) {
        const row = j * sy + k * sz;
        for (let i = 1 + ((1 + j + k + color) & 1); i < Nx - 1; i += 2) {
           const n = row + i, id = inv[n]; if (id === 0) continue; // solid or fully enclosed
           const m = 6 * n;
           const s = cx * (p[nb[m]] + p[nb[m + 1]]) + cy * (p[nb[m + 2]] + p[nb[m + 3]]) + cz * (p[nb[m + 4]] + p[nb[m + 5]]);
           const d = om * ((s - rhs[n] * idt) * id - p[n]); p[n] += d;
           const ad = d < 0 ? -d : d; if (ad > maxUp) maxUp = ad;
        }
      }
       if (maxUp < tol) { it++; break; }
    }
     this.report.pIters = it;
  }
  _project() {
    const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny, per = this.periodicY;
    const p = this.p, u = this.u, v = this.v, w = this.w, solid = this.solid, dt = this.dt;
    const ax = dt * 0.5 / g.hx, ay = dt * 0.5 / g.hy, az = dt * 0.5 / g.hz;
    for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) { const row = j * sy + k * sz; for (let i = 1; i < Nx - 1; i++) {
      const n = row + i; if (solid[n]) continue; const pc = p[n];
      const pxm = i > 1 && !solid[n - 1] ? p[n - 1] : pc;
      const pxp = i === Nx - 2 ? 0 : (!solid[n + 1] ? p[n + 1] : pc);
      let pym, pyp;
      if (per) { const jm = n + (j === 0 ? (Ny - 1) * sy : -sy), jp = n + (j === Ny - 1 ? -(Ny - 1) * sy : sy); pym = solid[jm] ? pc : p[jm]; pyp = solid[jp] ? pc : p[jp]; }
      else { pym = j > 0 && !solid[n - sy] ? p[n - sy] : pc; pyp = j < Ny - 1 && !solid[n + sy] ? p[n + sy] : pc; }
      const pzm = k > 0 && !solid[n - sz] ? p[n - sz] : pc, pzp = k < Nz - 1 && !solid[n + sz] ? p[n + sz] : pc;
      u[n] -= ax * (pxp - pxm); v[n] -= ay * (pyp - pym); w[n] -= az * (pzp - pzm);
    } }
  }
  _curl() {
    const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny, per = this.periodicY, zs = this.zsT;
    const u = this.u, v = this.v, w = this.w, wx = this.wx, wy = this.wy, wz = this.wz, solid = this.solid;
    const ix = 0.5 / g.hx, iy = 0.5 / g.hy, iz = 0.5 / g.hz;
    for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
      const n = i + j * sy + k * sz;
      if (solid[n]) { wx[n] = wy[n] = wz[n] = 0; continue; }
      let dvdx, dwdx;
      if (i === 0) { dvdx = (v[n + 1] - v[n]) * 2 * ix; dwdx = (w[n + 1] - w[n]) * 2 * ix; }
      else if (i === Nx - 1) { dvdx = (v[n] - v[n - 1]) * 2 * ix; dwdx = (w[n] - w[n - 1]) * 2 * ix; }
      else { dvdx = (v[n + 1] - v[n - 1]) * ix; dwdx = (w[n + 1] - w[n - 1]) * ix; }
      let uN, uS, wN, wS;
      if (per) { const jp = n + (j === Ny - 1 ? -(Ny - 1) * sy : sy), jm = n + (j === 0 ? (Ny - 1) * sy : -sy); uN = u[jp]; uS = u[jm]; wN = w[jp]; wS = w[jm]; }
      else { uN = j === Ny - 1 ? u[n] : u[n + sy]; uS = j === 0 ? u[n] : u[n - sy]; wN = j === Ny - 1 ? w[n] : w[n + sy]; wS = j === 0 ? w[n] : w[n - sy]; }
      const uT = k === Nz - 1 ? zs * u[n] : u[n + sz], uB = k === 0 ? zs * u[n] : u[n - sz];
      const vT = k === Nz - 1 ? zs * v[n] : v[n + sz], vB = k === 0 ? zs * v[n] : v[n - sz];
      const dudy = (uN - uS) * iy, dwdy = (wN - wS) * iy, dudz = (uT - uB) * iz, dvdz = (vT - vB) * iz;
      wx[n] = dwdy - dvdz; wy[n] = dudz - dwdx; wz[n] = dvdx - dudy;
    }
  }
  /** Exactly one Δt (§5.5). @returns {StepReport} */
  step() {
    const dt = this.dt, g = this.grid, Nx = g.Nx, N = g.N;
    this.applyBoundaries();
    this._advectVel(this.u, this.v, this.w, this.ua, this.va, this.wa, dt, 1, true);
    this._advectVel(this.ua, this.va, this.wa, this.ub, this.vb, this.wb, dt, -1, false);
    const { u, v, w, ua, va, wa, ub, vb, wb, solid } = this, [mn0, mn1, mn2] = this.mn, [mx0, mx1, mx2] = this.mx;
     for (let row = 0; row < N; row += Nx) for (let n = row + 1; n < row + Nx - 1; n++) { // rows are contiguous in x: no modulo per cell
       if (solid[n]) continue;
      let c = ua[n] + 0.5 * (u[n] - ub[n]); ua[n] = c < mn0[n] ? mn0[n] : c > mx0[n] ? mx0[n] : c;
      c = va[n] + 0.5 * (v[n] - vb[n]); va[n] = c < mn1[n] ? mn1[n] : c > mx1[n] ? mx1[n] : c;
      c = wa[n] + 0.5 * (w[n] - wb[n]); wa[n] = c < mn2[n] ? mn2[n] : c > mx2[n] ? mx2[n] : c;
    }
    this.u = ua; this.ua = u; this.v = va; this.va = v; this.w = wa; this.wa = w;
    this._advectTracers(dt);
    if (this.viscous) this._diffuse(dt);
    if (this.forcing) this._addForces(dt);
    this._divergence(this.div);
    this._pressure();
    this._project();
    this.applyBoundaries();
    const divMax = this._divergence(this.div);
    this._curl();
    this.t += dt; this.stepCount++;
     const r = this.report; r.t = this.t; r.divMax = divMax; r.divNorm = divMax * g.hx / this.U0; // r.pIters is set by _pressure
    return r;
  }
  snapshot() {
    return { t: this.t, stepCount: this.stepCount, u: Float32Array.from(this.u), v: Float32Array.from(this.v), w: Float32Array.from(this.w), p: Float32Array.from(this.p), tracers: this.tracers.map((T) => Float32Array.from(T)), rng: this.rng.getState() };
  }
  restore(s) {
    this.t = s.t; this.stepCount = s.stepCount; this.u.set(s.u); this.v.set(s.v); this.w.set(s.w); this.p.set(s.p);
    s.tracers.forEach((T, c) => this.tracers[c]?.set(T)); this.rng.setState(s.rng); this._curl();
  }
  get state() { return { u: this.u, v: this.v, w: this.w, p: this.p, wx: this.wx, wy: this.wy, wz: this.wz, solid: this.solid, tracers: this.tracers }; }
  dispose() { /* nothing to free on CPU */ }
}