// Axial hex math, pointy-top. Directions indexed clockwise from East.
export const SQRT3 = Math.sqrt(3);
export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export const DIR_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];

export const opposite = (d) => (d + 3) % 6;
export const key = (q, r) => q + ',' + r;

export function neighbor(q, r, d) {
  return [q + DIRS[d][0], r + DIRS[d][1]];
}

export function distance(q1, r1, q2, r2) {
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function toWorld(q, r, size = 1) {
  return [size * SQRT3 * (q + r / 2), size * 1.5 * r];
}

export function dirVector(d) {
  const [x, z] = toWorld(DIRS[d][0], DIRS[d][1]);
  const l = Math.hypot(x, z);
  return [x / l, z / l];
}

export function dirAngle(d) {
  const [x, z] = dirVector(d);
  return Math.atan2(z, x);
}

export function cellsInRadius(q, r, radius) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius), hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) out.push([q + dq, r + dr]);
  }
  return out;
}

export function hexRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

export function line(q1, r1, q2, r2, nudge = 1e-6) {
  const n = distance(q1, r1, q2, r2);
  if (n === 0) return [[q1, r1]];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(hexRound(q1 + (q2 - q1) * t + nudge, r1 + (r2 - r1) * t + nudge));
  }
  return out;
}

// If (q2,r2) lies on one of the 6 axes through (q1,r1), returns {dir, dist}.
export function axisTo(q1, r1, q2, r2) {
  const dq = q2 - q1, dr = r2 - r1;
  if (dq === 0 && dr === 0) return null;
  if (dr === 0) return { dir: dq > 0 ? 0 : 3, dist: Math.abs(dq) };
  if (dq === 0) return { dir: dr > 0 ? 1 : 4, dist: Math.abs(dr) };
  if (dq + dr === 0) return { dir: dq < 0 ? 2 : 5, dist: Math.abs(dq) };
  return null;
}