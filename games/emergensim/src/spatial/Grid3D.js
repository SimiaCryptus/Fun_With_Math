import { createTile, coordKey, isTilePassable } from './Tile.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Multi-floor discrete voxel grid keyed by "x,y,z" for O(1) lookup. */
export class Grid3D {
  constructor(dimensions, layout = []) {
    this.dimensions = { ...dimensions };
    this.tiles = new Map();
    for (const def of layout) {
      const tile = createTile(def);
      this.tiles.set(tile.key, tile);
    }
  }

  key(x, y, z) { return coordKey(x, y, z); }
  get(x, y, z) { return this.tiles.get(coordKey(x, y, z)) || null; }
  getByKey(key) { return this.tiles.get(key) || null; }
  has(key) { return this.tiles.has(key); }

  /** 8-way planar adjacency (orthogonal 1.0, diagonal 1.414) plus vertical links through STAIR tiles. */
  neighbors(coord, { diagonal = true, vertical = true } = {}) {
    const out = [];
    const { x, y, z } = coord;
    for (const [dx, dy] of DIRS) {
      const diag = dx !== 0 && dy !== 0;
      if (diag && !diagonal) continue;
      const t = this.get(x + dx, y + dy, z);
      if (!t) continue;
      if (diag) {
        const a = this.get(x + dx, y, z);
        const b = this.get(x, y + dy, z);
        const solid = (q) => !q || q.type === 'WALL' || q.type === 'WINDOW';
        if (solid(a) && solid(b)) continue;
      }
      out.push({ tile: t, cost: diag ? 1.414 : 1, diagonal: diag, vertical: false });
    }
    if (vertical) {
      const here = this.get(x, y, z);
      if (here && here.type === 'STAIR') {
        for (const dz of [1, -1]) {
          const t = this.get(x, y, z + dz);
          if (t && t.type === 'STAIR') out.push({ tile: t, cost: 1.5, diagonal: false, vertical: true });
        }
      }
    }
    return out;
  }

  passableNeighbors(coord, opts = {}) {
    return this.neighbors(coord, opts).filter((n) => isTilePassable(n.tile, opts.agent || {}));
  }

  tilesOfType(type) {
    const out = [];
    for (const t of this.tiles.values()) if (t.type === type) out.push(t);
    return out;
  }

  exits() { return this.tilesOfType('EXIT'); }

  floorTiles(z) {
    const out = [];
    for (const t of this.tiles.values()) if (t.coord.z === z) out.push(t);
    return out;
  }

  /** Octile distance with a heavy vertical penalty. */
  static distance(a, b) {
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), dz = Math.abs((a.z ?? 0) - (b.z ?? 0));
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy) + 3 * dz;
  }

  static chebyshev(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) + 100 * Math.abs((a.z ?? 0) - (b.z ?? 0));
  }
}