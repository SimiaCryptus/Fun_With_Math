// Recursive slicing / wreath cascade. Child framings: measured Lk if supplied, else formula.
import { parseWord, delta, pow } from './braid.js';
import { permOfWord, cycles, formatCycles } from './perm.js';

/** Parse "2: s1\n3: s1 s2" → [{n, word}] (max 2 cuts → depth ≤ 3). */
export function parseCuts(src) {
  const out = [];
  for (const raw of String(src).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const mt = /^(\d+)\s*:(.*)$/.exec(line);
    if (!mt) throw new Error(`cascade line "${line}" must look like "2: s1"`);
    const n = parseInt(mt[1], 10);
    if (n < 1 || n > 12) throw new Error('cascade n must be 1..12');
    parseWord(mt[2], n); // validate
    out.push({ n, word: mt[2].trim() });
  }
  if (out.length > 2) throw new Error('cascade depth is capped at 3 (two cut lines)');
  return out;
}

/** theory.md §5 formula (labelled unverified for general n). */
export function framingFormula(n, m, cycleLen) {
  if (cycleLen === 1) return m;
  if (n === 2) return 2 * m + 2;
  return n * n * m;
}

export function cascade(n0, m0, cycles0, cuts, measured = null) {
  let comps = cycles0.map((c, i) => {
    const mv = measured ? measured[i] : null;
    return mv == null
      ? { framing: framingFormula(n0, m0, c.length), source: 'formula' }
      : { framing: mv, source: 'measured' };
  });
  const levels = [];
  let label = `S${n0}`;
  for (const cut of cuts) {
    const w = parseWord(cut.word, cut.n);
    const next = [];
    const blocks = [];
    for (const c of comps) {
      const tau = permOfWord([...w, ...pow(delta(cut.n), c.framing)], cut.n);
      const cy = cycles(tau);
      blocks.push({ framing: c.framing, source: c.source, tau: formatCycles(cy), k: cy.length });
      for (const cc of cy) {
        next.push({ framing: framingFormula(cut.n, c.framing, cc.length), source: 'formula' });
      }
    }
    label = `S${cut.n} ≀ ${label}`;
    levels.push({ n: cut.n, word: cut.word, group: label, blocks, k: next.length });
    comps = next;
  }
  return levels;
}