// @ts-check
/**
 * Dense Gaussian elimination with partial pivoting. Deterministic.
 * @param {Float64Array} A row-major n×n (not modified)
 * @param {ArrayLike<number>} b length n (not modified)
 * @param {number} n
 */
export function solveDense(A, b, n) {
  const M = Float64Array.from(A);
  const x = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(M[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M[i * n + k]);
      if (v > max) { max = v; p = i; }
    }
    if (max === 0) throw new Error('solveDense: singular matrix');
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = M[k * n + j]; M[k * n + j] = M[p * n + j]; M[p * n + j] = t;
      }
      const t = x[k]; x[k] = x[p]; x[p] = t;
    }
    const piv = M[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i * n + k] / piv;
      if (f === 0) continue;
      M[i * n + k] = 0;
      const ri = i * n, rk = k * n;
      for (let j = k + 1; j < n; j++) M[ri + j] -= f * M[rk + j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= M[i * n + j] * x[j];
    x[i] = s / M[i * n + i];
  }
  return x;
}
/** LU with partial pivoting (row-major, rows swapped in place). Reuse for many RHS. */
export function luFactor(A, n) {
   const M = Float64Array.from(A);
   const piv = new Int32Array(n);
   for (let k = 0; k < n; k++) {
     let p = k;
     let max = Math.abs(M[k * n + k]);
     for (let i = k + 1; i < n; i++) {
       const v = Math.abs(M[i * n + k]);
       if (v > max) { max = v; p = i; }
     }
     if (max === 0) throw new Error('luFactor: singular matrix');
     piv[k] = p;
     if (p !== k) {
       for (let j = 0; j < n; j++) { const t = M[k * n + j]; M[k * n + j] = M[p * n + j]; M[p * n + j] = t; }
     }
     const d = M[k * n + k];
     for (let i = k + 1; i < n; i++) {
       const f = (M[i * n + k] /= d);
       if (f === 0) continue;
       const ri = i * n, rk = k * n;
       for (let j = k + 1; j < n; j++) M[ri + j] -= f * M[rk + j];
     }
   }
   return { M, piv, n };
}
export function luSolve({ M, piv, n }, b) {
   const x = Float64Array.from(b);
   for (let k = 0; k < n; k++) {
     const p = piv[k];
     if (p !== k) { const t = x[k]; x[k] = x[p]; x[p] = t; }
   }
   for (let i = 0; i < n; i++) {
     let s = x[i];
     for (let j = 0; j < i; j++) s -= M[i * n + j] * x[j];
     x[i] = s;
   }
   for (let i = n - 1; i >= 0; i--) {
     let s = x[i];
     for (let j = i + 1; j < n; j++) s -= M[i * n + j] * x[j];
     x[i] = s / M[i * n + i];
   }
   return x;
}