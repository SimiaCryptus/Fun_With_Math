import * as THREE from 'three';
import { CELLS, MAX_CELLS, CZ, LEVELS, N } from '../engine/geometry.js';
import { cellWorld, levelY, getLevelGap } from '../core/constants.js';

const BASE = new THREE.Color(0x8fb3d9);
const DEST = new THREE.Color(0x5cff9a);
const CAPTURE = new THREE.Color(0xffb347);
const FINAL = new THREE.Color(0xa8ffd0);
const HOVER = new THREE.Color(0xe8f4ff);
const DIM = new THREE.Color(0x181d27);

export class LatticeView {
  constructor(scene) {
    this.group = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.86, 0.86, 0.86);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.26, roughness: 0.2, metalness: 0.05, depthWrite: false,
    });
     this.mesh = new THREE.InstancedMesh(geo, mat, MAX_CELLS);
    this.mesh.renderOrder = 1;
     for (let i = 0; i < MAX_CELLS; i++) this.mesh.setColorAt(i, BASE);
     this.mesh.count = CELLS;
    this.group.add(this.mesh);

    this.frame = new THREE.LineSegments(
       new THREE.EdgesGeometry(new THREE.BoxGeometry(N, 1, N)),
      new THREE.LineBasicMaterial({ color: 0x8a7a66 }),
    );
    this.group.add(this.frame);

    this.plates = [];
     this.levels = 0;
     this.size = 0;
    scene.add(this.group);

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
     this.rebuild();
   }
   /** Re-create the cage + level plates for the current N × N × LEVELS board. */
   rebuild() {
     this.levels = LEVELS;
     this.size = N;
     this.frame.geometry.dispose();
     this.frame.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(N, LEVELS, N));
     for (const p of this.plates) { this.group.remove(p); p.geometry.dispose(); p.material.dispose(); }
     this.plates = [];
     for (let z = 0; z < LEVELS; z++) {
       const plate = new THREE.Mesh(
         new THREE.PlaneGeometry(N + 0.4, N + 0.4),
         new THREE.MeshStandardMaterial({ color: 0x2b313d, transparent: true, opacity: 0, roughness: 0.9, depthWrite: false }),
       );
       plate.rotation.x = -Math.PI / 2;
       plate.receiveShadow = true;
       this.plates.push(plate);
       this.group.add(plate);
     }
  }

  static isGhosted(view, idx) {
    if (view.focusLevel >= 0 && CZ[idx] !== view.focusLevel) return true;
    if (view.xray && !view.xray.has(idx)) return true;
    return false;
  }

  update(view) {
     if (this.levels !== LEVELS || this.size !== N) this.rebuild();
    const { explode, focusLevel, dests, hover } = view;
    for (let idx = 0; idx < CELLS; idx++) {
      cellWorld(idx, explode, this._p);
      this.mesh.setMatrixAt(idx, this._m.makeTranslation(this._p.x, this._p.y, this._p.z));
      const c = this._c.copy(BASE);
      const kind = dests?.get(idx);
      if (kind) c.copy(kind === 'capture' ? CAPTURE : kind === 'final' ? FINAL : DEST);
      if (hover === idx) c.lerp(HOVER, 0.5);
      if (!kind && LatticeView.isGhosted(view, idx)) c.lerp(DIM, 0.88);
      this.mesh.setColorAt(idx, c);
    }
     this.mesh.count = CELLS;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    // Keep the cached bounding sphere in step with the explode factor / board size so
    // the lattice is never frustum-culled while it is actually on screen.
    this.mesh.computeBoundingSphere();
     const span = (LEVELS - 1) * (1 + explode * getLevelGap()) + 1;
     this.frame.scale.y = span / LEVELS;
    this.plates.forEach((pl, z) => {
      pl.position.y = levelY(z, explode) - 0.5;
      pl.material.opacity = explode * 0.35 * (focusLevel >= 0 && focusLevel !== z ? 0.25 : 1);
    });
  }
}