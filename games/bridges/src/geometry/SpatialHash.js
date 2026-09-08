import { pointInPolygon, bboxOf } from './Polygon.js';

/** Uniform grid: O(1) point -> cell lookup for picking on any tiling. */
export class SpatialHash {
  constructor(cells) {
    this.cells = cells;
    const meanArea = cells.reduce((s, c) => s + c.area, 0) / Math.max(1, cells.length);
    this.size = Math.sqrt(meanArea) * 1.5 || 1;
    this.buckets = new Map();
    for (const c of cells) {
      const b = bboxOf(c.poly);
      const x0 = Math.floor(b.minX / this.size), x1 = Math.floor(b.maxX / this.size);
      const y0 = Math.floor(b.minY / this.size), y1 = Math.floor(b.maxY / this.size);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        const list = this.buckets.get(k);
        if (list) list.push(c.id); else this.buckets.set(k, [c.id]);
      }
    }
  }

  query(x, y) {
    const list = this.buckets.get(`${Math.floor(x / this.size)},${Math.floor(y / this.size)}`);
    if (!list) return -1;
    for (const id of list) if (pointInPolygon([x, y], this.cells[id].poly)) return id;
    return -1;
  }
}