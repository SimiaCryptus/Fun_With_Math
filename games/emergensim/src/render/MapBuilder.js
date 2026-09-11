import * as THREE from 'three';

export const TILE = 1;        // 1 world unit = 1 tile (1.5 m)
export const FLOOR_H = 2.6;   // vertical spacing between floors

/** Grid coordinate -> world position (grid x -> world X, grid y -> world Z, floor z -> world Y). */
export function worldPos(c, yOff = 0, out = new THREE.Vector3()) {
  return out.set(c.x * TILE, c.z * FLOOR_H + yOff, c.y * TILE);
}

const KIND = {
  FLOOR:       { size: [TILE, 0.12, TILE], yOff: -0.06, color: 0x2b3542 },
  CONTAINMENT: { size: [TILE, 0.12, TILE], yOff: -0.06, color: 0x2a4f56 },
  DOOR:        { size: [TILE, 0.12, TILE], yOff: -0.06, color: 0x3a3126 },
  EXIT:        { size: [TILE, 0.16, TILE], yOff: -0.04, color: 0x178a5c },
  STAIR:       { size: [TILE, 0.6, TILE],  yOff: 0.3,   color: 0x6f6350 },
  WALL:        { size: [TILE, 2.0, TILE],  yOff: 1.0,   color: 0x4d5a70, shadow: true },
  WINDOW:      { size: [TILE, 2.0, TILE],  yOff: 1.0,   color: 0x7fb6d8, transparent: true, opacity: 0.4 },
};
const CARPET = new THREE.Color(0x3a3450);
const FUEL = new THREE.Color(0x6b3f2a);
const DOOR_COLOR = 0x8a5a2b;
const PLANK_COLOR = 0x5a3b1e;

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

