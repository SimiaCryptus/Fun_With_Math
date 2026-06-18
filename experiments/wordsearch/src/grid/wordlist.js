// Helpers for handling (potentially large) target word lists.

import { normaliseText } from '../markov/textPipeline.js';

/**
 * Clean a raw word list: normalise, drop empties, de-duplicate.
 * @param {string[]} words
 * @returns {string[]}
 */
export function cleanWordList(words = []) {
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const n = normaliseText(w);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Randomly select up to `count` words from the cleaned list. When count is
 * 0 / falsy or >= list length, the whole (cleaned) list is returned.
 * Uses a partial Fisher–Yates shuffle so it scales to large lists.
 * @param {string[]} words
 * @param {number} count
 * @param {() => number} [rng]
 * @returns {string[]}
 */
export function selectWords(words = [], count = 0, rng = Math.random) {
  const clean = cleanWordList(words);
  if (!count || count >= clean.length) return clean;
  const arr = clean.slice();
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, count);
}

/**
 * Build a lookup structure for fast "would this complete a word?" checks
 * during grid filling. We store every word AND its reverse (so the check
 * is direction-agnostic), plus the maximum word length to bound how far
 * back we need to read along each direction.
 * @param {string[]} words
 * @returns {{set:Set<string>, maxLen:number}}
 */
export function buildForbiddenIndex(words = []) {
  const set = new Set();
  let maxLen = 0;
  for (const w of cleanWordList(words)) {
    if (w.length < 2) continue; // single letters can't be "accidentally" made
    set.add(w);
    set.add([...w].reverse().join(''));
    if (w.length > maxLen) maxLen = w.length;
  }
  return { set, maxLen };
}
