// @ts-check
import { toLocal, fromLocal, dirToLocal, dirFromLocal } from './portal.js';

/**
 * T : D_from → D_to. Entering the front of `from` exits the front of `to`:
 * local (x, y, z) ↦ λ·(−x, y, −z), i.e. a 180° turn about `up`, scaled by λ = R_to / R_from.
 */
export function createPortalMap(from, to) {
  const lambda = to.radius / from.radius;
  return {
    from,
    to,
    lambda,
    /** Map a point (includes scale λ). */
    point(x) {
      const l = toLocal(from, x);
      return fromLocal(to, { x: -l.x * lambda, y: l.y * lambda, z: -l.z * lambda });
    },
    /** Map a direction (rotation part only). */
    dir(v) {
      const l = dirToLocal(from, v);
      return dirFromLocal(to, { x: -l.x, y: l.y, z: -l.z });
    },
  };
}

/** Pair a→b with boundary data. ΔΦ = Φ₀(b) − Φ₀(a); disks held at ±ΔΦ/2 (idea.md §4.1). */
export function createPair(a, b, background) {
  const map = createPortalMap(a, b);
  const inverse = createPortalMap(b, a);
  const dPhi = background.potential(b.center) - background.potential(a.center);
  return { a, b, map, inverse, dPhi, lambda: map.lambda };
}