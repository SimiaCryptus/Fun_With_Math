// @ts-check
// 0-g gap *design* term (plan R8). Blends the potential toward the ideal ramp.
import * as V from '../vec3.js';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export function smoothstep(e0, e1, x) {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function buildGap(pair, c) {
  const { a, b } = pair;
  const d = V.sub(b.center, a.center);
  const h = V.length(d);
  if (h < 1e-9) return null;
  const axis = V.scale(d, 1 / h);
  const ca = V.dot(a.normal, axis);
  const cb = -V.dot(b.normal, axis);
  const coax = smoothstep(c.coaxLo, c.coaxHi, ca) * smoothstep(c.coaxLo, c.coaxHi, cb);
  const Rm = 0.5 * (a.radius + b.radius);
  const hFade = 1 - smoothstep(c.gapFadeLo, c.gapFadeHi, h / Rm);
  return { a, b, axis, h, Ra: a.radius, Rb: b.radius, Va: pair.dPhi / 2, Vb: -pair.dPhi / 2, strength: coax * hFade };
}

export function gapWeight(g, x, c) {
  const d = V.sub(x, g.a.center);
  const t = V.dot(d, g.axis);
  const pad0 = c.gapPadRel * Math.min(g.Ra, g.Rb);
  if (t <= -pad0 || t >= g.h + pad0) return 0;
  const f = clamp(t / g.h, 0, 1);
  const R = g.Ra + (g.Rb - g.Ra) * f;
  const rho = V.length(V.addScaled(d, g.axis, -t));
  if (rho >= R) return 0;
  const wr = 1 - smoothstep(R - c.gapPadRel * R, R, rho);
  const wa = smoothstep(-pad0, 0, t) * (1 - smoothstep(g.h, g.h + pad0, t));
  return g.strength * wr * wa;
}

/** Linear ramp ±ΔΦ/2 across the gap: Φ₀ + ramp is constant ⇒ g_eff = 0. */
export function gapRamp(g, x) {
  const t = V.dot(V.sub(x, g.a.center), g.axis);
  return g.Va + ((g.Vb - g.Va) * t) / g.h;
}