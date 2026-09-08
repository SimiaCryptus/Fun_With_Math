import { centroid, area, segmentDistance, bboxOf } from '../geometry/Polygon.js';
import { sub, dot, normalize, angle } from '../geometry/Vec2.js';
import { SpatialHash } from '../geometry/SpatialHash.js';

/**
 * Immutable board topology: cells, vertices (with cyclic cell order), edges,
 * chords (diagonal contacts at pinched vertices) and border arcs.
 * Pure data — no rendering, no rules.
 */
export class Board {
  constructor(topo, region, meta = {}) {
    this.meta = meta;
    this.outline = region.poly;
    this.sides = region.sides;
    this.center = region.center;
    this.players = meta.players ?? region.sides.length / 2;

    this.cells = topo.cells.map(c => ({
      id: c.id, kind: c.kind, poly: c.poly, vertices: c.vertices,
      centroid: centroid(c.poly), area: area(c.poly),
      neighbors: [], arcs: [], chords: [], boundary: false,
    }));
    this.vertices = topo.vertices.map(v => ({ id: v.id, p: v.p, cells: [], degree: 0, interior: true, chords: [] }));
    this.edges = topo.edges;
    this.chords = [];
    this.arcs = this.sides.map(s => ({ id: s.id, side: s.id, cells: [], owner: s.id % this.players }));
    this.scale = Math.sqrt(this.cells.reduce((s, c) => s + c.area, 0) / Math.max(1, this.cells.length));
    this.bbox = bboxOf(this.outline);

    this._buildAdjacency();
    this._buildVertices();
    this._buildChords();
    this._assignArcs();
    this.validate();
    this.hash = new SpatialHash(this.cells);
  }

  neighbors(id) { return this.cells[id].neighbors; }
  cellAt(x, y) { return this.hash.query(x, y); }

  /** Clean = every interior vertex has degree 3 (draw-free for 2 players). */
  get clean() { return this.vertices.every(v => !v.interior || v.degree <= 3); }
  get maxDegree() { return this.vertices.reduce((m, v) => v.interior ? Math.max(m, v.degree) : m, 0); }

  _buildAdjacency() {
    this.boundaryEdges = [];
    for (const e of this.edges) {
      if (e.cells.length === 2) {
        const [a, b] = e.cells;
        if (!this.cells[a].neighbors.includes(b)) {
          this.cells[a].neighbors.push(b);
          this.cells[b].neighbors.push(a);
        }
      } else if (e.cells.length === 1) {
        this.boundaryEdges.push(e);
        this.cells[e.cells[0]].boundary = true;
      } else {
        throw new Error(`edge shared by ${e.cells.length} cells — overlapping tiles`);
      }
    }
  }

  _buildVertices() {
    for (const c of this.cells) for (const v of c.vertices) this.vertices[v].cells.push(c.id);
    for (const e of this.boundaryEdges) {
      this.vertices[e.a].interior = false;
      this.vertices[e.b].interior = false;
    }
    for (const v of this.vertices) {
      v.cells.sort((x, y) => angle(sub(this.cells[x].centroid, v.p)) - angle(sub(this.cells[y].centroid, v.p)));
      v.degree = v.cells.length;
    }
  }

  _buildChords() {
    for (const v of this.vertices) {
      if (!v.interior || v.degree < 4) continue;
      const d = v.degree, local = [];
      for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) {
        if (j - i === 1 || (i === 0 && j === d - 1)) continue; // consecutive = already adjacent
        const ch = { id: this.chords.length, vertexId: v.id, a: v.cells[i], b: v.cells[j], i, j, conflicts: [] };
        this.chords.push(ch);
        local.push(ch);
        v.chords.push(ch.id);
        this.cells[ch.a].chords.push(ch.id);
        this.cells[ch.b].chords.push(ch.id);
      }
      for (const x of local) for (const y of local) {
        if (x === y) continue;
        if (x.i === y.i || x.i === y.j || x.j === y.i || x.j === y.j) continue; // shared endpoint never crosses
        const inside = k => x.i < k && k < x.j;
        if (inside(y.i) !== inside(y.j)) x.conflicts.push(y.id); // interleaved => crossing
      }
    }
  }

  _assignArcs() {
    for (const e of this.boundaryEdges) {
      const cell = this.cells[e.cells[0]];
      const a = this.vertices[e.a].p, b = this.vertices[e.b].p;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const d = sub(b, a);
      let n = [d[1], -d[0]];
      if (dot(n, sub(mid, cell.centroid)) < 0) n = [-n[0], -n[1]];
      n = normalize(n);
      let best = -1, bestScore = Infinity;
      for (const s of this.sides) {
        // distance (in cell widths) minus alignment of outward normals
        const score = segmentDistance(mid, s.a, s.b) / this.scale - dot(n, s.normal);
        if (score < bestScore) { bestScore = score; best = s.id; }
      }
      if (!cell.arcs.includes(best)) {
        cell.arcs.push(best);
        this.arcs[best].cells.push(cell.id);
      }
    }
  }

  validate() {
    const V = this.vertices.length, E = this.edges.length, F = this.cells.length;
    this.euler = V - E + F;
    if (F === 0) throw new Error('empty board');
    if (this.euler !== 1) console.warn(`[bridges] board is not a topological disc (V-E+F=${this.euler})`);
    for (const arc of this.arcs) {
      if (arc.cells.length === 0) throw new Error(`border arc ${arc.id} has no cells`);
    }
    const seen = new Uint8Array(F);
    const stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length) {
      const c = stack.pop();
      for (const n of this.cells[c].neighbors) if (!seen[n]) { seen[n] = 1; count++; stack.push(n); }
    }
    if (count !== F) throw new Error(`cell graph is disconnected (${count}/${F})`);
  }
}