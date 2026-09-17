import { C_MS, MAX_BETA, clamp } from './constants.js';

/** β = v / c */
export function beta(v) {
  return clamp(v / C_MS, -MAX_BETA, MAX_BETA);
}

/** γ = 1 / sqrt(1 - β²) */
export function gamma(b) {
  const bb = clamp(Math.abs(b), 0, MAX_BETA);
  return 1 / Math.sqrt(Math.max(1e-9, 1 - bb * bb));
}

export function gammaFromSpeed(v) {
  return gamma(beta(v));
}

/** Proper length → contracted (apparent) length. */
export function contract(length, g) {
  return length / g;
}

/** Proper time elapsed for a moving clock over coordinate time dt. */
export function properTime(dt, g) {
  return dt / g;
}

/** Relativistic-mass style acceleration falloff: a = F / (γ³ m). */
export function inertialFalloff(g) {
  return 1 / (g * g * g);
}