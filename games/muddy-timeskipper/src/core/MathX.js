import { MPH } from './constants.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export const smoothstep = (e0, e1, x) => {
  const t = clamp01(invLerp(e0, e1, x));
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach. */
export const damp = (cur, target, rate, dt) =>
  target + (cur - target) * Math.exp(-rate * dt);

export const wrapPi = (a) => {
  let x = (a + Math.PI) % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x - Math.PI;
};

/** Shortest-arc angle interpolation. */
export const lerpAngle = (a, b, t) => a + wrapPi(b - a) * t;

export const msToMph = (ms) => ms / MPH;
export const mphToMs = (mph) => mph * MPH;