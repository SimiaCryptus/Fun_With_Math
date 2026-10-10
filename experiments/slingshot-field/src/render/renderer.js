import * as THREE from 'three';

/** Orthographic 2D view with pan and zoom. */
export class OrthoView {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.camera.position.z = 1;
    this.cx = 0; this.cy = 0; this.hh = 1; this.aspect = 1;
  }
  setAspect(a) { this.aspect = a; this.updateCam(); }
  updateCam() {
    const c = this.camera, hw = this.hh * this.aspect;
    c.left = this.cx - hw; c.right = this.cx + hw; c.top = this.cy + this.hh; c.bottom = this.cy - this.hh;
    c.updateProjectionMatrix();
  }
  /** u, v ∈ [0, 1] within the viewport, with v measured from the top. */
  toWorld(u, v) { return [this.cx + (2 * u - 1) * this.hh * this.aspect, this.cy + (1 - 2 * v) * this.hh]; }
  zoom(f, u, v) {
    const [wx, wy] = this.toWorld(u, v);
    this.hh *= f; this.cx = wx + (this.cx - wx) * f; this.cy = wy + (this.cy - wy) * f; this.updateCam();
  }
  pan(du, dv) { this.cx -= du * 2 * this.hh * this.aspect; this.cy += dv * 2 * this.hh; this.updateCam(); }
}

/** One WebGLRenderer drawing two views side by side via scissor. Renders on demand. */
export class SplitRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(window.devicePixelRatio);
    this.views = []; this.pending = false;
    window.addEventListener('resize', () => this.resize());
  }
  add(v) { this.views.push(v); this.resize(); }
  rect(i) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (i * w) / 2, y: 0, w: w / 2, h };
  }
  resize() {
    this.r.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.views.forEach((v, i) => { const q = this.rect(i); v.setAspect(q.w / Math.max(1, q.h)); v.onResize?.(); });
    this.request();
  }
  request() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.draw(); });
  }
  draw() {
    this.r.setScissorTest(true);
    this.views.forEach((v, i) => {
      const q = this.rect(i);
      this.r.setViewport(q.x, q.y, q.w, q.h); this.r.setScissor(q.x, q.y, q.w, q.h);
      this.r.render(v.scene, v.camera);
    });
  }
  /** Which view (and local u, v) a pointer event falls in. */
  hit(e) {
    const b = this.canvas.getBoundingClientRect();
    const x = e.clientX - b.left, y = e.clientY - b.top, half = b.width / 2;
    const i = x < half ? 0 : 1;
    return { i, view: this.views[i], u: (x - i * half) / half, v: y / b.height, w: half, h: b.height };
  }
}