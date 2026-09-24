// Reversible integer YCoCg-R (Profile C, §6.3). Y in [0,255], Co/Cg in [-255,255].
// Reversibility is exact and is property-tested; without it the "exact" mode
// of phase 8 is impossible and the "faithful" mode leaks a rounding error.
export function rgbToYCoCgR(rgb, n) {
  const Y = new Int16Array(n), Co = new Int16Array(n), Cg = new Int16Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const r = rgb[p], g = rgb[p + 1], b = rgb[p + 2];
    const co = r - b;
    const t = b + (co >> 1);
    const cg = g - t;
    Y[i] = t + (cg >> 1);
    Co[i] = co; Cg[i] = cg;
  }
  return { Y, Co, Cg };
}

export function yCoCgRToRgb(Y, Co, Cg, n, out = new Uint8ClampedArray(n * 3)) {
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const y = Y[i], co = Co[i], cg = Cg[i];
    const t = y - (cg >> 1);
    const g = cg + t;
    const b = t - (co >> 1);
    const r = b + co;
    out[p] = r; out[p + 1] = g; out[p + 2] = b;
  }
  return out;
}