// Stage 4 (problem.md §6.3 – §6.5): centrelines → triangle meshes.
//  • sweep meshing with parallel‑transport frames; hollow tubes closed by annular caps → each tube
//    is a watertight solid shell whose lumen is open at both ports (or closed at a dead‑end tip)
//  • explicit pores are punched as watertight wall openings (§6.4 mode b, "slotted wall"); the
//    pore is one mesh quad, so its size follows mesh quality and is reported
//  • manifold plate with real port holes (tube stubs pass through; slicer unions the overlap)
//  • optional frame: corner posts, optionally a top rim
// Everything is Z‑up, mm.

import { sub, scale, cross, norm, dot, len, resample, clamp } from './geom.js';
import { mulberry32, hashSeed } from './rng.js';
import { sectionProfiles } from './section.js';

export const QUALITY = {
  preview: { key: 'preview', ds: 1.5, segments: 16 },
  export:  { key: 'export',  ds: 0.75, segments: 24 },
};

const PLATE_SEGS = 16;   // multiple of 8 so the cell‑boundary sampling hits the corners

/** Index/position accumulator with vertex de‑duplication (1 µm grid). */
export class MeshBuilder {
  constructor() { this.pos = []; this.idx = []; this.map = new Map(); }
  v(x, y, z) {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let i = this.map.get(k);
    if (i === undefined) { i = this.pos.length / 3; this.pos.push(x, y, z); this.map.set(k, i); }
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() { return { positions: Float32Array.from(this.pos), indices: Uint32Array.from(this.idx) }; }
}

export function mergeMeshes(list) {
  let nv = 0, ni = 0;
  for (const m of list) { nv += m.positions.length; ni += m.indices.length; }
  const positions = new Float32Array(nv), indices = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const m of list) {
    positions.set(m.positions, ov);
    const base = ov / 3;
    for (let i = 0; i < m.indices.length; i++) indices[oi + i] = m.indices[i] + base;
    ov += m.positions.length; oi += m.indices.length;
  }
  return { positions, indices };
}

export function bboxOf(meshes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const P = m.positions;
    for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) {
      if (P[i + a] < min[a]) min[a] = P[i + a];
      if (P[i + a] > max[a]) max[a] = P[i + a];
    }
  }
  const size = min[0] === Infinity ? [0, 0, 0] : [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return { min, max, size };
}

