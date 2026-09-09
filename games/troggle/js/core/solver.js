/**
 * Solver — DFS over the grid walking the trie in lockstep. See idea.md §6.2.
 *
 *   solve(grid, trie)          → Map<word, { score, path }>  (best-scoring path per word)
 *   findPath(grid, word)       → first path spelling `word`, or null (no dictionary)
 *   findAllPaths(grid, word)   → every path spelling `word`
 *
 * `Qu` occupies one cube but consumes two trie characters (§4.4).
 */

import { scoreWord } from './scoring.js';

/**
 * Find every dictionary word on the board.
 *
 * @param {import('./grid.js').Grid} grid
 * @param {import('./trie.js').Trie} trie
 * @param {{minWordLength?: number}} [opts]
 * @returns {Map<string, {score: ReturnType<typeof scoreWord>, path: number[]}>}
 */
export function solve(grid, trie, { minWordLength = 3 } = {}) {
  const results = new Map();
  const visited = new Uint8Array(grid.count);
  const path = [];
  // Lowercase once; the trie is lowercase a–z.
  const letters = grid.letters.map((l) => l.toLowerCase());
  const neighbours = grid._neighbours;

  const record = (word) => {
    const s = scoreWord(word, path, grid);
    const prev = results.get(word);
    if (!prev || s.total > prev.score.total) {
      results.set(word, { score: s, path: path.slice() });
    }
  };

  const dfs = (idx, node, word) => {
    const l = letters[idx];
    let n = node;
    for (let i = 0; i < l.length; i++) {
      n = trie.step(n, l[i]);
      if (!n) return;
    }
    const w = word + l;

    visited[idx] = 1;
    path.push(idx);

    if (w.length >= minWordLength && trie.isTerminal(n)) record(w);

    const nb = neighbours[idx];
    for (let k = 0; k < nb.length; k++) {
      const j = nb[k];
      if (!visited[j]) dfs(j, n, w);
    }

    path.pop();
    visited[idx] = 0;
  };

  for (let i = 0; i < grid.count; i++) dfs(i, trie.root, '');
  return results;
}

/**
 * Core word→path search. `onFound(path)` returns true to stop early.
 * @private
 */
function searchPaths(grid, word, onFound) {
  const target = String(word).toUpperCase();
  if (!target) return;
  const visited = new Uint8Array(grid.count);
  const path = [];
  const letters = grid.letters; // already uppercase (Grid constructor)
  const neighbours = grid._neighbours;
  let stop = false;

  const dfs = (idx, pos) => {
    if (stop) return;
    const l = letters[idx];
    if (!target.startsWith(l, pos)) return;
    const next = pos + l.length;

    visited[idx] = 1;
    path.push(idx);

    if (next === target.length) {
      if (onFound(path) === true) stop = true;
    } else {
      const nb = neighbours[idx];
      for (let k = 0; k < nb.length && !stop; k++) {
        const j = nb[k];
        if (!visited[j]) dfs(j, next);
      }
    }

    path.pop();
    visited[idx] = 0;
  };

  for (let i = 0; i < grid.count && !stop; i++) dfs(i, 0);
}

/**
 * First path found that spells `word`, or null. Used for live typing highlights;
 * does NOT consult a dictionary.
 * @returns {number[]|null}
 */
export function findPath(grid, word) {
  let found = null;
  searchPaths(grid, word, (path) => {
    found = path.slice();
    return true;
  });
  return found;
}

/**
 * All paths spelling `word` (optionally capped — some boards have thousands of
 * paths for short words on 26-adjacency).
 * @returns {number[][]}
 */
export function findAllPaths(grid, word, { limit = Infinity } = {}) {
  const out = [];
  searchPaths(grid, word, (path) => {
    out.push(path.slice());
    return out.length >= limit;
  });
  return out;
}

/** Convenience: is `word` findable on the board at all? */
export function hasPath(grid, word) {
  return findPath(grid, word) !== null;
}