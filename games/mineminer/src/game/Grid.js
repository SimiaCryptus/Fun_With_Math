// Pure logic: no three.js, no DOM.

export const EMPTY = 0;
export const MINE = 1;

export const INTACT = 0;
export const MARKED = 1;
export const MINED = 2;
export const SCAR = 3;

export const NEIGHBOUR_STRIDE = 26;

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
    this.adjacency = adjacency === 6 ? 6 : 26;
    this.layerSize = this.width * this.depth;
    this.cellCount = this.layerSize * this.height;
    this.content = new Uint8Array(this.cellCount);
    this.state = new Uint8Array(this.cellCount);
    this.counts = new Uint8Array(this.cellCount);
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

  forEachNeighbour(i, fn) {
    const base = i * NEIGHBOUR_STRIDE;
    for (let k = 0; k < NEIGHBOUR_STRIDE; k++) {
      const n = this.neighbours[base + k];
      if (n >= 0) fn(n);
    }
  }

  isSolid(i) {
    const s = this.state[i];
    return s === INTACT || s === MARKED;
  }

  recomputeCounts() {
    const { counts, content, neighbours, cellCount } = this;
    for (let i = 0; i < cellCount; i++) {
      let c = 0;
      const base = i * NEIGHBOUR_STRIDE;
      for (let k = 0; k < NEIGHBOUR_STRIDE; k++) {
        const n = neighbours[base + k];
        if (n >= 0 && content[n] === MINE) c++;
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
        if (grid.adjacency === 6 && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) !== 1) continue;
        offsets.push([dx, dy, dz]);
      }
    }
  }
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