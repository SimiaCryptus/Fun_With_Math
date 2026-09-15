import * as THREE from 'three';
import { CELLS, MAX_CELLS } from '../engine/geometry.js';
import { RED_MAN, RED_KING, BLACK_MAN, BLACK_KING } from '../engine/Board.js';
import { cellWorld } from '../core/constants.js';
import { LatticeView } from './LatticeView.js';

const MAN_PROFILE = [[0, 0], [0.36, 0], [0.41, 0.04], [0.41, 0.15], [0.37, 0.2], [0, 0.2]];
const KING_PROFILE = [
  [0, 0], [0.36, 0], [0.41, 0.04], [0.41, 0.15], [0.37, 0.2], [0.33, 0.2], [0.33, 0.34],
  [0.28, 0.37], [0.30, 0.47], [0.22, 0.42], [0.14, 0.48], [0, 0.44],
];
const lathe = (pts) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 40);

export const PIECE_Y = -0.43; // pieces sit on the bottom face of their cell

export class PieceView {
  constructor(scene) {
    this.manGeo = lathe(MAN_PROFILE);
    this.kingGeo = lathe(KING_PROFILE);
    const mk = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.2 });
    // Kings get their own material so themes can give them an emissive "glow".
    this.mats = { red: mk(0xc93b30), black: mk(0x2b2b32) };
    this.mats.redKing = this.mats.red.clone();
    this.mats.blackKing = this.mats.black.clone();
    this.ghost = 0.2; // brightness of pieces outside the focused level / X-ray set

    this.meshes = {};
    const spec = [[RED_MAN, this.manGeo, 'red'], [RED_KING, this.kingGeo, 'redKing'],
      [BLACK_MAN, this.manGeo, 'black'], [BLACK_KING, this.kingGeo, 'blackKing']];
    for (const [type, geo, mat] of spec) {
      const im = new THREE.InstancedMesh(geo, this.mats[mat], MAX_CELLS);
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData.cells = new Int16Array(MAX_CELLS);
      im.userData.type = type;
      for (let i = 0; i < MAX_CELLS; i++) im.setColorAt(i, new THREE.Color(1, 1, 1));
      im.count = 0;
      scene.add(im);
      this.meshes[type] = im;
    }
    this.board = new Uint8Array(MAX_CELLS);
    this.hidden = new Set();
    this.dirty = true;
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  get pickables() { return Object.values(this.meshes); }
  cellOf(mesh, instanceId) { return mesh.userData.cells[instanceId]; }
  geometryFor(piece) { return piece === RED_KING || piece === BLACK_KING ? this.kingGeo : this.manGeo; }
  materialFor(piece) { return this.meshes[piece]?.material ?? this.mats.red; }

  /** Apply the piece-related parts of a resolved style (see core/themes.js). */
  setStyle(s) {
    for (const [key, color] of [['red', s.redColor], ['black', s.blackColor]]) {
      const man = this.mats[key], king = this.mats[`${key}King`];
      for (const m of [man, king]) {
        m.color.set(color);
        m.roughness = s.pieceRoughness;
        m.metalness = s.pieceMetalness;
      }
      king.emissive.set(s.kingGlowColor);
      king.emissiveIntensity = s.kingGlow * 0.35;
    }
    this.ghost = s.ghostLevel;
    this.dirty = true;
  }

  setBoard(board, hidden) {
    this.board = board;
    if (hidden) this.hidden = hidden;
    this.dirty = true;
  }

  update(view) {
    for (const mesh of this.pickables) mesh.count = 0;
    for (let idx = 0; idx < CELLS; idx++) {
      const p = this.board[idx];
      if (!p || this.hidden.has(idx)) continue;
      const mesh = this.meshes[p];
      const i = mesh.count++;
      mesh.userData.cells[i] = idx;
      cellWorld(idx, view.explode, this._p);
      this._p.y += PIECE_Y + (view.selected === idx ? 0.3 : 0);
      mesh.setMatrixAt(i, this._m.makeTranslation(this._p.x, this._p.y, this._p.z));
      const c = this._c.setScalar(1);
      if (view.selected === idx) c.setRGB(1.9, 1.8, 1.4);
      else if (view.hover === idx) c.setScalar(1.35);
      else if (LatticeView.isGhosted(view, idx)) c.setScalar(this.ghost);
      mesh.setColorAt(i, c);
    }
    for (const mesh of this.pickables) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      // three.js caches an InstancedMesh bounding sphere the first time it renders or
      // raycasts and never refreshes it. Ours was first computed with count = 0 (menu
      // open), giving an empty sphere at the origin, so raycasts only reached instances
      // when the ray passed within ~1 unit of the cube centre. Recompute after every
      // rebuild so picking and frustum culling see the real piece positions.
      mesh.computeBoundingSphere();
    }
    this.dirty = false;
  }
}