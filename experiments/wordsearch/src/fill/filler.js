import { latticeDirections, readContext } from '../grid/directions.js';
import { combine } from './combiners.js';
import { pickNextCell } from './adjacency.js';

/**
 * Select a character from a distribution.
 * @param {Map<string,number>} dist
 * @param {'weighted'|'argmax'} mode
 * @param {() => number} rng
 * @param {string[]} fallbackAlphabet
 */
export function select(dist, mode, rng, fallbackAlphabet) {
  if (!dist || dist.size === 0) {
    const a = fallbackAlphabet;
    return a.length ? a[Math.floor(rng() * a.length)] : 'x';
  }
  if (mode === 'argmax') {
    let bestChar = null;
    let bestP = -1;
    for (const [c, p] of dist) {
      if (p > bestP) {
        bestP = p;
        bestChar = c;
      }
    }
    return bestChar;
  }
  // weighted sampling
  let r = rng();
  for (const [c, p] of dist) {
    r -= p;
    if (r <= 0) return c;
  }
  // floating point fallback
  return [...dist.keys()].pop();
}

/**
  * Step-by-step generator version of fillGrid. Yields after each cell
  * is filled so callers can visualise the buildout.
  *
  * @param {import('../grid/Grid.js').Grid} grid
  * @param {import('../markov/MarkovModel.js').MarkovModel} model
  * @param {object} config
  * @yields {{x:number,y:number,ch:string,contexts:Array}}
  */
export function* fillGridSteps(grid, model, config = {}) {
   const {
     combiner = 'product',
     sampling = 'weighted',
     rng = Math.random,
      lattice = 'square',
      includeBackwards = true,
   } = config;
   const alphabet = [...model.alphabet];
   let cell;
   let guard = grid.width * grid.height + 1;
    while ((cell = pickNextCell(grid, rng, lattice)) && guard-- > 0) {
     const { x, y } = cell;
     const dists = [];
     const contexts = [];
      const dirs = latticeDirections(lattice, y, { includeBackwards });
      for (const d of dirs) {
        const ctx = readContext(grid, x, y, d, model.order, lattice);
       if (ctx) {
         const dist = model.predict(ctx);
         if (dist.size) {
           dists.push(dist);
           contexts.push({ dir: d.name, ctx });
         }
       }
     }
     const combined = dists.length
       ? combine(dists, combiner)
       : model.predict('');
     const ch = select(combined, sampling, rng, alphabet);
     grid.set(x, y, ch);
     yield { x, y, ch, contexts };
   }
   return grid;
}
/**
 * Fill all empty cells of the grid using directional Markov
 * predictions combined per config.
 *
 * @param {import('../grid/Grid.js').Grid} grid
 * @param {import('../markov/MarkovModel.js').MarkovModel} model
 * @param {object} config
 * @param {string} [config.combiner]
 * @param {string} [config.sampling]
 * @param {() => number} [config.rng]
 */
export function fillGrid(grid, model, config = {}) {
  const {
    combiner = 'product',
    sampling = 'weighted',
    rng = Math.random,
     lattice = 'square',
     includeBackwards = true,
  } = config;
  const alphabet = [...model.alphabet];

  let cell;
  let guard = grid.width * grid.height + 1;
   while ((cell = pickNextCell(grid, rng, lattice)) && guard-- > 0) {
    const { x, y } = cell;
    const dists = [];
     const dirs = latticeDirections(lattice, y, { includeBackwards });
     for (const d of dirs) {
       const ctx = readContext(grid, x, y, d, model.order, lattice);
      if (ctx) {
        const dist = model.predict(ctx);
        if (dist.size) dists.push(dist);
      }
    }
    // If no directional context available, fall back to unigram.
    const combined = dists.length
      ? combine(dists, combiner)
      : model.predict('');
    const ch = select(combined, sampling, rng, alphabet);
    grid.set(x, y, ch);
  }
  return grid;
}