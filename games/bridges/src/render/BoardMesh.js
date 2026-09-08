import * as THREE from 'three';
import { triangulate, inset, centroid } from '../geometry/Polygon.js';
import { vertexShader, fragmentShader } from './cellShader.js';

export const BORDER_MODE = { off: 0, anchored: 1, spanning: 2 };

/**
 * The whole board as ONE merged, non-indexed BufferGeometry with per-vertex
 * cell attributes.  Claiming a cell = filling a small attribute range.
 *
 * Every cell is an extruded prism made of an inner top plate, a rim band
 * around it and the side walls.  The `aRim` attribute is 1 on the outer top
 * edge, 0 on the inner plate and fades 1 (top) -> 0 (table) down the walls, so
 * the shader can paint the tile's border in place — no extra layers, no
 * discards, no z-fighting.
 */
export class BoardMesh extends THREE.Mesh {
  constructor(board, theme) {
    const scale = board.scale;
    const height = theme.height * scale;
    const gap = theme.gap * scale;
    const bw = (theme.border ?? 0.1) * scale;
    const outers = board.cells.map(c => inset(c.poly, gap));
    const inners = outers.map(p => {
      const c = centroid(p);
      let r = 0;
      for (const q of p) r = Math.max(r, Math.hypot(q[0] - c[0], q[1] - c[1]));
      return inset(p, Math.min(bw, r * 0.45));
    });
    const tris = inners.map(p => triangulate(p));

    let count = 0;
    for (let i = 0; i < outers.length; i++) count += tris[i].length + outers[i].length * 12;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
    const own = new Float32Array(count), ct = new Float32Array(count);
    const cid = new Float32Array(count), st = new Float32Array(count), cc = new Float32Array(count * 2);
    const rm = new Float32Array(count), cn = new Float32Array(count);
    const ranges = new Array(board.cells.length);
    let k = 0;

    board.cells.forEach((c, i) => {
      const start = k, p = outers[i], q = inners[i], n = p.length;
      const put = (x, y, z, nx, ny, nz, rim) => {
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
        own[k] = -1; ct[k] = -100; cid[k] = c.id; st[k] = 0;
        cc[k * 2] = c.centroid[0]; cc[k * 2 + 1] = c.centroid[1];
        rm[k] = rim; cn[k] = 0;
        k++;
      };
      // 2D y -> 3D -z keeps CCW winding facing +y
      const top = (pt, rim) => put(pt[0], height, -pt[1], 0, 1, 0, rim);
      // inner plate
      for (const idx of tris[i]) top(q[idx], 0);
      // rim band between the cell outline and the inner plate
      for (let e = 0; e < n; e++) {
        const a = p[e], b = p[(e + 1) % n], a2 = q[e], b2 = q[(e + 1) % n];
        top(a, 1); top(b, 1); top(b2, 0);
        top(a, 1); top(b2, 0); top(a2, 0);
      }
      // side walls: rim fades from 1 at the top edge to 0 at the table
      for (let e = 0; e < n; e++) {
        const a = p[e], b = p[(e + 1) % n];
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const nx = dy / l, nz = dx / l;
        const wall = (pt, y, rim) => put(pt[0], y, -pt[1], nx, 0, nz, rim);
        wall(a, 0, 0); wall(b, 0, 0); wall(b, height, 1);
        wall(a, 0, 0); wall(b, height, 1); wall(a, height, 1);
      }
      ranges[i] = [start, k - start];
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('aOwner', new THREE.BufferAttribute(own, 1));
    geo.setAttribute('aClaimTime', new THREE.BufferAttribute(ct, 1));
    geo.setAttribute('aCellId', new THREE.BufferAttribute(cid, 1));
    geo.setAttribute('aState', new THREE.BufferAttribute(st, 1));
    geo.setAttribute('aCellCenter', new THREE.BufferAttribute(cc, 2));
    geo.setAttribute('aRim', new THREE.BufferAttribute(rm, 1));
    geo.setAttribute('aConn', new THREE.BufferAttribute(cn, 1));

    const palette = [theme.empty, ...theme.players].slice(0, 4);
    while (palette.length < 4) palette.push('#888888');
    const mat = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uRise: { value: 0.35 * height },
        uScale: { value: scale },
        uAnim: { value: 1 },
        uBorderMode: { value: BORDER_MODE.anchored },
        uLastClaimCenter: { value: new THREE.Vector2(1e9, 1e9) },
        uLastClaimTime: { value: -1000 },
        uHoverCell: { value: -1 },
        uPalette: { value: palette.map(c => new THREE.Color(c)) },
        uLightDir: { value: new THREE.Vector3(0.5, 1, 0.6).normalize() },
      },
    });
    super(geo, mat);
    this.board = board;
    this.ranges = ranges;
    this.height = height;
    this.boardScale = scale; // `scale` is Object3D's read-only Vector3 — don't shadow it
    this.frustumCulled = false;
    this.attrs = {
      owner: geo.getAttribute('aOwner'),
      claim: geo.getAttribute('aClaimTime'),
      state: geo.getAttribute('aState'),
      conn: geo.getAttribute('aConn'),
    };
  }

  /** Display settings that live on the GPU: border paint mode, animation gate. */
  setDisplay(display) {
    this.material.uniforms.uBorderMode.value = BORDER_MODE[display.borders] ?? BORDER_MODE.anchored;
    this.material.uniforms.uAnim.value = display.animations === false ? 0 : 1;
  }

  setCell(id, owner, time) {
    const [s, n] = this.ranges[id];
    this.attrs.owner.array.fill(owner, s, s + n);
    this.attrs.claim.array.fill(time, s, s + n);
    this.attrs.owner.needsUpdate = true;
    this.attrs.claim.needsUpdate = true;
  }

  setStates(fn) {
    for (let i = 0; i < this.ranges.length; i++) {
      const [s, n] = this.ranges[i];
      this.attrs.state.array.fill(fn(i), s, s + n);
    }
    this.attrs.state.needsUpdate = true;
  }

  /** counts[i] = how many owned border arcs cell i's group reaches (0/1/2). */
  setConnections(counts) {
    for (let i = 0; i < this.ranges.length; i++) {
      const [s, n] = this.ranges[i];
      this.attrs.conn.array.fill(counts[i] ?? 0, s, s + n);
    }
    this.attrs.conn.needsUpdate = true;
  }

  /** Rebuild all per-cell attributes from a game (undo / replay / load). */
  syncFrom(game) {
    for (let i = 0; i < this.ranges.length; i++) {
      const [s, n] = this.ranges[i];
      this.attrs.owner.array.fill(game.owner[i], s, s + n);
      this.attrs.claim.array.fill(-100, s, s + n); // already settled
    }
    this.attrs.owner.needsUpdate = true;
    this.attrs.claim.needsUpdate = true;
    this.material.uniforms.uLastClaimTime.value = -1000;
    this.setConnections(game.connectionCounts());
    this.applyPhase(game);
  }

  applyPhase(game) {
     if (game.phase === 'won' || game.phase === 'timeout') {
      const win = new Uint8Array(this.ranges.length);
      for (const c of game.winningCells) win[c] = 1;
      this.setStates(i => (win[i] ? 1 : game.owner[i] >= 0 ? 2 : 0));
    } else {
      this.setStates(() => 0);
    }
  }

  setHover(id) { this.material.uniforms.uHoverCell.value = id; }
  setLastClaim(center, time) {
    this.material.uniforms.uLastClaimCenter.value.set(center[0], center[1]);
    this.material.uniforms.uLastClaimTime.value = time;
  }
  update(time) { this.material.uniforms.uTime.value = time; }
}