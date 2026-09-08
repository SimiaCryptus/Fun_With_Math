import { cleanPolygon } from './Polygon.js';

/**
 * Turn a polygon soup into topology: shared vertex table + edge table.
 * An edge with two incident cells makes them adjacent; one cell = boundary.
 */
export function weld(polys, { epsilon = 1e-6 } = {}) {
  const vmap = new Map();
  const vertices = [];
  const key = p => `${Math.round(p[0] / epsilon)},${Math.round(p[1] / epsilon)}`;
  const cells = [];

  for (const src of polys) {
    const clean = cleanPolygon(src.poly, epsilon * 10);
    if (clean.length < 3) continue;
    const vids = [];
    for (const p of clean) {
      const k = key(p);
      let v = vmap.get(k);
      if (v === undefined) {
        v = vertices.length;
        vmap.set(k, v);
        vertices.push({ id: v, p: [p[0], p[1]] });
      }
      if (vids[vids.length - 1] !== v) vids.push(v);
    }
    if (vids.length > 1 && vids[0] === vids[vids.length - 1]) vids.pop();
    if (vids.length < 3) continue;
    cells.push({ id: cells.length, kind: src.kind, vertices: vids, poly: vids.map(v => vertices[v].p) });
  }

  const emap = new Map();
  const edges = [];
  for (const c of cells) {
    const n = c.vertices.length;
    for (let i = 0; i < n; i++) {
      const a = c.vertices[i], b = c.vertices[(i + 1) % n];
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const k = `${lo},${hi}`;
      let e = emap.get(k);
      if (!e) { e = { a: lo, b: hi, cells: [] }; emap.set(k, e); edges.push(e); }
      e.cells.push(c.id);
    }
  }
  return { cells, vertices, edges };
}