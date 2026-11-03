// 3D analogue of idea.md §7.2: a thin slab around an oblique plane.

const B0 = 0.3, BX = 0.4, BY = -0.2;

export default {
  id: 'noisy-plane',
  name: 'noisy plane (slab)',
  description: 'z = 0.3 + 0.4x - 0.2y, uniform width w. Affine-slab recovery.',
  params: { w: { value: 0.01, min: 0.001, max: 0.1, step: 0.001 } },
  generate(params, rng, N = 20000) {
    const w = params.w ?? 0.01;
    const xs = new Float64Array(N * 3);
    let i = 0;
    while (i < N) {
      const x = rng.uniform(), y = rng.uniform();
      const z = B0 + BX * x + BY * y + w * (2 * rng.uniform() - 1);
      if (z < 0 || z > 1) continue;
      xs[i * 3] = x; xs[i * 3 + 1] = y; xs[i * 3 + 2] = z;
      i++;
    }
    return xs;
  },
  truth: { type: 'plane', normal: [BX, BY, -1], offset: B0, codim: 1 },
};