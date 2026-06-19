import { lineCells, pointId } from './geometry.js';

// Reference-counted expansion frontier.
// blockCount[cellId] = number of carrier lines (through pairs of selected
// points) passing through that empty cell. blockCount==0 => safe.
export class Frontier {
  constructor(n) {
    this.n = n;
    this.block = new Map(); // cellId -> count (only stores >0)
  }

  clone() {
    const f = new Frontier(this.n);
    for (const [k, v] of this.block) f.block.set(k, v);
    return f;
  }

  blockCount(id) {
    return this.block.get(id) || 0;
  }

  _inc(id) {
    this.block.set(id, (this.block.get(id) || 0) + 1);
  }
  _dec(id) {
    const v = (this.block.get(id) || 0) - 1;
    if (v <= 0) this.block.delete(id);
    else this.block.set(id, v);
  }

  // Add a point: for each existing selected point q, the line p-q extended
  // blocks all OTHER cells on that line. We add +1 to those cells.
  addPoint(p, points) {
    const n = this.n;
    const pid = pointId(p[0], p[1], n);
    for (const q of points) {
      if (q[0] === p[0] && q[1] === p[1]) continue;
      const cells = lineCells(p, q, n);
      for (const c of cells) {
        const cid = pointId(c[0], c[1], n);
        if (cid === pid) continue;
        // don't count cells that are themselves selected points
        this._inc(cid);
      }
    }
  }

  removePoint(p, points) {
    const n = this.n;
    const pid = pointId(p[0], p[1], n);
    for (const q of points) {
      if (q[0] === p[0] && q[1] === p[1]) continue;
      const cells = lineCells(p, q, n);
      for (const c of cells) {
        const cid = pointId(c[0], c[1], n);
        if (cid === pid) continue;
        this._dec(cid);
      }
    }
  }

  // All safe empty cells (blockCount==0 and not selected).
  frontierCells(selectedSet) {
    const cells = [];
    const n = this.n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const id = pointId(x, y, n);
        if (selectedSet.has(id)) continue;
        if (this.blockCount(id) === 0) cells.push([x, y]);
      }
    return cells;
  }
}
