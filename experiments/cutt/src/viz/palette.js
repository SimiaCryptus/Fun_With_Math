import * as THREE from 'three';
// Okabe–Ito (colour-blind safe).
export const CLASS_COLORS = [0x0072B2, 0xE69F00, 0x009E73, 0xCC79A7];
export const STATUS_COLORS = [0x777777, 0xD55E00, 0x0072B2, 0x56B4E9, 0xE69F00, 0xBBBBBB];

export function mixClasses(weights) {
  const c = new THREE.Color(0, 0, 0);
  let s = 0;
  weights.forEach((v, k) => { s += v; c.add(new THREE.Color(CLASS_COLORS[k]).multiplyScalar(v)); });
  if (s <= 0) return new THREE.Color(0xdddddd);
  return c.multiplyScalar(1 / s);
}

export function labelColor(Y, C) {
  const wts = [];
  for (let c = 0; c < C; c++) wts.push((Y >> c) & 1);
  return mixClasses(wts);
}

export const isSingleton = Y => (Y & (Y - 1)) === 0;