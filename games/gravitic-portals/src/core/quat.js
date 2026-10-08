// @ts-check
import { add, cross, scale, normalize } from './vec3.js';

/** @typedef {{x:number,y:number,z:number,w:number}} Quat */

export const qIdentity = () => ({ x: 0, y: 0, z: 0, w: 1 });

export function qFromAxisAngle(axis, angle) {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(angle / 2) };
}

export function qMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export const qConj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function qNormalize(q) {
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** Rotate vector v by unit quaternion q. */
export function qRotate(q, v) {
  const u = { x: q.x, y: q.y, z: q.z };
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q.w)), cross(u, t));
}