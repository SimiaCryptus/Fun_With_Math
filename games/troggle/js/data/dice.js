/**
 * Dice pools — one canonical pool of 6-face dice per board size. See idea.md §3.2.
 *
 * Real Boggle dice do not satisfy the constraints we want (e.g. Big Boggle ships a
 * `BJKQXZ` die), so the pools are *generated* — deterministically, from a fixed seed
 * per size — from an English-weighted letter distribution with two constraints:
 *
 *   1. every die contains at least one vowel,
 *   2. no die contains more than one of {J, K, Qu, X, Z}.
 *
 * Because the seed is fixed, the pool is a constant: the same on every machine, so a
 * board seed string fully determines the board.
 */

import { mulberry32, hashString } from '../core/rng.js';

/** English-ish letter weights, tuned for a ~36% vowel ratio on rolled faces. */
export const LETTER_WEIGHTS = Object.freeze({
  A: 7, B: 2, C: 3, D: 4, E: 10, F: 2, G: 3, H: 3, I: 7, J: 1, K: 1, L: 5,
  M: 3, N: 6, O: 6, P: 3, Qu: 1, R: 6, S: 5, T: 6, U: 4, V: 1, W: 2, X: 1,
  Y: 2, Z: 1,
});

export const VOWELS = Object.freeze(['A', 'E', 'I', 'O', 'U']);
export const RARE = Object.freeze(new Set(['J', 'K', 'Qu', 'X', 'Z']));

export const FACES_PER_DIE = 6;

/** Cube count per supported board size. */
export const POOL_SIZES = Object.freeze({ 3: 27, 4: 64, 5: 125, 6: 216 });

const LETTERS = Object.keys(LETTER_WEIGHTS);
const CUMULATIVE = (() => {
  const out = [];
  let acc = 0;
  for (const l of LETTERS) {
    acc += LETTER_WEIGHTS[l];
    out.push(acc);
  }
  return out;
})();
const TOTAL_WEIGHT = CUMULATIVE[CUMULATIVE.length - 1];

/** Weighted draw of a single letter. */
export function weightedLetter(rng) {
  const r = rng() * TOTAL_WEIGHT;
  for (let i = 0; i < CUMULATIVE.length; i++) {
    if (r < CUMULATIVE[i]) return LETTERS[i];
  }
  return LETTERS[LETTERS.length - 1];
}

/** True if the die meets both constraints. */
export function isValidDie(faces) {
  if (faces.length !== FACES_PER_DIE) return false;
  let rare = 0;
  let vowel = false;
  for (const f of faces) {
    if (RARE.has(f)) rare++;
    if (VOWELS.includes(f)) vowel = true;
  }
  return vowel && rare <= 1;
}

/** Build one constraint-satisfying die. */
export function makeDie(rng) {
  const faces = [];
  let rare = 0;
  let vowel = false;
  while (faces.length < FACES_PER_DIE) {
    const l = weightedLetter(rng);
    if (RARE.has(l)) {
      if (rare > 0) continue; // at most one rare letter per die
      rare++;
    }
    if (VOWELS.includes(l)) vowel = true;
    faces.push(l);
  }
  if (!vowel) {
    // Overwrite a random face with a weighted vowel (A/E/I/O/U proportional to weights).
    const vw = VOWELS.map((v) => LETTER_WEIGHTS[v]);
    const total = vw.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    let v = VOWELS[VOWELS.length - 1];
    for (let i = 0; i < VOWELS.length; i++) {
      if (r < vw[i]) { v = VOWELS[i]; break; }
      r -= vw[i];
    }
    faces[Math.floor(rng() * FACES_PER_DIE)] = v;
  }
  return faces;
}

/**
 * Build a pool of `count` dice from a seed.
 * @returns {string[][]} array of dice, each an array of 6 faces
 */
export function buildPool(count, seed) {
  const rng = mulberry32(seed);
  const pool = new Array(count);
  for (let i = 0; i < count; i++) pool[i] = makeDie(rng);
  return pool;
}

const POOL_CACHE = new Map();

/**
 * The canonical pool for a board size (built lazily, cached).
 * @param {number} size  4, 5 or 6
 */
export function getPool(size) {
  const count = POOL_SIZES[size];
  if (!count) throw new Error(`No dice pool for size ${size}`);
  let pool = POOL_CACHE.get(size);
  if (!pool) {
    pool = buildPool(count, hashString(`troggle-dice-v1-${size}`));
    POOL_CACHE.set(size, pool);
  }
  return pool;
}

export default getPool;