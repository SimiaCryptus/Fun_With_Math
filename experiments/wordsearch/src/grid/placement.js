import { latticeDirections, step } from './directions.js';
  import { normaliseText } from '../markov/textPipeline.js';

  /**
   * Attempt to place a single word along a random direction/position.
   * Returns the placement record or null if no valid spot found within
   * `tries`.
   * @param {object} [opts]
   * @param {'square'|'hex'|'triangular'} [opts.lattice]
   * @param {boolean} [opts.includeBackwards]
   */
  function tryPlaceWord(grid, word, rng, opts = {}, tries = 200) {
    const { lattice = 'square', includeBackwards = true } = opts;
    for (let t = 0; t < tries; t++) {
      const x = Math.floor(rng() * grid.width);
      const y = Math.floor(rng() * grid.height);
      const dirs = latticeDirections(lattice, y, { includeBackwards });
      const dir = dirs[Math.floor(rng() * dirs.length)];
      const len = word.length;

      // Walk the word using row-aware stepping.
      let ok = true;
      const coords = [];
      let cx = x;
      let cy = y;
      for (let i = 0; i < len; i++) {
        if (!grid.inBounds(cx, cy)) {
          ok = false;
          break;
        }
        const existing = grid.get(cx, cy);
        if (existing && existing !== word[i]) {
          ok = false;
          break;
        }
        coords.push({ x: cx, y: cy, ch: word[i] });
        const next = step(lattice, cx, cy, dir.name, 1);
        if (!next) {
          ok = false;
          break;
        }
        cx = next.x;
        cy = next.y;
      }
      if (!ok || coords.length !== len) continue;

      for (const c of coords) {
        grid.set(c.x, c.y, c.ch);
        grid.lock(c.x, c.y);
      }
      return { word, dir: dir.name, x, y, coords };
    }
    return null;
  }

  /**
   * Place all target words onto the grid. Returns { placed, failed }.
   * @param {import('./Grid.js').Grid} grid
   * @param {string[]} words
   * @param {() => number} [rng]
   * @param {object} [opts]
   * @param {'square'|'hex'|'triangular'} [opts.lattice]
   * @param {boolean} [opts.includeBackwards]
   */
  export function placeWords(grid, words, rng = Math.random, opts = {}) {
    const placed = [];
    const failed = [];
    // Place longer words first (harder to fit).
    const clean = words
      .map((w) => normaliseText(w))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    for (const w of clean) {
      const rec = tryPlaceWord(grid, w, rng, opts);
      if (rec) placed.push(rec);
      else failed.push(w);
    }
    return { placed, failed };
  }