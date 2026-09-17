/**
 * Relativistic aberration of a direction (CPU mirror of the vertex shader).
 *   cosθ' = (cosθ + β) / (1 + β cosθ)
 * Directions bunch toward the direction of motion `n`.
 *
 * @param {THREE.Vector3} dir  unit direction (mutated & returned)
 * @param {THREE.Vector3} n    unit direction of motion
 * @param {number} b           β magnitude
 */
export function aberrate(dir, n, b) {
  if (b < 1e-4) return dir;
  const c = dir.dot(n);
  const c2 = (c + b) / (1 + b * c);
  // perpendicular component
  const px = dir.x - c * n.x;
  const py = dir.y - c * n.y;
  const pz = dir.z - c * n.z;
  const pl = Math.hypot(px, py, pz);
  const s2 = Math.sqrt(Math.max(0, 1 - c2 * c2));
  if (pl < 1e-6) {
    dir.copy(n).multiplyScalar(Math.sign(c2) || 1);
    return dir;
  }
  dir.set(
    c2 * n.x + (s2 * px) / pl,
    c2 * n.y + (s2 * py) / pl,
    c2 * n.z + (s2 * pz) / pl,
  ).normalize();
  return dir;
}