import * as THREE from 'three';
export class Overlays {
  constructor(scene) {
    this.scene = scene;
    this.sun = new THREE.ArrowHelper(new THREE.Vector3(1, 0.3, 0.2).normalize(), new THREE.Vector3(), 40, 0xffd060);
    scene.add(this.sun);
    this.wArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0x60ff90);
    this.lArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xff60c0);
    scene.add(this.wArrow, this.lArrow);
    this.vel = [];
    this.show = { axes: false, vel: false };
  }
  update(snap, sel, origin) {
    const hud = snap.hud;
    this.wArrow.visible = this.lArrow.visible = this.show.axes && !!hud;
    if (hud && this.show.axes) {
      const w = new THREE.Vector3(...hud.w), Lv = new THREE.Vector3(...hud.L);
      const r = hud.rad * 1.4;
      if (w.length() > 0) { this.wArrow.setDirection(w.clone().normalize()); this.wArrow.setLength(r); }
      if (Lv.length() > 0) { this.lArrow.setDirection(Lv.clone().normalize()); this.lArrow.setLength(r * 0.8); }
    }
    for (const a of this.vel) this.scene.remove(a);
    this.vel = [];
    if (this.show.vel && sel) {
      for (const c of snap.clusters) {
        const dv = new THREE.Vector3(c.V[0] - sel.V[0], c.V[1] - sel.V[1], c.V[2] - sel.V[2]);
        const l = dv.length(); if (l < 1e-6) continue;
        const a = new THREE.ArrowHelper(dv.normalize(), new THREE.Vector3(c.X[0] - origin[0], c.X[1] - origin[1], c.X[2] - origin[2]), Math.min(30, 2 + l * 100), 0x40c0ff);
        this.scene.add(a); this.vel.push(a);
      }
    }
  }
}