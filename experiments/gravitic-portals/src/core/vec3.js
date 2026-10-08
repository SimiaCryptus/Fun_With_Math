// @ts-check
/** @typedef {{x:number,y:number,z:number}} Vec3 */

/** @returns {Vec3} */
export const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

/** Accepts [x,y,z] or {x,y,z}. @returns {Vec3} */
export function toVec3(v) {
  if (Array.isArray(v)) return { x: v[0], y: v[1], z: v[2] };
  return { x: v.x, y: v.y, z: v.z };
}

export const toArray = (a) => [a.x, a.y, a.z];
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const addScaled = (a, b, s) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const negate = (a) => ({ x: -a.x, y: -a.y, z: -a.z });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const lengthSq = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const length = (a) => Math.sqrt(lengthSq(a));
export const distance = (a, b) => length(sub(a, b));
export const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export function normalize(a) {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
}

export function approxEqual(a, b, eps = 1e-9) {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
}

export const isFiniteVec = (a) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);