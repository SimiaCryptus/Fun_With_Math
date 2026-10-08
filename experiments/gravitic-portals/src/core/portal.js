// @ts-check
import * as V from './vec3.js';

/**
 * @typedef {Object} Portal
 * @property {number|string} id
 * @property {V.Vec3} center
 * @property {V.Vec3} normal  front-facing unit normal
 * @property {V.Vec3} up      in-plane unit vector (fixes the frame)
 * @property {V.Vec3} right   up × normal
 * @property {number} radius
 * @property {number|string|null} linkId
 */

/** A default in-plane "up" for a given normal (world +Y projected, or -Z for floor/ceiling). */
export function defaultUp(n) {
  const ref = Math.abs(n.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: -1 };
  return V.normalize(V.sub(ref, V.scale(n, V.dot(ref, n))));
}

/** @returns {Portal} */
export function makePortal({ id, center, normal, up = undefined, radius = 1, linkId = null }) {
  const c = V.toVec3(center);
  const n = V.normalize(V.toVec3(normal));
  let u = up ? V.toVec3(up) : defaultUp(n);
  u = V.sub(u, V.scale(n, V.dot(u, n)));
  if (V.length(u) < 1e-9) u = defaultUp(n);
  u = V.normalize(u);
  const right = V.cross(u, n);
  if (!(radius > 0)) throw new Error(`portal ${id}: radius must be > 0`);
  return Object.freeze({ id, center: c, normal: n, up: u, right, radius, linkId });
}

export function toLocal(p, x) {
  const d = V.sub(x, p.center);
  return { x: V.dot(d, p.right), y: V.dot(d, p.up), z: V.dot(d, p.normal) };
}

export function fromLocal(p, l) {
  return {
    x: p.center.x + p.right.x * l.x + p.up.x * l.y + p.normal.x * l.z,
    y: p.center.y + p.right.y * l.x + p.up.y * l.y + p.normal.y * l.z,
    z: p.center.z + p.right.z * l.x + p.up.z * l.y + p.normal.z * l.z,
  };
}

export function dirToLocal(p, v) {
  return { x: V.dot(v, p.right), y: V.dot(v, p.up), z: V.dot(v, p.normal) };
}

export function dirFromLocal(p, l) {
  return {
    x: p.right.x * l.x + p.up.x * l.y + p.normal.x * l.z,
    y: p.right.y * l.x + p.up.y * l.y + p.normal.y * l.z,
    z: p.right.z * l.x + p.up.z * l.y + p.normal.z * l.z,
  };
}

/** Degrees → unit normal. pitch=+90 points up (+Y). */
export function normalFromYawPitch(yawDeg, pitchDeg) {
  const y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180;
  return { x: Math.cos(p) * Math.sin(y), y: Math.sin(p), z: Math.cos(p) * Math.cos(y) };
}

export function yawPitchFromNormal(n) {
  const pitch = (Math.asin(Math.max(-1, Math.min(1, n.y))) * 180) / Math.PI;
  const yaw = (Math.atan2(n.x, n.z) * 180) / Math.PI;
  return { yaw, pitch };
}

/** Stable id comparison (numbers or strings, never mixed hash order). */
export function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}