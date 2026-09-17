// Cross‑section profiles shared by the validator and the mesher (problem.md §3.1 "cross-section").
//  outer: CCW polygon of the tube's outer wall in the (N, B) frame plane, bounding radius r.
//  inner: polygon a true `wall` mm inside the outer polygon. Computed per ray by bisection on the
//         point→polygon distance, so it never self‑intersects and the wall is ≥ `wall` everywhere
//         (a scaled copy would be too thin in star valleys). null if the lumen collapses.

import { clamp } from './geom.js';

const RSQ_NORM = Math.sqrt(2) * Math.sqrt(Math.SQRT1_2);   // ≈ 1.189: superellipse (n=4) corner radius

function segDist2D(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-12), 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function polyDist2D(px, py, poly) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const d = segDist2D(px, py, a[0], a[1], b[0], b[1]);
    if (d < m) m = d;
  }
  return m;
}

export function outerProfile(section, r, n) {
  const pts = [];
  for (let j = 0; j < n; j++) {
    const th = (2 * Math.PI * j) / n, c = Math.cos(th), s = Math.sin(th);
    switch (section) {
      case 'ellipse':
        pts.push([r * c, 0.7 * r * s]);
        break;
      case 'rsquare':
        pts.push([(r * Math.sign(c) * Math.sqrt(Math.abs(c))) / RSQ_NORM, (r * Math.sign(s) * Math.sqrt(Math.abs(s))) / RSQ_NORM]);
        break;
      case 'star': {
        const rho = r * (0.82 + 0.18 * Math.cos(5 * th));   // 5 lobes, valleys at 0.64 r
        pts.push([rho * c, rho * s]);
        break;
      }
      default:
        pts.push([r * c, r * s]);
    }
  }
  return pts;
}

export function innerProfile(outer, wall) {
  if (polyDist2D(0, 0, outer) <= wall + 0.15) return null;      // lumen collapsed
  const inner = [];
  for (const [ux, uy] of outer) {
    const rho = Math.hypot(ux, uy), dx = ux / rho, dy = uy / rho;
    let lo = 0, hi = rho;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      if (polyDist2D(mid * dx, mid * dy, outer) >= wall) lo = mid; else hi = mid;
    }
    inner.push([lo * dx, lo * dy]);
  }
  return inner;
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

export function polygonPerimeter(poly) {
  let L = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    L += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return L;
}

/**
 * @returns {{ outer, inner, lumenArea, lumenRmin, rEq, perimeter }}
 *  lumenArea mm², rEq = equivalent circular radius for Hagen–Poiseuille, perimeter of the outer wall.
 */
export function sectionProfiles(section, r, wall, n) {
  if (section === 'star') n = Math.max(n, 20);
  const outer = outerProfile(section, r, n);
  const inner = innerProfile(outer, wall);
  const lumenArea = inner ? polygonArea(inner) : 0;
  const lumenRmin = inner ? inner.reduce((m, q) => Math.min(m, Math.hypot(q[0], q[1])), Infinity) : 0;
  return { outer, inner, lumenArea, lumenRmin, rEq: Math.sqrt(lumenArea / Math.PI), perimeter: polygonPerimeter(outer) };
}