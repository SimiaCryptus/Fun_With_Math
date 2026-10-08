// @ts-check
import { addScaled } from '../vec3.js';

/**
 * Velocity-Verlet (kick–drift–kick) with a portal-crossing hook on the drift segment.
 * @returns crossing result {pos, vel, count, seamError}
 */
export function stepVerlet(p, dt, accel, cross = null) {
  const a0 = accel(p.pos);
  const vHalf = addScaled(p.vel, a0, 0.5 * dt);
  const x1 = addScaled(p.pos, vHalf, dt);
  const res = cross ? cross(p.pos, x1, vHalf) : { pos: x1, vel: vHalf, count: 0, seamError: 0 };
  const a1 = accel(res.pos);
  p.pos = res.pos;
  p.vel = addScaled(res.vel, a1, 0.5 * dt);
  return res;
}