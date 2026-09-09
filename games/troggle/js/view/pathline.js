/**
 * pathline.js — the selection ribbon: a tube through cube centres (§5.2),
 * with a flowing dash unless motion is reduced.
 */

import * as THREE from 'three';

function dashTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 40, 4);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(40, 0, 24, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export class PathLine {
  constructor({ reducedMotion = false, color = 0x2ec4b6 } = {}) {
    this.reducedMotion = reducedMotion;
    this.group = new THREE.Group();
    this.texture = dashTexture();
    this.material = new THREE.MeshBasicMaterial({
      color,
      map: this.texture,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.mesh = null;
    this.group.renderOrder = 4;
  }

  /** @param {THREE.Vector3[]} points cube centres, in order */
  setPoints(points) {
    this._dispose();
    if (!points || points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
    const segments = Math.min(200, Math.max(24, points.length * 12));
    const geo = new THREE.TubeGeometry(curve, segments, 0.085, 8, false);
    this.texture.repeat.set(Math.max(2, curve.getLength() * 1.6), 1);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  update(dt) {
    if (!this.mesh || this.reducedMotion) return;
    this.texture.offset.x = (this.texture.offset.x - dt * 0.45) % 1;
  }

  _dispose() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }

  dispose() {
    this._dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

export default PathLine;