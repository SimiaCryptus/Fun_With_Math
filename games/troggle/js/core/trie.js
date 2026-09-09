/**
 * Trie — dictionary structure walked in lockstep by the solver. See idea.md §6.
 *
 * This is the in-memory, plain-object version (M1/M3 stepping stone). The packed
 * binary DAWG can replace it later as long as it exposes the same tiny interface:
 *
 *   trie.root                 opaque node handle
 *   trie.step(node, ch)       child node for one lowercase a–z char, or null
 *   trie.isTerminal(node)     true if a word ends here
 *   trie.isWord(word)
 *   trie.hasPrefix(prefix)
 */

function createNode() {
  return { children: new Map(), terminal: false };
}

/** Lowercase, keep a–z only; returns '' if anything else is present. */
export function normaliseEntry(word) {
  const w = String(word).trim().toLowerCase();
  return /^[a-z]+$/.test(w) ? w : '';
}

export class Trie {
  constructor() {
    this.root = createNode();
    this.size = 0;
  }

  /**
   * Insert one word. Returns true if it was new.
   * Non a–z input is rejected (returns false).
   */
  add(word) {
    const w = normaliseEntry(word);
    if (!w) return false;
    let n = this.root;
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      let c = n.children.get(ch);
      if (!c) {
        c = createNode();
        n.children.set(ch, c);
      }
      n = c;
    }
    if (n.terminal) return false;
    n.terminal = true;
    this.size++;
    return true;
  }

  step(node, ch) {
    return node.children.get(ch) ?? null;
  }

  isTerminal(node) {
    return node.terminal === true;
  }

  /** Node for a whole prefix, or null. */
  walk(prefix) {
    let n = this.root;
    for (let i = 0; i < prefix.length; i++) {
      n = this.step(n, prefix[i]);
      if (!n) return null;
    }
    return n;
  }

  hasPrefix(prefix) {
    return this.walk(String(prefix).toLowerCase()) !== null;
  }

  isWord(word) {
    const n = this.walk(String(word).toLowerCase());
    return n !== null && n.terminal;
  }

  /** Enumerate all words (mostly for tests/debugging). */
  *words() {
    const stack = [[this.root, '']];
    while (stack.length) {
      const [node, prefix] = stack.pop();
      if (node.terminal) yield prefix;
      for (const [ch, child] of node.children) stack.push([child, prefix + ch]);
    }
  }

  /**
   * Build from any iterable of words, filtering by length (§6.1: 3–15 letters).
   */
  static fromWords(words, { minLength = 3, maxLength = 15 } = {}) {
    const t = new Trie();
    for (const raw of words) {
      const w = normaliseEntry(raw);
      if (!w || w.length < minLength || w.length > maxLength) continue;
      t.add(w);
    }
    return t;
  }

  /** Build from whitespace/newline separated text. */
  static fromText(text, opts) {
    return Trie.fromWords(String(text).split(/\s+/), opts);
  }
}

export default Trie;