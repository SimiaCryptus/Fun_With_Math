/**
 * Grid — geometry of the Troggle block.
 *
 * Cubes are stored in a flat array; index = x + y * N + z * N * N.
 * Nothing here knows about three.js, the DOM, or the dictionary.
 */

export const ADJACENCY = Object.freeze({
  FACE: 'face',     //  6 neighbours: |dx|+|dy|+|dz| === 1
  EDGE: 'edge',     // 18 neighbours: face + edge (max 2 non-zero deltas)
  CORNER: 'corner', // 26 neighbours: everything in the 3x3x3 shell
});

/** Precomputed delta triples per mode, built once at module load. */
const DELTAS = (() => {
  const all = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (dx || dy || dz) all.push([dx, dy, dz]);

  const nonZero = ([dx, dy, dz]) => Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  return {
    [ADJACENCY.FACE]: all.filter((d) => nonZero(d) === 1),
    [ADJACENCY.EDGE]: all.filter((d) => nonZero(d) <= 2),
    [ADJACENCY.CORNER]: all,
  };
})();

export class Grid {
  /**
   * @param {number} size          N, edge length of the block (4..6)
   * @param {string[]} letters      N^3 letters, 'Qu' allowed as a single entry
   * @param {string} adjacency      one of ADJACENCY.*
   */
  constructor(size, letters, adjacency = ADJACENCY.CORNER) {
    if (!DELTAS[adjacency]) throw new Error(`Unknown adjacency: ${adjacency}`);
    if (letters.length !== size ** 3) {
      throw new Error(`Expected ${size ** 3} letters, got ${letters.length}`);
    }
    this.size = size;
    this.count = size ** 3;
    this.letters = letters.map((l) => l.toUpperCase());
    this.adjacency = adjacency;

    /** @type {Int32Array[]} neighbour index lists, one per cube */
    this._neighbours = this._buildNeighbours();
  }

  // ---------------------------------------------------------------- coords

  index(x, y, z) {
    const n = this.size;
    return x + y * n + z * n * n;
  }

  coords(index, out = { x: 0, y: 0, z: 0 }) {
    const n = this.size;
    out.x = index % n;
    out.y = Math.floor(index / n) % n;
    out.z = Math.floor(index / (n * n));
    return out;
  }

  inBounds(x, y, z) {
    const n = this.size;
    return x >= 0 && y >= 0 && z >= 0 && x < n && y < n && z < n;
  }

  letterAt(index) {
    return this.letters[index];
  }

  /** True if the cube touches no outer face of the block (N >= 3 only). */
  isInterior(index) {
    const n = this.size;
    const { x, y, z } = this.coords(index);
    return x > 0 && y > 0 && z > 0 && x < n - 1 && y < n - 1 && z < n - 1;
  }

  // ------------------------------------------------------------ neighbours

  _buildNeighbours() {
    const deltas = DELTAS[this.adjacency];
    const list = new Array(this.count);
    const c = { x: 0, y: 0, z: 0 };

    for (let i = 0; i < this.count; i++) {
      this.coords(i, c);
      const found = [];
      for (const [dx, dy, dz] of deltas) {
        const x = c.x + dx;
        const y = c.y + dy;
        const z = c.z + dz;
        if (this.inBounds(x, y, z)) found.push(this.index(x, y, z));
      }
      list[i] = Int32Array.from(found);
    }
    return list;
  }

  /** @returns {Int32Array} indices adjacent to `index` under the current mode. */
  neighbours(index) {
    return this._neighbours[index];
  }

  isAdjacent(a, b) {
    if (a === b) return false;
    return this._neighbours[a].includes(b);
  }

  // ------------------------------------------------------------------ path

  /**
   * A path is legal if every step is adjacent and no cube repeats.
   * @param {number[]} path
   */
  isValidPath(path) {
    if (path.length === 0) return false;
    const seen = new Set();
    for (let i = 0; i < path.length; i++) {
      const idx = path[i];
      if (!Number.isInteger(idx) || idx < 0 || idx >= this.count) return false;
      if (seen.has(idx)) return false;
      seen.add(idx);
      if (i > 0 && !this.isAdjacent(path[i - 1], idx)) return false;
    }
    return true;
  }

  /** Concatenated letters of a path ('Qu' contributes two characters). */
  wordFromPath(path) {
    let word = '';
    for (const idx of path) word += this.letters[idx];
    return word;
  }

  /**
   * Geometric facts about a path, used by the scorer.
   * @param {number[]} path
   */
  pathMetrics(path) {
    const c = { x: 0, y: 0, z: 0 };
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    const layers = new Set();
    let allInterior = path.length > 0;

    for (const idx of path) {
      this.coords(idx, c);
      min.x = Math.min(min.x, c.x); max.x = Math.max(max.x, c.x);
      min.y = Math.min(min.y, c.y); max.y = Math.max(max.y, c.y);
      min.z = Math.min(min.z, c.z); max.z = Math.max(max.z, c.z);
      layers.add(c.z);
      if (allInterior && !this.isInterior(idx)) allInterior = false;
    }

    const span = {
      x: max.x - min.x + 1,
      y: max.y - min.y + 1,
      z: max.z - min.z + 1,
    };
    return {
      layers: layers.size,
      span,
      isVolumetric: span.x >= 2 && span.y >= 2 && span.z >= 2,
      allInterior,
    };
  }
}

export default Grid;