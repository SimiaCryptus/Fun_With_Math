// Principal directions of the node's points. The smallest-variance
// direction is the plane-law candidate; with a slab it is the §7.2 law.

import { pca } from '../core/linalg.js';
import { AffineField } from '../geometry/predicates/affine.js';

export const affinePCA = {
  id: 'affinePCA',
  propose({ points, idx, d = 3 }) {
    if (idx.length < 8) return [];
    const { mean: m, vectors } = pca(points, idx, d);
    const out = [];
    for (let k = 0; k < vectors.length; k++) {
      const v = vectors[k];
      let c = 0;
      for (let i = 0; i < d; i++) c -= v[i] * m[i];
      out.push({
        family: 'affinePCA',
        field: new AffineField(v, c, { family: 'affinePCA', paramCount: d }),
        paramCount: d,
        gridSize: vectors.length,
        label: `pca${k}`,
      });
    }
    return out;
  },
};