/** Bulk invariants (§6.1). CPU reduction in a fixed order → deterministic. */
export function bulkInvariants(solver) {
  const g = solver.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny;
  const { u, v, w, wx, wy, wz, solid } = solver, nu = solver.nu;
  const ix = 0.5 / g.hx, iy = 0.5 / g.hy, iz = 0.5 / g.hz;
  let E = 0, Z = 0, P = 0, eps = 0, n = 0, ng = 0, divMax = 0, umax = 0, Q = 0, nq = 0;
  const div = solver.div;
  // |∇f|² at cell m (central differences); a plain function so the hot loop allocates nothing.
  const g3 = (f, m) => { const gx = (f[m + 1] - f[m - 1]) * ix, gy = (f[m + sy] - f[m - sy]) * iy, gz = (f[m + sz] - f[m - sz]) * iz; return gx * gx + gy * gy + gz * gz; };
  for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
    const m = i + j * sy + k * sz; if (solid[m]) continue; n++;
    const uu = u[m], vv = v[m], ww = w[m];
    E += uu * uu + vv * vv + ww * ww; Z += wx[m] * wx[m] + wy[m] * wy[m] + wz[m] * wz[m];
    const sp = Math.abs(uu) + Math.abs(vv) + Math.abs(ww); if (sp > umax) umax = sp;
    const ad = Math.abs(div[m]); if (ad > divMax) divMax = ad;
    if (i === Nx - 2) { Q += uu; nq++; }
    if (i > 0 && i < Nx - 1 && j > 0 && j < Ny - 1 && k > 0 && k < Nz - 1) {
      ng++;
      eps += g3(u, m) + g3(v, m) + g3(w, m);
      P += g3(wx, m) + g3(wy, m) + g3(wz, m);
    }
  }
  n = Math.max(1, n);
  return { E: 0.5 * E / n, Z: 0.5 * Z / n, P: ng ? 0.5 * P / ng : 0, eps: ng ? nu * eps / ng : 0, divMax, divNorm: divMax * g.hx / solver.U0, umax, cfl: umax * solver.dt / g.hx, Q: nq ? Q / nq / solver.U0 : 0 };
}