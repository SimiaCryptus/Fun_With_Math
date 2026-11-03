// The §3.3 worked example: 98% of mass in 1% of the volume.

export default {
  id: 'blob',
  name: 'blob (98% in 1%)',
  description: '98% of points in a ball of volume 0.01, 2% uniform.',
  params: { frac: { value: 0.98, min: 0.5, max: 1, step: 0.01 } },
  generate(params, rng, N = 20000) {
    const frac = params.frac ?? 0.98;
    const R = Math.cbrt((0.01 * 3) / (4 * Math.PI));
    const c = [0.5, 0.5, 0.5];
    const xs = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      if (rng.uniform() < frac) {
        let v, r2;
        do {
          v = [2 * rng.uniform() - 1, 2 * rng.uniform() - 1, 2 * rng.uniform() - 1];
          r2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
        } while (r2 > 1);
        for (let k = 0; k < 3; k++) xs[i * 3 + k] = c[k] + R * v[k];
      } else {
        for (let k = 0; k < 3; k++) xs[i * 3 + k] = rng.uniform();
      }
    }
    return xs;
  },
  truth: { relations: ['|x - c| < R'], codim: 0 },
};