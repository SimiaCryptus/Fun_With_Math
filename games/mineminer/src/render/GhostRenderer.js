import * as THREE from 'three';
import { LayeredInstances } from './LayeredInstances.js';

/**
 * Mostly-transparent additive cubes left behind in mined cells. Colour intensity
 * controls visibility: zero-count ghosts are near-invisible, numbers glow in the
 * digit's palette colour, defused mines glow red.
 */
export class GhostRenderer {
  constructor(scene, grid) {
    this.geometry = new THREE.BoxGeometry(0.86, 0.86, 0.86);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.inst = new LayeredInstances(scene, grid, this.geometry, material, { renderOrder: 1 });
  }

  show(i, colour, scale = 1) {
    this.inst.set(i, scale, colour);
  }

  hide(i) {
    this.inst.hide(i);
  }

  setLayerFocus(layer) {
     this.inst.setLayerFocus(layer, 0.12, 0.06);
  }

  dispose() {
    this.inst.dispose();
    this.geometry.dispose();
  }
}