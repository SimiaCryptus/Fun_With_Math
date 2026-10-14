import { Atom, node } from '../expr/ast.js';
import { canonicalize } from '../expr/canonical.js';
import { print } from '../expr/printer.js';
import { parse } from '../expr/parser.js';

export function exampleTree(store, v, k) {
  const e = store.get(v, k);
  if (!e) return null;
  if (e.trees && e.trees.length) return parse(e.trees[0]);
  if (v === 1 && k === 1) return Atom();
  const d = e.derivations[0];
  if (d[0] === '!') return node('!', [exampleTree(store, d[1], d[2])]);
  const [op, x, a, y, b] = d;
  return node(op, [exampleTree(store, x, a), exampleTree(store, y, b)]);
}

// Up to `limit` distinct canonical trees with value v and cost k.
export function treesFor(store, v, k, limit = 100) {
  const memo = new Map();
  const build = (v, k) => {
    const key = v + ':' + k;
    if (memo.has(key)) return memo.get(key);
    const e = store.get(v, k);
    let out = [];
    if (e) {
      if (e.trees && e.trees.length) out = e.trees.slice(0, limit * 4).map(s => parse(s));
      else if (v === 1 && k === 1) out = [Atom()];
      else {
        outer:
        for (const d of e.derivations) {
          if (d[0] === '!') {
            for (const t of build(d[1], d[2])) {
              out.push(node('!', [t]));
              if (out.length >= limit * 4) break outer;
            }
            continue;
          }
          const [op, x, a, y, b] = d;
          const L = build(x, a), R = build(y, b);
          const same = op !== '^' && x === y && a === b;
          for (let i = 0; i < L.length; i++) {
            for (let j = same ? i : 0; j < R.length; j++) {
              out.push(node(op, [L[i], R[j]]));
              if (out.length >= limit * 4) break outer;
            }
          }
        }
      }
    }
    memo.set(key, out);
    return out;
  };
  const seen = new Map();
  for (const t of build(v, k)) {
    const c = canonicalize(t);
    const s = print(c);
    if (!seen.has(s)) seen.set(s, c);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}