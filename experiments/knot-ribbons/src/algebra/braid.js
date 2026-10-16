// Braid words: arrays of non-zero ints. +i = σ_i, −i = σ_i⁻¹ (1-based).

export function delta(n) {
  const w = [];
  for (let k = n - 1; k >= 1; k--) for (let i = 1; i <= k; i++) w.push(i);
  return w;
}

export const inverse = (w) => w.slice().reverse().map((g) => -g);

export function pow(w, p) {
  const base = p < 0 ? inverse(w) : w;
  const out = [];
  for (let k = 0; k < Math.abs(p); k++) out.push(...base);
  return out;
}

/** Δ conjugation flip σ_i ↔ σ_{n−i}. */
export const flip = (w, n) => w.map((g) => Math.sign(g) * (n - Math.abs(g)));

export function freeReduce(w) {
  const st = [];
  for (const g of w) {
    if (st.length && st[st.length - 1] === -g) st.pop();
    else st.push(g);
  }
  return st;
}

/**
 * Parse e.g. "(s1 s2^-1)^2 D^3", "σ1 σ2⁻¹", "1 -2 1 -2".
 * Throws Error with a position on invalid input.
 */
export function parseWord(src, n) {
  const s = String(src)
    .replace(/σ/g, 's')
    .replace(/Δ/g, 'D')
    .replace(/⁻¹/g, '^-1')
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));
  let i = 0;
  const err = (msg) => { throw new Error(`${msg} (at char ${i + 1})`); };
  const ws = () => { while (i < s.length && /[\s,·*.]/.test(s[i])) i++; };
  const num = () => {
    const mt = /^[+-]?\d+/.exec(s.slice(i));
    if (!mt) return null;
    i += mt[0].length;
    return parseInt(mt[0], 10);
  };
  const checkGen = (k) => {
    if (k < 1 || k > n - 1) err(`σ${k} is not a generator of B_${n}`);
  };
  const power = () => {
    ws();
    if (s[i] !== '^') return 1;
    i++;
    ws();
    const p = num();
    if (p === null) err('expected exponent');
    return p;
  };
  function atom() {
    const c = s[i];
    let base;
    if (c === '(') {
      i++;
      base = seq();
      if (s[i] !== ')') err("expected ')'");
      i++;
    } else if (c === 's' || c === 'S') {
      i++;
      const k = num();
      if (k === null) err('expected generator index');
      checkGen(k);
      base = [k];
    } else if (c === 'D') {
      i++;
      base = delta(n);
    } else {
      const k = num();
      if (k === null || k === 0) err(`unexpected '${c}'`);
      checkGen(Math.abs(k));
      base = [k];
    }
    return pow(base, power());
  }
  function seq() {
    const out = [];
    for (;;) {
      ws();
      if (i >= s.length || s[i] === ')') return out;
      out.push(...atom());
    }
  }
  const w = seq();
  if (i < s.length) err("unbalanced ')'");
  return w;
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const sup = (k) => String(k).split('').map((c) => SUP[c]).join('');
const sub = (k) => String(k).split('').map((c) => SUB[c]).join('');

/** Pretty print with run-length powers: σ₁³ σ₂⁻¹. */
export function formatWord(w) {
  if (!w.length) return 'e';
  const out = [];
  for (let i = 0; i < w.length;) {
    let j = i;
    while (j < w.length && w[j] === w[i]) j++;
    const e = (j - i) * Math.sign(w[i]);
    out.push(`σ${sub(Math.abs(w[i]))}${e === 1 ? '' : sup(e)}`);
    i = j;
  }
  return out.join(' ');
}