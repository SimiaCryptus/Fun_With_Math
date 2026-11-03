// Headline dataset: the bilogistic ribbon.
//
//   normalized (default):  R(s) = r0 + (r1-r0) s
//       y* = R(s)     y (1-y)
//       x* = R(1-s)   x (1-x)
//       point = (s, x, y)
//   literal: the formula exactly as first written (r in [0,1]); degenerate.

export default {
  id: 'bilogistic',
  name: 'bilogistic ribbon',
  description:
    'Two logistic maps swept in opposite directions along s. Fixed-point ' +
    'branches are curves (codim 2); chaotic bands are sheets (codim 1).',
  params: {
    r0: { value: 2.8, min: 0, max: 4, step: 0.01 },
    r1: { value: 4.0, min: 0, max: 4, step: 0.01 },
    burn: { value: 1000, min: 0, max: 5000, step: 100 },
    M: { value: 20, min: 1, max: 200, step: 1 },
    noise: { value: 0, min: 0, max: 0.05, step: 0.001 },
    sync: { value: 0, min: 0, max: 1, step: 1 },
    mode: { value: 'normalized', options: ['normalized', 'literal'] },
  },
  generate(params, rng, N = 20000) {
    const r0 = params.r0 ?? 2.8;
    const r1 = params.r1 ?? 4.0;
    const burn = Math.round(params.burn ?? 1000);
    const M = Math.max(1, Math.round(params.M ?? 20));
    const noise = params.noise ?? 0;
    const sync = !!params.sync;
    const literal = (params.mode ?? 'normalized') === 'literal';

    const xs = new Float64Array(N * 3);
    let w = 0;
    while (w < N) {
      const s = rng.uniform();
      const Ry = literal ? s : r0 + (r1 - r0) * s;
      const Rx = literal ? 1 - s : r0 + (r1 - r0) * (1 - s);
      let x = rng.range(0.05, 0.95);
      let y = sync ? x : rng.range(0.05, 0.95);
      for (let b = 0; b < burn; b++) {
        x = Rx * x * (1 - x);
        y = Ry * y * (1 - y);
      }
      for (let m = 0; m < M && w < N; m++) {
        x = Rx * x * (1 - x);
        y = Ry * y * (1 - y);
        let px = x, py = y;
        if (noise > 0) { px += noise * rng.normal(); py += noise * rng.normal(); }
        xs[w * 3 + 0] = Math.min(1, Math.max(0, s));
        xs[w * 3 + 1] = Math.min(1, Math.max(0, px));
        xs[w * 3 + 2] = Math.min(1, Math.max(0, py));
        w++;
      }
    }
    return xs;
  },
  truth: { relations: ['x = 1 - 1/R(1-s)', 'y = 1 - 1/R(s)'], codim: 'varies' },
};