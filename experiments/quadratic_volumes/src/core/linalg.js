// Small dense linear algebra: symmetric Jacobi eigendecomposition, mean,
// covariance, PCA. Matrices are plain arrays of arrays. DOM-free.

export function zeros(n, m = n) {
  return Array.from({ length: n }, () => new Float64Array(m));
}

export function mean(points, idx, d = 3) {
  const m = new Float64Array(d);
  for (const i of idx) for (let k = 0; k < d; k++) m[k] += points[i * d + k];
  for (let k = 0; k < d; k++) m[k] /= Math.max(1, idx.length);
  return m;
}

export function covariance(points, idx, d = 3) {
  const m = mean(points, idx, d);
  const C = zeros(d);
  for (const i of idx) {
    for (let a = 0; a < d; a++) {
      const da = points[i * d + a] - m[a];
      for (let b = 0; b < d; b++) C[a][b] += da * (points[i * d + b] - m[b]);
    }
  }
  const n = Math.max(1, idx.length - 1);
  for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) C[a][b] /= n;
  return { mean: m, cov: C };
}

/**
 * Jacobi eigendecomposition of a symmetric matrix.
 * Returns { values: Float64Array, vectors: columns as array of Float64Array }
 * sorted by descending eigenvalue.
 */
export function symEig(Ain, iters = 100, tol = 1e-12) {
  const n = Ain.length;
  const A = Ain.map((r) => Float64Array.from(r));
  const V = zeros(n);
  for (let i = 0; i < n; i++) V[i][i] = 1;
  for (let sweep = 0; sweep < iters; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < tol) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = [...Array(n).keys()].sort((a, b) => A[b][b] - A[a][a]);
  const values = new Float64Array(n);
  const vectors = [];
  order.forEach((o, j) => {
    values[j] = A[o][o];
    const v = new Float64Array(n);
    for (let k = 0; k < n; k++) v[k] = V[k][o];
    vectors.push(v);
  });
  return { values, vectors };
}

export function pca(points, idx, d = 3) {
  const { mean: m, cov } = covariance(points, idx, d);
  const { values, vectors } = symEig(cov);
  return { mean: m, values, vectors };
}
/** Inverse of a symmetric PSD matrix, with eigenvalue ridge. */
export function inverseSym(A, ridge = 1e-9) {
  const { values, vectors } = symEig(A);
  const n = A.length;
  const out = zeros(n);
  for (let k = 0; k < n; k++) {
    const lam = Math.max(values[k], ridge);
    const v = vectors[k];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) out[i][j] += (v[i] * v[j]) / lam;
  }
  return out;
}