import { Store } from './store.js';
import { Atom, node, factorial } from '../expr/ast.js';
import { canonicalize } from '../expr/canonical.js';
import { print } from '../expr/printer.js';

export function costBound(N) {
  return N <= 1 ? 1 : Math.ceil(3 * Math.log2(N));
}

// Derivations: [op, x, a, y, b] for binary ops ('+', '*', '^'); ['!', x, k] for factorial (same cost).
export class Aggregator {
  constructor({ N = 1000, K, mode = 'value', minimalOnly = true, includeIdentity = false, maxTrees = 2000, ops = {} } = {}) {
    Object.assign(this, { N, K: K ?? costBound(N), mode, minimalOnly, includeIdentity, maxTrees });
    this.pow = !!ops.pow;
    this.fact = !!ops.fact;
    this.store = new Store();
    this.level = 0;
    this.sorted = new Map();   // cost -> sorted values
    this.best = new Map();     // value -> minimal cost found
    this.treeAsts = new Map(); // "v:k" -> canonical ASTs (tree mode)
  }

  done() {
    return this.level >= this.K || (this.minimalOnly && this.best.size >= this.N);
  }

  run(onLevel) {
    while (!this.done()) {
      const r = this.step();
      if (onLevel) onLevel(r);
    }
    return this;
  }

  dominated(v, k) {
    if (!this.minimalOnly) return false;
    const bc = this.best.get(v);
    return bc !== undefined && bc < k;
  }

  step() {
    const k = ++this.level;
    const N = this.N;
    const found = new Map();

    if (k === 1) {
      found.set(1, { value: 1, cost: 1, count: 1, derivations: [] });
    } else {
      const add = (op, x, a, y, b, v) => {
        if (this.dominated(v, k)) return;
        let e = found.get(v);
        if (!e) { e = { value: v, cost: k, count: 0, derivations: [] }; found.set(v, e); }
        const cl = this.store.get(x, a).count, cr = this.store.get(y, b).count;
        e.count += (op !== '^' && a === b && x === y) ? cl * (cl + 1) / 2 : cl * cr;
        e.derivations.push([op, x, a, y, b]);
      };

      for (let a = 1; 2 * a <= k; a++) {
        const b = k - a;
        const A = this.sorted.get(a), B = this.sorted.get(b);
        if (!A || !B || !A.length || !B.length) continue;
        for (const x of A) {
          if (x + B[0] > N && x * B[0] > N) break;
          for (const y of B) {
            if (a === b && y < x) continue;
            if (x + y > N) break;
            add('+', x, a, y, b, x + y);
          }
          for (const y of B) {
            if (a === b && y < x) continue;
            if (x * y > N) break;
            if (!this.includeIdentity && (x === 1 || y === 1)) continue;
            add('*', x, a, y, b, x * y);
          }
        }
      }

      if (this.pow) {
        // Not commutative: try every split in both orders.
        for (let a = 1; a < k; a++) {
          const b = k - a;
          const A = this.sorted.get(a), B = this.sorted.get(b);
          if (!A || !B) continue;
          for (const x of A) {
            if (x === 1 && !this.includeIdentity) continue;
            for (const y of B) {
              if (y === 1 && !this.includeIdentity) continue;
              const v = x ** y;
              if (v > N) break;
              add('^', x, a, y, b, v);
            }
          }
        }
      }
    }

    if (this.fact) this.applyFactorial(found, k);

    const entries = [...found.values()].sort((p, q) => p.value - q.value);
    if (this.mode === 'tree') for (const e of entries) this.buildTrees(e);
    for (const e of entries) {
      this.store.add(e);
      if (!this.best.has(e.value)) this.best.set(e.value, k);
    }
    this.sorted.set(k, entries.map(e => e.value));
    return { level: k, K: this.K, newValues: entries.length, totalValues: this.best.size, entries };
  }

  // Factorial keeps the cost, so close the level under '!' in increasing value order
  // (x! > x for x >= 3, so each source is complete before it is used).
  applyFactorial(found, k) {
    const queue = [...found.keys()].sort((p, q) => p - q);
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i];
      if (x < 3) continue; // 1! = 1 and 2! = 2 would be self-loops
      const v = factorial(x);
      if (v > this.N || this.dominated(v, k)) continue;
      let e = found.get(v);
      if (!e) {
        e = { value: v, cost: k, count: 0, derivations: [] };
        found.set(v, e);
        let j = queue.length;
        while (j > i + 1 && queue[j - 1] > v) j--;
        queue.splice(j, 0, v);
      }
      e.count += found.get(x).count;
      e.derivations.push(['!', x, k]);
    }
  }

  buildTrees(e) {
    const map = new Map();
    const put = t => {
      const s = print(t);
      if (!map.has(s)) map.set(s, t);
      return map.size >= this.maxTrees;
    };
    if (e.derivations.length === 0) {
      map.set('1', Atom());
    } else {
      outer:
      for (const d of e.derivations) {
        if (d[0] === '!') {
          for (const t of this.treeAsts.get(`${d[1]}:${d[2]}`) || []) {
            if (put(canonicalize(node('!', [t])))) { e.truncated = true; break outer; }
          }
          continue;
        }
        const [op, x, a, y, b] = d;
        const L = this.treeAsts.get(`${x}:${a}`) || [];
        const R = this.treeAsts.get(`${y}:${b}`) || [];
        const same = op !== '^' && x === y && a === b;
        for (let i = 0; i < L.length; i++) {
          for (let j = same ? i : 0; j < R.length; j++) {
            if (put(canonicalize(node(op, [L[i], R[j]])))) { e.truncated = true; break outer; }
          }
        }
      }
    }
    this.treeAsts.set(`${e.value}:${e.cost}`, [...map.values()]);
    e.trees = [...map.keys()];
    e.count = e.trees.length;
  }
}