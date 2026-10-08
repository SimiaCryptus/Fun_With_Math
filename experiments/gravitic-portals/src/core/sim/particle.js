// @ts-check
import { toVec3 } from '../vec3.js';

export function createParticle(id, pos, vel, mass = 1) {
  const p = toVec3(pos);
  return {
    id,
    pos: p,
    vel: toVec3(vel),
    prevPos: p,
    mass,
    alive: true,
    crossings: 0,
    lastCrossStep: -1,
    seamError: 0,
    e0: 0,
   expireStep: -1,
  };
}