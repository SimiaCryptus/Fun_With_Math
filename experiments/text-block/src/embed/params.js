/** Embedding-mode parameters, presets, and which keys affect the graph. */

export const EMBED_LIMIT = 256;

export const DEFAULT_PARAMS = {
  preset: 'context',
  dim: 8,
  window: [0, 8],
  followView: false,
  radius: [2, 1],
  sigma: [1, 1],
  kernel: 'gaussian',
  alpha: 0.2,
  beta: 1,
  columnFocus: null,
  columnTau: 4,
  lcpGate: 'off',
  lcpMin: 1,
  lcpCap: 4,
  cyclicRows: false,
  optimizer: 'contrastive',
  lr: 0.05,
  momentum: 0.9,
  lambda: 1,
  t: 2,
  eta: 0.5,
  glyphTying: 0,
  seed: 1,
  stepsPerFrame: 10,
   layout: 'pca',
   perplexity: 15,
   layoutSteps: 10,
};

export const PRESETS = {
  context: {
    window: [0, 8], followView: false, radius: [2, 1], sigma: [1, 1], kernel: 'gaussian',
    alpha: 0.2, beta: 1, columnFocus: null, lcpGate: 'off', cyclicRows: false,
  },
  substitution: {
    window: [-1, -1], followView: false, radius: [3, 0], sigma: [1, 1], kernel: 'gaussian',
    alpha: 0, beta: 1, columnFocus: null, lcpGate: 'soft', lcpCap: 4, cyclicRows: false,
  },
  ring: {
    window: [0, 8], followView: false, radius: [0, 2], sigma: [1, 1], kernel: 'gaussian',
    alpha: 1, beta: 0, columnFocus: null, lcpGate: 'off', cyclicRows: false,
  },
  follow: {
    followView: true, radius: [2, 1], sigma: [1, 1], kernel: 'gaussian',
    alpha: 0.2, beta: 1, columnFocus: null, lcpGate: 'off', cyclicRows: false,
  },
};

/** Parameters that change the graph (and therefore need a rebuild). */
export const GRAPH_KEYS = [
  'window', 'followView', 'radius', 'sigma', 'kernel', 'alpha', 'beta',
  'columnFocus', 'columnTau', 'lcpGate', 'lcpMin', 'lcpCap', 'cyclicRows',
];

/** Parameters controlled by presets; editing one switches the preset to "custom". */
export const PRESET_KEYS = new Set(Object.values(PRESETS).flatMap((p) => Object.keys(p)));