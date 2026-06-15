import { sub, normalize, scale, add, len } from './vector.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scaleFactor = 1;
    this.offset = { x: 0, y: 0 }; // pan in screen px
    this.showVectors = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
  }

  // world -> screen
  toScreen(p) {
    return {
      x: this.w / 2 + p.x * this.scaleFactor + this.offset.x,
      y: this.h / 2 + p.y * this.scaleFactor + this.offset.y,
    };
  }

  // screen -> world
  toWorld(s) {
    return {
      x: (s.x - this.w / 2 - this.offset.x) / this.scaleFactor,
      y: (s.y - this.h / 2 - this.offset.y) / this.scaleFactor,
    };
  }

  clear() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5, 6, 10, 0.28)'; // motion-blur trails
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawTrail(body) {
    const ctx = this.ctx;
    const h = body.history;
    if (h.count < 2) return;
    ctx.beginPath();
    for (let i = 0; i < h.count; i++) {
      const s = h._at(i);
      const p = this.toScreen(s.position);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = body.color + '55';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawBody(body) {
    const ctx = this.ctx;
    const p = this.toScreen(body.position);
    const r = body.radius * Math.max(0.5, this.scaleFactor);

    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
    grad.addColorStop(0, body.color);
    grad.addColorStop(1, body.color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (this.showVectors) this.drawVectors(body);
  }

  drawVectors(body) {
    const ctx = this.ctx;
    const origin = this.toScreen(body.position);

    const drawArrow = (vecW, color, gain) => {
      const tip = this.toScreen(add(body.position, scale(vecW, gain)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      const dir = normalize(sub(tip, origin));
      const a = 6;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - dir.x * a - dir.y * a, tip.y - dir.y * a + dir.x * a);
      ctx.lineTo(tip.x - dir.x * a + dir.y * a, tip.y - dir.y * a - dir.x * a);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    drawArrow(body.velocity, '#5ad1ff', 20);
    if (body.acceleration) drawArrow(body.acceleration, '#ff7b5a', 60);
  }

  render(simulation) {
    this.clear();
    for (const b of simulation.bodies) this.drawTrail(b);
    for (const b of simulation.bodies) this.drawBody(b);
  }
}
