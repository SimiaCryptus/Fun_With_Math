// @ts-check
// Runtime field engine: normalize each pair, interpolate σ from the table (or solve if out of
// range / no table), then evaluate Φ_c and −∇Φ_c from world-space softened sources.
// Φ_c is one scalar and E is its exact gradient ⇒ conservative by construction.
import COEFFICIENTS from './coefficients.js';
import { DEFAULT_LAYOUT, diskLayout, INV4PI } from './panels.js';
import { canonicalize, geometryFromParams, modeCoefficients } from './canonical.js';
import { primaryLayout, solveCombined } from './solve.js';
import { buildGap, gapWeight, gapRamp, smoothstep } from './gap.js';

export const DEFAULT_TERMS = Object.freeze({ disks: true, gap: true });

function buildSource(cz, P, S, sigma) {
  const N = P.pts.length + S.pts.length;
  const px = new Float64Array(N), py = new Float64Array(N), pz = new Float64Array(N);
  const q = new Float64Array(N), e2 = new Float64Array(N);
  const R = cz.R;
  let k = 0;
  const push = (pt, off) => {
    const w = cz.toWorld(pt.p);
    px[k] = w.x; py[k] = w.y; pz[k] = w.z;
    q[k] = sigma[pt.panel + off] * pt.w * R;
    e2[k] = pt.e2 * R * R;
    k++;
  };
  for (const pt of P.pts) push(pt, 0);
  for (const pt of S.pts) push(pt, P.count);

  const c = { x: 0.5 * (cz.P.center.x + cz.S.center.x), y: 0.5 * (cz.P.center.y + cz.S.center.y), z: 0.5 * (cz.P.center.z + cz.S.center.z) };
  let Q = 0, dx = 0, dy = 0, dz = 0, xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0, ext = 0;
  for (let i = 0; i < N; i++) {
    const rx = px[i] - c.x, ry = py[i] - c.y, rz = pz[i] - c.z, r2 = rx * rx + ry * ry + rz * rz, s = q[i];
    Q += s; dx += s * rx; dy += s * ry; dz += s * rz;
    xx += s * (3 * rx * rx - r2); yy += s * (3 * ry * ry - r2); zz += s * (3 * rz * rz - r2);
    xy += s * 3 * rx * ry; xz += s * 3 * rx * rz; yz += s * 3 * ry * rz;
    ext = Math.max(ext, Math.sqrt(r2) + Math.sqrt(e2[i]));
  }
  return { px, py, pz, q, e2, N, c, Q, dip: { x: dx, y: dy, z: dz }, quad: { xx, yy, zz, xy, xz, yz }, ext };
}

function exact(src, x, o) {
  const { px, py, pz, q, e2, N } = src;
  let phi = 0, gx = 0, gy = 0, gz = 0;
  for (let k = 0; k < N; k++) {
    const dx = x.x - px[k], dy = x.y - py[k], dz = x.z - pz[k];
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz + e2[k]);
    let t = q[k] * inv;
    phi += t;
    t *= inv * inv;
    gx -= t * dx; gy -= t * dy; gz -= t * dz;
  }
  o.phi = phi * INV4PI; o.gx = gx * INV4PI; o.gy = gy * INV4PI; o.gz = gz * INV4PI;
}

function multipole(src, x, o) {
  const rx = x.x - src.c.x, ry = x.y - src.c.y, rz = x.z - src.c.z;
  const r2 = rx * rx + ry * ry + rz * rz;
  const inv = 1 / Math.sqrt(r2), inv2 = inv * inv, inv3 = inv * inv2, inv5 = inv3 * inv2, inv7 = inv5 * inv2;
  const p = src.dip, m = src.quad;
  const pr = p.x * rx + p.y * ry + p.z * rz;
  const qx = m.xx * rx + m.xy * ry + m.xz * rz;
  const qy = m.xy * rx + m.yy * ry + m.yz * rz;
  const qz = m.xz * rx + m.yz * ry + m.zz * rz;
  const rqr = rx * qx + ry * qy + rz * qz;
  const radial = -src.Q * inv3 - 3 * pr * inv5 - 2.5 * rqr * inv7;
  o.phi = (src.Q * inv + pr * inv3 + 0.5 * rqr * inv5) * INV4PI;
  o.gx = (radial * rx + p.x * inv3 + qx * inv5) * INV4PI;
  o.gy = (radial * ry + p.y * inv3 + qy * inv5) * INV4PI;
  o.gz = (radial * rz + p.z * inv3 + qz * inv5) * INV4PI;
}

