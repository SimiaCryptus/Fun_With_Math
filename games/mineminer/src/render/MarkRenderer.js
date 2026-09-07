import * as THREE from 'three';
import { MARKED } from '../game/Grid.js';
import { cellCenter } from './layout.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Flag prop planted on marked blocks that have headroom above them. */
export class MarkRenderer {
  constructor(scene, grid) {
    this.scene = scene;
    this.grid = grid;
    this.focus = -1;
    const n = grid.cellCount;
    this.poleGeo = new THREE.BoxGeometry(0.08, 0.62, 0.08);
    this.flagGeo = new THREE.BoxGeometry(0.04, 0.26, 0.4);
    this.pole = new THREE.InstancedMesh(
      this.poleGeo, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), n,
    );
    this.flag = new THREE.InstancedMesh(
      this.flagGeo,
      new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff6a10, emissiveIntensity: 0.8, roughness: 0.8 }),
      n,
    );
    for (const mesh of [this.pole, this.flag]) {
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, HIDDEN);
      scene.add(mesh);
    }
  }

  hasHeadroom(i) {
    const y = this.grid.y(i);
    if (y + 1 >= this.grid.height) return true;
    return !this.grid.isSolid(i + this.grid.layerSize);
  }

  syncCell(i) {
    const show =
      this.grid.state[i] === MARKED && this.hasHeadroom(i) && (this.focus < 0 || this.grid.y(i) === this.focus);
    if (show) {
      cellCenter(this.grid, i, _p);
      _m.makeTranslation(_p.x, _p.y + 0.81, _p.z);
      this.pole.setMatrixAt(i, _m);
      _m.makeTranslation(_p.x, _p.y + 1.0, _p.z + 0.2);
      this.flag.setMatrixAt(i, _m);
    } else {
      this.pole.setMatrixAt(i, HIDDEN);
      this.flag.setMatrixAt(i, HIDDEN);
    }
    this.pole.instanceMatrix.needsUpdate = true;
    this.flag.instanceMatrix.needsUpdate = true;
  }

  syncAll() {
    for (let i = 0; i < this.grid.cellCount; i++) this.syncCell(i);
  }

  setLayerFocus(layer) {
    this.focus = layer;
    this.syncAll();
  }

  dispose() {
    for (const mesh of [this.pole, this.flag]) {
      this.scene.remove(mesh);
      mesh.material.dispose();
      mesh.dispose();
    }
    this.poleGeo.dispose();
    this.flagGeo.dispose();
  }
}