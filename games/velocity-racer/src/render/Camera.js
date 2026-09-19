import * as THREE from 'three';
import { RENDER_BETA_MAX, clamp } from '../relativity/constants.js';

/** Camera presets cycled with the `camera` action; the wheel zooms between them. */
export const CAMERA_PRESETS = [
  { name: 'COCKPIT CAM', distance: 0 },
  { name: 'CHASE CAM', distance: 9 },
  { name: 'FAR CHASE CAM', distance: 18 },
];

const MAX_DISTANCE = 30;
const MIN_CHASE = 5; // closer than this you'd be inside the car

/**
 * Race camera: cockpit view (rides the spline frame, banks with the road,
 * widens FOV and shakes with β) or a chase view that follows `distance`
 * metres behind the car *along the spline*, so it never dips under the
 * road on crests or banks.
 *
 * It also publishes `warpNear` / `warpFar`: the distance window over which
 * the relativistic vertex warp fades in (see RelativisticMaterial.js).
 */
export class RaceCamera {
  constructor({ fovBase = 68, fovGain = 26, lockFov = false, mode = 0 } = {}) {
    this.object = new THREE.PerspectiveCamera(fovBase, 1, 0.3, 30000);
    this.fovBase = fovBase;
    this.fovGain = fovGain;
    this.lockFov = lockFov;

    this.velocityDir = new THREE.Vector3(0, 0, -1);

    this.mode = clamp(Math.round(mode) || 0, 0, CAMERA_PRESETS.length - 1);
    this.targetDistance = CAMERA_PRESETS[this.mode].distance;
    this.distance = this.targetDistance;

    this.warpNear = 3;
    this.warpFar = 30;

    this._pos = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._frame = {
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      lateral: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      s: 0,
    };
    this._yaw = 0;
    this._t = 0;
  }

  get isCockpit() {
    return this.distance < 1.0;
  }

  get presetName() {
    return CAMERA_PRESETS[this.mode].name;
  }

  setMode(i) {
    const n = CAMERA_PRESETS.length;
    this.mode = ((i % n) + n) % n;
    this.targetDistance = CAMERA_PRESETS[this.mode].distance;
    return this.presetName;
  }

  cycleMode() {
    return this.setMode(this.mode + 1);
  }

  /** Continuous zoom (positive = further out). Snaps into the cockpit when close. */
  zoom(delta) {
    let d = clamp(this.targetDistance + delta, 0, MAX_DISTANCE);
    if (d > 0 && d < MIN_CHASE) d = delta > 0 ? MIN_CHASE : 0;
    this.targetDistance = d;
    // keep the preset index pointing at the nearest preset (for the HUD label)
    let best = 0;
    for (let i = 1; i < CAMERA_PRESETS.length; i++) {
      if (Math.abs(CAMERA_PRESETS[i].distance - d) < Math.abs(CAMERA_PRESETS[best].distance - d)) {
        best = i;
      }
    }
    this.mode = best;
  }

  update(track, car, dt, lookBack = false) {
    this._t += dt;
    const f = track.frameAt(car.s);
    const b = car.beta;

    // Motion direction = tangent yawed by the car's heading about the road normal.
    this.velocityDir.copy(f.tangent).applyAxisAngle(f.normal, -car.heading).normalize();

    // Ease the zoom.
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-dt * 7));
    if (Math.abs(this.distance - this.targetDistance) < 0.01) this.distance = this.targetDistance;

    // Speed shake (and a kick while scraping a wall); gentler from outside.
    const shake = (b * b * 0.16 + car.scrape * 0.25) * (this.isCockpit ? 1 : 0.35);
    const sx = Math.sin(this._t * 37.0) * shake * 0.12;
    const sy = Math.sin(this._t * 53.0) * shake * 0.08;
    const sign = lookBack ? -1 : 1;

    if (this.distance < 0.05) {
      // ---- cockpit ----
      this._pos.copy(f.position).addScaledVector(f.normal, 1.45).addScaledVector(f.lateral, car.d);
      this._pos.addScaledVector(f.lateral, sx).addScaledVector(f.normal, sy);
      this._target.copy(this._pos).addScaledVector(this.velocityDir, 10 * sign);
      this.object.up.copy(f.normal);
      // The road quad right under the eye straddles the observer; leave it unwarped.
      this.warpNear = 3.0;
      this.warpFar = 30.0;
    } else {
      // ---- chase ----
      const dist = this.distance;
      // Smoothed heading so the camera swings gently behind the car.
      this._yaw += (car.heading * 0.6 - this._yaw) * (1 - Math.exp(-dt * 4));
      const fb = track.frameAt(car.s - sign * dist * Math.cos(this._yaw), this._frame);
      const height = 1.3 + dist * 0.22;
      const lateral = car.d - sign * dist * Math.sin(this._yaw);
      this._pos.copy(fb.position).addScaledVector(fb.lateral, lateral).addScaledVector(fb.normal, height);
      this._pos.addScaledVector(fb.lateral, sx).addScaledVector(fb.normal, sy);
      // Look slightly past the car.
      this._target
        .copy(f.position)
        .addScaledVector(f.lateral, car.d)
        .addScaledVector(f.normal, 0.9)
        .addScaledVector(this.velocityDir, sign * (2 + dist * 0.35));
      this.object.up.copy(fb.normal).lerp(f.normal, 0.5).normalize();
      // Everything between the camera and the car stays unwarped.
      this.warpNear = dist + 4.0;
      this.warpFar = dist + 34.0;
    }

    this.object.position.copy(this._pos);
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

/** @deprecated kept for older imports */
export { RaceCamera as CockpitCamera };