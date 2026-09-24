import { fail } from '../core/errors.js';

// Iterative radix-2 Cooley-Tukey. Twiddles are computed from the angle
// directly rather than by recurrence: recurrence accumulates ~1e-10 by
// N=1024, which would break the 1e-12 agreement we demand of the two DCT paths.
const twiddleCache = new Map();
function twiddles(len, inverse) {
  const key = (inverse ? -len : len);
  let t = twiddleCache.get(key);
  if (t) return t;
  const half = len >> 1;
  const re = new Float64Array(half), im = new Float64Array(half);
  const sgn = inverse ? 2 : -2;
  for (let k = 0; k < half; k++) {
    const a = sgn * Math.PI * k / len;
    re[k] = Math.cos(a); im[k] = Math.sin(a);
  }
  t = { re, im };
  twiddleCache.set(key, t);
  return t;
}

export function fftInPlace(re, im, inverse = false) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) fail('FDDP_E_PARAM', `FFT length ${n} is not a power of two`);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const { re: wr, im: wi } = twiddles(len, inverse);
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const vr = re[b] * wr[k] - im[b] * wi[k];
        const vi = re[b] * wi[k] + im[b] * wr[k];
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr;        im[a] += vi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// §8.2 rFFT, forward-unnormalized. Returns K = N/2 + 1 complex bins.
export function rfft(x) {
  const n = x.length;
  const re = Float64Array.from(x), im = new Float64Array(n);
  fftInPlace(re, im, false);
  const K = (n >> 1) + 1;
  return { re: re.slice(0, K), im: im.slice(0, K) };
}