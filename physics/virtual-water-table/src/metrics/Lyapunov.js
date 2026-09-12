/** λ ≈ (1/(M·T_r)) Σ ln(‖Δ_m‖/δ₀) with renormalization every T_r steps (§6.4). */
export class Lyapunov {
  constructor({ delta0 = 1e-6, Tr = 32, window = 16 } = {}) { this.delta0 = delta0; this.Tr = Tr; this.window = window; this.reset(); }
  reset() { this.n = 0; this.samples = []; }
  init(main, twin, rng) { twin.copyFrom(); twin.perturb(rng, this.delta0); this.reset(); }
  tick(main, twin) {
    if (++this.n % this.Tr) return;
    const d = twin.diffNorm();
    if (d > 0 && Number.isFinite(d)) { this.samples.push(Math.log(d / this.delta0) / (this.Tr * main.dt)); if (this.samples.length > this.window) this.samples.shift(); }
    twin.renormalize(this.delta0);
  }
  get lambda() { if (!this.samples.length) return null; let s = 0; for (const x of this.samples) s += x; return s / this.samples.length; }
}