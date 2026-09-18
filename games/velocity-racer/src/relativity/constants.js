/** Speed of light, Velocity-Racer edition. */
export const C_MPH = 88;
export const MPH_TO_MS = 0.44704;
export const C_MS = C_MPH * MPH_TO_MS; // ≈ 39.34 m/s

/** Physics never quite reaches c. */
export const MAX_BETA = 0.9985;

/** Rendering clamps β so the picture stays legible (see idea.md §5). */
export const RENDER_BETA_MAX = 0.95;

export const G = 9.81;

export const msToMph = (v) => v / MPH_TO_MS;
export const mphToMs = (v) => v * MPH_TO_MS;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
