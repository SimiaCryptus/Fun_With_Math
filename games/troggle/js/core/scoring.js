/**
 * Scoring — pure functions, no state. See idea.md §2.3.
 */

/** Base points by word length; index 0..8, 9+ extrapolates. */
const BASE = [0, 0, 0, 1, 1, 2, 3, 5, 11];
const LONG_WORD_STEP = 4;

export const BONUS = Object.freeze({
  PER_EXTRA_LAYER: 1,
  VOLUMETRIC: 3,
  INTERIOR_MULTIPLIER: 1.5,
});

/** Points for length alone, ignoring geometry. */
export function baseScore(length) {
  if (length < 3) return 0;
  if (length < BASE.length) return BASE[length];
  return BASE[BASE.length - 1] + LONG_WORD_STEP * (length - (BASE.length - 1));
}

/**
 * Full score for one found word along one specific path.
 *
 * @param {string} word           the (already validated) word
 * @param {number[]} path         cube indices, in order
 * @param {import('./grid.js').Grid} grid
 * @returns {{total:number, base:number, layerBonus:number,
 *            volumeBonus:number, interior:boolean}}
 */
export function scoreWord(word, path, grid) {
  const base = baseScore(word.length);
  if (base === 0) {
    return { total: 0, base: 0, layerBonus: 0, volumeBonus: 0, interior: false };
  }

  const m = grid.pathMetrics(path);
  const layerBonus = Math.max(0, m.layers - 1) * BONUS.PER_EXTRA_LAYER;
  const volumeBonus = m.isVolumetric ? BONUS.VOLUMETRIC : 0;

  let total = base + layerBonus + volumeBonus;
  const interior = m.allInterior && grid.size >= 5;
  if (interior) total = Math.ceil(total * BONUS.INTERIOR_MULTIPLIER);

  return { total, base, layerBonus, volumeBonus, interior };
}

/**
 * Best score across every path that spells `word`.
 * @param {string} word
 * @param {number[][]} paths  all valid paths (from solver.findAllPaths)
 */
export function bestScore(word, paths, grid) {
  let best = null;
  for (const path of paths) {
    const s = scoreWord(word, path, grid);
    if (!best || s.total > best.score.total) best = { score: s, path };
  }
  return best ?? { score: scoreWord(word, [], grid), path: [] };
}

/** Sum of a found-words map produced by game.js. */
export function totalScore(found) {
  let sum = 0;
  for (const entry of found.values()) sum += entry.score.total;
  return sum;
}