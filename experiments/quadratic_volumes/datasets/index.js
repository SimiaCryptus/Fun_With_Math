import uniform from './uniform.js';
import bilogistic from './bilogistic.js';
import blob from './blob.js';
import noisyPlane from './noisyPlane.js';
import shell from './shell.js';
import torus from './torus.js';
import helix from './helix.js';
import gmm from './gmm.js';
import { lorenz, rossler, thomas, henonSweep, swissRoll } from './attractors.js';

export const DATASETS = {
  uniform,
  bilogistic,
  blob,
  'noisy-plane': noisyPlane,
  shell,
  torus,
  helix,
  gmm,
  lorenz,
  rossler,
  thomas,
  'henon-sweep': henonSweep,
  'swiss-roll': swissRoll,
};

export function getDataset(id) {
  const d = DATASETS[id];
  if (!d) throw new Error('unknown dataset ' + id);
  return d;
}