/** Builds instanced static geometry per (tile type, floor) and individual animated door meshes. */
export class MapBuilder {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.floorGroups = new Map();   // z -> Group
    this.instances = new Map();     // key -> { mesh, index, base }
    this.doors = new Map();         // key -> door parts
    this.viewFloor = 0;
    this._dirty = new Set();
    this._tmp = new THREE.Color();
  }

  static baseColor(tile) {
    const c = new THREE.Color((KIND[tile.type] || KIND.FLOOR).color);
    if (tile.type === 'FLOOR') {
      const f = tile.material.flammability;
      if (f >= 0.4) c.copy(CARPET);
      if (f > 0.6) c.lerp(FUEL, 0.5); // fuel-heavy furnishings read as a warmer tone
    }
    return c;
  }

  floorGroup(z) {
    if (!this.floorGroups.has(z)) {
      const g = new THREE.Group();
      g.userData.z = z;
      this.group.add(g);
      this.floorGroups.set(z, g);
    }
    return this.floorGroups.get(z);
  }

  center() {
    const d = this.state.grid.dimensions;
    return new THREE.Vector3(((d.x - 1) * TILE) / 2, 0, ((d.y - 1) * TILE) / 2);
  }

  build() {
    this.clear();
    const groups = new Map();
    for (const tile of this.state.grid.tiles.values()) {
      const k = `${tile.type}|${tile.coord.z}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(tile);
    }
    const m = new THREE.Matrix4();
    for (const [k, tiles] of groups) {
      const type = k.split('|')[0];
      const z = tiles[0].coord.z;
      const kind = KIND[type] || KIND.FLOOR;
      const geo = new THREE.BoxGeometry(...kind.size);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: !!kind.transparent, opacity: kind.opacity ?? 1 });
      const inst = new THREE.InstancedMesh(geo, mat, tiles.length);
      inst.castShadow = !!kind.shadow;
      inst.receiveShadow = true;
      tiles.forEach((tile, i) => {
        const p = worldPos(tile.coord, kind.yOff);
        m.makeTranslation(p.x, p.y, p.z);
        inst.setMatrixAt(i, m);
        const base = MapBuilder.baseColor(tile);
        inst.setColorAt(i, base);
        this.instances.set(tile.key, { mesh: inst, index: i, base });
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.instanceColor.needsUpdate = true;
      this.floorGroup(z).add(inst);
    }
    for (const tile of this.state.grid.tilesOfType('DOOR')) this._buildDoor(tile);
    this.setViewFloor(this.viewFloor);
  }

  _buildDoor(tile) {
    const { x, y, z } = tile.coord;
    const g = this.state.grid;
    const solid = (dx, dy) => { const t = g.get(x + dx, y + dy, z); return !t || t.type === 'WALL' || t.type === 'WINDOW'; };
    // Door slab spans the axis that has walls on both sides.
    const alongX = solid(1, 0) && solid(-1, 0) ? true : !(solid(0, 1) && solid(0, -1));

    const mat = new THREE.MeshLambertMaterial({ color: DOOR_COLOR });
    const plankMat = new THREE.MeshLambertMaterial({ color: PLANK_COLOR });
    const pivot = new THREE.Group(); // hinge at one end; local +X runs along the door
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.9, 0.14), mat);
    slab.position.set(0.47, 0.95, 0);
    slab.castShadow = true;
    pivot.add(slab);
    const planks = new THREE.Group();
    for (const [py, rz] of [[0.6, -0.2], [1.3, 0.2]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 0.26), plankMat);
      p.position.set(0.47, py, 0);
      p.rotation.z = rz;
      planks.add(p);
    }
    pivot.add(planks);
    const lock = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    lock.position.set(0.78, 1.0, 0.12);
    pivot.add(lock);

    const wp = worldPos(tile.coord);
    if (alongX) pivot.position.set(wp.x - 0.47, wp.y, wp.z);
    else { pivot.position.set(wp.x, wp.y, wp.z - 0.47); pivot.rotation.y = -Math.PI / 2; }
    const closedRot = pivot.rotation.y;
    this.floorGroup(z).add(pivot);
    this.doors.set(tile.key, {
      pivot, slab, planks, lock, mat, plankMat, closedRot, targetRot: closedRot,
      base: new THREE.Color(DOOR_COLOR), plankBase: new THREE.Color(PLANK_COLOR),
    });
  }

  setViewFloor(z) {
    this.viewFloor = z;
    for (const [gz, g] of this.floorGroups) g.visible = gz <= z;
  }

  /** Multiply a tile's base colour by a visibility factor with an optional tint callback (fog of war, heat, char). */
  shade(key, factor, tint = null) {
    const c = this._tmp;
    const inst = this.instances.get(key);
    if (inst) {
      c.copy(inst.base);
      if (tint) tint(c);
      c.multiplyScalar(factor);
      inst.mesh.setColorAt(inst.index, c);
      this._dirty.add(inst.mesh);
    }
    const d = this.doors.get(key);
    if (d) {
      c.copy(d.base);
      if (tint) tint(c);
      c.multiplyScalar(factor);
      d.mat.color.copy(c);
      d.plankMat.color.copy(d.plankBase).multiplyScalar(factor);
      d.pivot.visible = factor > 0.07;
    }
  }

  commit() {
    for (const mesh of this._dirty) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this._dirty.clear();
  }

  /** Door swing, barricade planks, lock marker, and a heat glow for doors the player has checked. */
  syncDoors(turn) {
    for (const [key, d] of this.doors) {
      const tile = this.state.grid.getByKey(key);
      const ds = tile && tile.doorState;
      if (!ds) continue;
      d.targetRot = d.closedRot + (ds.isOpen ? Math.PI / 2 : 0);
      d.planks.visible = !!ds.isBarricaded;
      d.lock.visible = !!ds.isLocked && !ds.isOpen;
      const T = ds.temperature ?? 20;
      const recent = ds.lastChecked >= turn - 1;
      const known = ds.lastChecked > -99;
      const glow = T > 45 && (recent || known) ? Math.min(1, (T - 45) / 350) * (recent ? 1 : 0.4) : 0;
      d.mat.emissive.setRGB(glow, glow * 0.22, 0);
    }
  }

  update(dt) {
    const a = Math.min(1, dt * 8);
    for (const d of this.doors.values()) {
      if (Math.abs(d.pivot.rotation.y - d.targetRot) > 0.001) d.pivot.rotation.y += (d.targetRot - d.pivot.rotation.y) * a;
    }
  }

  clear() {
    for (const g of this.floorGroups.values()) { disposeObject(g); this.group.remove(g); }
    this.floorGroups.clear();
    this.instances.clear();
    this.doors.clear();
    this._dirty.clear();
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}