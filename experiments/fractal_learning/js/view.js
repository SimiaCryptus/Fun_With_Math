// Canvas viewport + drawing utilities.

export class View {
  constructor(canvas, lossCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.lossCanvas = lossCanvas;
    this.lctx = lossCanvas.getContext("2d");
    this.world = { cx: 0, cy: 0, scale: 200 };
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.lossCanvas.width = this.lossCanvas.clientWidth * dpr;
    this.lossCanvas.height = this.lossCanvas.clientHeight * dpr;
  }

  w2s(x, y) {
    return [
      this.canvas.width / 2 + (x - this.world.cx) * this.world.scale,
      this.canvas.height / 2 - (y - this.world.cy) * this.world.scale,
    ];
  }
  s2w(sx, sy) {
    return [
      (sx - this.canvas.width / 2) / this.world.scale + this.world.cx,
      -(sy - this.canvas.height / 2) / this.world.scale + this.world.cy,
    ];
  }

  drawGrid() {
    const ctx = this.ctx,
      c = this.canvas;
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#161b22";
    ctx.lineWidth = 1;
    const step = 0.25;
    const [x0, y0] = this.s2w(0, c.height);
    const [x1, y1] = this.s2w(c.width, 0);
    ctx.beginPath();
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      const [sx] = this.w2s(x, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, c.height);
    }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
      const [, sy] = this.w2s(0, y);
      ctx.moveTo(0, sy);
      ctx.lineTo(c.width, sy);
    }
    ctx.stroke();
    ctx.strokeStyle = "#30363d";
    ctx.beginPath();
    const [, sy0] = this.w2s(0, 0);
    const [sx0] = this.w2s(0, 0);
    ctx.moveTo(0, sy0);
    ctx.lineTo(c.width, sy0);
    ctx.moveTo(sx0, 0);
    ctx.lineTo(sx0, c.height);
    ctx.stroke();
  }

  drawPoints(pts, color, r) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let i = 0; i < pts.length; i++) {
      const [sx, sy] = this.w2s(pts[i][0], pts[i][1]);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFixedPoints(transforms) {
    const ctx = this.ctx;
    for (let k = 0; k < transforms.length; k++) {
      const { A, b, frozen } = transforms[k];
      const m11 = 1 - A[0],
        m12 = -A[1],
        m21 = -A[2],
        m22 = 1 - A[3];
      const det = m11 * m22 - m12 * m21;
      if (Math.abs(det) < 1e-6) continue;
      const fx = (m22 * b[0] - m12 * b[1]) / det;
      const fy = (-m21 * b[0] + m11 * b[1]) / det;
      const [sx, sy] = this.w2s(fx, fy);
      ctx.strokeStyle = frozen ? "#d29922" : "#ff7b72";
      ctx.fillStyle = frozen ? "#d29922" : "#ff7b72";
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = "11px ui-monospace";
      ctx.fillText("T" + (k + 1) + (frozen ? "❄" : ""), sx + 8, sy - 6);
    }
  }

  drawLossCurve(history) {
    const w = this.lossCanvas.width,
      h = this.lossCanvas.height;
    const lctx = this.lctx;
    lctx.fillStyle = "#0d1117";
    lctx.fillRect(0, 0, w, h);
    if (history.length < 2) return;
    const logs = history.map((v) => Math.log10(Math.max(v, 1e-10)));
    let lo = Math.min(...logs),
      hi = Math.max(...logs);
    if (hi - lo < 1e-6) hi = lo + 1e-6;
    lctx.strokeStyle = "#58a6ff";
    lctx.lineWidth = 1.5;
    lctx.beginPath();
    for (let i = 0; i < logs.length; i++) {
      const x = (i / (logs.length - 1)) * w;
      const y = h - ((logs[i] - lo) / (hi - lo)) * (h - 4) - 2;
      if (i === 0) lctx.moveTo(x, y);
      else lctx.lineTo(x, y);
    }
    lctx.stroke();
    lctx.fillStyle = "#7d8590";
    lctx.font = "10px ui-monospace";
    lctx.fillText(`log10 loss [${lo.toFixed(2)}, ${hi.toFixed(2)}]`, 4, 12);
  }
}

// Spectral radius of a 2x2 matrix [a,b,c,d].
export function specRad(A) {
  const [a, b, c, d] = A;
  const tr = a + d,
    det = a * d - b * c;
  const disc = (tr * tr) / 4 - det;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return Math.max(Math.abs(tr / 2 + s), Math.abs(tr / 2 - s));
  }
  return Math.sqrt(Math.max(det, 0));
}
