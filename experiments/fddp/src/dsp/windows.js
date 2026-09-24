import { fail } from '../core/errors.js';

// §7.3 window registry, periodic form.
export const WINDOW = Object.freeze({
  RECT: 0x00, HANN: 0x01, HAMMING: 0x02, SQRT_HANN: 0x03,
  BLACKMAN_HARRIS: 0x04, TUKEY: 0x05, KBD: 0x06,
});

export function makeWindow(id, N, param = 0.25) {
  const w = new Float64Array(N);
  switch (id) {
    case WINDOW.RECT: w.fill(1); break;
    case WINDOW.HANN:
      for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / N)); break;
    case WINDOW.HAMMING:
      for (let n = 0; n < N; n++) w[n] = 0.54 - 0.46 * Math.cos(2 * Math.PI * n / N); break;
    case WINDOW.SQRT_HANN:
      for (let n = 0; n < N; n++) w[n] = Math.sqrt(0.5 * (1 - Math.cos(2 * Math.PI * n / N))); break;
    case WINDOW.BLACKMAN_HARRIS: {
      const a = [0.35875, 0.48829, 0.14128, 0.01168];
      for (let n = 0; n < N; n++) {
        let s = 0;
        for (let i = 0; i < 4; i++) s += ((i % 2) ? -1 : 1) * a[i] * Math.cos(2 * Math.PI * i * n / N);
        w[n] = s;
      }
      break;
    }
    case WINDOW.TUKEY: {
      const a = param, edge = a * N / 2;
      for (let n = 0; n < N; n++) {
        if (n < edge) w[n] = 0.5 * (1 + Math.cos(Math.PI * (n / edge - 1)));
        else if (n > N - edge) w[n] = 0.5 * (1 + Math.cos(Math.PI * ((n - N + edge) / edge)));
        else w[n] = 1;
      }
      break;
    }
    default: fail('FDDP_E_PARAM', `window id 0x${id.toString(16)} not implemented`);
  }
  return w;
}

// §7.4 — COLA/WOLA must be VERIFIED NUMERICALLY at configuration time, not
// assumed from a table of "known good" pairs. p=1 for OLA, p=2 for WOLA.
export function colaNormalizer(w, H, p = 1) {
  const N = w.length;
  const reps = Math.ceil(N / H) + 2;
  const norm = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (let t = -reps; t <= reps; t++) {
      const idx = n - t * H;
      if (idx >= 0 && idx < N) s += Math.pow(w[idx], p);
    }
    norm[n] = s;
  }
  return norm;
}

export function verifyCola(w, H, p = 1, tol = 1e-7) {
  const norm = colaNormalizer(w, H, p);
  let min = Infinity, max = -Infinity;
   // colaNormalizer already sums over the infinite hop lattice, so every residue
   // n in [0, N) is an interior sample of an unbounded stream. (An earlier
   // "interior only" loop over [H, N-H) was EMPTY whenever H >= N/2 -- Hann @ N/2,
   // rect @ N -- and reported a NaN deviation as a COLA violation.)
   for (let n = 0; n < w.length; n++) { if (norm[n] < min) min = norm[n]; if (norm[n] > max) max = norm[n]; }
  const dev = (max - min) / (Math.abs(max) + 1e-30);
   if (!(max > 0) || !(dev <= tol)) {
    fail('FDDP_E_COLA_VIOLATION',
         `sum w^${p} varies by ${dev.toExponential(3)} > ${tol} at H=${H}, N=${w.length}`);
  }
  return { constant: (min + max) / 2, deviation: dev };
}