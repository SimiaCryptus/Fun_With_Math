// HexGrid defines the bounded set of valid cells for a board.
//
// For Milestones 0-3 we use a simple rectangular block of hex cells
// using "offset" style rows built from axial coordinates. Each row is a
// horizontal line of `cols` cells; successive rows shift to produce the
// hex packing when rendered pointy-top.

import { axialToPixel, keyOf, neighbors as axialNeighbors } from './coords.js';

export class HexGrid {
  constructor({ cols, rows, size }) {
    this.cols = cols;
    this.rows = rows;
    this.size = size; // hex radius in px

    this.cells = []; // array of {q, r}
    this._cellSet = new Set();

    this._build();
  }

  _build() {
    // Build using offset rows converted to axial.
    // For row r (0..rows-1) and column c (0..cols-1):
    //   axial q = c - floor(r/2), axial r = r
    // This yields a compact parallelogram-free rectangular hex block.
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const q = col - Math.floor(row / 2);
        const r = row;
        this.cells.push({ q, r });
        this._cellSet.add(keyOf(q, r));
      }
    }
  }

  has(coord) {
    return this._cellSet.has(keyOf(coord.q, coord.r));
  }

  // Return only in-bounds neighbors of a coordinate.
  neighbors(coord) {
    return axialNeighbors(coord).filter((n) => this.has(n));
  }

  // All valid cells.
  allCells() {
    return this.cells;
  }

  // Pixel position of a coordinate, offset so the whole grid fits nicely.
  toPixel(coord) {
    const { x, y } = axialToPixel(coord.q, coord.r, this.size);
    return { x: x + this._offsetX, y: y + this._offsetY };
  }

  // Compute pixel bounds and store centering offsets for a given canvas.
  layout(canvasWidth, canvasHeight) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of this.cells) {
      const { x, y } = axialToPixel(c.q, c.r, this.size);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const gridW = maxX - minX + this.size * 2;
    const gridH = maxY - minY + this.size * 2;
    this._offsetX = (canvasWidth - gridW) / 2 - minX + this.size;
    this._offsetY = (canvasHeight - gridH) / 2 - minY + this.size;
  }
}
