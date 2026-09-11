export const TAU = Math.PI * 2;
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const deg2rad = (d) => (d * Math.PI) / 180;

/** Move `cur` toward `target` by at most `maxDelta`. */
export function approach(cur, target, maxDelta) {
  const d = target - cur;
  if (d > maxDelta) return cur + maxDelta;
  if (d < -maxDelta) return cur - maxDelta;
  return target;
}

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

/** Deterministic integer hash mixing of a float (quantised to mm). */
export function hashFloat(h, x) {
  const i = Math.floor(x * 1000) | 0;
  h ^= i;
  h = Math.imul(h, 16777619);
  return h >>> 0;
}