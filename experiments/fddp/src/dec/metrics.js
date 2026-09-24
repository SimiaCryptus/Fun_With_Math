import { dct2d } from '../dsp/dct.js';

// §17 quality metrics. Reported, never inferred.
export function relativeRMS(a, b) {
  let num = 0, den = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; num += d * d; den += a[i] * a[i]; }
  return Math.sqrt(num / (den || 1));
}

export function psnr(a, b) {
  let mse = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; mse += d * d; }
  mse /= a.length;
  return mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse);
}

export function byteEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// §17.4 L1 — spectral convergence over 16x16 luma blocks of the two images.
export function spectralConvergenceRGB(a, b, w, h, bs = 16) {
  const bw = Math.floor(w / bs), bh = Math.floor(h / bs);
  const blk = new Float64Array(bs * bs), blk2 = new Float64Array(bs * bs);
  const s1 = new Float64Array(bs * bs), s2 = new Float64Array(bs * bs);
  let num = 0, den = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    for (let r = 0; r < bs; r++) for (let c = 0; c < bs; c++) {
      const p = ((by * bs + r) * w + bx * bs + c) * 3;
      blk[r * bs + c]  = (a[p] * 0.299 + a[p + 1] * 0.587 + a[p + 2] * 0.114) / 255;
      blk2[r * bs + c] = (b[p] * 0.299 + b[p + 1] * 0.587 + b[p + 2] * 0.114) / 255;
    }
    dct2d(blk, bs, bs, s1); dct2d(blk2, bs, bs, s2);
    for (let i = 0; i < bs * bs; i++) {
      const d = Math.abs(s2[i]) - Math.abs(s1[i]);
      num += d * d; den += s1[i] * s1[i];
    }
  }
  return Math.sqrt(num / (den || 1));
}

export function scDb(sc) { return 20 * Math.log10(Math.max(sc, 1e-12)); }

// §13.1 — level is MEASURED, then declared. Never the other way round.
export function determineLevel({ relRMS, sc, exact, payloadBits, request }) {
  const l2tol = payloadBits <= 16 ? 1e-4 : 1e-6;
  if (exact) return 2;                 // L3 additionally needs an integer-exact
                                       // transform (§13.1); DCT-II is not one.
  if (relRMS <= l2tol) return 2;
  if (sc <= 0.25) return 1;
  return 0;
}

export function bitsPerSourceOctet(dataBytes, sourceLength) {
  return (8 * dataBytes) / (sourceLength || 1);
}