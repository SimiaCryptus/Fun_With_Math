// Coordinate fields x, y, z. With the KT branch code and topology bit this
// family reproduces a density-estimation-tree baseline.

import { axisField } from '../geometry/predicates/affine.js';

const NAMES = ['x', 'y', 'z'];

export const axis = {
  id: 'axis',
  propose({ d = 3 }) {
    const out = [];
    for (let k = 0; k < d; k++) {
      out.push({
        family: 'axis',
        field: axisField(k, d),
        paramCount: 0,
        gridSize: d, // which axis was selected
        label: NAMES[k] ?? 'x' + k,
      });
    }
    return out;
  },
};