/** Rotate a 2-vector by angle t. */
export function rot2(t, v, out = [0, 0]) {
  const c = Math.cos(t), s = Math.sin(t), x = v[0], y = v[1];
  out[0] = c * x - s * y; out[1] = s * x + c * y; return out;
}

/** Eigenvalues of the symmetric 2×2 matrix [[a, b], [b, d]], in descending order. */
export function eigSym2(a, b, d) {
  const m = 0.5 * (a + d), r = Math.hypot(0.5 * (a - d), b);
  return [m + r, m - r];
}

/** Closed-form 2×2 polar decomposition A = Q S, with A = [a00, a01, a10, a11]. */
export function polar2(A) {
  const [a, b, c, d] = A;
  const det = a * d - b * c;
  const theta = Math.atan2(c - b, a + d);
  const co = Math.cos(theta), si = Math.sin(theta);
  const s00 = co * a + si * c, s01 = co * b + si * d;
  const s10 = -si * a + co * c, s11 = -si * b + co * d;
  const [s1, s2] = eigSym2(s00, 0.5 * (s01 + s10), s11);
  return { theta, S: [s00, s01, s10, s11], s1, s2, flip: det <= 0 };
}