const tE = { phi: 0, gx: 0, gy: 0, gz: 0 };
const tM = { phi: 0, gx: 0, gy: 0, gz: 0 };

/** o.phi = Φ, o.g = ∇Φ. Smooth potential blend near → far. */
function evalSource(src, x, o, c) {
  const rx = x.x - src.c.x, ry = x.y - src.c.y, rz = x.z - src.c.z;
  const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const s = r / src.ext;
  if (s <= c.farLo) return exact(src, x, o);
  if (s >= c.farHi) return multipole(src, x, o);
  exact(src, x, tE);
  multipole(src, x, tM);
  const w = smoothstep(c.farLo, c.farHi, s);
  const t = (s - c.farLo) / (c.farHi - c.farLo);
  const dw = (6 * t * (1 - t)) / ((c.farHi - c.farLo) * src.ext * r);
  const diff = tM.phi - tE.phi;
  o.phi = tE.phi + w * diff;
  o.gx = tE.gx + w * (tM.gx - tE.gx) + diff * dw * rx;
  o.gy = tE.gy + w * (tM.gy - tE.gy) + diff * dw * ry;
  o.gz = tE.gz + w * (tM.gz - tE.gz) + diff * dw * rz;
}

/**
 * @param pairs     portal pairs (createPair)
 * @param background uniform background (Φ₀)
 * @param opts.table decoded field table, or null for direct solves
 */
export function createTabulatedModel(pairs, background, { table = null, terms = {}, coef = {} } = {}) {
  const c = { ...COEFFICIENTS, ...coef };
  const t = { ...DEFAULT_TERMS, ...terms };
  const layout = table?.meta.layout ?? DEFAULT_LAYOUT;
  const sources = [];
  const info = [];
  if (t.disks) {
    for (const pair of pairs) {
      const cz = canonicalize(pair, background);
      const geom = geometryFromParams(cz.params);
      const coefs = modeCoefficients(cz, geom.B);
      const P = primaryLayout(layout);
      const S = diskLayout(geom.secondary, layout);
      let sigma = table ? table.interpolate(cz.params, coefs) : null;
      const source = sigma ? 'table' : 'solve';
      if (!sigma) sigma = solveCombined(P, S, geom.B, coefs);
      sources.push(buildSource(cz, P, S, sigma));
      info.push({ params: cz.params, source });
    }
  }
  const gaps = t.gap ? pairs.map((p) => buildGap(p, c)).filter((g) => g && g.strength > 0) : [];
  const tmp = { phi: 0, gx: 0, gy: 0, gz: 0 };

  function evaluate(x) {
    let phi = 0, gx = 0, gy = 0, gz = 0;
    for (const s of sources) {
      evalSource(s, x, tmp, c);
      phi += tmp.phi; gx += tmp.gx; gy += tmp.gy; gz += tmp.gz;
    }
    if (gaps.length) {
      const s0 = phi, sx = gx, sy = gy, sz = gz;
      const h = c.fdStep, inv = 1 / (2 * h);
      for (const g of gaps) {
        const w = gapWeight(g, x, c);
        const wx = (gapWeight(g, { x: x.x + h, y: x.y, z: x.z }, c) - gapWeight(g, { x: x.x - h, y: x.y, z: x.z }, c)) * inv;
        const wy = (gapWeight(g, { x: x.x, y: x.y + h, z: x.z }, c) - gapWeight(g, { x: x.x, y: x.y - h, z: x.z }, c)) * inv;
        const wz = (gapWeight(g, { x: x.x, y: x.y, z: x.z + h }, c) - gapWeight(g, { x: x.x, y: x.y, z: x.z - h }, c)) * inv;
        if (w === 0 && wx === 0 && wy === 0 && wz === 0) continue;
        const diff = gapRamp(g, x) - s0;
        const k = (g.Vb - g.Va) / g.h;
        phi += w * diff;
        gx += w * (g.axis.x * k - sx) + diff * wx;
        gy += w * (g.axis.y * k - sy) + diff * wy;
        gz += w * (g.axis.z * k - sz) + diff * wz;
      }
    }
    return { phi, gx, gy, gz };
  }

  return {
    potential: (x) => evaluate(x).phi,
    field: (x) => { const r = evaluate(x); return { x: -r.gx, y: -r.gy, z: -r.gz }; },
    info,
    gaps,
    terms: t,
    coef: c,
  };
}