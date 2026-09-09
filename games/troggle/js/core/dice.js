/**
 * Dice — rolling a pool onto a board. See idea.md §3.2.
 * Pools themselves live in data/dice.js.
 */

import { shuffle } from './rng.js';
import { VOWELS } from '../data/dice.js';

/**
 * Shuffle a copy of the pool, take `count` dice, roll each one.
 * @param {string[][]} pool
 * @param {number} count       number of cubes to fill (N^3)
 * @param {() => number} rng
 * @returns {string[]} one face per cube, in cube-index order
 */
export function rollDice(pool, count, rng) {
  if (pool.length < count) {
    throw new Error(`Pool has ${pool.length} dice, need ${count}`);
  }
  const dice = shuffle(pool.slice(), rng).slice(0, count);
  const faces = new Array(count);
  for (let i = 0; i < count; i++) {
    const d = dice[i];
    faces[i] = d[Math.floor(rng() * d.length)];
  }
  return faces;
}

/**
 * Does this face carry a vowel? `Qu` counts (it brings its own U).
 * Case-insensitive so it works on raw faces and on Grid.letters.
 */
export function isVowel(face) {
  const f = face.toUpperCase();
  if (f === 'QU') return true;
  return VOWELS.includes(f);
}

/** Fraction of faces that are vowels. */
export function vowelRatio(faces) {
  if (faces.length === 0) return 0;
  let v = 0;
  for (const f of faces) if (isVowel(f)) v++;
  return v / faces.length;
}