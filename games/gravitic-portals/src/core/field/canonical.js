// @ts-check
// Normalization of a portal pair into the tabulated configuration space.
//
// Canonical frame: the larger disk ("primary", P) is the unit disk at the origin facing +Z.
// The frame is rotated about Z so the secondary centre lies in the X≥0 half of the XZ plane,
// and mirrored (Y → −Y) so the secondary normal has n.y ≥ 0. Remaining parameters:
//   d, ψ   secondary centre  B = d(sin ψ, 0, cos ψ)            (units of R_P)
//   θ, φ   secondary normal  n = (sinθ cosφ, cosθ, sinθ sinφ), θ ∈ [0, π/2]
//   λ      R_S / R_P ∈ (0, 1]
// Gravity, T and absolute scale are not parameters: by linearity the boundary data is an
// affine function on each disk, so Φ_c is a combination of 7 geometry-only modes.
import * as V from '../vec3.js';

export const MODES = 7; // P: 1, X, Y   S: 1, X−Bx, Y−By, Z−Bz

export const PRIMARY_FRAME = Object.freeze({
  center: { x: 0, y: 0, z: 0 },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 1,
});

/** Canonical secondary geometry. The in-plane frame (up = −∂n/∂θ) is smooth in (θ, φ). */
export function geometryFromParams({ d, psi, theta, phi, lambda }) {
  const B = { x: d * Math.sin(psi), y: 0, z: d * Math.cos(psi) };
  const st = Math.sin(theta), ct = Math.cos(theta), sp = Math.sin(phi), cp = Math.cos(phi);
  const normal = { x: st * cp, y: ct, z: st * sp };
  const up = { x: -ct * cp, y: st, z: -ct * sp };
  const right = V.cross(up, normal);
  return { B, secondary: { center: B, right, up, normal, radius: lambda } };
}

/** Mode values at a canonical collocation point. */
export function modeRow(onPrimary, c, B, out, i) {
  const o = i * MODES;
  for (let m = 0; m < MODES; m++) out[o + m] = 0;
  if (onPrimary) { out[o] = 1; out[o + 1] = c.x; out[o + 2] = c.y; }
  else { out[o + 3] = 1; out[o + 4] = c.x - B.x; out[o + 5] = c.y - B.y; out[o + 6] = c.z - B.z; }
}

export function canonicalize(pair, background) {
  const swap = pair.b.radius > pair.a.radius;
  const P = swap ? pair.b : pair.a;
  const S = swap ? pair.a : pair.b;
  const mapP = swap ? pair.inverse : pair.map;
  const mapS = swap ? pair.map : pair.inverse;
  // Pointwise symmetric split (plan R4): Φ_c = ½(Φ₀(Tx) − Φ₀(x)) on each disk.
  const vP = (x) => 0.5 * (background.potential(mapP.point(x)) - background.potential(x));
  const vS = (x) => 0.5 * (background.potential(mapS.point(x)) - background.potential(x));
  const R = P.radius;
  const e3 = P.normal;
  const D = V.sub(S.center, P.center);
  const inPlane = V.addScaled(D, e3, -V.dot(D, e3));
  const e1 = V.length(inPlane) > 1e-9 * R ? V.normalize(inPlane) : P.right;
  let e2 = V.cross(e3, e1);
  if (V.dot(S.normal, e2) < 0) e2 = V.negate(e2); // mirror ⇒ θ ≤ π/2
  const nx = V.dot(S.normal, e1), ny = V.dot(S.normal, e2), nz = V.dot(S.normal, e3);
  const Bx = V.dot(D, e1) / R, Bz = V.dot(D, e3) / R;
  const params = {
    d: Math.hypot(Bx, Bz),
    psi: Math.atan2(Bx, Bz),
    theta: Math.acos(Math.max(-1, Math.min(1, ny))),
    phi: Math.atan2(nz, nx),
    lambda: S.radius / R,
  };
  const toWorld = (c) => ({
    x: P.center.x + R * (c.x * e1.x + c.y * e2.x + c.z * e3.x),
    y: P.center.y + R * (c.x * e1.y + c.y * e2.y + c.z * e3.y),
    z: P.center.z + R * (c.x * e1.z + c.y * e2.z + c.z * e3.z),
  });
  return { P, S, R, params, toWorld, vP, vS };
}

/** Mode mixing coefficients (exact: boundary data is affine on each disk). */
export function modeCoefficients(cz, B) {
  const { toWorld, vP, vS } = cz;
  const p0 = vP(toWorld({ x: 0, y: 0, z: 0 }));
  const s0 = vS(toWorld(B));
  return Float64Array.of(
    p0,
    vP(toWorld({ x: 1, y: 0, z: 0 })) - p0,
    vP(toWorld({ x: 0, y: 1, z: 0 })) - p0,
    s0,
    vS(toWorld({ x: B.x + 1, y: B.y, z: B.z })) - s0,
    vS(toWorld({ x: B.x, y: B.y + 1, z: B.z })) - s0,
    vS(toWorld({ x: B.x, y: B.y, z: B.z + 1 })) - s0,
  );
}