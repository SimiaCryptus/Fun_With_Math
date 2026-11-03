// The law finder: an algebraic quadric g(x) ~ 0 fitted as the smallest
// eigenvector of the lifted (degree-<=2 monomial) scatter matrix. Its
// two-sided slabs |g| < w are the implicit-relation candidates of §7.3.

import { symEig, zeros } from '../core/linalg.js';
import { quadraticFromCoeffs } from '../geometry/predicates/quadratic.js';

const P = 10; // x², y², z², xy, xz, yz, x, y, z, 1

function lift(x, out) {
  out[0] = x[0] * x[0];
  out[1] = x[1] * x[1];
  out[2] = x[2] * x[2];
  out[3] = x[0] * x[1];
  out[4] = x[0] * x[2];
  out[5] = x[1] * x[2];
  out[6] = x[0];
  out[7] = x[1];
  out[8] = x[2];
  out[9] = 1;
  return out;
}

export const quadImplicit = {
  id: 'quadImplicit',
  propose({ points, idx, d = 3 }) {
    if (d !== 3 || idx.length < 3 * P) return [];
    const M = zeros(P);
    const m = new Float64Array(P);
    const x = new Float64Array(3);
    for (const i of idx) {
      x[0] = points[i * 3];
      x[1] = points[i * 3 + 1];
      x[2] = points[i * 3 + 2];
      lift(x, m);
      for (let a = 0; a < P; a++)
        for (let b = a; b < P; b++) M[a][b] += m[a] * m[b];
    }
    for (let a = 0; a < P; a++)
      for (let b = 0; b < a; b++) M[a][b] = M[b][a];

    const { values, vectors } = symEig(M);
    const w = Float64Array.from(vectors[P - 1]); // smallest eigenvalue
    if (!Number.isFinite(values[P - 1])) return [];

    let field = quadraticFromCoeffs(w, { family: 'quadImplicit' });

    // Normalize so that |g| is roughly a distance: divide by mean |grad|.
    let gsum = 0;
    let cnt = 0;
    for (const i of idx) {
      if (cnt++ % 7) continue;
      x[0] = points[i * 3];
      x[1] = points[i * 3 + 1];
      x[2] = points[i * 3 + 2];
      const g = field.grad(x);
      gsum += Math.hypot(g[0], g[1], g[2]);
    }
    const gbar = gsum / Math.max(1, Math.ceil(cnt / 7));
    if (gbar > 1e-9) {
      for (let k = 0; k < P; k++) w[k] /= gbar;
      field = quadraticFromCoeffs(w, { family: 'quadImplicit' });
    }

    // Drop numerically negligible coefficients (sparse encoding).
    let mx = 0;
    for (let k = 0; k < P; k++) mx = Math.max(mx, Math.abs(w[k]));
    const ws = Float64Array.from(w, (v) => (Math.abs(v) < 1e-4 * mx ? 0 : v));
    const sparse = quadraticFromCoeffs(ws, { family: 'quadImplicit' });

    return [
      {
        family: 'quadImplicit',
        field: sparse,
        paramCount: sparse.nonzeros,
        gridSize: 1,
        label: 'g(x)',
      },
    ];
  },
};