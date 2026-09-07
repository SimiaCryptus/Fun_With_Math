// Pure logic: no three.js, no DOM.

export const EMPTY = 0;
export const MINE = 1;

export const INTACT = 0;
export const MARKED = 1;
export const MINED = 2;
export const SCAR = 3;

export const NEIGHBOUR_STRIDE = 26;
/**
  * Neighbour classes, by the Manhattan length of the offset:
  *   1 = face-connected  (6 cells)
  *   2 = edge-connected  (12 cells)
  *   3 = point/corner-connected (8 cells)
  * Each class contributes `weight` to a cell's proximity count. Faces are always 1;
  * edges and corners are configurable as 1 / 0.5 / 0.
  */
export const DEFAULT_WEIGHTS = Object.freeze({ face: 1, edge: 1, corner: 1 });
const WEIGHT_STEPS = [0, 0.5, 1];
/** Snaps an arbitrary number to the nearest allowed weight (0, 0.5, 1). */
export function quantiseWeight(v, fallback = 1) {
   const n = Number(v);
   if (!Number.isFinite(n)) return fallback;
   let best = WEIGHT_STEPS[0];
   let bestD = Infinity;
   for (const s of WEIGHT_STEPS) {
     const d = Math.abs(s - n);
     if (d < bestD) {
       bestD = d;
       best = s;
     }
   }
   return best;
}
/** Accepts the legacy `26` / `6` presets or a `{face, edge, corner}` weight object. */
export function normaliseWeights(spec) {
   if (spec === 6) return { face: 1, edge: 0, corner: 0 };
   if (spec === null || spec === undefined || typeof spec === 'number') return { ...DEFAULT_WEIGHTS };
   return {
     face: quantiseWeight(spec.face, 1),
     edge: quantiseWeight(spec.edge, 1),
     corner: quantiseWeight(spec.corner, 1),
   };
}
function weightFor(weights, dx, dy, dz) {
   const m = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
   return m === 1 ? weights.face : m === 2 ? weights.edge : weights.corner;
}


/**
 * Flat typed-array voxel grid.
 * index(x, y, z) = x + width * (z + depth * y)
 */
export class Grid {
  constructor(width, depth, height, adjacency = 26) {
    if (width < 1 || depth < 1 || height < 1) throw new Error('Grid dimensions must be >= 1');
    this.width = width | 0;
    this.depth = depth | 0;
    this.height = height | 0;
     this.weights = normaliseWeights(adjacency);
     // Legacy shorthand kept for callers/tests that only care about "faces only or not".
     this.adjacency = this.weights.edge === 0 && this.weights.corner === 0 ? 6 : 26;
    this.layerSize = this.width * this.depth;
    this.cellCount = this.layerSize * this.height;
    this.content = new Uint8Array(this.cellCount);
    this.state = new Uint8Array(this.cellCount);
     // Fractional weights mean counts are no longer integers (0, 0.5, 1, 1.5, ...).
     this.counts = new Float32Array(this.cellCount);
     this.slotWeights = new Float32Array(NEIGHBOUR_STRIDE);
    this.neighbours = buildNeighbourTable(this);
  }

  index(x, y, z) {
    return x + this.width * (z + this.depth * y);
  }

  x(i) {
    return i % this.width;
  }

  y(i) {
    return Math.floor(i / this.layerSize);
  }

  z(i) {
    return Math.floor(i / this.width) % this.depth;
  }

  coords(i, out = { x: 0, y: 0, z: 0 }) {
    out.x = this.x(i);
    out.y = this.y(i);
    out.z = this.z(i);
    return out;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height && z >= 0 && z < this.depth;
  }

  neighbour(i, k) {
    return this.neighbours[i * NEIGHBOUR_STRIDE + k];
  }

   /** Weight of neighbour slot `k` (identical for every cell). */
   neighbourWeight(k) {
     return this.slotWeights[k];
   }

   /** Calls fn(neighbourIndex, weight). Zero-weight classes are not in the table at all. */
   forEachNeighbour(i, fn) {
     const base = i * NEIGHBOUR_STRIDE;
     for (let k = 0; k < NEIGHBOUR_STRIDE; k++) {
       const n = this.neighbours[base + k];
       if (n >= 0) fn(n, this.slotWeights[k]);
     }
   }

   /** Highest count this grid could ever produce (used to size glyph atlases). */
   maxCount() {
     const { face, edge, corner } = this.weights;
     return 6 * face + 12 * edge + 8 * corner;
   }

  isSolid(i) {
    const s = this.state[i];
    return s === INTACT || s === MARKED;
  }

  recomputeCounts() {
     const { counts, content, neighbours, slotWeights, cellCount } = this;
    for (let i = 0; i < cellCount; i++) {
      let c = 0;
      const base = i * NEIGHBOUR_STRIDE;
      for (let k = 0; k < NEIGHBOUR_STRIDE; k++) {
        const n = neighbours[base + k];
         if (n >= 0 && content[n] === MINE) c += slotWeights[k];
      }
      counts[i] = c;
    }
  }
}

function buildNeighbourTable(grid) {
  const offsets = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
         const w = weightFor(grid.weights, dx, dy, dz);
         // A class weighted 0 contributes nothing to counts and is excluded from the
         // neighbourhood entirely, so cascades and safe-first-strike ignore it too.
         if (w <= 0) continue;
         offsets.push([dx, dy, dz, w]);
      }
    }
  }
   grid.slotWeights.fill(0);
   for (let k = 0; k < offsets.length; k++) grid.slotWeights[k] = offsets[k][3];
  const table = new Int32Array(NEIGHBOUR_STRIDE * grid.cellCount).fill(-1);
  for (let i = 0; i < grid.cellCount; i++) {
    const x = grid.x(i);
    const y = grid.y(i);
    const z = grid.z(i);
    const base = i * NEIGHBOUR_STRIDE;
    for (let k = 0; k < offsets.length; k++) {
      const [dx, dy, dz] = offsets[k];
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (grid.inBounds(nx, ny, nz)) table[base + k] = grid.index(nx, ny, nz);
    }
  }
  return table;
}