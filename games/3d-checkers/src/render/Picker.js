import * as THREE from 'three';

/**
 * Raycasts against instanced meshes (pieces and destination markers — never the
 * lattice voxels) and resolves the nearest accepted hit to a cell index, or -1.
 * `accept(idx, isPiece)` lets the caller reject e.g. pieces outside the focused level.
 */
export class Picker {
  constructor(dom, camera, { pickables, resolve, accept, onHover, onClick }) {
    this.dom = dom;
    this.camera = camera;
    this.pickables = pickables;
    this.resolve = resolve;
    this.accept = accept ?? (() => true);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.down = null;

    dom.addEventListener('pointerdown', (e) => { this.down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', (e) => {
      if (!this.down) return;
      const moved = Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]);
      this.down = null;
      if (moved < 6 && e.button === 0) onClick?.(this.pick(e));
    });
    dom.addEventListener('pointermove', (e) => { if (!this.down) onHover?.(this.pick(e)); });
    dom.addEventListener('pointerleave', () => onHover?.(-1));
  }

  pick(e) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables(), false); // sorted by distance
    for (const h of hits) {
      if (h.instanceId === undefined) continue;
      const { idx, isPiece } = this.resolve(h.object, h.instanceId);
      if (idx >= 0 && this.accept(idx, isPiece)) return idx;
    }
    return -1;
  }
}