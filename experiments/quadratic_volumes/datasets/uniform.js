// Null control: the tree must find essentially nothing.

export default {
  id: 'uniform',
  name: 'uniform cube',
  description: 'Uniform in [0,1]^3. Null control: expect ~0 splits, ~30 bits/pt.',
  params: {},
  generate(params, rng, N = 20000) {
    const xs = new Float64Array(N * 3);
    for (let i = 0; i < N * 3; i++) xs[i] = rng.uniform();
    return xs;
  },
  truth: { relations: [], codim: 0 },
};