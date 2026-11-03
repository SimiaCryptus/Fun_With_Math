// Generator registry. Each generator exposes
//   propose(ctx) -> [{ family, field, paramCount, gridSize }]
// plus, for region-contraction candidates, a `special` marker.

import { tightBox } from './tightBox.js';
import { axis } from './axis.js';

export const GENERATORS = { tightBox, axis };

export function resolveGenerators(names) {
  return names.map((n) => {
    const g = GENERATORS[n];
    if (!g) throw new Error('unknown generator: ' + n);
    return g;
  });
}