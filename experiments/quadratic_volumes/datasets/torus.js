export default {
  id: 'torus',
  name: 'torus',
  description: 'Noisy torus (R=0.3, r=0.1): quartic, tests quadratic generators.',
  params: {
    R: { value: 0.3, min: 0.1, max: 0.4, step: 0.01 },
    r: { value: 0.1, min: 0.01, max: 0.2, step: 0.01 },
    noise: { value: 0.005, min: 0, max: 0.05, step: 0.001 },
  },
  generate(params, rng, N = 20000) {
    const R = params.R ?? 0.3, r = params.r ?? 0.1, s = params.noise ?? 0.005;
    const xs = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = 2 * Math.PI * rng.uniform(), b = 2 * Math.PI * rng.uniform();
      const rr = r + s * rng.normal();
      xs[i * 3] = 0.5 + (R + rr * Math.cos(b)) * Math.cos(a);
      xs[i * 3 + 1] = 0.5 + (R + rr * Math.cos(b)) * Math.sin(a);
      xs[i * 3 + 2] = 0.5 + rr * Math.sin(b);
    }
    return xs;
  },
  truth: { type: 'torus', codim: 1 },
};