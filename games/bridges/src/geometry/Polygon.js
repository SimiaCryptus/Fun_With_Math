import { sub, cross } from './Vec2.js';

export function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export const area = poly => Math.abs(signedArea(poly));

export function centroid(poly) {
  const n = poly.length;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-12) {
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function ensureCCW(poly) {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

/** Point in a convex CCW polygon; boundary counts as inside (within eps). */
export function pointInConvex(p, poly, eps = 1e-9) {
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (cross(sub(b, a), sub(p, a)) < -eps) return false;
  }
  return true;
}

/** Point in an arbitrary simple polygon (ray casting). */
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
        p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function segmentDistance(p, a, b) {
  const d = sub(b, a);
  const l2 = d[0] * d[0] + d[1] * d[1];
  let t = l2 > 0 ? ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * d[0]), p[1] - (a[1] + t * d[1]));
}

/** Remove consecutive near-duplicate vertices (including the wrap-around). */
export function cleanPolygon(poly, eps = 1e-7) {
  const out = [];
  for (const p of poly) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > eps) out.push(p);
  }
  while (out.length > 1 &&
         Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  return out;
}

/** Shrink a polygon toward its centroid by a fixed distance (visual grooves). */
function radialInset(poly, amount) {
  const c = centroid(poly);
  return poly.map(p => {
    const d = sub(p, c);
    const l = Math.hypot(d[0], d[1]) || 1;
    const f = Math.max(0, l - amount) / l;
    return [c[0] + d[0] * f, c[1] + d[1] * f];
  });
}
/**
  * Offset every edge inward by `amount` (mitred corners), so gaps stay uniform
  * on irregular tiles and collinear vertices (brick midpoints) stay straight.
  * Falls back to the radial shrink when the offset would invert the polygon.
  */
export function inset(poly, amount) {
   const n = poly.length;
   if (amount <= 0 || n < 3) return poly.map(p => [p[0], p[1]]);
   const ccw = signedArea(poly) >= 0 ? 1 : -1;
   const inward = (a, b) => {
     const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
     return [-dy / l * ccw, dx / l * ccw];
   };
   const out = [];
   for (let i = 0; i < n; i++) {
     const p = poly[(i + n - 1) % n], c = poly[i], q = poly[(i + 1) % n];
     const n1 = inward(p, c), n2 = inward(c, q);
     let bx = n1[0] + n2[0], by = n1[1] + n2[1];
     const bl = Math.hypot(bx, by);
     if (bl < 1e-9) return radialInset(poly, amount);
     bx /= bl; by /= bl;
     const k = Math.min(amount / Math.max(0.35, bx * n1[0] + by * n1[1]), amount * 3);
     out.push([c[0] + bx * k, c[1] + by * k]);
   }
   if (signedArea(out) * ccw <= 0 || area(out) >= area(poly)) return radialInset(poly, amount);
   return out;
}


export function bboxOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function pointStrictlyInTri(p, a, b, c) {
  const eps = 1e-12;
  return cross(sub(b, a), sub(p, a)) > eps &&
         cross(sub(c, b), sub(p, b)) > eps &&
         cross(sub(a, c), sub(p, c)) > eps;
}

/** Ear-clipping triangulation. Returns a flat index list into `poly`. */
export function triangulate(poly) {
  const n = poly.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  if (signedArea(poly) < 0) idx.reverse();
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let found = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cross(sub(b, a), sub(c, b)) <= 1e-12) continue; // reflex or degenerate corner
      let blocked = false;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (pointStrictlyInTri(poly[j], a, b, c)) { blocked = true; break; }
      }
      if (blocked) continue;
      tris.push(ia, ib, ic);
      idx.splice(i, 1);
      found = true;
      break;
    }
    if (!found) { // numerically degenerate: fall back to a fan
      for (let i = 1; i < idx.length - 1; i++) tris.push(idx[0], idx[i], idx[i + 1]);
      return tris;
    }
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}