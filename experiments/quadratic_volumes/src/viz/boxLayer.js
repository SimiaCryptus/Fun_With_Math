// Instanced rendering of certified-IN leaf boxes: the leaf volume made
// literally visible (idea.md §5.2 bookkeeping, plan.md M3).

import * as THREE from 'three';

const PALETTE = [
  0x66ccff, 0xffcc66, 0x99ff99, 0xff8888, 0xcc99ff, 0x66ffcc,
  0xffaa44, 0x88aaff, 0xdddd66, 0xff66aa,
];

export function createBoxLayer(scene) {
  let mesh = null;
  const geo = new THREE.BoxGeometry(1, 1, 1);

  function dispose() {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.material.dispose();
    mesh = null;
  }

  return {
    /** boxes: Float32Array of [lo xyz, hi xyz] per box; ids: Int32Array */
    set(boxes, ids = null, { opacity = 0.12 } = {}) {
      dispose();
      const n = boxes.length / 6;
      if (!n) return;
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity, depthWrite: false,
      });
      mesh = new THREE.InstancedMesh(geo, mat, n);
      const m = new THREE.Matrix4();
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        const sx = Math.max(1e-6, boxes[o + 3] - boxes[o]);
        const sy = Math.max(1e-6, boxes[o + 4] - boxes[o + 1]);
        const sz = Math.max(1e-6, boxes[o + 5] - boxes[o + 2]);
        m.makeScale(sx, sy, sz);
        m.setPosition(
          boxes[o] + sx / 2, boxes[o + 1] + sy / 2, boxes[o + 2] + sz / 2
        );
        mesh.setMatrixAt(i, m);
        c.setHex(PALETTE[(ids ? ids[i] : 0) % PALETTE.length]);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
    },
    setVisible(v) { if (mesh) mesh.visible = v; },
    clear: dispose,
  };
}