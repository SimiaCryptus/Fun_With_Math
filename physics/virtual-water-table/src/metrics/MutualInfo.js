/** I(in;out) from K inlet bands to K outlet bands, flux-weighted joint histogram (§6.5). */
export class MutualInfo {
  constructor(K) { this.K = K; this.joint = new Float64Array(K * K); this.forget = 0.998; }
  reset() { this.joint.fill(0); }
  accumulate(solver) {
    const K = this.K; if (!K) return;
    const g = solver.grid, Nx = g.Nx, Ny = g.Ny, i = Nx - 2, sy = Nx, sz = Nx * Ny, J = this.joint;
    for (let n = 0; n < J.length; n++) J[n] *= this.forget;
    for (let k = 0; k < g.Nz; k++) for (let j = 0; j < Ny; j++) {
      const idx = i + j * sy + k * sz; if (solver.solid[idx]) continue;
      const flux = solver.u[idx]; if (flux <= 0) continue;
      const o = Math.floor(j * K / Ny);
      for (let c = 0; c < K; c++) J[c * K + o] += solver.tracers[c][idx] * flux;
    }
  }
  /** @returns {number|null} Î ∈ [0,1] (bits normalized by log₂K) */
  compute() {
    const K = this.K, J = this.joint; let tot = 0; for (let n = 0; n < J.length; n++) tot += J[n];
    if (!(tot > 0)) return null;
    const pi = new Float64Array(K), po = new Float64Array(K);
    for (let c = 0; c < K; c++) for (let o = 0; o < K; o++) { const p = J[c * K + o] / tot; pi[c] += p; po[o] += p; }
    let I = 0;
    for (let c = 0; c < K; c++) for (let o = 0; o < K; o++) { const p = J[c * K + o] / tot; if (p > 0) I += p * Math.log2(p / (pi[c] * po[o])); }
    return Math.max(0, Math.min(1, I / Math.log2(K)));
  }
}