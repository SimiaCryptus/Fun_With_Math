import * as THREE from 'three';
import { CELLS, MAX_CELLS, CZ, LEVELS, N } from '../engine/geometry.js';
import { cellWorld, levelY, getLevelGap } from '../core/constants.js';

export class LatticeView {
  constructor(scene) {
    this.group = new THREE.Group();
    // Colours live on the instance (not as module constants) so a theme can retint
    // the lattice, frame and plates live via setStyle().
    this.colors = {
      base: new THREE.Color(0x8fb3d9), dest: new THREE.Color(0x5cff9a), capture: new THREE.Color(0xffb347),
      final: new THREE.Color(0xa8ffd0), hover: new THREE.Color(0xe8f4ff), dim: new THREE.Color(0x15181f),
    };
    this.plateColor = new THREE.Color(0x2b313d);
    this.plateOpacity = 0.35;
    this.ghost = 0.2; // fraction of a ghosted cell's own colour that survives dimming

    const geo = new THREE.BoxGeometry(0.86, 0.86, 0.86);
    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.26, roughness: 0.2, metalness: 0.05, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, MAX_CELLS);
    this.mesh.renderOrder = 1;
    for (let i = 0; i < MAX_CELLS; i++) this.mesh.setColorAt(i, this.colors.base);
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
        new THREE.MeshStandardMaterial({
          color: this.plateColor.clone(), transparent: true, opacity: 0, roughness: 0.9, depthWrite: false,
        }),
      );
      plate.rotation.x = -Math.PI / 2;
      plate.receiveShadow = true;
      this.plates.push(plate);
      this.group.add(plate);
    }
  }

  /** Apply the board-related parts of a resolved style (see core/themes.js). */
  setStyle(s) {
    this.colors.base.set(s.latticeColor);
    this.colors.dest.set(s.moveColor);
    this.colors.capture.set(s.captureColor);
    this.colors.final.set(s.finalColor);
    this.colors.hover.set(s.hoverColor);
    this.colors.dim.set(s.background); // ghosted cells sink toward the background
    this.material.opacity = s.latticeOpacity;
    this.frame.material.color.set(s.frameColor);
    this.plateColor.set(s.plateColor);
    this.plateOpacity = s.plateOpacity;
    for (const p of this.plates) p.material.color.copy(this.plateColor);
    this.ghost = s.ghostLevel;
  }

  static isGhosted(view, idx) {
    if (view.focusLevel >= 0 && CZ[idx] !== view.focusLevel) return true;
    if (view.xray && !view.xray.has(idx)) return true;
    return false;
  }

  update(view) {
    if (this.levels !== LEVELS || this.size !== N) this.rebuild();
    const { explode, focusLevel, dests, hover } = view;
    const { base, dest, capture, final, hover: hoverC, dim } = this.colors;
    for (let idx = 0; idx < CELLS; idx++) {
      cellWorld(idx, explode, this._p);
      this.mesh.setMatrixAt(idx, this._m.makeTranslation(this._p.x, this._p.y, this._p.z));
      const c = this._c.copy(base);
      const kind = dests?.get(idx);
      if (kind) c.copy(kind === 'capture' ? capture : kind === 'final' ? final : dest);
      if (hover === idx) c.lerp(hoverC, 0.5);
      if (!kind && LatticeView.isGhosted(view, idx)) c.lerp(dim, 1 - this.ghost);
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
      pl.material.opacity = explode * this.plateOpacity * (focusLevel >= 0 && focusLevel !== z ? 0.25 : 1);
    });
  }
}