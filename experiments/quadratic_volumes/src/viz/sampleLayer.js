// The "sieve": points re-generated from the trained tree's density.
// Drawn in a deliberately different colour from the data so the two
// clouds can be compared at a glance.

import * as THREE from 'three';

export function createSampleLayer(scene) {
  let obj = null;
  return {
    set(xs) {
      if (obj) {
        scene.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
        obj = null;
      }
      if (!xs || !xs.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position', new THREE.BufferAttribute(Float32Array.from(xs), 3)
      );
      obj = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: 0.007, color: 0xff4fd8, transparent: true, opacity: 0.75,
        })
      );
      scene.add(obj);
    },
    setVisible(v) { if (obj) obj.visible = v; },
    clear() { if (obj) scene.remove(obj); obj = null; },
  };
}