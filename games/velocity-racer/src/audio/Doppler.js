import { dopplerFactor } from '../relativity/doppler.js';

/**
 * Pitch multiplier for a world source, given the listener's β and the
 * cosine of the angle between the velocity and the source direction.
 */
export function sourcePitch(beta, cosTheta, { min = 0.25, max = 6 } = {}) {
  const D = dopplerFactor(beta, cosTheta);
  return Math.min(max, Math.max(min, D));
}

/** Everything ahead of you blueshifts; use this for wind/ambience. */
export function forwardPitch(beta) {
  return sourcePitch(beta, 1, { min: 1, max: 14 });
}
