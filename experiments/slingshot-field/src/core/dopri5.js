/**
 * Dormand–Prince 5(4) stepper with FSAL.
 * (plan.md calls for DOP853; see the deviation notes. The API matches, so swapping it in later is local.)
 * rhs(y, out) must not allocate.
 */
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

export class Dopri5 {
  constructor(n, rhs, { rtol = 1e-12, atol = 1e-12, nerr = n } = {}) {
    this.n = n; this.rhs = rhs; this.rtol = rtol; this.atol = atol; this.nerr = nerr;
    for (const k of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'yt']) this[k] = new Float64Array(n);
  }

  /** One trial step of size h from y. Requires this.k1 = f(y). Writes out and k7 = f(out). Returns the error norm. */
  attempt(y, h, out) {
    const { n, k1, k2, k3, k4, k5, k6, k7, yt, rhs } = this;
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * A21 * k1[i];
    rhs(yt, k2);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A31 * k1[i] + A32 * k2[i]);
    rhs(yt, k3);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
    rhs(yt, k4);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
    rhs(yt, k5);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
    rhs(yt, k6);
    for (let i = 0; i < n; i++) out[i] = y[i] + h * (B1 * k1[i] + B3 * k3[i] + B4 * k4[i] + B5 * k5[i] + B6 * k6[i]);
    rhs(out, k7);
    let sum = 0;
    for (let i = 0; i < this.nerr; i++) {
      const e = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
      const sc = this.atol + this.rtol * Math.max(Math.abs(y[i]), Math.abs(out[i]));
      sum += (e / sc) ** 2;
    }
    return Math.sqrt(sum / this.nerr);
  }
}

export const stepFactor = (err) =>
  err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(err, -0.2)));

/** Integrate y in place from s = 0 to s1 exactly. */
export function integrateTo(integ, y, s1, h = 1e-3) {
  const yn = new Float64Array(y.length);
  integ.rhs(y, integ.k1);
  let s = 0;
  for (let it = 0; it < 1e7; it++) {
    const last = s + h >= s1;
    const hh = last ? s1 - s : h;
    const err = integ.attempt(y, hh, yn);
    if (err <= 1) {
      s += hh; y.set(yn); integ.k1.set(integ.k7);
      if (last) return y;
    }
    h = hh * stepFactor(err);
    if (h < 1e-15) throw new Error('step size underflow');
  }
  throw new Error('too many steps');
}