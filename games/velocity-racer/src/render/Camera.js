import * as THREE from 'three';
import { RENDER_BETA_MAX, clamp } from '../relativity/constants.js';

/**
 * Cockpit camera: rides the spline frame, banks with the road,
 * widens FOV and shakes with β.
 */
export class CockpitCamera {
  constructor({ fovBase = 68, fovGain = 26, lockFov = false } = {}) {
    this.object = new THREE.PerspectiveCamera(fovBase, 1, 0.3, 30000);
    this.fovBase = fovBase;
    this.fovGain = fovGain;
    this.lockFov = lockFov;
    this.velocityDir = new THREE.Vector3(0, 0, -1);
    this._pos = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._t = 0;
  }

  update(track, car, dt, lookBack = false) {
    this._t += dt;
    const f = track.frameAt(car.s);
    const b = car.beta;

    // Motion direction = tangent yawed by the car's heading about the road normal.
    this.velocityDir.copy(f.tangent).applyAxisAngle(f.normal, -car.heading).normalize();

    this._pos.copy(f.position)
      .addScaledVector(f.normal, 1.45)
      .addScaledVector(f.lateral, car.d);

    // Speed shake (and a kick while scraping a wall).
    const shake = (b * b * 0.16 + car.scrape * 0.25);
    this._pos.addScaledVector(f.lateral, Math.sin(this._t * 37.0) * shake * 0.12);
    this._pos.addScaledVector(f.normal, Math.sin(this._t * 53.0) * shake * 0.08);

    const dir = lookBack ? this.velocityDir.clone().negate() : this.velocityDir;
    this._target.copy(this._pos).addScaledVector(dir, 10);

    this.object.position.copy(this._pos);
    this.object.up.copy(f.normal);
    this.object.lookAt(this._target);

    const fov = this.lockFov
      ? this.fovBase
      : this.fovBase + this.fovGain * clamp(b / RENDER_BETA_MAX, 0, 1);
    if (Math.abs(fov - this.object.fov) > 0.01) {
      this.object.fov = fov;
      this.object.updateProjectionMatrix();
    }
  }
}