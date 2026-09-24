import { devAssert } from '../core/assert.js';

// §10.2 — the area-average MUST happen on LINEAR magnitudes, before log
// compression: averaging logs computes a geometric mean and biases every wide
// band downward.
//
// DEVIATION D-05: an *arithmetic* mean of linear magnitudes does not preserve
// band energy either (Jensen). §17.1 demands energy preservation to 1e-5, so
// the area average is taken over POWER and rooted -- still strictly linear
// domain, and exactly energy-preserving.
export function areaAverage(lin, k0, k1, Kp, out = new Float64Array(Kp)) {
  const W = k1 - k0;
  devAssert(W > 0, 'empty band reached the resampler');
  const step = W / Kp;
  for (let p = 0; p < Kp; p++) {
    const a = k0 + p * step, b = a + step;
    let acc = 0;
    const i0 = Math.floor(a), i1 = Math.ceil(b);
    for (let k = i0; k < i1; k++) {
      const cov = Math.min(b, k + 1) - Math.max(a, k);
      if (cov <= 0) continue;
      const v = lin[k];
      devAssert(v >= 0, 'areaAverage received a negative value: logs were passed in');
      acc += cov * v * v;
    }
    out[p] = Math.sqrt(acc / step);
  }
  return out;
}

export function bandEnergy(lin, k0, k1) {
  let e = 0;
  for (let k = k0; k < k1; k++) e += lin[k] * lin[k];
  return e;
}

export function slotsEnergy(slots, width) {
  const step = width / slots.length;
  let e = 0;
  for (let p = 0; p < slots.length; p++) e += slots[p] * slots[p] * step;
  return e;
}

// §13.2 step 3 — expand by nearest neighbour in k, then RESCALE so that the
// reconstructed band energy matches the decoded band energy exactly.
export function expandNN(slots, width, targetEnergy, out = new Float64Array(width)) {
  const Kp = slots.length;
  for (let k = 0; k < width; k++) out[k] = slots[Math.min(Kp - 1, Math.floor(k * Kp / width))];
  let e = 0;
  for (let k = 0; k < width; k++) e += out[k] * out[k];
  if (e > 0 && targetEnergy > 0) {
    const g = Math.sqrt(targetEnergy / e);
    for (let k = 0; k < width; k++) out[k] *= g;
  }
  return out;
}