// ------------------------------------------------------------------ sweep
/** Parallel‑transport frames (T, N, B) with N × B = T. */
function frames(pts) {
  const n = pts.length, T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T.push(norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  const ref = Math.abs(T[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let prev = norm(cross(cross(T[0], ref), T[0]));
  for (let i = 0; i < n; i++) {
    let Ni = sub(prev, scale(T[i], dot(prev, T[i])));
    if (len(Ni) < 1e-6) Ni = cross(T[i], Math.abs(T[i][0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    Ni = norm(Ni);
    N.push(Ni); B.push(cross(T[i], Ni)); prev = Ni;
  }
  return { T, N, B };
}

/**
 * Sweep a cross‑section along a centreline.
 * opts: { ds, deadEnd, wall, poreDensity (per cm², 0 = none), zMinPore, rng }
 */
export function sweepTube(path, prof, opts) {
  const pts = resample(path, opts.ds);
  const nR = pts.length, n = prof.outer.length;
  if (nR < 2) return null;
  const { N, B } = frames(pts);
  const hollow = !!prof.inner;
  const backRings = hollow && opts.deadEnd ? Math.ceil(opts.wall / opts.ds) + 1 : 0;   // solid tip
  const nRI = hollow ? Math.max(2, nR - backRings) : 0;

  const pos = [];
  const place = (i, q) => {
    const c = pts[i], Ni = N[i], Bi = B[i];
    pos.push(c[0] + Ni[0] * q[0] + Bi[0] * q[1], c[1] + Ni[1] * q[0] + Bi[1] * q[1], c[2] + Ni[2] * q[0] + Bi[2] * q[1]);
  };
  for (let i = 0; i < nR; i++) for (let j = 0; j < n; j++) place(i, prof.outer[j]);
  for (let i = 0; i < nRI; i++) for (let j = 0; j < n; j++) place(i, prof.inner[j]);
  const O = (i, j) => i * n + (j % n);
  const I = (i, j) => nR * n + i * n + (j % n);
  const centre = (i) => { const k = pos.length / 3; pos.push(pts[i][0], pts[i][1], pts[i][2]); return k; };
  const idx = [];
  const tri = (a, b, c) => idx.push(a, b, c);

  // ---- pore selection: one wall quad per pore, never two adjacent, none near the ports
  const pores = new Set();
  const quadW = prof.perimeter / n;
  if (hollow && opts.poreDensity > 0) {
    const prob = Math.min(0.5, opts.poreDensity * ((opts.ds * quadW) / 100));
    for (let i = 2; i <= nRI - 4; i++) {
      if (pts[i][2] < opts.zMinPore || pts[i + 1][2] < opts.zMinPore) continue;
      for (let j = 0; j < n; j++) {
        if (pores.has(O(i - 1, j)) || pores.has(O(i, j + n - 1)) || pores.has(O(i, j + 1))) continue;
        if (opts.rng() < prob) pores.add(O(i, j));
      }
    }
  }

  // ---- walls
  for (let i = 0; i + 1 < nR; i++) for (let j = 0; j < n; j++) {
    if (pores.has(O(i, j))) {
      // four pore side walls, all facing into the opening (see derivation in the sweep notes)
      tri(O(i, j), I(i, j + 1), I(i, j));           tri(O(i, j), O(i, j + 1), I(i, j + 1));           // ring i side  (+T)
      tri(O(i + 1, j), I(i + 1, j), I(i + 1, j + 1)); tri(O(i + 1, j), I(i + 1, j + 1), O(i + 1, j + 1)); // ring i+1 side (−T)
      tri(O(i, j), I(i + 1, j), O(i + 1, j));       tri(O(i, j), I(i, j), I(i + 1, j));               // angle j side (+θ)
      tri(O(i, j + 1), O(i + 1, j + 1), I(i + 1, j + 1)); tri(O(i, j + 1), I(i + 1, j + 1), I(i, j + 1)); // angle j+1 side (−θ)
      continue;
    }
    tri(O(i, j), O(i, j + 1), O(i + 1, j + 1)); tri(O(i, j), O(i + 1, j + 1), O(i + 1, j));           // outer, outward
    if (hollow && i + 1 < nRI) {
      tri(I(i, j), I(i + 1, j + 1), I(i, j + 1)); tri(I(i, j), I(i + 1, j), I(i + 1, j + 1));         // inner, into lumen
    }
  }

  // ---- caps
  if (hollow) {
    for (let j = 0; j < n; j++) { tri(O(0, j), I(0, j), I(0, j + 1)); tri(O(0, j), I(0, j + 1), O(0, j + 1)); }   // start annulus (−T)
  } else {
    const c = centre(0);
    for (let j = 0; j < n; j++) tri(c, O(0, j + 1), O(0, j));
  }
  const e = nR - 1;
  if (hollow && !opts.deadEnd) {
    for (let j = 0; j < n; j++) { tri(O(e, j), I(e, j + 1), I(e, j)); tri(O(e, j), O(e, j + 1), I(e, j + 1)); }   // end annulus (+T)
  } else {
    const c = centre(e);
    for (let j = 0; j < n; j++) tri(c, O(e, j), O(e, j + 1));                       // solid tip disc (+T)
    if (hollow) {
      const ei = nRI - 1, ci = centre(ei);
      for (let j = 0; j < n; j++) tri(ci, I(ei, j + 1), I(ei, j));                   // lumen end wall (−T)
    }
  }

  return {
    positions: Float32Array.from(pos), indices: Uint32Array.from(idx),
    rings: nR, poreCount: pores.size, poreDims: [opts.ds, quadW], hollow,
  };
}

// ------------------------------------------------------------------ plate & frame
export function boxMesh(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const idx = [];
  for (const [a, b, c, d] of F) idx.push(a, b, c, a, c, d);
  return { positions: Float32Array.from(P.flat()), indices: Uint32Array.from(idx) };
}

/** Plate footprint = routing grid (or a synthetic grid) grown by `plate.margin`, snapped to whole cells. */
function plateLayout(spec, grid) {
  const { x: dx, y: dy } = spec.cartridge.dims;
  const maxD = Math.max(1, ...spec.channels.map((c) => c.diameter));
  const p = grid ? grid.pitch : maxD + spec.clearanceMin;
  const nx = grid ? grid.dims[0] : Math.ceil(dx / p), ny = grid ? grid.dims[1] : Math.ceil(dy / p);
  const o = grid ? grid.origin : [-(nx * p) / 2, -(ny * p) / 2, 0];
  const mc = Math.ceil(spec.plate.margin / p);
  const i0 = -mc, i1 = nx - 1 + mc, j0 = -mc, j1 = ny - 1 + mc;
  return { p, o, i0, i1, j0, j1, extent: { x0: o[0] + i0 * p, x1: o[0] + (i1 + 1) * p, y0: o[1] + j0 * p, y1: o[1] + (j1 + 1) * p } };
}

function buildPlate(spec, ports, grid, notes) {
  const t = spec.plate.thickness, N = PLATE_SEGS;
  const { p, o, i0, i1, j0, j1, extent } = plateLayout(spec, grid);
  const h = p / 2;

  const holes = new Map();
  for (const port of ports) {
    const i = Math.floor((port.x - o[0]) / p), j = Math.floor((port.y - o[1]) / p);
    const cx = o[0] + (i + 0.5) * p, cy = o[1] + (j + 0.5) * p;
    const rh = port.r - 0.15;                                   // slightly under the tube OD → solid overlap
    const key = `${i},${j}`;
    if (i < i0 || i > i1 || j < j0 || j > j1 || Math.abs(port.x - cx) + rh + 0.4 > h || Math.abs(port.y - cy) + rh + 0.4 > h) {
      notes.push(`plate: ${port.ch} port at (${port.x.toFixed(1)}, ${port.y.toFixed(1)}) does not fit a plate cell – hole omitted, drill manually`);
      continue;
    }
    if (holes.has(key)) { notes.push(`plate: two ports share plate cell (${i},${j}) – hole for ${port.ch} omitted`); continue; }
    holes.set(key, { x: port.x, y: port.y, r: rh });
  }

  const B = new MeshBuilder();
  const bnd = (cx, cy, jj, z) => {
    const th = (2 * Math.PI * jj) / N, c = Math.cos(th), s = Math.sin(th);
    const tt = h / Math.max(Math.abs(c), Math.abs(s));         // ray from cell centre to the cell square
    return B.v(cx + tt * c, cy + tt * s, z);
  };
  const ring = (hx, hy, r, jj, z) => { const th = (2 * Math.PI * jj) / N; return B.v(hx + r * Math.cos(th), hy + r * Math.sin(th), z); };

  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const cx = o[0] + (i + 0.5) * p, cy = o[1] + (j + 0.5) * p;
    const hole = holes.get(`${i},${j}`);
    const top = [], bot = [];
    for (let jj = 0; jj < N; jj++) { top.push(bnd(cx, cy, jj, 0)); bot.push(bnd(cx, cy, jj, -t)); }
    if (!hole) {
      const ct = B.v(cx, cy, 0), cb = B.v(cx, cy, -t);
      for (let jj = 0; jj < N; jj++) { const k = (jj + 1) % N; B.tri(ct, top[jj], top[k]); B.tri(cb, bot[k], bot[jj]); }
    } else {
      const rt = [], rb = [];
      for (let jj = 0; jj < N; jj++) { rt.push(ring(hole.x, hole.y, hole.r, jj, 0)); rb.push(ring(hole.x, hole.y, hole.r, jj, -t)); }
      for (let jj = 0; jj < N; jj++) {
        const k = (jj + 1) % N;
        B.tri(rt[jj], top[jj], top[k]); B.tri(rt[jj], top[k], rt[k]);      // top annulus (+z)
        B.tri(rb[jj], bot[k], bot[jj]); B.tri(rb[jj], rb[k], bot[k]);      // bottom annulus (−z)
        B.tri(rt[jj], rt[k], rb[k]);    B.tri(rt[jj], rb[k], rb[jj]);      // hole wall (facing the axis)
      }
    }
    // outer side walls; boundary points are traversed CCW (seen from +z) → outward normals
    const wall = (from, count) => {
      for (let q = 0; q < count; q++) {
        const a = (from + q) % N, b = (from + q + 1) % N;
        B.tri(top[a], bot[a], bot[b]); B.tri(top[a], bot[b], top[b]);
      }
    };
    if (i === i1) wall(N - 2, 4);    // +x edge
    if (j === j1) wall(2, 4);        // +y edge
    if (i === i0) wall(6, 4);        // −x edge
    if (j === j0) wall(10, 4);       // −y edge
  }
  return { mesh: B.build(), extent, holeCount: holes.size };
}

function buildFrame(spec, extent) {
  const mode = spec.frame === true ? 'posts' : spec.frame || 'none';
  if (mode === 'none') return null;
  const s = clamp(spec.plate.margin - 1, 3, 8), inset = 0.5, dz = spec.cartridge.dims.z;
  const { x0, x1, y0, y1 } = extent;
  const parts = [];
  const corners = [[x0 + inset, y0 + inset], [x1 - inset - s, y0 + inset], [x1 - inset - s, y1 - inset - s], [x0 + inset, y1 - inset - s]];
  for (const [cx, cy] of corners) parts.push(boxMesh([cx, cy, 0], [cx + s, cy + s, dz]));
  if (mode === 'rim') {
    const zt = dz - s;
    parts.push(boxMesh([x0 + inset + s, y0 + inset, zt], [x1 - inset - s, y0 + inset + s, dz]));
    parts.push(boxMesh([x0 + inset + s, y1 - inset - s, zt], [x1 - inset - s, y1 - inset, dz]));
    parts.push(boxMesh([x0 + inset, y0 + inset + s, zt], [x0 + inset + s, y1 - inset - s, dz]));
    parts.push(boxMesh([x1 - inset - s, y0 + inset + s, zt], [x1 - inset, y1 - inset - s, dz]));
  }
  return { ...mergeMeshes(parts), mode };
}

// ------------------------------------------------------------------ entry point
/**
 * @returns {{ tubes: [], plate, frame|null, notes: [], extent }}
 * Every mesh is { id, kind, colour, positions: Float32Array, indices: Uint32Array, ... }.
 */
export function buildMeshes(routing, spec, quality = QUALITY.preview) {
  const notes = [], tubes = [], ports = [];
  for (const ch of routing.channels) {
    if (!ch.path || ch.path.length < 2) continue;
    const c = ch.spec;
    const prof = sectionProfiles(c.section, c.diameter / 2, c.wall, quality.segments);
    const rng = mulberry32(hashSeed(`${spec.seed}:pores:${ch.id}`));
    const m = sweepTube(ch.path, prof, {
      ds: quality.ds, deadEnd: !!ch.deadEnd, wall: c.wall,
      poreDensity: c.poreMode === 'explicit' ? c.poreDensity : 0, zMinPore: c.diameter, rng,
    });
    if (!m) continue;
    if (m.poreCount && quality.key === 'export') {
      notes.push(`${c.name}: ${m.poreCount} explicit pores ≈ ${m.poreDims[0].toFixed(2)} × ${m.poreDims[1].toFixed(2)} mm (spec ${c.poreSize} µm)`);
    }
    tubes.push({ id: ch.id, kind: 'tube', name: c.name, colour: c.colour, wall: c.wall, diameter: c.diameter, ...m });
    if (ch.ports) {
      ports.push({ x: ch.ports.inlet[0], y: ch.ports.inlet[1], r: c.diameter / 2, ch: c.name });
      if (ch.ports.outlet) ports.push({ x: ch.ports.outlet[0], y: ch.ports.outlet[1], r: c.diameter / 2, ch: c.name });
    }
  }
  const plate = buildPlate(spec, ports, routing.grid, notes);
  const frame = buildFrame(spec, plate.extent);
  return {
    tubes,
    plate: { id: 'plate', kind: 'plate', name: 'plate', colour: '#7a8590', holeCount: plate.holeCount, ...plate.mesh },
    frame: frame ? { id: 'frame', kind: 'frame', name: 'frame', colour: '#55606a', ...frame } : null,
    notes,
    extent: plate.extent,
  };
}