import * as THREE from 'three';
import { createRelativisticMaterial } from '../render/RelativisticMaterial.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * The player's hover car, shown in chase views. It is co-moving with the
 * observer, so its materials opt out of the relativistic warp/Doppler
 * (`warp: false`) — only the world around it is distorted.
 *
 * Local frame: +x = right (lateral), +y = up (normal), -z = forward.
 */
export class CarMesh {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'car';

    const body = createRelativisticMaterial({ color: 0xe8f4ff, emissive: 0.15, warp: false });
    const trim = createRelativisticMaterial({ color: 0xff4fd8, emissive: 1.2, warp: false });
    const glass = createRelativisticMaterial({ color: 0x102040, emissive: 0.6, warp: false });
    const thruster = createRelativisticMaterial({ color: 0x63f4ff, emissive: 2.4, warp: false });
    this._thrusterMat = thruster;

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };

    add(new THREE.BoxGeometry(2.1, 0.55, 4.6), body, 0, 0.35, 0); // chassis
    add(new THREE.BoxGeometry(1.2, 0.35, 1.6), body, 0, 0.28, -2.9); // nose
    add(new THREE.BoxGeometry(1.3, 0.55, 1.7), glass, 0, 0.85, -0.2); // canopy
    add(new THREE.BoxGeometry(0.5, 0.4, 2.4), trim, -1.2, 0.32, 0.4); // side pods
    add(new THREE.BoxGeometry(0.5, 0.4, 2.4), trim, 1.2, 0.32, 0.4);
    add(new THREE.BoxGeometry(0.12, 0.6, 0.5), trim, -1.1, 0.75, 2.0); // wing posts
    add(new THREE.BoxGeometry(0.12, 0.6, 0.5), trim, 1.1, 0.75, 2.0);
    add(new THREE.BoxGeometry(2.6, 0.12, 0.7), trim, 0, 1.05, 2.0); // rear wing

    const nozzle = new THREE.CylinderGeometry(0.32, 0.32, 0.4, 14);
    nozzle.rotateX(Math.PI / 2);
    this.thrusters = [
      add(nozzle, thruster, -0.65, 0.42, 2.45),
      add(nozzle, thruster, 0.65, 0.42, 2.45),
    ];

    this._frame = {
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      lateral: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      s: 0,
    };
    this._back = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
  }

  update(track, car, time = 0) {
    const f = track.frameAt(car.s, this._frame);
    const hover = 0.3 + 0.05 * Math.sin(time * 6.0);

    this.group.position
      .copy(f.position)
      .addScaledVector(f.lateral, car.d)
      .addScaledVector(f.normal, hover);

    // Right-handed basis (x=lateral, y=normal, z=-tangent) so -z is forward.
    this._back.copy(f.tangent).negate();
    this._m.makeBasis(f.lateral, f.normal, this._back);
    this.group.quaternion.setFromRotationMatrix(this._m);
    // Yaw with the car's heading (same convention as the camera's velocityDir)...
    this._q.setFromAxisAngle(Y_AXIS, -car.heading);
    this.group.quaternion.multiply(this._q);
    // ...and lean into the turn a little.
    this._q.setFromAxisAngle(Z_AXIS, -car.heading * 0.5);
    this.group.quaternion.multiply(this._q);

    // Thrusters flare with boost.
    const flare = car.boosting ? 1.35 : 1 + car.beta * 0.25;
    for (const t of this.thrusters) t.scale.setScalar(flare);
  }
}