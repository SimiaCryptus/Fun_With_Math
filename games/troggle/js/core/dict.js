/**
 * Dictionary loading (§6.1). Ships with a compact built-in list so the game is
 * playable with zero assets; if `js/data/words.txt` exists (one word per line)
 * it is preferred. The packed DAWG can slot in here later behind loadTrie().
 */

import { Trie } from './trie.js';
import { WORDS } from '../data/words.js';

let cached = null;

export function builtinTrie(opts) {
  return Trie.fromWords(WORDS.split(/\s+/), opts);
}

/**
 * @returns {Promise<{trie: Trie, source: string}>}
 */
export async function loadTrie({ url = new URL('../data/words.txt', import.meta.url).href } = {}) {
  if (cached) return cached;
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 4096) {
        cached = { trie: Trie.fromText(text), source: 'words.txt' };
        return cached;
      }
    }
  } catch {
    /* offline / missing file → built-in */
  }
  cached = { trie: builtinTrie(), source: 'builtin' };
  return cached;
}

export default loadTrie;