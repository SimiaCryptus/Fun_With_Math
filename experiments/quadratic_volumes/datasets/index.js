import uniform from './uniform.js';
import bilogistic from './bilogistic.js';
import blob from './blob.js';

export const DATASETS = { uniform, bilogistic, blob };
export function getDataset(id) {
  const d = DATASETS[id];
  if (!d) throw new Error('unknown dataset ' + id);
  return d;
}