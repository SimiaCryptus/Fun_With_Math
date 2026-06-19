// Lightweight live chart of point count over steps.
export class MetricsChart {
  constructor(canvas, target) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = [];
    this.target = target;
    this.maxPoints = 200;
  }

  setTarget(t) {
    this.target = t;
  }

  push(count) {
    this.data.push(count);
    if (this.data.length > this.maxPoints) this.data.shift();
    this.draw();
  }

  reset() {
    this.data = [];
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width,
      H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const maxV = Math.max(this.target * 1.1, ...this.data, 1);
    // target line
    const ty = H - (this.target / maxV) * H;
    ctx.strokeStyle = '#4fd1c5';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(W, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    // data
    ctx.strokeStyle = '#ffd866';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.data.forEach((v, i) => {
      const x = (i / this.maxPoints) * W;
      const y = H - (v / maxV) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
