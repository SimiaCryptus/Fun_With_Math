import { lut } from './Palette.js';
import { bandpass2d } from '../metrics/Spectra.js';
/** Plan-view compositing: field layer, barrier mask, paint preview, analysis-window overlay. */
export class TopDownView {
  constructor(grid, barrier) {
    this.barrier = barrier; this.layer = 'vorticity'; this.lockRange = false; this.showOverlay = true;
    this.range = { vorticity: 1, speed: 1, scope: 1 }; this.preview = null; this.caret = null;
    this.scopeBand = [0.15, 0.5]; this.lastScope = null; this.setGrid(grid);
  }
  setGrid(grid) { this.grid = grid; const n = grid.Nx * grid.Ny; this.field = new Float32Array(n); this.data = new Uint8ClampedArray(n * 4); this.dye = new Float32Array(n * 3); }
  _bandColors(K) { if (this._bc?.length === K) return this._bc; this._bc = []; for (let c = 0; c < K; c++) { const h = c / K; this._bc.push(hsl(h, 0.75, 0.55)); } return this._bc; }
  compose(solver) {
    const g = this.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, n2 = Nx * Ny, f = this.field, d = this.data, mask = this.barrier.mask;
    const layer = this.layer;
    if (layer === 'dye') {
      const K = solver.K, cols = this._bandColors(K), dye = this.dye; dye.fill(0);
      for (let c = 0; c < K; c++) { const T = solver.tracers[c], col = cols[c]; for (let k = 0; k < Nz; k++) for (let q = 0; q < n2; q++) { const v = T[q + k * n2] / Nz; dye[q * 3] += v * col[0]; dye[q * 3 + 1] += v * col[1]; dye[q * 3 + 2] += v * col[2]; } }
    } else {
      f.fill(0);
      if (layer === 'speed') { for (let k = 0; k < Nz; k++) for (let q = 0; q < n2; q++) { const n = q + k * n2; f[q] += Math.hypot(solver.u[n], solver.v[n], solver.w[n]) / Nz; } }
      else { for (let k = 0; k < Nz; k++) for (let q = 0; q < n2; q++) f[q] += solver.wz[q + k * n2] / Nz; }
      if (layer === 'scope') this._scope(g);
      const key = layer === 'speed' ? 'speed' : layer === 'scope' ? 'scope' : 'vorticity';
      if (!this.lockRange) { let m = 0; for (let q = 0; q < n2; q++) { const a = Math.abs(f[q]); if (a > m) m = a; } const tgt = Math.max(1e-6, 0.85 * m); this.range[key] = this.range[key] * 0.9 + tgt * 0.1; }
      this._cur = { key, r: this.range[key] };
    }
    const L = layer === 'speed' ? lut('viridis') : lut('coolwarm'), r = this._cur?.r || 1, signed = layer !== 'speed';
    const win = g.analysisWindow(), scope = layer === 'scope';
    for (let q = 0; q < n2; q++) {
      const o = q * 4;
      if (mask[q]) { d[o] = 44; d[o + 1] = 46; d[o + 2] = 54; d[o + 3] = 255; continue; }
      if (layer === 'dye') { d[o] = 10 + Math.min(245, this.dye[q * 3] * 255); d[o + 1] = 12 + Math.min(243, this.dye[q * 3 + 1] * 255); d[o + 2] = 18 + Math.min(237, this.dye[q * 3 + 2] * 255); }
      else { let t = signed ? 0.5 + 0.5 * f[q] / r : f[q] / r; t = t < 0 ? 0 : t > 1 ? 1 : t; const i = Math.round(t * 255) * 3; d[o] = L[i]; d[o + 1] = L[i + 1]; d[o + 2] = L[i + 2]; }
      d[o + 3] = 255;
      if (scope) { const i = q % Nx, j = (q / Nx) | 0; if (i < win.i0 || i >= win.i0 + win.nx || j < win.j0 || j >= win.j0 + win.ny) { d[o] *= 0.35; d[o + 1] *= 0.35; d[o + 2] *= 0.35; } }
    }
    if (this.preview) for (let q = 0; q < n2; q++) if (this.preview[q]) { const o = q * 4; d[o] = (d[o] + 108) >> 1; d[o + 1] = (d[o + 1] + 196) >> 1; d[o + 2] = (d[o + 2] + 255) >> 1; }
    if (this.caret) { const o = (this.caret.i + this.caret.j * Nx) * 4; d[o] = 255; d[o + 1] = 180; d[o + 2] = 80; }
    if (this.showOverlay) {
      const { i0, j0, nx, ny } = win, mark = (i, j) => { const o = (i + j * Nx) * 4; d[o] = 120; d[o + 1] = 130; d[o + 2] = 150; };
      for (let i = i0; i < i0 + nx; i += 2) { mark(i, j0); mark(i, j0 + ny - 1); }
      for (let j = j0; j < j0 + ny; j += 2) { mark(i0, j); mark(i0 + nx - 1, j); }
      const pc = this.barrier.protectedCols; for (let j = 0; j < Ny; j++) { for (let i = 0; i < pc; i++) { const o = (i + j * Nx) * 4; d[o] *= 0.6; d[o + 1] *= 0.6; d[o + 2] *= 0.6; } for (let i = Nx - pc; i < Nx; i++) { const o = (i + j * Nx) * 4; d[o] *= 0.6; d[o + 1] *= 0.6; d[o + 2] *= 0.6; } }
    }
    return d;
  }
  _scope(g) {
    const { i0, j0, nx, ny } = g.analysisWindow(), sub = new Float64Array(nx * ny), f = this.field;
    for (let jj = 0; jj < ny; jj++) for (let ii = 0; ii < nx; ii++) sub[ii + jj * nx] = f[(i0 + ii) + (j0 + jj) * g.Nx];
    const kmax = Math.PI / g.hy, k1 = this.scopeBand[0] * kmax, k2 = this.scopeBand[1] * kmax;
    const out = bandpass2d(sub, nx, ny, g.hx, g.hy, k1, k2);
    for (let jj = 0; jj < ny; jj++) for (let ii = 0; ii < nx; ii++) f[(i0 + ii) + (j0 + jj) * g.Nx] = out[ii + jj * nx];
    this.lastScope = { k1, k2 };
  }
}
function hsl(h, s, l) { const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; }