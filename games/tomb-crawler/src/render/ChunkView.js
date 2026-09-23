import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { CELL, ITEM, PICKUP, isWalkableType } from '../world/Chunk.js';
import { toWorld } from '../hex/Hex.js';
import { hash32 } from '../core/Rng.js';

const S = CONFIG.CHUNK_SIZE;
const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _col = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// Builds/disposes the instanced meshes for one active chunk.
export class ChunkView {
  constructor(chunk, assets) {
    this.chunk = chunk;
    this.assets = assets;
    this.group = new THREE.Group();
    this.group.name = 'chunk ' + chunk.key;
    this.meshes = [];
    this.coinSlots = new Map();
    this.pickupMeshes = new Map();
    this.builtVersion = -1;
    this.build();
  }

  _inst(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.frustumCulled = false;
    this.group.add(m);
    this.meshes.push(m);
    return m;
  }

  _clear() {
    for (const m of this.meshes) { this.group.remove(m); m.dispose(); }
    for (const p of this.pickupMeshes.values()) this.group.remove(p);
    this.meshes = [];
    this.coinSlots.clear();
    this.pickupMeshes.clear();
  }

  build() {
    this._clear();
    const c = this.chunk, d = c.data, A = this.assets;
    const floors = [], walls = [], cracked = [], coins = [], piles = [];
    const gq = (i) => c.oq + (i % S), gr = (i) => c.or + ((i / S) | 0);
    for (let i = 0; i < S * S; i++) {
      const t = d.type[i];
      if (isWalkableType(t)) floors.push(i);
      else if (t === CELL.CRACKED) cracked.push(i);
      else walls.push(i);
      if (d.item[i] === ITEM.COIN) coins.push(i);
      else if (d.item[i] === ITEM.PILE) piles.push(i);
      if (d.pickup[i] !== PICKUP.NONE) this._addPickup(i, d.pickup[i]);
    }

    if (floors.length) {
      const m = this._inst(A.floorGeo, A.floorMat, floors.length);
      floors.forEach((i, k) => {
        const [x, z] = toWorld(gq(i), gr(i));
        _m.makeTranslation(x, 0, z);
        m.setMatrixAt(k, _m);
        if (d.type[i] === CELL.RUBBLE) _col.setRGB(0.55, 0.47, 0.4);
        else {
          const v = 0.82 + (hash32(gq(i), gr(i)) / 4294967296) * 0.18;
          _col.setRGB(v, v * 0.97, v * 0.92);
        }
        m.setColorAt(k, _col);
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    const addWalls = (list, mat) => {
      if (!list.length) return;
      const m = this._inst(A.wallGeo, mat, list.length);
      list.forEach((i, k) => {
        const [x, z] = toWorld(gq(i), gr(i));
        const h = hash32(gq(i), gr(i), 7) / 4294967296;
        _pos.set(x, 0, z);
        _quat.identity();
        _scl.set(1, 0.85 + h * 0.4, 1);
        _m.compose(_pos, _quat, _scl);
        m.setMatrixAt(k, _m);
      });
      m.instanceMatrix.needsUpdate = true;
    };
    addWalls(walls, A.wallMat);
    addWalls(cracked, A.crackedMat);

    const addCoins = (list, geo) => {
      if (!list.length) return;
      const m = this._inst(geo, A.coinMat, list.length);
      list.forEach((i, k) => {
        const [x, z] = toWorld(gq(i), gr(i));
        _m.makeTranslation(x, 0.45, z);
        m.setMatrixAt(k, _m);
        this.coinSlots.set(i, { mesh: m, k });
      });
      m.instanceMatrix.needsUpdate = true;
    };
    addCoins(coins, A.coinGeo);
    addCoins(piles, A.pileGeo);

    this.builtVersion = c.typeVersion;
    c.changes.length = 0;
  }

  _addPickup(i, type) {
    const mesh = this.assets.makePickup(type);
    const [x, z] = toWorld(this.chunk.oq + (i % S), this.chunk.or + ((i / S) | 0));
    mesh.position.set(x, 0, z);
    mesh.userData.phase = i * 0.37;
    this.group.add(mesh);
    this.pickupMeshes.set(i, mesh);
  }

  update(time) {
    const c = this.chunk;
    if (!c.data) return;
    if (c.typeVersion !== this.builtVersion) {
      this.build();
    } else if (c.changes.length) {
      for (const i of c.changes) {
        const slot = this.coinSlots.get(i);
        if (slot && c.data.item[i] === ITEM.NONE) {
          slot.mesh.setMatrixAt(slot.k, HIDDEN);
          slot.mesh.instanceMatrix.needsUpdate = true;
          this.coinSlots.delete(i);
        }
        const pm = this.pickupMeshes.get(i);
        if (pm && c.data.pickup[i] === PICKUP.NONE) {
          this.group.remove(pm);
          this.pickupMeshes.delete(i);
        }
      }
      c.changes.length = 0;
    }
    for (const pm of this.pickupMeshes.values()) {
      const inner = pm.userData.inner;
      inner.position.y = 0.45 + Math.sin(time * 2.5 + pm.userData.phase) * 0.08;
      inner.rotation.y = time * 1.5 + pm.userData.phase;
    }
  }

  dispose() {
    this._clear();
    this.group.removeFromParent();
  }
}