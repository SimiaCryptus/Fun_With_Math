// Symmetric group S_n, 0-based arrays. perm[p] = final position of strand starting at p.

export const identity = (n) => Array.from({ length: n }, (_, i) => i);
export const reversal = (n) => identity(n).map((i) => n - 1 - i);
export const compose = (a, b) => a.map((x) => b[x]); // first a, then b
export const isIdentity = (p) => p.every((x, i) => x === i);

export function inverse(p) {
  const q = new Array(p.length);
  p.forEach((x, i) => { q[x] = i; });
  return q;
}

/** π : B_n → S_n. */
export function permOfWord(word, n) {
  const at = identity(n); // at[position] = strand
  for (const g of word) {
    const i = Math.abs(g) - 1;
    const t = at[i];
    at[i] = at[i + 1];
    at[i + 1] = t;
  }
  const p = new Array(n);
  for (let q = 0; q < n; q++) p[at[q]] = q;
  return p;
}

/** Cycles follow p → perm[p], i.e. the order strands are glued in the closure. */
export function cycles(perm) {
  const seen = new Array(perm.length).fill(false);
  const out = [];
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    const c = [];
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      c.push(j);
    }
    out.push(c);
  }
  return out;
}

export const formatCycles = (cs) => cs.map((c) => `(${c.map((i) => i + 1).join(' ')})`).join('');
export const cycleType = (cs) => cs.map((c) => c.length).sort((a, b) => b - a);
export const sign = (perm) => ((perm.length - cycles(perm).length) % 2 === 0 ? 1 : -1);