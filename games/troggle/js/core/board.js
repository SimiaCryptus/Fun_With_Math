/**
 * Board — seeded generation + quality gate. See idea.md §3.
 *
 * A "board" object is the thing handed to game.js:
 *   { size, adjacency, seed, seedString, letters, grid, words, quality, attempts }
 */

import { Grid, ADJACENCY } from './grid.js';
import { mulberry32, hashString, randomSeed, seedToHex, hexToSeed } from './rng.js';
import { getPool } from '../data/dice.js';
import { rollDice, vowelRatio, isVowel } from './dice.js';
import { solve } from './solver.js';

export const MIN_WORDS = Object.freeze({ 3: 25, 4: 60, 5: 150, 6: 300 });
export const MAX_ATTEMPTS = 12;
export const VOWEL_RANGE = Object.freeze([0.28, 0.45]);
export const LONG_WORD_LENGTH = 7;
export const MIN_LONG_WORDS = 3;

/** §2.1: min length is 3, except 4 on the 6³ board. */
export function defaultMinWordLength(size) {
  return size >= 6 ? 4 : 3;
}

// ------------------------------------------------------------- seed strings

const SEED_RE = /^troggle:(\d):(face|edge|corner):([0-9a-f]{1,8})$/i;

/** `troggle:5:corner:8f31c2ab` */
export function encodeSeed({ size, adjacency, seed }) {
  return `troggle:${size}:${adjacency}:${seedToHex(seed)}`;
}

/** Inverse of encodeSeed; null if malformed. */
export function parseSeed(str) {
  const m = SEED_RE.exec(String(str).trim());
  if (!m) return null;
  const size = Number(m[1]);
  if (!(size in MIN_WORDS)) return null;
  const seed = hexToSeed(m[3]);
  if (seed === null) return null;
  return { size, adjacency: m[2].toLowerCase(), seed };
}

/** The Daily Cube seed: identical for everyone on a given (UTC) date. */
export function dailySeed(date = new Date(), size = 4, adjacency = ADJACENCY.CORNER) {
  const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
  return hashString(`troggle${day}${size}${adjacency}`);
}

// ------------------------------------------------------------ quality gate

/** Every 2×2×2 sub-block must contain at least one vowel. */
export function everySubBlockHasVowel(grid) {
  const n = grid.size;
  for (let z = 0; z < n - 1; z++) {
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        let ok = false;
        for (let dz = 0; dz < 2 && !ok; dz++)
          for (let dy = 0; dy < 2 && !ok; dy++)
            for (let dx = 0; dx < 2 && !ok; dx++)
              if (isVowel(grid.letterAt(grid.index(x + dx, y + dy, z + dz)))) ok = true;
        if (!ok) return false;
      }
    }
  }
  return true;
}

/**
 * Run every check from §3.3. Word checks are skipped when `words` is null
 * (no dictionary available, e.g. M1 or tests).
 */
export function assessQuality(grid, words, {
  minWords = MIN_WORDS[grid.size] ?? 0,
  vowelRange = VOWEL_RANGE,
  longWordLength = LONG_WORD_LENGTH,
  minLongWords = MIN_LONG_WORDS,
} = {}) {
  const checks = {};
  const ratio = vowelRatio(grid.letters);
  checks.vowelRatio = ratio >= vowelRange[0] && ratio <= vowelRange[1];
  checks.vowelBlocks = everySubBlockHasVowel(grid);

  let longWords = 0;
  if (words) {
    for (const w of words.keys()) if (w.length >= longWordLength) longWords++;
    checks.wordCount = words.size >= minWords;
    checks.longWords = longWords >= minLongWords;
  }

  const failed = Object.keys(checks).filter((k) => !checks[k]);
  return {
    ok: failed.length === 0,
    failed,
    checks,
    vowelRatio: ratio,
    wordCount: words ? words.size : null,
    longWords: words ? longWords : null,
  };
}

/** Ordering for "accept best" fallback: fewest failures, then most words. */
function betterThan(a, b) {
  if (!b) return true;
  if (a.quality.failed.length !== b.quality.failed.length) {
    return a.quality.failed.length < b.quality.failed.length;
  }
  return (a.quality.wordCount ?? 0) > (b.quality.wordCount ?? 0);
}

// -------------------------------------------------------------- generation

/**
 * Roll one board (no quality gate) from an rng stream.
 * @returns {string[]} faces in cube-index order
 */
export function rollLetters(size, rng) {
  return rollDice(getPool(size), size ** 3, rng);
}

/**
 * Generate a board, regenerating up to `attempts` times until the quality gate
 * passes; otherwise the best attempt is accepted.
 *
 * @param {object} opts
 * @param {number} [opts.size=4]
 * @param {string} [opts.adjacency='corner']
 * @param {number} [opts.seed]              32-bit seed; random if omitted
 * @param {import('./trie.js').Trie|null} [opts.trie]  dictionary (null → skip word checks)
 * @param {number} [opts.minWordLength]
 * @param {number} [opts.minWords]
 * @param {number} [opts.attempts=12]
 */
export function generateBoard({
  size = 4,
  adjacency = ADJACENCY.CORNER,
  seed = randomSeed(),
  trie = null,
  minWordLength = defaultMinWordLength(size),
  minWords = MIN_WORDS[size],
  attempts = MAX_ATTEMPTS,
} = {}) {
  if (!(size in MIN_WORDS)) throw new Error(`Unsupported size ${size}`);
  seed = seed >>> 0;

  // One stream for all attempts → the whole retry sequence is reproducible.
  const rng = mulberry32(seed);
  let best = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const letters = rollLetters(size, rng);
    const grid = new Grid(size, letters, adjacency);
    const words = trie ? solve(grid, trie, { minWordLength }) : null;
    const quality = assessQuality(grid, words, { minWords });

    const candidate = {
      size,
      adjacency,
      seed,
      seedString: encodeSeed({ size, adjacency, seed }),
      minWordLength,
      letters,
      grid,
      words,
      quality,
      attempts: attempt,
    };

    if (quality.ok) return candidate;
    if (betterThan(candidate, best)) best = candidate;
  }
  return best;
}

/** Rebuild a board from a share string (`troggle:N:mode:hex`). */
export function boardFromSeedString(str, opts = {}) {
  const parsed = parseSeed(str);
  if (!parsed) throw new Error(`Bad seed string: ${str}`);
  return generateBoard({ ...opts, ...parsed });
}

/** Today's Daily Cube. */
export function dailyBoard({ date = new Date(), size = 4, adjacency = ADJACENCY.CORNER, ...opts } = {}) {
  return generateBoard({ ...opts, size, adjacency, seed: dailySeed(date, size, adjacency) });
}