import { generateHelix } from './helix.js';
import { generateHilbertLayered } from './hilbertLayered.js';
import { generateMaze } from './maze.js';

/**
 * Routing output contract (problem.md §2 stage 2 – abstract centrelines only):
 * {
 *   generator, grid: { pitch, dims:[nx,ny,nz], origin:[x,y,z] } | null,
 *   channels: [{ id, spec, cells:[[i,j,k]...] | null, centreline:[[x,y,z]...]?, deadEnd, notes:[] }],
 *   warnings: [], stats: {}
 * }
 */
export const GENERATORS = {
  maze:    { label: 'k‑colour maze growth (§4.2)', fn: generateMaze },
  hilbert: { label: 'layered Hilbert (§4.1 / Eller)', fn: generateHilbertLayered },
  helix:   { label: 'k parallel helices (pipeline test)', fn: generateHelix },
};

export function generate(spec, rng) {
  const g = GENERATORS[spec.generator];
  if (!g) throw new Error(`unknown generator "${spec.generator}"`);
  if (!spec.channels.length) throw new Error('add at least one channel');
  return g.fn(spec, rng);
}