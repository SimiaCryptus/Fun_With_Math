import { deg2rad } from '../core/math.js';

/** Frames the whole road along Z; damped follow on X; screen shake (SPEC §16.1). */
export class CameraRig {
  constructor(camera, cfg) {
    this.camera = camera; this.cfg = cfg;
    this.camX = 0; this.h = 30; this.d = 20; this.lookZ = -10;
    this.shakeT = 0; this.shakeA = 0; this.shakeEnabled = true;
  }

  setup(road) {
    const th = deg2rad(this.cfg.pitchDeg), ph = deg2rad(this.cfg.fov / 2);
    const K = 1 / Math.tan(th - ph) - 1 / Math.tan(th + ph);
    const D = (road.depth + 10) / (Math.sin(th) * K);
    this.h = D * Math.sin(th);
    this.d = D * Math.cos(th);
    this.lookZ = road.zMax + 5 - this.d + this.h / Math.tan(th + ph);
  }

  snap(x) { this.camX = x; }

  shake(amount) {
    if (!this.shakeEnabled) return;
    this.shakeA = Math.min(1, this.shakeA + amount);
    this.shakeT = 0.4;
  }

  update(targetX, dt) {
    this.camX += (targetX - this.camX) * (1 - Math.exp(-dt / this.cfg.followTime));
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeA * (this.shakeT / 0.4);
      sx = (Math.random() - 0.5) * k * 1.2;
      sy = (Math.random() - 0.5) * k * 0.8;
    } else this.shakeA = 0;
    this.camera.position.set(this.camX + sx, this.h + sy, this.lookZ + this.d);
    this.camera.lookAt(this.camX, 0, this.lookZ);
  }
}