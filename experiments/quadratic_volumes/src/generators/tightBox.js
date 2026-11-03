// Mandatory defensive baseline (idea.md §4.1): contract the node region to
// the tight axis-aligned bounding box of its points. Costs 2d thresholds.

import { AffineField } from '../geometry/predicates/affine.js';
import { constraint } from '../geometry/region.js';

export const tightBox = {
  id: 'tightBox',
  propose({ points, idx, d = 3 }) {
    if (idx.length === 0) return [];
    const lo = new Float64Array(d).fill(Infinity);
    const hi = new Float64Array(d).fill(-Infinity);
    for (const i of idx) {
      for (let k = 0; k < d; k++) {
        const v = points[i * d + k];
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
    }
    const cons = [];
    for (let k = 0; k < d; k++) {
      const e = new Float64Array(d);
      e[k] = 1;
      const f = new AffineField(e, 0, { family: 'axis', axis: k, paramCount: 0 });
      // lo[k] <= x_k <= hi[k], with a hair of slack so points stay inside.
      const pad = 1e-12;
      cons.push(constraint(f, 'ge', lo[k] - pad));
      cons.push(constraint(f, 'lt', hi[k] + pad));
    }
    return [
      {
        family: 'tightBox',
        special: 'contract',
        constraints: cons,
        paramCount: 2 * d,
        gridSize: 1,
        label: `bbox[${Array.from(lo, (v) => v.toFixed(3))}]..[${Array.from(hi, (v) => v.toFixed(3))}]`,
      },
    ];
  },
};