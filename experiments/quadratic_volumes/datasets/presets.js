// M7 presets for the headline dataset.

export const PRESETS = {
  'bilogistic/cascade': {
    dataset: 'bilogistic', N: 60000, seed: 1,
    params: { r0: 2.8, r1: 4.0, burn: 1000, M: 20, noise: 0, sync: 0, mode: 'normalized' },
  },
  'bilogistic/windows': {
    dataset: 'bilogistic', N: 40000, seed: 2,
    params: { r0: 3.82, r1: 3.86, burn: 2000, M: 20, noise: 0, sync: 0, mode: 'normalized' },
  },
  'bilogistic/fixed-only': {
    dataset: 'bilogistic', N: 20000, seed: 3,
    params: { r0: 1.5, r1: 2.9, burn: 2000, M: 5, noise: 0, sync: 0, mode: 'normalized' },
  },
  'bilogistic/sync': {
    dataset: 'bilogistic', N: 40000, seed: 4,
    params: { r0: 2.8, r1: 4.0, burn: 1000, M: 20, noise: 0, sync: 1, mode: 'normalized' },
  },
  'bilogistic/noisy': {
    dataset: 'bilogistic', N: 40000, seed: 5,
    params: { r0: 2.8, r1: 4.0, burn: 1000, M: 20, noise: 0.005, sync: 0, mode: 'normalized' },
  },
  'bilogistic/literal': {
    dataset: 'bilogistic', N: 20000, seed: 6,
    params: { r0: 0, r1: 1, burn: 1000, M: 20, noise: 0, sync: 0, mode: 'literal' },
  },
  'plane': { dataset: 'noisy-plane', N: 20000, seed: 1, params: { w: 0.01 } },
  'shell': { dataset: 'shell', N: 20000, seed: 1, params: { r: 0.3, w: 0.01 } },
  'helix': { dataset: 'helix', N: 20000, seed: 1, params: { turns: 2, noise: 0.01 } },
};