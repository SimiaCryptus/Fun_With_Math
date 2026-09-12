export function shannon(hist) {
  let n = 0; for (let i = 0; i < hist.length; i++) n += hist[i];
  if (!n) return 0; let H = 0;
  for (let i = 0; i < hist.length; i++) if (hist[i] > 0) { const p = hist[i] / n; H -= p * Math.log(p); }
  return H;
}
/**
 * Field entropy (§6.3): normalized Shannon entropy of log(|ω|+δ) over the analysis
 * window (B=256 bins on a fixed range [1e-3, 1e3]) plus velocity-direction entropy.
 */
export function vorticityEntropy(solver, win, B = 256) {
  const g = solver.grid, sy = g.Nx, sz = g.Nx * g.Ny, { i0, j0, nx, ny } = win;
  const hist = new Float64Array(B), ang = new Float64Array(64);
  const lo = Math.log(1e-3), hi = Math.log(1e3), sc = B / (hi - lo);
  const { wx, wy, wz, u, v, solid } = solver;
  for (let k = 0; k < g.Nz; k++) for (let jj = 0; jj < ny; jj++) for (let ii = 0; ii < nx; ii++) {
    const n = (i0 + ii) + (j0 + jj) * sy + k * sz; if (solid[n]) continue;
    const m = Math.sqrt(wx[n] * wx[n] + wy[n] * wy[n] + wz[n] * wz[n]);
    let b = Math.floor((Math.log(m + 1e-3) - lo) * sc); if (b < 0) b = 0; else if (b >= B) b = B - 1; hist[b]++;
    let a = Math.floor((Math.atan2(v[n], u[n]) + Math.PI) / (2 * Math.PI) * 64); if (a >= 64) a = 63; ang[a]++;
  }
  return { Hw: shannon(hist) / Math.log(B), Hang: shannon(ang) / Math.log(64) };
}