/** Planar CR3BP in normalized units. State s = [x, y, ẋ, ẏ] in the rotating frame. */

export function omega(x, y, mu) {
  const r1 = Math.hypot(x + mu, y), r2 = Math.hypot(x - 1 + mu, y);
  return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2;
}

export function gradOmega(x, y, mu, out = [0, 0]) {
  const dx1 = x + mu, dx2 = x - 1 + mu;
  const r1s = dx1 * dx1 + y * y, r2s = dx2 * dx2 + y * y;
  const k1 = (1 - mu) / (r1s * Math.sqrt(r1s)), k2 = mu / (r2s * Math.sqrt(r2s));
  out[0] = x - k1 * dx1 - k2 * dx2;
  out[1] = y - (k1 + k2) * y;
  return out;
}

/** Returns [Ωxx, Ωxy, Ωyy]. */
export function hessOmega(x, y, mu, out = [0, 0, 0]) {
  const dx1 = x + mu, dx2 = x - 1 + mu;
  const r1s = dx1 * dx1 + y * y, r2s = dx2 * dx2 + y * y;
  const k1 = (1 - mu) / (r1s * Math.sqrt(r1s)), k2 = mu / (r2s * Math.sqrt(r2s));
  const a5 = 3 * k1 / r1s, b5 = 3 * k2 / r2s;
  out[0] = 1 - k1 - k2 + a5 * dx1 * dx1 + b5 * dx2 * dx2;
  out[1] = (a5 * dx1 + b5 * dx2) * y;
  out[2] = 1 - k1 - k2 + (a5 + b5) * y * y;
  return out;
}

/** Physical-time vector field f(s). */
export function rhs4(s, mu, out = [0, 0, 0, 0]) {
  const g = gradOmega(s[0], s[1], mu);
  out[0] = s[2]; out[1] = s[3];
  out[2] = 2 * s[3] + g[0]; out[3] = -2 * s[2] + g[1];
  return out;
}

export const jacobi = (s, mu) => 2 * omega(s[0], s[1], mu) - (s[2] * s[2] + s[3] * s[3]);

/** Inertial velocity components in the instantaneous rotating axes. */
export function inertialVel(s, out = [0, 0]) {
  out[0] = s[2] - s[1]; out[1] = s[3] + s[0]; return out;
}

export function inertialEnergy(s, mu) {
  const vx = s[2] - s[1], vy = s[3] + s[0];
  const r1 = Math.hypot(s[0] + mu, s[1]), r2 = Math.hypot(s[0] - 1 + mu, s[1]);
  return 0.5 * (vx * vx + vy * vy) - (1 - mu) / r1 - mu / r2;
}

export const angMom = (s) => s[0] * s[3] - s[1] * s[2] + s[0] * s[0] + s[1] * s[1];

/** Keplerian energy relative to P1 (rotation invariant). v_P1 = ω × (−μ, 0) = (0, −μ). */
export function keplerE1(s, mu) {
  const vx = s[2] - s[1], vy = s[3] + s[0] + mu;
  return 0.5 * (vx * vx + vy * vy) - (1 - mu) / Math.hypot(s[0] + mu, s[1]);
}

/** ∂E/∂s for the inertial energy. */
export function gradEnergy(s, mu, out = [0, 0, 0, 0]) {
  const x = s[0], y = s[1], vIx = s[2] - y, vIy = s[3] + x;
  const dx1 = x + mu, dx2 = x - 1 + mu;
  const r1s = dx1 * dx1 + y * y, r2s = dx2 * dx2 + y * y;
  const k1 = (1 - mu) / (r1s * Math.sqrt(r1s)), k2 = mu / (r2s * Math.sqrt(r2s));
  out[0] = vIy + k1 * dx1 + k2 * dx2;
  out[1] = -vIx + (k1 + k2) * y;
  out[2] = vIx; out[3] = vIy;
  return out;
}