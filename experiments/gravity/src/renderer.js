import { sub, normalize, scale, add, len } from './vector.js';
import { solveRetardedPosition } from './physics.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scaleFactor = 1;
    this.offset = { x: 0, y: 0 }; // pan in screen px
    this.showVectors = true;
    this.showRetarded = true; // draw co-observed (retarded) force directions
    this.autoFit = true; // keep both bodies centered & visible
    this.fitPadding = 80; // screen px margin around bodies
    this.fitLerp = 0.12; // smoothing factor for camera moves
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
  // Re-enable auto-fit framing and let the camera smoothly re-frame the
  // bodies. Used by the "Reset View" control after manual zoom/pan.
  resetView() {
    this.autoFit = true;
  }

  // Adjust scaleFactor and offset so all bodies fit within the viewport,
  // centered on their midpoint. Smoothed for gentle camera motion.
  fitToBodies(simulation) {
    const bodies = simulation.bodies;
    if (!bodies || bodies.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of bodies) {
      const r = b.radius;
      if (b.position.x - r < minX) minX = b.position.x - r;
      if (b.position.y - r < minY) minY = b.position.y - r;
      if (b.position.x + r > maxX) maxX = b.position.x + r;
      if (b.position.y + r > maxY) maxY = b.position.y + r;
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const availW = Math.max(this.w - this.fitPadding * 2, 1);
    const availH = Math.max(this.h - this.fitPadding * 2, 1);
    const targetScale = Math.min(availW / spanX, availH / spanY);
    // Target offset so that the world-space center maps to screen center.
    const targetOffsetX = -centerX * targetScale;
    const targetOffsetY = -centerY * targetScale;
    // Smoothly approach the target to avoid jarring jumps.
    this.scaleFactor += (targetScale - this.scaleFactor) * this.fitLerp;
    this.offset.x += (targetOffsetX - this.offset.x) * this.fitLerp;
    this.offset.y += (targetOffsetY - this.offset.y) * this.fitLerp;
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
  // Draw the co-observed (retarded) force directions: for each body, show
  // where it currently "sees" the other body (the retarded position) and the
  // force direction along that retarded line of sight. This visually
  // distinguishes the delayed interaction from the instantaneous geometry.
  drawRetardedVectors(simulation) {
    const ctx = this.ctx;
    const bodies = simulation.bodies;
    if (bodies.length < 2) return;
    const params = simulation.params;
    if (!isFinite(params.c)) return;
    for (let i = 0; i < bodies.length; i++) {
      const observer = bodies[i];
      const source = bodies[(i + 1) % bodies.length];
      if (source.history.count <= 1) continue;
      const ret = solveRetardedPosition(observer.position, source.history, simulation.t, params);
      if (!ret) continue;
      const oScreen = this.toScreen(observer.position);
      const retScreen = this.toScreen(ret.position);
      const curScreen = this.toScreen(source.position);
      // Faint dashed line connecting current source position to its
      // retarded (co-observed) position.
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ffd45a66';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(curScreen.x, curScreen.y);
      ctx.lineTo(retScreen.x, retScreen.y);
      ctx.stroke();
      ctx.restore();
      // Marker ring at the retarded position ("ghost" of the source).
      ctx.save();
      ctx.strokeStyle = '#ffd45a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(retScreen.x, retScreen.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Co-observed force direction: line of sight from observer toward the
      // retarded source position (the direction the force actually acts).
      const dir = normalize(sub(retScreen, oScreen));
      const tip = {
        x: oScreen.x + dir.x * 28,
        y: oScreen.y + dir.y * 28,
      };
      ctx.save();
      ctx.strokeStyle = '#9d5aff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(oScreen.x, oScreen.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      const a = 6;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - dir.x * a - dir.y * a, tip.y - dir.y * a + dir.x * a);
      ctx.lineTo(tip.x - dir.x * a + dir.y * a, tip.y - dir.y * a - dir.x * a);
      ctx.closePath();
      ctx.fillStyle = '#9d5aff';
      ctx.fill();
      ctx.restore();
    }
  }

  render(simulation) {
    if (this.autoFit) this.fitToBodies(simulation);
    this.clear();
    for (const b of simulation.bodies) this.drawTrail(b);
    for (const b of simulation.bodies) this.drawBody(b);
    if (this.showRetarded) this.drawRetardedVectors(simulation);
  }
}
