import { gamma } from './lorentz.js';

/**
 * Relativistic Doppler factor for light arriving from angle θ
 * (cosTheta measured against the direction of motion).
 *   D = 1 / (γ (1 - β cosθ))
 * D > 1 → blueshift (ahead), D < 1 → redshift (behind).
 */
export function dopplerFactor(b, cosTheta, g = gamma(b)) {
  return 1 / Math.max(1e-4, g * (1 - b * cosTheta));
}

/** Headlight effect: observed intensity scales as D^k (k ≈ 3 for full SR). */
export function headlightGain(D, k = 1.4) {
  return Math.pow(D, k);
}

/** Audio uses the same factor to shift pitch. */
export function pitchFactor(b, cosTheta) {
  return dopplerFactor(b, cosTheta);
}
