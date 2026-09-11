import * as THREE from 'three';
import { worldPos, FLOOR_H } from './MapBuilder.js';

/** Fire columns (flicker), ceiling-hugging smoke volumes (opacity = density), debris blocks, and a fire glow light. */
export class HazardRenderer {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.fire = new Map();
    this.smoke = new Map();
    this.debris = new Map();
    this.fireGeo = new THREE.BoxGeometry(0.7, 1, 0.7);
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.92 });
    this.smokeGeo = new THREE.BoxGeometry(0.98, 1, 0.98);
    this.debrisGeo = new THREE.BoxGeometry(0.85, 0.45, 0.65);
    this.debrisMat = new THREE.MeshLambertMaterial({ color: 0x6b5a48 });
    this.light = new THREE.PointLight(0xff7a1a, 0, 12, 1.6);
    scene.add(this.light);
  }

  sync(viewFloor, revealFn, exploredFn) {
    const s = this.state;
    const grid = s.grid;

    // ---- fire
    const liveFire = new Set();
    let cx = 0, cz = 0, n = 0;
    for (const [key, cell] of s.hazards.fireCells) {
      const tile = grid.getByKey(key);
      if (!tile) continue;
      liveFire.add(key);
      let m = this.fire.get(key);
      if (!m) {
        m = new THREE.Mesh(this.fireGeo, this.fireMat);
        m.userData.phase = Math.random() * Math.PI * 2; // visual only, never touches the state RNG
        this.scene.add(m);
        this.fire.set(key, m);
      }
      const h = 0.5 + cell.intensity * 1.4;
      m.userData.h = h;
      m.userData.floorY = tile.coord.z * FLOOR_H;
      worldPos(tile.coord, h / 2, m.position);
      m.scale.set(1, h, 1);
      m.visible = tile.coord.z === viewFloor && revealFn(key);
      if (m.visible) { cx += m.position.x; cz += m.position.z; n++; }
    }
    for (const [key, m] of this.fire) if (!liveFire.has(key)) { this.scene.remove(m); this.fire.delete(key); }
    if (n) { this.light.position.set(cx / n, viewFloor * FLOOR_H + 1.6, cz / n); this.light.intensity = 10 + n * 3; }
    else this.light.intensity = 0;

    // ---- smoke
    const liveSmoke = new Set();
    for (const [key, cell] of s.hazards.smokeCells) {
      const tile = grid.getByKey(key);
      if (!tile) continue;
      liveSmoke.add(key);
      let m = this.smoke.get(key);
      if (!m) {
        m = new THREE.Mesh(this.smokeGeo, new THREE.MeshLambertMaterial({ color: 0x4b5160, transparent: true, opacity: 0.4, depthWrite: false }));
        this.scene.add(m);
        this.smoke.set(key, m);
      }
      const h = 0.5 + cell.density * 1.0;
      worldPos(tile.coord, 2.0 - h / 2, m.position); // buoyant: hugs the ceiling
      m.scale.set(1, h, 1);
      m.material.opacity = 0.2 + cell.density * 0.6;
      m.visible = tile.coord.z === viewFloor && revealFn(key);
    }
    for (const [key, m] of this.smoke) if (!liveSmoke.has(key)) { this.scene.remove(m); m.material.dispose(); this.smoke.delete(key); }

    // ---- debris (static once fallen -> shown on explored tiles too)
    const liveDebris = new Set();
    for (const [key, tile] of grid.tiles) {
      if (!tile.debris) continue;
      liveDebris.add(key);
      let m = this.debris.get(key);
      if (!m) {
        m = new THREE.Mesh(this.debrisGeo, this.debrisMat);
        const h = key.split(',').reduce((a, v) => a + Number(v) * 7, 0);
        m.rotation.y = (h % 17) / 17 * Math.PI;
        this.scene.add(m);
        this.debris.set(key, m);
      }
      worldPos(tile.coord, 0.22, m.position);
      m.visible = tile.coord.z === viewFloor && exploredFn(key);
    }
    for (const [key, m] of this.debris) if (!liveDebris.has(key)) { this.scene.remove(m); this.debris.delete(key); }
  }

  update(ts) {
    for (const m of this.fire.values()) {
      if (!m.visible) continue;
      const h = m.userData.h * (0.85 + 0.15 * Math.sin(ts / 110 + m.userData.phase));
      m.scale.y = h;
      m.position.y = m.userData.floorY + h / 2;
    }
    if (this.light.intensity > 0) this.light.intensity *= 0.98 + 0.04 * Math.random();
  }

  dispose() {
    for (const m of this.fire.values()) this.scene.remove(m);
    for (const m of this.smoke.values()) { this.scene.remove(m); m.material.dispose(); }
    for (const m of this.debris.values()) this.scene.remove(m);
    this.fire.clear(); this.smoke.clear(); this.debris.clear();
    this.scene.remove(this.light);
    for (const g of [this.fireGeo, this.smokeGeo, this.debrisGeo]) g.dispose();
    this.fireMat.dispose(); this.debrisMat.dispose();
  }
}