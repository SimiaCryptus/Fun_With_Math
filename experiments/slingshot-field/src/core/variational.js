/**
 * Augmented system in Sundman time s: y = [x, y, ẋ, ẏ, Φ (16, row-major), t] (21 components).
 * dy/ds = g · [f(s); JΦ; 1], with g = r1/(r1+e1) · r2/(r2+e2).
 * With e1 = e2 = 0, g ≡ 1 (pure physical time).
 */
export function makeAugRhs(mu, { withSTM = true, e1 = 0, e2 = 0 } = {}) {
  return function rhs(y, out) {
    const x = y[0], yy = y[1], vx = y[2], vy = y[3];
    const dx1 = x + mu, dx2 = x - 1 + mu;
    const r1s = dx1 * dx1 + yy * yy, r2s = dx2 * dx2 + yy * yy;
    const r1 = Math.sqrt(r1s), r2 = Math.sqrt(r2s);
    const k1 = (1 - mu) / (r1s * r1), k2 = mu / (r2s * r2);
    const g = (r1 / (r1 + e1)) * (r2 / (r2 + e2));
    out[0] = g * vx; out[1] = g * vy;
    out[2] = g * (2 * vy + x - k1 * dx1 - k2 * dx2);
    out[3] = g * (-2 * vx + yy - (k1 + k2) * yy);
    if (withSTM) {
      const a5 = 3 * k1 / r1s, b5 = 3 * k2 / r2s;
      const oxx = 1 - k1 - k2 + a5 * dx1 * dx1 + b5 * dx2 * dx2;
      const oxy = (a5 * dx1 + b5 * dx2) * yy;
      const oyy = 1 - k1 - k2 + (a5 + b5) * yy * yy;
      for (let j = 0; j < 4; j++) {
        const p0 = y[4 + j], p1 = y[8 + j], p2 = y[12 + j], p3 = y[16 + j];
        out[4 + j] = g * p2;
        out[8 + j] = g * p3;
        out[12 + j] = g * (oxx * p0 + oxy * p1 + 2 * p3);
        out[16 + j] = g * (oxy * p0 + oyy * p1 - 2 * p2);
      }
    } else {
      for (let i = 4; i < 20; i++) out[i] = 0;
    }
    out[20] = g;
  };
}