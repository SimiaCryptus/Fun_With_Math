export default {
  id: 'helix',
  name: 'helix (codim 2)',
  description: 'Noisy helix curve: needs at least two constraints.',
  params: {
    turns: { value: 2, min: 0.5, max: 6, step: 0.5 },
    radius: { value: 0.3, min: 0.05, max: 0.45, step: 0.01 },
    noise: { value: 0.01, min: 0, max: 0.05, step: 0.001 },
  },
  generate(params, rng, N = 20000) {
    const T = params.turns ?? 2, R = params.radius ?? 0.3, s = params.noise ?? 0.01;
    const xs = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rng.uniform();
      const a = 2 * Math.PI * T * u;
      xs[i * 3] = Math.min(1, Math.max(0, 0.5 + R * Math.cos(a) + s * rng.normal()));
      xs[i * 3 + 1] = Math.min(1, Math.max(0, 0.5 + R * Math.sin(a) + s * rng.normal()));
      xs[i * 3 + 2] = Math.min(1, Math.max(0, 0.05 + 0.9 * u + s * rng.normal()));
    }
    return xs;
  },
  truth: { type: 'curve', codim: 2 },
};