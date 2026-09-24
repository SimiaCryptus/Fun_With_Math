import { fftInPlace } from './fft.js';
import { devAssert } from '../core/assert.js';

// §8.2 DCT-II, ORTHONORMAL:
//   X[k] = a(k) * SUM x[n] w[n] cos( (pi/N)(n + 1/2) k ),  a(0)=sqrt(1/N), a(k>0)=sqrt(2/N)
// The (n + 1/2) half-sample offset is the whole point of conformance vector V2.

// ---- reference kernel: O(N^2), never deleted, never optimised ----------
export function dct2Ref(x) {
  const N = x.length, X = new Float64Array(N);
  const a0 = Math.sqrt(1 / N), ak = Math.sqrt(2 / N);
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let n = 0; n < N; n++) s += x[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    X[k] = (k === 0 ? a0 : ak) * s;
  }
  return X;
}

export function dct3Ref(X) {
  const N = X.length, x = new Float64Array(N);
  const a0 = Math.sqrt(1 / N), ak = Math.sqrt(2 / N);
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (let k = 0; k < N; k++) s += (k === 0 ? a0 : ak) * X[k] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    x[n] = s;
  }
  return x;
}

// ---- matrix kernel: the one we actually run for 16x16 blocks -----------
const matCache = new Map();
export function dctMatrix(N) {                  // row k, column n
  let m = matCache.get(N);
  if (m) return m;
  m = new Float64Array(N * N);
  const a0 = Math.sqrt(1 / N), ak = Math.sqrt(2 / N);
  for (let k = 0; k < N; k++)
    for (let n = 0; n < N; n++)
      m[k * N + n] = (k === 0 ? a0 : ak) * Math.cos((Math.PI / N) * (n + 0.5) * k);
  matCache.set(N, m);
  return m;
}

// ---- fast kernel: even/odd reorder + one N-point complex FFT -----------
// v[n] = x[2n], v[N-1-n] = x[2n+1];  W[k] = e^{-i pi k / 2N} FFT(v)[k]
// then C[k] = Re W[k] and C[N-k] = -Im W[k]. Orthonormal factors applied last.
export function dct2Fast(x) {
  const N = x.length;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let n = 0; n < N >> 1; n++) { re[n] = x[2 * n]; re[N - 1 - n] = x[2 * n + 1]; }
  fftInPlace(re, im, false);
  const X = new Float64Array(N);
  const a0 = Math.sqrt(1 / N), ak = Math.sqrt(2 / N);
  for (let k = 0; k < N; k++) {
    const a = -Math.PI * k / (2 * N);
    const c = Math.cos(a), s = Math.sin(a);
    X[k] = (k === 0 ? a0 : ak) * (re[k] * c - im[k] * s);
  }
  return X;
}

export function dct3Fast(X) {
  const N = X.length;
  const a0 = Math.sqrt(1 / N), ak = Math.sqrt(2 / N);
  const C = new Float64Array(N + 1);
  for (let k = 0; k < N; k++) C[k] = X[k] / (k === 0 ? a0 : ak);
  C[N] = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const a = Math.PI * k / (2 * N);
    const c = Math.cos(a), s = Math.sin(a);
    const cr = C[k], ci = -C[N - k];
    re[k] = cr * c - ci * s;
    im[k] = cr * s + ci * c;
  }
  fftInPlace(re, im, true);
  const x = new Float64Array(N);
  for (let n = 0; n < N >> 1; n++) { x[2 * n] = re[n]; x[2 * n + 1] = re[N - 1 - n]; }
  return x;
}

// Dispatcher. The matrix path wins below ~64 (our 16x16 blocks); the FFT path
// carries Profile A's N=1024.
export function dct2(x) {
  const N = x.length;
  if (N <= 64) {
    const m = dctMatrix(N), X = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      let s = 0, o = k * N;
      for (let n = 0; n < N; n++) s += m[o + n] * x[n];
      X[k] = s;
    }
    return X;
  }
  return dct2Fast(x);
}

export function dct3(X) {
  const N = X.length;
  if (N <= 64) {
    const m = dctMatrix(N), x = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      let s = 0;
      for (let k = 0; k < N; k++) s += m[k * N + n] * X[k];
      x[n] = s;
    }
    return x;
  }
  return dct3Fast(X);
}

// §8.1 transform 0x08 — separable 2-D DCT-II, orthonormal on both axes.
// block is Float64Array(rows*cols), row-major. Result overwrites `out`.
export function dct2d(block, rows, cols, out = new Float64Array(rows * cols), scratch = null) {
  const tmp = scratch || new Float64Array(rows * cols);
  const mr = dctMatrix(cols);
  for (let r = 0; r < rows; r++) {                       // rows
    const ro = r * cols;
    for (let k = 0; k < cols; k++) {
      let s = 0, mo = k * cols;
      for (let n = 0; n < cols; n++) s += mr[mo + n] * block[ro + n];
      tmp[ro + k] = s;
    }
  }
  const mc = dctMatrix(rows);
  for (let c = 0; c < cols; c++) {                       // columns
    for (let k = 0; k < rows; k++) {
      let s = 0, mo = k * rows;
      for (let n = 0; n < rows; n++) s += mc[mo + n] * tmp[n * cols + c];
      out[k * cols + c] = s;
    }
  }
  devAssert(out.length === rows * cols, 'dct2d output shape');
  return out;
}

export function idct2d(spec, rows, cols, out = new Float64Array(rows * cols), scratch = null) {
  const tmp = scratch || new Float64Array(rows * cols);
  const mc = dctMatrix(rows);
  for (let c = 0; c < cols; c++) {
    for (let n = 0; n < rows; n++) {
      let s = 0;
      for (let k = 0; k < rows; k++) s += mc[k * rows + n] * spec[k * cols + c];
      tmp[n * cols + c] = s;
    }
  }
  const mr = dctMatrix(cols);
  for (let r = 0; r < rows; r++) {
    const ro = r * cols;
    for (let n = 0; n < cols; n++) {
      let s = 0;
      for (let k = 0; k < cols; k++) s += mr[k * cols + n] * tmp[ro + k];
      out[ro + n] = s;
    }
  }
  return out;
}