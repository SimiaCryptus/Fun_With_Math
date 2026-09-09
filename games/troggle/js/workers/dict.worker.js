/**
 * dict.worker.js — trie load, board generation, solving (idea.md §8).
 * Module worker; imports only core modules (no three.js, no DOM).
 */

import { loadTrie } from '../core/dict.js';
import { generateBoard } from '../core/board.js';
import { Grid } from '../core/grid.js';
import { findAllPaths } from '../core/solver.js';

let triePromise = null;
const trie = () => (triePromise ??= loadTrie().then((r) => r.trie));

function serialise(board) {
  return {
    size: board.size,
    adjacency: board.adjacency,
    seed: board.seed,
    seedString: board.seedString,
    minWordLength: board.minWordLength,
    letters: board.letters,
    quality: board.quality,
    attempts: board.attempts,
    words: board.words ? [...board.words.entries()] : null,
  };
}

self.addEventListener('message', async (e) => {
  const { id, type, opts } = e.data || {};
  try {
    if (type === 'generate') {
      const t = await trie();
      const board = generateBoard({ ...opts, trie: t });
      self.postMessage({ id, ok: true, board: serialise(board) });
      return;
    }
    if (type === 'isWord') {
      const t = await trie();
      self.postMessage({ id, ok: true, board: { isWord: t.isWord(opts.word) } });
      return;
    }
    if (type === 'findPath') {
      const grid = new Grid(opts.size, opts.letters, opts.adjacency);
      const paths = findAllPaths(grid, opts.word, { limit: 1 });
      self.postMessage({ id, ok: true, board: { path: paths[0] ?? null } });
      return;
    }
    throw new Error(`unknown message: ${type}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
});