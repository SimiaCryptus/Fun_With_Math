import * as THREE from 'three';
import { MATERIALS, L } from '../sim/voxels.js';

const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
const MAT_COLORS = MATERIALS.map((m) => new THREE.Color(m.color));
const BOX = new THREE.BoxGeometry(L * 0.97, L * 0.97, L * 0.97);

// Colorblind-safe ramp: blue -> orange -> white (over limit)
export function stressColor(r, out) {
  if (r >= 1) return out.setRGB(1, 1, 1);
  const t = Math.max(0, Math.min(1, r));
  return out.setRGB(0.1 + 0.9 * t, 0.3 + 0.3 * t, 0.8 - 0.7 * t);
}

export class ClusterView {
  constructor(scene) { this.group = new THREE.Group(); scene.add(this.group); this.mesh = null; this.mat = null; this.stress = null; }
  setVoxels({ pos, mat, com }) {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.material.dispose(); this.mesh.dispose(); }
    const n = mat.length;
    this.mesh = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ roughness: 0.95 }), Math.max(n, 1));
    this.mesh.count = n;
    for (let i = 0; i < n; i++) {
      tmpM.makeTranslation(pos[i * 3] * L - com[0], pos[i * 3 + 1] * L - com[1], pos[i * 3 + 2] * L - com[2]);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mat = mat; this.group.add(this.mesh);
  }
  recolor(mode) {
    if (!this.mesh) return;
    for (let i = 0; i < this.mat.length; i++) {
      if (mode === 'stress') stressColor(this.stress ? this.stress[i] : 0, tmpC);
      else tmpC.copy(MAT_COLORS[this.mat[i]]);
      this.mesh.setColorAt(i, tmpC);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  setTransform(X, q, origin) {
    this.group.position.set(X[0] - origin[0], X[1] - origin[1], X[2] - origin[2]);
    this.group.quaternion.set(q[1], q[2], q[3], q[0]);
  }
  dispose(scene) { if (this.mesh) { this.mesh.material.dispose(); this.mesh.dispose(); } scene.remove(this.group); }
}