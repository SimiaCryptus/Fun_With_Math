// @ts-check
import * as V from '../vec3.js';
import { toLocal } from '../portal.js';

/** Distance from x to the (closed) disk surface. */
export function distanceToDisk(portal, x) {
  const l = toLocal(portal, x);
  const rho = Math.hypot(l.x, l.y);
  return Math.hypot(Math.max(rho - portal.radius, 0), l.z);
}

/** Uniform samples in a box, rejected by `accept`. */
export function samplePoints(rng, center, half, count, accept = () => true) {
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 50) {
    const p = {
      x: center.x + rng.range(-half, half),
      y: center.y + rng.range(-half, half),
      z: center.z + rng.range(-half, half),
    };
    if (accept(p)) pts.push(p);
  }
  return pts;
}

/** sqrt(Σ|Ea−Eb|² / Σ|Eb|²) */
export function relativeRmsError(fieldA, fieldB, points) {
  let num = 0, den = 0;
  for (const p of points) {
    const a = fieldA(p), b = fieldB(p);
    num += V.lengthSq(V.sub(a, b));
    den += V.lengthSq(b);
  }
  return den > 0 ? Math.sqrt(num / den) : 0;
}