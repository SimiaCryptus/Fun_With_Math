// Tier 2: quadratic predicates with Hessian certificates (idea.md §5.4).
//
//   f(x) = x^T Q x + a^T x + c = 1/2 x^T H x + a^T x + c,  H = Q + Q^T
//
// The Hessian is constant and known, so convexity is read off once at
// construction time rather than estimated per box.

import { boxCorners, boxCenter, boxHalfWidths } from '../box.js';
import { symEig, zeros } from '../../core/linalg.js';

function qval(H, a, c, x) {
  const d = x.length;
  let s = c;
  for (let i = 0; i < d; i++) {
    s += a[i] * x[i];
    let t = 0;
    for (let j = 0; j < d; j++) t += H[i][j] * x[j];
    s += 0.5 * x[i] * t;
  }
  return s;
}

function qgrad(H, a, x) {
  const d = x.length;
  const g = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let t = a[i];
    for (let j = 0; j < d; j++) t += H[i][j] * x[j];
    g[i] = t;
  }
  return g;
}

/** Max (sign=+1) or min (sign=-1) of a quadratic over the box corners. */
function cornerExtreme(H, a, c, box, sign) {
  let best = -Infinity;
  for (const v of boxCorners(box)) {
    const z = sign * qval(H, a, c, v);
    if (z > best) best = z;
  }
  return sign * best;
}

/** Supporting (tangent) plane bound at the box center; exact affine range. */
function tangentBound(H, a, c, box, sign) {
  const m = boxCenter(box);
  const h = boxHalfWidths(box);
  const v = qval(H, a, c, m);
  const g = qgrad(H, a, m);
  let r = 0;
  for (let i = 0; i < g.length; i++) r += Math.abs(g[i]) * h[i];
  return sign > 0 ? v + r : v - r;
}

export class QuadraticField {
  /** @param {number[][]} Q d x d (need not be symmetric) */
  constructor(Q, a, c = 0, meta = {}) {
    const d = Q.length;
    this.d = d;
    this.Q = Q.map((r) => Float64Array.from(r));
    this.a = Float64Array.from(a);
    this.c = c;
    this.family = meta.family || 'quadratic';
    this.meta = meta;

    const H = zeros(d);
    for (let i = 0; i < d; i++)
      for (let j = 0; j < d; j++) H[i][j] = this.Q[i][j] + this.Q[j][i];
    this.H = H;

    const { values, vectors } = symEig(H);
    let scale = 0;
    for (let k = 0; k < d; k++) scale = Math.max(scale, Math.abs(values[k]));
    const tol = 1e-12 * Math.max(1, scale);
    const anyPos = Array.from(values).some((v) => v > tol);
    const anyNeg = Array.from(values).some((v) => v < -tol);
    this.curvature = anyPos && anyNeg ? 'indefinite' : anyNeg ? 'concave' : 'convex';

    if (this.curvature === 'indefinite') {
      const Hp = zeros(d);
      const Hm = zeros(d);
      for (let k = 0; k < d; k++) {
        const lam = values[k];
        const v = vectors[k];
        const p = Math.max(lam, 0);
        const n = Math.max(-lam, 0);
        for (let i = 0; i < d; i++)
          for (let j = 0; j < d; j++) {
            Hp[i][j] += p * v[i] * v[j];
            Hm[i][j] += n * v[i] * v[j];
          }
      }
      this.Hp = Hp;
      this.Hm = Hm;
      this.zero = new Float64Array(d);
    }

    let nz = Math.abs(c) > 1e-14 ? 1 : 0;
    for (let i = 0; i < d; i++) if (Math.abs(this.a[i]) > 1e-14) nz++;
    for (let i = 0; i < d; i++)
      for (let j = i; j < d; j++)
        if (Math.abs(this.H[i][j]) > 1e-14) nz++;
    this.nonzeros = nz;
    this.paramCount = meta.paramCount ?? nz;
  }

  eval(x) {
    return qval(this.H, this.a, this.c, x);
  }

  grad(x) {
    return qgrad(this.H, this.a, x);
  }

  /** Certified enclosure over the box, using the Hessian class. */
  range(box) {
    if (this.curvature === 'convex') {
      return {
        lo: tangentBound(this.H, this.a, this.c, box, -1),
        hi: cornerExtreme(this.H, this.a, this.c, box, +1),
      };
    }
    if (this.curvature === 'concave') {
      return {
        lo: cornerExtreme(this.H, this.a, this.c, box, -1),
        hi: tangentBound(this.H, this.a, this.c, box, +1),
      };
    }
    // Difference of convex: f = f+ - f-
    const hiP = cornerExtreme(this.Hp, this.a, this.c, box, +1);
    const loP = tangentBound(this.Hp, this.a, this.c, box, -1);
    const hiM = cornerExtreme(this.Hm, this.zero, 0, box, +1);
    const loM = tangentBound(this.Hm, this.zero, 0, box, -1);
    return { lo: loP - hiM, hi: hiP - loM };
  }

  text(names = ['x', 'y', 'z']) {
    const p = [];
    const f = (v) => v.toFixed(3);
    for (let i = 0; i < this.d; i++) {
      for (let j = i; j < this.d; j++) {
        const q = i === j ? 0.5 * this.H[i][i] : this.H[i][j];
        if (Math.abs(q) < 1e-6) continue;
        p.push(`${f(q)}${names[i]}${i === j ? '²' : names[j]}`);
      }
    }
    for (let i = 0; i < this.d; i++) {
      if (Math.abs(this.a[i]) < 1e-6) continue;
      p.push(`${f(this.a[i])}${names[i]}`);
    }
    if (Math.abs(this.c) > 1e-6) p.push(f(this.c));
    return p.join(' + ') || '0';
  }

  toJSON() {
    return {
      type: 'quadratic',
      Q: this.Q.map((r) => Array.from(r)),
      a: Array.from(this.a),
      c: this.c,
      meta: { family: this.family, paramCount: this.paramCount },
    };
  }
}

/** Build a quadratic from the 10 degree-<=2 monomial coefficients (3D). */
export function quadraticFromCoeffs(w, meta = {}) {
  // order: x², y², z², xy, xz, yz, x, y, z, 1
  const Q = [
    [w[0], 0.5 * w[3], 0.5 * w[4]],
    [0.5 * w[3], w[1], 0.5 * w[5]],
    [0.5 * w[4], 0.5 * w[5], w[2]],
  ];
  return new QuadraticField(Q, [w[6], w[7], w[8]], w[9], meta);
}