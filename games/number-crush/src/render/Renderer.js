// Renderer draws the hex board, tiles, and the current selection path.
//
// Pointy-top hexagons. Keeps rendering purely a function of model state.

import { coordKey } from '../model/coords.js';

export class Renderer {
  constructor(canvas, board) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = board;
    this.size = board.grid.size;

    this.colors = {
      bg: '#242835',
      tile: '#3a4054',
      tileStroke: '#4a516a',
      selected: '#ffb454',
      selectedStroke: '#ffd699',
      text: '#f0f2f8',
      selectedText: '#242835',
    };
  }

  // Compute the 6 corner points of a pointy-top hex centered at (cx, cy).
  _hexPath(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push({
        x: cx + this.size * Math.cos(angle),
        y: cy + this.size * Math.sin(angle),
      });
    }
    return pts;
  }

  _drawHex(cx, cy, fill, stroke) {
    const pts = this._hexPath(cx, cy);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  // selectionCoords: array of {q,r} in order (may be empty).
  render(selectionCoords = []) {
    const ctx = this.ctx;
    const c = this.colors;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const selectedSet = new Set(selectionCoords.map(coordKey));

    // Draw tiles.
    this.board.forEachTile((tile) => {
      const { x, y } = this.board.grid.toPixel(tile.coord);
      const selected = selectedSet.has(coordKey(tile.coord));
      this._drawHex(
        x,
        y,
        selected ? c.selected : c.tile,
        selected ? c.selectedStroke : c.tileStroke
      );

      ctx.fillStyle = selected ? c.selectedText : c.text;
      ctx.font = `bold ${Math.round(this.size * 0.9)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(tile.value), x, y + 1);
    });

    // Draw selection connecting line.
    if (selectionCoords.length > 1) {
      ctx.beginPath();
      selectionCoords.forEach((coord, i) => {
        const { x, y } = this.board.grid.toPixel(coord);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = c.selectedStroke;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
