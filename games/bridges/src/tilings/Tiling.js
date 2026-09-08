import { makeOutline } from '../geometry/outline.js';
import { clipPolygon } from '../geometry/clip.js';
import { weld } from '../geometry/weld.js';
import { centroid, area, pointInConvex } from '../geometry/Polygon.js';
import { cross } from '../geometry/Vec2.js';
import { Board } from '../engine/Board.js';

const MAX_CELLS = 20000;

/** outline -> stamp -> edge mode -> prune -> weld -> Board */
export function generateBoard(tiling, cfg) {
  const region = makeOutline(cfg.outline, tiling, cfg.size);
  const raw = tiling.generate ? tiling.generate(region, cfg) : stampLattice(tiling, region.bbox);
  const kept = applyEdgeMode(raw, region, cfg.edgeMode);
  const connected = largestComponent(kept);
  const topo = weld(connected, { epsilon: 1e-6 });
  return new Board(topo, region, {
    tiling: tiling.id, size: cfg.size, players: cfg.players, clean: tiling.clean,
  });
}

/** Emit every prototile at every lattice point covering the bounding box. */
export function stampLattice(tiling, bbox, pad = 2) {
  const [b0, b1] = tiling.basis;
  const det = cross(b0, b1);
  const toLattice = (x, y) => [cross([x, y], b1) / det, cross(b0, [x, y]) / det];
  const corners = [
    [bbox.minX, bbox.minY], [bbox.maxX, bbox.minY], [bbox.maxX, bbox.maxY], [bbox.minX, bbox.maxY],
  ].map(c => toLattice(c[0], c[1]));
  const i0 = Math.floor(Math.min(...corners.map(c => c[0]))) - pad;
  const i1 = Math.ceil(Math.max(...corners.map(c => c[0]))) + pad;
  const j0 = Math.floor(Math.min(...corners.map(c => c[1]))) - pad;
  const j1 = Math.ceil(Math.max(...corners.map(c => c[1]))) + pad;
  const out = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const tx = i * b0[0] + j * b1[0], ty = i * b0[1] + j * b1[1];
    for (const pt of tiling.protoTiles) {
      out.push({ kind: pt.kind, lattice: [i, j], poly: pt.poly.map(p => [p[0] + tx, p[1] + ty]) });
      if (out.length > MAX_CELLS) throw new Error('too many cells');
    }
  }
  return out;
}

export function applyEdgeMode(raw, region, mode, minAreaRatio = 0.3) {
  const out = [];
  for (const c of raw) {
    if (mode === 'whole') {
      if (c.poly.every(p => pointInConvex(p, region.poly, 1e-7))) out.push(c);
    } else if (mode === 'clip') {
      const clipped = clipPolygon(c.poly, region.poly);
      if (clipped.length >= 3 && area(clipped) >= minAreaRatio * area(c.poly)) out.push({ ...c, poly: clipped });
    } else {
      if (pointInConvex(centroid(c.poly), region.poly, 1e-9)) out.push(c);
    }
  }
  return out;
}

/** Drop cells not in the largest edge-connected component (ragged corners). */
export function largestComponent(polys) {
  const topo = weld(polys, { epsilon: 1e-6 });
  const n = topo.cells.length;
  if (n === 0) return [];
  const adj = Array.from({ length: n }, () => []);
  for (const e of topo.edges) if (e.cells.length === 2) {
    adj[e.cells[0]].push(e.cells[1]);
    adj[e.cells[1]].push(e.cells[0]);
  }
  const comp = new Int32Array(n).fill(-1);
  let best = -1, bestSize = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    let size = 0;
    const stack = [s];
    comp[s] = s;
    while (stack.length) {
      const c = stack.pop();
      size++;
      for (const nb of adj[c]) if (comp[nb] < 0) { comp[nb] = s; stack.push(nb); }
    }
    if (size > bestSize) { bestSize = size; best = s; }
  }
  if (bestSize !== n) console.warn(`[bridges] dropped ${n - bestSize} disconnected cell(s)`);
  return topo.cells.filter(c => comp[c.id] === best).map(c => ({ kind: c.kind, poly: c.poly }));
}