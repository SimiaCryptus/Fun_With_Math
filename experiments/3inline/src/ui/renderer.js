import { lineCells, pointId } from '../core/geometry.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.overlays = { lines: false, frontier: true, heatmap: true, sublattice: true };
    this.hoverCell = null;
    this.activeSub = null;
  }

  cellSize(n) {
    return Math.floor(Math.min(this.canvas.width, this.canvas.height) / n);
  }

  draw(config, extra = {}) {
    const ctx = this.ctx;
    const n = config.n;
    const cs = this.cellSize(n);
    const W = cs * n;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // background
    ctx.fillStyle = '#0c0f14';
    ctx.fillRect(0, 0, W, W);

    // heatmap
    if (this.overlays.heatmap) {
      let maxB = 1;
      for (const v of config.frontier.block.values()) maxB = Math.max(maxB, v);
      for (const [id, v] of config.frontier.block) {
        if (config.selected.has(id)) continue;
        const x = id % n,
          y = Math.floor(id / n);
        const a = 0.12 + 0.5 * (v / maxB);
        ctx.fillStyle = `rgba(224,108,117,${a.toFixed(3)})`;
        ctx.fillRect(x * cs, y * cs, cs, cs);
      }
    }

    // frontier safe cells
    if (this.overlays.frontier) {
      const cells = config.frontier.frontierCells(config.selected);
      ctx.fillStyle = 'rgba(92,219,149,0.35)';
      for (const [x, y] of cells) {
        ctx.beginPath();
        ctx.arc(x * cs + cs / 2, y * cs + cs / 2, cs * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // grid lines
    ctx.strokeStyle = '#1c232d';
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cs, 0);
      ctx.lineTo(i * cs, W);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cs);
      ctx.lineTo(W, i * cs);
      ctx.stroke();
    }

    // carrier lines
    if (this.overlays.lines) {
      ctx.strokeStyle = 'rgba(61,71,83,0.7)';
      ctx.lineWidth = 1;
      for (const set of config.lineIndex.lines.values()) {
        if (set.size < 2) continue;
        const pts = [...set].map((id) => [id % n, Math.floor(id / n)]);
        pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const a = pts[0],
          b = pts[pts.length - 1];
        ctx.beginPath();
        ctx.moveTo(a[0] * cs + cs / 2, a[1] * cs + cs / 2);
        ctx.lineTo(b[0] * cs + cs / 2, b[1] * cs + cs / 2);
        ctx.stroke();
      }
    }

    // active sublattice
    if (this.overlays.sublattice && this.activeSub) {
      const s = this.activeSub;
      ctx.strokeStyle = '#c792ea';
      ctx.lineWidth = 2;
      const x0 = s.c * cs,
        y0 = s.r * cs;
      const w = (s.size - 1) * s.t * cs + cs;
      const h = (s.size - 1) * s.s * cs + cs;
      ctx.strokeRect(x0, y0, w, h);
    }

    // selected points
    ctx.fillStyle = '#ffd866';
    for (const id of config.selected) {
      const x = id % n,
        y = Math.floor(id / n);
      ctx.beginPath();
      ctx.arc(x * cs + cs / 2, y * cs + cs / 2, cs * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // hover preview (manual mode)
    if (this.hoverCell) {
      const [hx, hy] = this.hoverCell;
      const id = pointId(hx, hy, n);
      const isSel = config.selected.has(id);
      ctx.strokeStyle = isSel ? '#ff4d4d' : '#4fd1c5';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx * cs + 1, hy * cs + 1, cs - 2, cs - 2);
    }

    // violation lines (from a rejected manual placement)
    if (extra.violation) {
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 2.5;
      const v = extra.violation;
      ctx.beginPath();
      ctx.moveTo(v.a[0] * cs + cs / 2, v.a[1] * cs + cs / 2);
      ctx.lineTo(v.b[0] * cs + cs / 2, v.b[1] * cs + cs / 2);
      ctx.stroke();
      ctx.fillStyle = '#ff4d4d';
      for (const p of [v.a, v.b, v.p]) {
        ctx.beginPath();
        ctx.arc(p[0] * cs + cs / 2, p[1] * cs + cs / 2, cs * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  cellFromEvent(evt, n) {
    const rect = this.canvas.getBoundingClientRect();
    const cs = this.cellSize(n);
    const x = Math.floor((evt.clientX - rect.left) / cs);
    const y = Math.floor((evt.clientY - rect.top) / cs);
    if (x < 0 || y < 0 || x >= n || y >= n) return null;
    return [x, y];
  }
}
