import * as THREE from 'three';
import { MINED } from '../game/Grid.js';
import { cellCenter } from '../render/layout.js';

const SPEED = 3.2;
const LOOK = 0.0022;
const HALF = { x: 0.28, y: 0.4, z: 0.28 };
const EYE_OFFSET = 0.25; // eye sits above the AABB centre

/** First-person "Minecraft" view: pointer lock, WASD + Space/Shift, AABB collision vs solid blocks and steel. */
export class MinerController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.grid = null;
    this.enabled = false;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.onExit = null;
    this.next = new THREE.Vector3();

    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('keydown', (e) => this.enabled && this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('pointerlockchange', () => {
      if (this.enabled && document.pointerLockElement !== this.canvas) this.onExit?.();
    });
  }

  /** Nearest-to-centre mined cell (prefers headroom) as an eye position, or null if no pocket exists. */
  findSpawn(grid) {
    let best = null;
    let bestScore = Infinity;
    const cx = grid.width / 2;
    const cz = grid.depth / 2;
    for (let i = 0; i < grid.cellCount; i++) {
      if (grid.state[i] !== MINED) continue;
      const y = grid.y(i);
      const above = y + 1 < grid.height ? i + grid.layerSize : -1;
      const headroom = above < 0 || !grid.isSolid(above);
      const dx = grid.x(i) + 0.5 - cx;
      const dz = grid.z(i) + 0.5 - cz;
      const score = (headroom ? 0 : 1000) + dx * dx + dz * dz + y * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === null) return null;
    const pos = cellCenter(grid, best, new THREE.Vector3());
    pos.y += 0.2;
    return pos;
  }

  enter(position, grid) {
    this.grid = grid;
    this.enabled = true;
    this.keys.clear();
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.max(-1.5, Math.min(1.5, Math.asin(dir.y)));
    this.camera.position.copy(position);
    this.applyRotation();
    this.canvas.requestPointerLock?.();
  }

  exit() {
    this.enabled = false;
    this.keys.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  applyRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  onMouseMove(e) {
    if (!this.enabled || document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * LOOK;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * LOOK));
    this.applyRotation();
  }

  free(p) {
    const { grid } = this;
    const cy0 = p.y - EYE_OFFSET;
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sy = -1; sy <= 1; sy += 2) {
        for (let sz = -1; sz <= 1; sz += 2) {
          const x = p.x + sx * HALF.x;
          const y = cy0 + sy * HALF.y;
          const z = p.z + sz * HALF.z;
          const cx = Math.floor(x + grid.width / 2);
          const cyy = Math.floor(y);
          const cz = Math.floor(z + grid.depth / 2);
          if (!grid.inBounds(cx, cyy, cz)) return false; // steel floor/ceiling/walls
          if (grid.isSolid(grid.index(cx, cyy, cz))) return false;
        }
      }
    }
    return true;
  }

  update(dt) {
    if (!this.enabled || !this.grid) return;
    const k = this.keys;
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const up = (k.has('Space') ? 1 : 0) - (k.has('ShiftLeft') || k.has('ControlLeft') ? 1 : 0);
    if (!fwd && !side && !up) return;

    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let mx = -sy * fwd + cy * side;
    let mz = -cy * fwd - sy * side;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len;
    mz /= len;
    const step = SPEED * dt;
    const pos = this.camera.position;

    this.next.copy(pos);
    this.next.x += mx * step;
    if (this.free(this.next)) pos.x = this.next.x; else this.next.x = pos.x;
    this.next.z += mz * step;
    if (this.free(this.next)) pos.z = this.next.z; else this.next.z = pos.z;
    this.next.y += up * step;
    if (this.free(this.next)) pos.y = this.next.y;
  }
}