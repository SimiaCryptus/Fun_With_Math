export default {
  id: 'gmm',
  name: 'Gaussian mixture (3)',
  description: 'Diffuse density: expect tiling, not laws.',
  params: { sigma: { value: 0.09, min: 0.02, max: 0.3, step: 0.01 } },
  generate(params, rng, N = 20000) {
    const s = params.sigma ?? 0.09;
    const mu = [[0.3, 0.3, 0.3], [0.7, 0.6, 0.35], [0.5, 0.3, 0.75]];
    const xs = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      const m = mu[rng.int(3)];
      for (let k = 0; k < 3; k++) {
        xs[i * 3 + k] = Math.min(1, Math.max(0, m[k] + s * rng.normal()));
      }
    }
    return xs;
  },
  truth: { type: 'none', codim: 0 },
};