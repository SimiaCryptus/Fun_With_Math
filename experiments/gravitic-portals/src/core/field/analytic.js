// @ts-check
import * as V from '../vec3.js';
import { toLocal } from '../portal.js';
import { solveDense } from '../linalg.js';
import COEFFICIENTS from './coefficients.js';

export const DEFAULT_TERMS = Object.freeze({ disks: true, gap: true, sharpRim: true });

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export function smoothstep(e0, e1, x) {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Exact potential of an isolated conducting disk held at potential 1 (oblate-spheroidal
 * closed form), with rim softening `soft` (the s_min clamp):
 *   φ = (2/π) asin( 2R / (√((ρ−R)²+z²+s²) + √((ρ+R)²+z²+s²)) )
 * Contains the 1/√s rim behaviour and the far-field falloff, so separate rim/far terms
 * from idea.md §4.2 are not needed.
 */
export function diskUnitPotential(portal, x, soft) {
  const l = toLocal(portal, x);
  const rho = Math.hypot(l.x, l.y);
  const R = portal.radius;
  const s2 = soft * soft;
  const z2 = l.z * l.z;
  const d1 = Math.sqrt((rho - R) * (rho - R) + z2 + s2);
  const d2 = Math.sqrt((rho + R) * (rho + R) + z2 + s2);
  const u = Math.min(1, (2 * R) / (d1 + d2));
  return (2 / Math.PI) * Math.asin(u);
}

function buildGap(pair, c) {
  const { a, b } = pair;
  const d = V.sub(b.center, a.center);
  const h = V.length(d);
  if (h < 1e-9) return null;
  const axis = V.scale(d, 1 / h);
  // Portals must face each other across the gap.
  const ca = V.dot(a.normal, axis);
  const cb = -V.dot(b.normal, axis);
  const coax = smoothstep(c.coaxLo, c.coaxHi, ca) * smoothstep(c.coaxLo, c.coaxHi, cb);
  const Rm = 0.5 * (a.radius + b.radius);
  const hFade = 1 - smoothstep(c.gapFadeLo, c.gapFadeHi, h / Rm);
  const strength = coax * hFade;
  return { a, b, axis, h, Ra: a.radius, Rb: b.radius, Va: pair.dPhi / 2, Vb: -pair.dPhi / 2, strength };
}

function gapWeight(g, x, c) {
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

/** Linear ramp ±ΔΦ/2 across the gap: Φ₀ + ramp is constant ⇒ g_eff = 0 (idea.md §4.3). */
function gapRamp(g, x) {
  const t = V.dot(V.sub(x, g.a.center), g.axis);
  return g.Va + ((g.Vb - g.Va) * t) / g.h;
}

/**
 * Analytic correction potential Φ_c for a set of portal pairs.
 *
 * - disks: superposition of exact single-disk solutions, with amplitudes solved jointly
 *   (collocation at every disk centre) so each disk sits at its target ±ΔΦ/2. Joint
 *   solve also covers unequal radii (non-zero monopole, plan R3) and multiple pairs.
 * - gap: design term. Blends the potential (never the field, plan §1.3) toward the
 *   ideal 0-g ramp inside facing coaxial gaps. Still a single scalar ⇒ conservative.
 *
 * E_CF = −∇Φ_c by central differences of the one scalar, so the field is curl-free
 * to round-off (difference operators commute).
 */
export function createAnalyticModel(pairs, { terms = {}, coef = {} } = {}) {
   // Legacy rim knobs (no longer in coefficients.js after the tabulated rewrite).
   const c = { sMinRel: 0.02, softRimRel: 0.1, ...COEFFICIENTS, ...coef };
  const t = { ...DEFAULT_TERMS, ...terms };

  const disks = [];
  for (const pair of pairs) {
    disks.push({ portal: pair.a, target: pair.dPhi / 2, amp: 0, soft: 0 });
    disks.push({ portal: pair.b, target: -pair.dPhi / 2, amp: 0, soft: 0 });
  }
  for (const d of disks) {
    d.soft = (t.sharpRim ? c.sMinRel : Math.max(c.sMinRel, c.softRimRel)) * d.portal.radius;
  }

  const n = disks.length;
  if (t.disks && n > 0) {
    const M = new Float64Array(n * n);
    const rhs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      rhs[i] = disks[i].target;
      for (let j = 0; j < n; j++) {
        M[i * n + j] = diskUnitPotential(disks[j].portal, disks[i].portal.center, disks[j].soft);
      }
    }
    const amps = solveDense(M, rhs, n);
    for (let i = 0; i < n; i++) disks[i].amp = amps[i];
  }

  const gaps = t.gap ? pairs.map((p) => buildGap(p, c)).filter((g) => g && g.strength > 0) : [];

  function diskSum(x) {
    if (!t.disks) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = disks[i];
      if (d.amp !== 0) s += d.amp * diskUnitPotential(d.portal, x, d.soft);
    }
    return s;
  }

  function potential(x) {
    const s = diskSum(x);
    let phi = s;
    for (const g of gaps) {
      const w = gapWeight(g, x, c);
      if (w > 0) phi += w * (gapRamp(g, x) - s);
    }
    return phi;
  }

  function field(x) {
    const h = c.fdStep;
    const inv = 1 / (2 * h);
    return {
      x: -(potential({ x: x.x + h, y: x.y, z: x.z }) - potential({ x: x.x - h, y: x.y, z: x.z })) * inv,
      y: -(potential({ x: x.x, y: x.y + h, z: x.z }) - potential({ x: x.x, y: x.y - h, z: x.z })) * inv,
      z: -(potential({ x: x.x, y: x.y, z: x.z + h }) - potential({ x: x.x, y: x.y, z: x.z - h })) * inv,
    };
  }

  return { potential, field, disks, gaps, terms: t, coef: c };
}