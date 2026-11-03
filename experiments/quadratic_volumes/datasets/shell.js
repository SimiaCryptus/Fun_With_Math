export default {
  id: 'shell',
  name: 'spherical shell',
  description: 'Noisy sphere of radius r about the cube centre. Quadric slab.',
  params: {
    r: { value: 0.3, min: 0.05, max: 0.45, step: 0.01 },
    w: { value: 0.01, min: 0.001, max: 0.08, step: 0.001 },
  },
  generate(params, rng, N = 20000) {
    const r = params.r ?? 0.3, w = params.w ?? 0.01;
    const xs = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = [rng.normal(), rng.normal(), rng.normal()];
      const n = Math.hypot(u[0], u[1], u[2]) || 1;
      const rad = r + w * (2 * rng.uniform() - 1);
      for (let k = 0; k < 3; k++) {
        xs[i * 3 + k] = Math.min(1, Math.max(0, 0.5 + (rad * u[k]) / n));
      }
    }
    return xs;
  },
  truth: { type: 'sphere', center: [0.5, 0.5, 0.5], radius: 0.3, codim: 1 },
};