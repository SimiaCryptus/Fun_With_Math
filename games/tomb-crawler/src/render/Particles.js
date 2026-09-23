import * as THREE from 'three';

const MAX = 900;
const _c = new THREE.Color();

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.base = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -1000;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.25, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
    this.active = false;
  }

  burst(x, y, z, color, n, speed) {
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const j = i * 3;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const s = speed * (0.3 + Math.random() * 0.7);
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.vel[j] = Math.cos(a) * s * (1 - up * 0.5);
      this.vel[j + 1] = up * s * 1.2 + 1;
      this.vel[j + 2] = Math.sin(a) * s * (1 - up * 0.5);
      this.base[j] = _c.r; this.base[j + 1] = _c.g; this.base[j + 2] = _c.b;
      this.life[i] = this.maxLife[i] = 0.5 + Math.random() * 0.6;
    }
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 1] = -1000; continue; }
      any = true;
      this.vel[j + 1] -= 9 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.05) {
        this.pos[j + 1] = 0.05;
        this.vel[j + 1] *= -0.3;
        this.vel[j] *= 0.7; this.vel[j + 2] *= 0.7;
      }
      const f = this.life[i] / this.maxLife[i];
      this.col[j] = this.base[j] * f;
      this.col[j + 1] = this.base[j + 1] * f;
      this.col[j + 2] = this.base[j + 2] * f;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.active = any;
  }

  clear() {
    for (let i = 0; i < MAX; i++) { this.life[i] = 0; this.pos[i * 3 + 1] = -1000; }
    this.posAttr.needsUpdate = true;
    this.active = false;
  }
}