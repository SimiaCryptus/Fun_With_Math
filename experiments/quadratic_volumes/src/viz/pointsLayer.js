import * as THREE from 'three';

const PALETTE = [
  0x66ccff, 0xffcc66, 0x99ff99, 0xff8888, 0xcc99ff, 0x66ffcc,
  0xffaa44, 0x88aaff, 0xdddd66, 0xff66aa,
];

export function createPointsLayer(scene) {
  let obj = null;
  return {
    set(xs, leafIds = null) {
      if (obj) { scene.remove(obj); obj.geometry.dispose(); obj.material.dispose(); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(xs), 3));
      const n = xs.length / 3;
      const col = new Float32Array(n * 3);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        c.setHex(leafIds ? PALETTE[leafIds[i] % PALETTE.length] : 0x88bbdd);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      obj = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size: 0.006, vertexColors: true })
      );
      scene.add(obj);
    },
     setVisible(v) { if (obj) obj.visible = v; },
    clear() { if (obj) scene.remove(obj); obj = null; },
  };
}