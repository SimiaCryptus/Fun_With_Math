/**
 * boardsource — "give me a board" for the main thread.
 *
 * Tries the module worker first (§3.3: generation + solving must not jank the
 * main thread); falls back to generating in-page if workers are unavailable.
 * Returns a *serialised* board: { size, adjacency, seed, seedString,
 * minWordLength, letters, quality, attempts, words: [[word, {score,path}]] }.
 */

import { generateBoard } from './board.js';
import { loadTrie } from './dict.js';
import { randomSeed } from './rng.js';

let worker = null;
let nextId = 1;
const pending = new Map();

function spawn() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('../workers/dict.worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e) => {
      const { id, ok, board, error } = e.data || {};
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      ok ? p.resolve(board) : p.reject(new Error(error || 'worker failed'));
    });
    worker.addEventListener('error', (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'worker error'));
      pending.clear();
      worker.terminate();
      worker = false; // never retry
    });
  } catch {
    worker = false;
  }
  return worker;
}

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

async function local(opts) {
  const { trie } = await loadTrie();
  return serialise(generateBoard({ ...opts, trie }));
}

/**
 * @param {{size?:number, adjacency?:string, seed?:number}} opts
 * @returns {Promise<object>} serialised board
 */
export function requestBoard(opts = {}) {
  const payload = { ...opts, seed: opts.seed ?? randomSeed() };
  const w = spawn();
  if (!w) return local(payload);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: 'generate', opts: payload });
  }).catch(() => local(payload));
}

export default requestBoard;