import { Atom, node } from '../expr/ast.js';

// op codes: 0 = '+', 1 = '*', 2 = '^', 3 = '!'
export function complexityTable(N, ops = {}) {
  const C = new Int32Array(N + 1);
  const op = new Uint8Array(N + 1);
  const part = new Int32Array(N + 1);  // left operand / base / factorial argument
  const part2 = new Int32Array(N + 1); // exponent
  const factOf = new Map();
  if (ops.fact) for (let m = 3, f = 6; f <= N; m++, f *= m) factOf.set(f, m);
  if (N >= 1) C[1] = 1;
  for (let n = 2; n <= N; n++) {
    let best = Infinity, bo = 0, bp = 0, be = 0;
    for (let a = 1; 2 * a <= n; a++) {
      const c = C[a] + C[n - a];
      if (c < best) { best = c; bo = 0; bp = a; }
    }
    for (let d = 2; d * d <= n; d++) {
      if (n % d === 0) {
        const c = C[d] + C[n / d];
        if (c < best) { best = c; bo = 1; bp = d; }
      }
    }
    if (ops.pow) {
      for (let b = 2; b * b <= n; b++) {
        let p = b * b, e = 2;
        while (p < n) { p *= b; e++; }
        if (p === n) {
          const c = C[b] + C[e];
          if (c < best) { best = c; bo = 2; bp = b; be = e; }
        }
      }
    }
    if (factOf.has(n)) {
      const m = factOf.get(n);
      if (C[m] < best) { best = C[m]; bo = 3; bp = m; }
    }
    C[n] = best; op[n] = bo; part[n] = bp; part2[n] = be;
  }
  return { N, C, op, part, part2 };
}

const cache = new Map();
export function getTable(N, ops = {}) {
  const key = `${!!ops.pow}|${!!ops.fact}`;
  let t = cache.get(key);
  if (!t || t.N < N) { t = complexityTable(Math.max(N, 1000), ops); cache.set(key, t); }
  return t;
}

export function minimalExpr(t, n) {
  if (n === 1) return Atom();
  const a = t.part[n];
  switch (t.op[n]) {
    case 0: return node('+', [minimalExpr(t, a), minimalExpr(t, n - a)]);
    case 1: return node('*', [minimalExpr(t, a), minimalExpr(t, n / a)]);
    case 2: return node('^', [minimalExpr(t, a), minimalExpr(t, t.part2[n])]);
    default: return node('!', [minimalExpr(t, a)]);
  }
}