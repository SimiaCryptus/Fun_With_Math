/**
 * Small dense linear-algebra helpers. Matrices are row-major flat arrays.
 * Eigenvector matrices store eigenvector j in column j (index i*k + j).
 */

/** Cyclic Jacobi eigen-decomposition of a symmetric k×k matrix. Ascending eigenvalues. */
export function jacobiEig(Ain, k, { maxSweeps = 64 } = {}) {
  const A = Float64Array.from(Ain);
  const V = new Float64Array(k * k);
  for (let i = 0; i < k; i++) V[i * k + i] = 1;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    let all = 0;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const a = A[i * k + j] * A[i * k + j];
        all += a;
        if (i !== j) off += a;
      }
    }
    if (all === 0 || off <= 1e-28 * all) break;

    for (let p = 0; p < k - 1; p++) {
      for (let q = p + 1; q < k; q++) {
        const apq = A[p * k + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q * k + q] - A[p * k + p]) / (2 * apq);
        const t = Math.abs(theta) > 1e150
          ? 1 / (2 * theta)
          : (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let r = 0; r < k; r++) {
          const arp = A[r * k + p];
          const arq = A[r * k + q];
          A[r * k + p] = c * arp - s * arq;
          A[r * k + q] = s * arp + c * arq;
        }
        for (let r = 0; r < k; r++) {
          const apr = A[p * k + r];
          const aqr = A[q * k + r];
          A[p * k + r] = c * apr - s * aqr;
          A[q * k + r] = s * apr + c * aqr;
        }
        for (let r = 0; r < k; r++) {
          const vrp = V[r * k + p];
          const vrq = V[r * k + q];
          V[r * k + p] = c * vrp - s * vrq;
          V[r * k + q] = s * vrp + c * vrq;
        }
      }
    }
  }

  const order = Array.from({ length: k }, (_, i) => i).sort((a, b) => A[a * k + a] - A[b * k + b]);
  const values = new Float64Array(k);
  const vectors = new Float64Array(k * k);
  order.forEach((src, j) => {
    values[j] = A[src * k + src];
    for (let i = 0; i < k; i++) vectors[i * k + j] = V[i * k + src];
  });
  return { values, vectors };
}

/** M^(-1/2) for a symmetric PSD matrix; tiny eigenvalues are clamped (relative floor). */
export function invSqrtSym(M, k, { rel = 1e-10 } = {}) {
  const { values, vectors: V } = jacobiEig(M, k);
  let max = 0;
  for (const v of values) max = Math.max(max, v);
  const floor = Math.max(max * rel, 1e-300);
  const inv = Array.from(values, (v) => 1 / Math.sqrt(Math.max(v, floor)));
  const out = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let c = 0; c < k; c++) s += V[i * k + c] * inv[c] * V[j * k + c];
      out[i * k + j] = s;
    }
  }
  return out;
}

/** Mean and (population) covariance of the rows of X (n×d). */
export function covariance(X, n, d) {
  const mean = new Float64Array(d);
  const C = new Float64Array(d * d);
  if (!n) return { mean, C };
  for (let p = 0; p < n; p++) for (let c = 0; c < d; c++) mean[c] += X[p * d + c];
  for (let c = 0; c < d; c++) mean[c] /= n;
  for (let p = 0; p < n; p++) {
    for (let i = 0; i < d; i++) {
      const a = X[p * d + i] - mean[i];
      if (!a) continue;
      for (let j = i; j < d; j++) C[i * d + j] += a * (X[p * d + j] - mean[j]);
    }
  }
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      C[i * d + j] /= n;
      C[j * d + i] = C[i * d + j];
    }
  }
  return { mean, C };
}

/** Project the rows of X onto the top-k principal axes. Missing axes (k > d) are zero. */
export function pca(X, n, d, k) {
  const Y = new Float32Array(n * k);
  if (!n || !d) return Y;
  const { mean, C } = covariance(X, n, d);
  const { vectors: V } = jacobiEig(C, d);
  for (let j = 0; j < Math.min(k, d); j++) {
    const col = d - 1 - j;
    let best = 0;
    for (let i = 0; i < d; i++) if (Math.abs(V[i * d + col]) > Math.abs(best)) best = V[i * d + col];
    const sign = best < 0 ? -1 : 1;
    for (let p = 0; p < n; p++) {
      let s = 0;
      for (let i = 0; i < d; i++) s += (X[p * d + i] - mean[i]) * V[i * d + col];
      Y[p * k + j] = sign * s;
    }
  }
  return Y;
}

/**
 * Orthogonal R (k×k) minimizing ‖A R − B‖_F for A, B of shape n×k.
 * R = U Vᵀ from the SVD of AᵀB (computed via Jacobi on (AᵀB)ᵀ(AᵀB)).
 */
export function procrustes(A, B, n, k) {
  const M = new Float64Array(k * k);
  for (let p = 0; p < n; p++) {
    for (let i = 0; i < k; i++) {
      const a = A[p * k + i];
      if (!a) continue;
      for (let j = 0; j < k; j++) M[i * k + j] += a * B[p * k + j];
    }
  }
  const MtM = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let r = 0; r < k; r++) s += M[r * k + i] * M[r * k + j];
      MtM[i * k + j] = s;
    }
  }
  const { values, vectors: V } = jacobiEig(MtM, k);
  const smax = Math.sqrt(Math.max(values[k - 1] ?? 0, 0));
  const U = new Float64Array(k * k);
  const ok = new Array(k).fill(false);
  for (let j = 0; j < k; j++) {
    const s = Math.sqrt(Math.max(values[j], 0));
    if (s > 1e-9 * smax && s > 1e-300) {
      for (let r = 0; r < k; r++) {
        let u = 0;
        for (let i = 0; i < k; i++) u += M[r * k + i] * V[i * k + j];
        U[r * k + j] = u / s;
      }
      ok[j] = true;
    }
  }
  // Complete U to an orthonormal basis for degenerate directions (Gram–Schmidt on e_b).
  for (let j = 0; j < k; j++) {
    if (ok[j]) continue;
    for (let b = 0; b < k; b++) {
      const v = new Float64Array(k);
      v[b] = 1;
      for (let c = 0; c < k; c++) {
        if (!ok[c]) continue;
        const dot = U[b * k + c];
        for (let r = 0; r < k; r++) v[r] -= dot * U[r * k + c];
      }
      const norm = Math.hypot(...v);
      if (norm > 1e-6) {
        for (let r = 0; r < k; r++) U[r * k + j] = v[r] / norm;
        ok[j] = true;
        break;
      }
    }
  }
  const R = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let c = 0; c < k; c++) s += U[i * k + c] * V[j * k + c];
      R[i * k + j] = s;
    }
  }
  return R;
}