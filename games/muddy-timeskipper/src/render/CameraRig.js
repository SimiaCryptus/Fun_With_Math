import * as THREE from 'three';
import { clamp01, damp } from '../core/MathX.js';

/** Chase camera with snapback FOV punch, rotational whip and procedural shake. */
export class CameraRig {
  constructor(camera, { reducedMotion = false } = {}) {
    this.cam = camera;
    this.baseFov = camera.fov;
    this.reduced = reducedMotion;
    this.punch = 0;
    this.shake = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  onSnapback(ev) {
    if (this.reduced) return;
    this.punch = 1;
    this.shake = Math.min(1.2, ev.shake);
  }
   /** Continue smoothly from wherever another camera (orbit) left us. */
   snapTo(v) { this.pos.set(v.x, v.y, v.z); }


  update(body, dt) {
    const strain = body.instability;
    const back = 9.5 + body.speed * 0.12;
    const height = 4.2 + strain * 1.2;
    const fwdX = Math.sin(body.yaw), fwdZ = Math.cos(body.yaw);

    this.tmp.set(body.pos.x - fwdX * back, body.pos.y + height, body.pos.z - fwdZ * back);
    const k = 1 - Math.exp(-6 * dt);
    this.pos.lerp(this.tmp, k);

    this.look.set(body.pos.x + fwdX * 6, body.pos.y + 1.4, body.pos.z + fwdZ * 6);

    this.punch = Math.max(0, this.punch - dt * 2.6);
    this.shake = Math.max(0, this.shake - dt * 2.2);

    const s = this.shake * 0.5;
    const t = performance.now() * 0.001;
    this.cam.position.set(
      this.pos.x + Math.sin(t * 71) * s,
      this.pos.y + Math.sin(t * 89) * s,
      this.pos.z + Math.sin(t * 67) * s
    );
    this.cam.lookAt(this.look);
    this.cam.rotation.z += Math.sin(t * 43) * s * 0.05;

    const targetFov = this.baseFov + 8 * strain + 18 * Math.pow(this.punch, 1.6);
    this.cam.fov = damp(this.cam.fov, targetFov, 12, dt);
    this.cam.updateProjectionMatrix();
  }
}