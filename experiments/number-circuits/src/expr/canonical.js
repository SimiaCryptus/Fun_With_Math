import { evaluate } from './ast.js';
import { print } from './printer.js';

// Flatten same-operator chains of + and * into n-ary nodes and sort children by (value, string).
// '^' (not associative/commutative) and '!' (unary) keep their structure; only children are canonicalized.
export function canonicalize(n) {
  if (n.type === '1') return n;
  if (n.type === '^' || n.type === '!') return { type: n.type, children: n.children.map(canonicalize) };
  const kids = [];
  for (const c of n.children) {
    const cc = canonicalize(c);
    if (cc.type === n.type) kids.push(...cc.children);
    else kids.push(cc);
  }
  const dec = kids.map(k => ({ k, v: evaluate(k), s: print(k) }));
  dec.sort((a, b) => a.v - b.v || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  return { type: n.type, children: dec.map(d => d.k) };
}

// Minimal-paren printing of a flattened tree is unambiguous, so it serves as the canonical key.
export function canonicalString(n) {
  return print(canonicalize(n));
}