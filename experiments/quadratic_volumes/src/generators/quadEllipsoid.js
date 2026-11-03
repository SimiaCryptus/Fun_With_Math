// Mahalanobis field from the node's mean and covariance. Sublevel sets are
// ellipsoids; two-sided slabs are shells.

import { covariance, inverseSym } from '../core/linalg.js';
import { QuadraticField } from '../geometry/predicates/quadratic.js';

export const quadEllipsoid = {
  id: 'quadEllipsoid',
  propose({ points, idx, d = 3 }) {
    if (idx.length < 4 * d) return [];
    const { mean: m, cov } = covariance(points, idx, d);
    let tr = 0;
    for (let i = 0; i < d; i++) tr += cov[i][i];
    const ridge = Math.max(1e-12, 1e-6 * (tr / d));
    for (let i = 0; i < d; i++) cov[i][i] += ridge;
    const S = inverseSym(cov);

    // f(x) = (x-m)^T S (x-m) = x^T S x - 2 (S m)^T x + m^T S m
    const Sm = new Float64Array(d);
    for (let i = 0; i < d; i++)
      for (let j = 0; j < d; j++) Sm[i] += S[i][j] * m[j];
    let c = 0;
    for (let i = 0; i < d; i++) c += m[i] * Sm[i];
    const a = new Float64Array(d);
    for (let i = 0; i < d; i++) a[i] = -2 * Sm[i];

    return [
      {
        family: 'quadEllipsoid',
        field: new QuadraticField(S, a, c, {
          family: 'quadEllipsoid',
          paramCount: d + (d * (d + 1)) / 2,
        }),
        paramCount: d + (d * (d + 1)) / 2,
        gridSize: 1,
        label: 'mahalanobis²',
      },
    ];
  },
};