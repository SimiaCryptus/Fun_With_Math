import * as THREE from 'three';
export class ParticleView {
  constructor(scene, cap = 20000) {
    this.geom = new THREE.BufferGeometry();
    this.arr = new Float32Array(cap * 3);
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    this.points = new THREE.Points(this.geom, new THREE.PointsMaterial({ color: 0xb8a890, size: 0.6 }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(pp, origin) {
    const n = pp.length / 3;
    for (let i = 0; i < n; i++) {
      this.arr[i * 3] = pp[i * 3] - origin[0]; this.arr[i * 3 + 1] = pp[i * 3 + 1] - origin[1]; this.arr[i * 3 + 2] = pp[i * 3 + 2] - origin[2];
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.setDrawRange(0, n);
  }
}