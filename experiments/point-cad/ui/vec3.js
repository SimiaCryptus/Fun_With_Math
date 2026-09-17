// ℝ³ helpers for the renderer (display space only).
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => Math.sqrt(dot(a, a));
export const normalize = (a) => {
  const n = norm(a);
  return n > 0 ? scale(a, 1 / n) : [0, 0, 0];
};
export const lerp = (a, b, t) => add(a, scale(sub(b, a), t));

/** Rodrigues rotation of v about axis by angle (radians). */
export function rotate(v, axis, angle) {
  const k = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** Spherical interpolation between unit vectors. */
export function slerp(a, b, t) {
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  const ang = Math.acos(d);
  if (ang < 1e-6) return a;
  if (Math.PI - ang < 1e-6) {
    const helper = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return rotate(a, normalize(cross(a, helper)), t * ang);
  }
  const s = Math.sin(ang);
  return add(scale(a, Math.sin((1 - t) * ang) / s), scale(b, Math.sin(t * ang) / s));
}