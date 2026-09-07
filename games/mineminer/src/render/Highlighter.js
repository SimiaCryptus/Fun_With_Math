import * as THREE from 'three';
import { cellCenter } from './layout.js';

/** Minecraft-style selection box around the aimed block. */
export class Highlighter {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.renderOrder = 5;
    const inner = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.03, 1.03, 1.03)),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    const outer = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.07, 1.07, 1.07)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    );
    this.group.add(inner, outer);
    scene.add(this.group);
    this.cell = -1;
  }

  set(grid, cell) {
    if (cell < 0 || !grid) {
      this.hide();
      return;
    }
    this.cell = cell;
    cellCenter(grid, cell, this.group.position);
    this.group.visible = true;
  }

  hide() {
    this.cell = -1;
    this.group.visible = false;
  }
}