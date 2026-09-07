import * as THREE from 'three';
import { INTACT, MARKED, SCAR, MINE } from '../game/Grid.js';
import { LayeredInstances } from './LayeredInstances.js';
import { getTextures } from './textures.js';

const _c = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);
const SCAR_COLOUR = new THREE.Color(0x4a2020);

function hash01(i) {
  return (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
}

/** Instanced stone / marked / ore blocks. */
export class BlockRenderer {
  constructor(scene, grid) {
    this.grid = grid;
    this.minesRevealed = false;
    const tex = getTextures();
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.markedGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    this.oreGeo = new THREE.BoxGeometry(0.92, 0.92, 0.92);

    this.stone = new LayeredInstances(
      scene, grid, this.boxGeo,
      new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.95, metalness: 0.02 }),
      { shadows: true },
    );
    this.marked = new LayeredInstances(
      scene, grid, this.markedGeo,
      new THREE.MeshStandardMaterial({ map: tex.marked, emissive: 0xff7a1a, emissiveIntensity: 0.35, roughness: 0.9 }),
      { shadows: true },
    );
    this.ore = new LayeredInstances(
      scene, grid, this.oreGeo,
      new THREE.MeshStandardMaterial({ map: tex.ore, emissive: 0xff2020, emissiveIntensity: 0.6, roughness: 0.8 }),
    );
  }

  syncCell(i) {
    const s = this.grid.state[i];
    const isMine = this.grid.content[i] === MINE;
    if (s === INTACT && !(this.minesRevealed && isMine)) {
      _c.setScalar(0.8 + 0.2 * hash01(i));
      this.stone.set(i, 1, _c);
    } else {
      this.stone.hide(i);
    }
    if (s === MARKED) this.marked.set(i, 1, WHITE);
    else this.marked.hide(i);
    if (s === SCAR) this.ore.set(i, 0.9, SCAR_COLOUR);
    else if (this.minesRevealed && isMine && s === INTACT) this.ore.set(i, 0.9, WHITE);
    else this.ore.hide(i);
  }

  syncAll() {
    for (let i = 0; i < this.grid.cellCount; i++) this.syncCell(i);
  }

  revealMines() {
    this.minesRevealed = true;
    this.syncAll();
  }

  setLayerFocus(layer) {
    this.stone.setLayerFocus(layer);
    this.marked.setLayerFocus(layer);
    this.ore.setLayerFocus(layer);
  }

  setXray(on) {
    this.stone.setGlobalFactor(on ? 0.28 : 1);
    this.marked.setGlobalFactor(on ? 0.4 : 1);
  }

  dispose() {
    this.stone.dispose();
    this.marked.dispose();
    this.ore.dispose();
    this.boxGeo.dispose();
    this.markedGeo.dispose();
    this.oreGeo.dispose();
  }
}