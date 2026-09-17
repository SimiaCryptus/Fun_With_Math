import * as THREE from 'three';
import { createRelativisticMaterial, PATTERN } from '../render/RelativisticMaterial.js';

/**
 * Star dome. It rides with the camera and goes through the same vertex warp,
 * so stars bunch toward the vanishing point as β → 1.
 */
export class Sky {
  constructor({ radius = 6000 } = {}) {
    const geo = new THREE.SphereGeometry(radius, 96, 56);
    this.material = createRelativisticMaterial({
      color: 0x170f36,   // horizon
      colorB: 0x03030c,  // zenith
      pattern: PATTERN.SKY,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  update(camera) {
    this.mesh.position.copy(camera.position);
  }
}