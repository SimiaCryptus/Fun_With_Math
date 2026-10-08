// @ts-check
import { dot, normalize, scale, toVec3 } from './vec3.js';

/**
 * Uniform gravity. Φ₀(x) = g · (x · up), g₀ = −∇Φ₀ = −g·up.
 * (idea.md uses z as height; the engine uses +Y up to match three.js.)
 */
export function createUniformGravity({ g = 9.81, up = [0, 1, 0] } = {}) {
  const u = normalize(toVec3(up));
  return {
    kind: 'uniform',
    g,
    up: u,
    potential: (x) => g * dot(x, u),
    accel: (_x) => scale(u, -g),
  };
}