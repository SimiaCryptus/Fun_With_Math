// Tier 1: affine predicates. Exact box range in O(d) (idea.md §5.3).

import { boxCenter, boxHalfWidths } from '../box.js';

export class AffineField {
  /** f(x) = a . x + c */
  constructor(a, c = 0, meta = {}) {
    this.a = Float64Array.from(a);
    this.c = c;
    this.family = meta.family || 'affine';
    this.meta = meta;
    this.paramCount = meta.paramCount ?? this.a.length + 1;
  }
  eval(x) {
    let s = this.c;
    for (let i = 0; i < this.a.length; i++) s += this.a[i] * x[i];
    return s;
  }
  /** Exact: f(m) ± sum |a_i| h_i. */
  range(box) {
    const m = boxCenter(box);
    const h = boxHalfWidths(box);
    let c = this.c, r = 0;
    for (let i = 0; i < this.a.length; i++) {
      c += this.a[i] * m[i];
      r += Math.abs(this.a[i]) * h[i];
    }
    return { lo: c - r, hi: c + r };
  }
  text(names = ['x', 'y', 'z']) {
    const parts = [];
    for (let i = 0; i < this.a.length; i++) {
      if (Math.abs(this.a[i]) < 1e-12) continue;
      parts.push(`${this.a[i].toFixed(3)}${names[i] ?? 'x' + i}`);
    }
    if (Math.abs(this.c) > 1e-12) parts.push(this.c.toFixed(3));
    return parts.join(' + ') || '0';
  }
  toJSON() {
    return {
      type: 'affine',
      a: Array.from(this.a),
      c: this.c,
      meta: { family: this.family, paramCount: this.paramCount },
    };
  }
}

/** Coordinate field x_k, the axis-aligned (DET-like) family. */
export function axisField(k, d = 3) {
  const a = new Float64Array(d);
  a[k] = 1;
  return new AffineField(a, 0, { family: 'axis', axis: k, paramCount: 0 });
}