// Same codec, axis-aligned family only: a density-estimation-tree baseline.

import { trainTree } from '../tree/train.js';

export function trainAxisDET(points, opts = {}) {
  return trainTree(points, { ...opts, families: ['axis'] });
}