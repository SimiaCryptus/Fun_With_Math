import { signedArea, bboxOf } from './Polygon.js';
import { sub, normalize } from './Vec2.js';

/**
 * Build the convex board outline for a tiling.  The `rhombus` outline is
 * lattice-aligned (so hex + rhombus is exactly Hex); `square` and `hexagon`
 * are centred on the same region and sized in "cells across the short axis".
 */
export function makeOutline(kind, tiling, size) {
  const ext = tiling.extent(size);
  const [b0, b1] = tiling.basis;
  const [oi, oj] = tiling.latticeOffset ?? [0, 0];
  const L = (i, j) => [i * b0[0] + j * b1[0], i * b0[1] + j * b1[1]];
  const center = L(oi + ext.i / 2, oj + ext.j / 2);
  const span = size * tiling.cellWidth;

  let poly;
  switch (kind) {
    case 'rhombus':
      poly = [L(oi, oj), L(oi + ext.i, oj), L(oi + ext.i, oj + ext.j), L(oi, oj + ext.j)];
      break;
    case 'square': {
      const h = span / 2;
      poly = [[-h, -h], [h, -h], [h, h], [-h, h]].map(p => [p[0] + center[0], p[1] + center[1]]);
      break;
    }
    case 'hexagon': {
      const R = span / Math.sqrt(3); // inradius = span / 2
      poly = [0, 1, 2, 3, 4, 5].map(k => {
        const a = Math.PI / 3 * k;
        return [center[0] + R * Math.cos(a), center[1] + R * Math.sin(a)];
      });
      break;
    }
    default:
      throw new Error(`unknown outline "${kind}"`);
  }
  if (signedArea(poly) < 0) poly.reverse();

  const sides = poly.map((a, k) => {
    const b = poly[(k + 1) % poly.length];
    const d = sub(b, a);
    return { id: k, a, b, normal: normalize([d[1], -d[0]]) }; // outward for CCW
  });
  return { kind, poly, sides, center, bbox: bboxOf(poly) };
}