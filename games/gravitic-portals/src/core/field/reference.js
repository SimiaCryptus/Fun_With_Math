// @ts-check
// Slow numerical reference: boundary-element collocation with the free-space Green's
// function (units ε₀ = 1, kernel 1/(4π r)). Tests and debug overlay only.
import * as V from '../vec3.js';
import { fromLocal } from '../portal.js';
import { solveDense } from '../linalg.js';

const INV4PI = 1 / (4 * Math.PI);

/** Panels on a disk: rings graded toward the rim (sin spacing) × angular sectors. */
export function buildPanels(portal, rings, sectors) {
  const R = portal.radius;
  const panels = [];
  const dth = (2 * Math.PI) / sectors;
  for (let i = 0; i < rings; i++) {
    const r0 = R * Math.sin((Math.PI / 2) * (i / rings));
    const r1 = R * Math.sin((Math.PI / 2) * ((i + 1) / rings));
    const dr = r1 - r0;
    const rc = 0.5 * (r0 + r1);
    for (let j = 0; j < sectors; j++) {
      const th0 = j * dth;
      const thc = th0 + dth / 2;
      const a = dr, b = rc * dth;
      panels.push({
        portal, r0, dr, th0, dth,
        c: fromLocal(portal, { x: rc * Math.cos(thc), y: rc * Math.sin(thc), z: 0 }),
        area: rc * dr * dth,
        a, b,
        size: Math.hypot(a, b),
        // ∫∫ dA/r at the centre of an a×b rectangle = 2[a·asinh(b/a) + b·asinh(a/b)]
        self: INV4PI * 2 * (a * Math.asinh(b / a) + b * Math.asinh(a / b)),
      });
    }
  }
  return panels;
}

const NEAR_FACTOR = 2;

function subdivisions(p, d) {
  const gap = Math.max(d - 0.5 * p.size, 0.25 * Math.min(p.a, p.b));
  const hc = 0.5 * gap;
  const kr = Math.min(8, Math.max(1, Math.ceil(p.a / hc)));
  const kt = Math.min(32, Math.max(1, Math.ceil(p.b / hc)));
  return [kr, kt];
}

function forEachSub(p, kr, kt, fn) {
  const sdr = p.dr / kr, sdt = p.dth / kt;
  for (let i = 0; i < kr; i++) {
    const r = p.r0 + (i + 0.5) * sdr;
    for (let j = 0; j < kt; j++) {
      const th = p.th0 + (j + 0.5) * sdt;
      fn(fromLocal(p.portal, { x: r * Math.cos(th), y: r * Math.sin(th), z: 0 }), r * sdr * sdt);
    }
  }
}

function potentialCoef(p, x) {
  const d = V.distance(x, p.c);
  if (d > NEAR_FACTOR * p.size) return (p.area * INV4PI) / d;
  const [kr, kt] = subdivisions(p, d);
  let s = 0;
  forEachSub(p, kr, kt, (q, area) => { s += area / V.distance(x, q); });
  return s * INV4PI;
}

function fieldCoef(p, x) {
  const d = V.distance(x, p.c);
  if (d > NEAR_FACTOR * p.size) return V.scale(V.sub(x, p.c), (p.area * INV4PI) / (d * d * d));
  const [kr, kt] = subdivisions(p, d);
  let e = { x: 0, y: 0, z: 0 };
  forEachSub(p, kr, kt, (q, area) => {
    const r = V.sub(x, q);
    const l = V.length(r);
    e = V.addScaled(e, r, area / (l * l * l));
  });
  return V.scale(e, INV4PI);
}

/**
 * Solve for panel charge densities so Φ_c(x) = disk.value(x) on every disk (pointwise).
 * @param {{portal: any, value: (x:any)=>number}[]} disks
 */
export function solveDisks(disks, { rings = 16, sectors = 24 } = {}) {
  const panels = [];
  disks.forEach((disk, di) => {
    for (const p of buildPanels(disk.portal, rings, sectors)) panels.push({ ...p, disk: di });
  });
  const n = panels.length;
  const A = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const xi = panels[i].c;
    rhs[i] = disks[panels[i].disk].value(xi);
    for (let j = 0; j < n; j++) {
      A[i * n + j] = i === j ? panels[j].self : potentialCoef(panels[j], xi);
    }
  }
  const sigma = solveDense(A, rhs, n);

  return {
    panels,
    sigma,
    potential(x) {
      let s = 0;
      for (let j = 0; j < n; j++) s += sigma[j] * potentialCoef(panels[j], x);
      return s;
    },
    field(x) {
      let e = { x: 0, y: 0, z: 0 };
      for (let j = 0; j < n; j++) e = V.addScaled(e, fieldCoef(panels[j], x), sigma[j]);
      return e;
    },
    /** Total charge on disk `di` (or all disks). */
    charge(di = -1) {
      let q = 0;
      for (let j = 0; j < n; j++) if (di < 0 || panels[j].disk === di) q += sigma[j] * panels[j].area;
      return q;
    },
  };
}

/**
 * Reference Φ_c for portal pairs with the *pointwise* boundary condition (plan R4):
 * Φ₀(x) + Φ_c(x) = Φ₀(T x) + Φ_c(T x), symmetrically split:
 *   Φ_c(x) = (Φ₀(Tx) − Φ₀(x))/2 on a,  Φ_c(y) = (Φ₀(T⁻¹y) − Φ₀(y))/2 on b.
 */
export function solveReferencePairs(pairs, background, opts = {}) {
  const disks = [];
  for (const pair of pairs) {
    disks.push({ portal: pair.a, value: (x) => 0.5 * (background.potential(pair.map.point(x)) - background.potential(x)) });
    disks.push({ portal: pair.b, value: (y) => 0.5 * (background.potential(pair.inverse.point(y)) - background.potential(y)) });
  }
  return solveDisks(disks, opts);
}