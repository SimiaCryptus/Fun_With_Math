import * as THREE from 'three';
import { CHUNK_SIZE } from './world.js';
import { voxelInfo, isSolid, isClimbable } from './voxel.js';

// Face table: outward normal, CCW vertex order (viewed from outside), and a flat shade factor.
const FACES = [
  { n: [1, 0, 0],  v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.82 },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.7 },
  { n: [0, 1, 0],  v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1],  v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.78 },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.64 },
];

// Ladders hug each solid side wall: [index of the face pointing at the wall, index of the face to draw].
const LADDER_SIDES = [[0, 1], [1, 0], [4, 5], [5, 4]];
const LADDER_INSET = 0.9;   // distance from the far side of the cell to the ladder plane
const RAIL_WIDTH = 0.14;
const RUNG_HEIGHT = 0.12;
const RUNG_OFFSETS = [0.16, 0.46, 0.76];

/**
 * Builds a culled-face mesh for one chunk using per-vertex colours (no texture atlas
 * needed for the MVP; greedy quad merging is a follow-up optimisation).
 * Ladders (non-solid, climbable) are drawn as rails + rungs against the wall they lean on.
 * Returns null when the chunk has no visible faces.
 */
export function buildChunkGeometry(world, cx, cy, cz) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();

  const x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  const x1 = Math.min(x0 + CHUNK_SIZE, world.w);
  const y1 = Math.min(y0 + CHUNK_SIZE, world.h);
  const z1 = Math.min(z0 + CHUNK_SIZE, world.d);

  // For rendering we want the diorama's outer walls visible, so out-of-bounds counts as air.
  const neighbourSolid = (x, y, z) => world.inBounds(x, y, z) && world.isSolid(x, y, z);

  /** Emit one quad of `face`, scaled by `s` and offset by `o` inside the unit cell at (x, y, z). */
  const pushQuad = (face, x, y, z, s, o, hex, shade) => {
    color.setHex(hex).multiplyScalar(shade);
    const base = positions.length / 3;
    for (const [vx, vy, vz] of face.v) {
      positions.push(x + o[0] + vx * s[0], y + o[1] + vy * s[1], z + o[2] + vz * s[2]);
      normals.push(face.n[0], face.n[1], face.n[2]);
      colors.push(color.r, color.g, color.b);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const pushLadder = (x, y, z, wallIdx, drawIdx, info, checker) => {
    const n = FACES[wallIdx].n;
    const face = FACES[drawIdx];
    const shade = face.shade * checker;
    const along = n[0] !== 0 ? 2 : 0; // in-plane horizontal axis (z for x-walls, x for z-walls)
    const o = [n[0] * LADDER_INSET, 0, n[2] * LADDER_INSET];
    const s = [1, 1, 1];
    // two rails
    s[along] = RAIL_WIDTH;
    for (const off of [0.05, 1 - 0.05 - RAIL_WIDTH]) {
      const oo = [...o];
      oo[along] += off;
      pushQuad(face, x, y, z, s, oo, info.color, shade);
    }
    // rungs
    s[along] = 1;
    s[1] = RUNG_HEIGHT;
    for (const off of RUNG_OFFSETS) {
      pushQuad(face, x, y, z, s, [o[0], off, o[2]], info.color, shade * 1.12);
    }
  };

  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const type = world.get(x, y, z);
        const info = voxelInfo(type);
        const checker = (x + y + z) & 1 ? 1 : 0.92;

        if (isClimbable(type)) {
          let drawn = false;
          for (const [wallIdx, drawIdx] of LADDER_SIDES) {
            const n = FACES[wallIdx].n;
            if (!neighbourSolid(x + n[0], y + n[1], z + n[2])) continue;
            pushLadder(x, y, z, wallIdx, drawIdx, info, checker);
            drawn = true;
          }
          if (!drawn) pushLadder(x, y, z, 5, 4, info, checker); // free-standing (editor-painted): still visible
          continue;
        }
        if (!isSolid(type)) continue;

        for (const face of FACES) {
          if (neighbourSolid(x + face.n[0], y + face.n[1], z + face.n[2])) continue;
          const hex = face.n[1] === 1 && info.top !== undefined ? info.top : info.color;
          pushQuad(face, x, y, z, [1, 1, 1], [0, 0, 0], hex, face.shade * checker);
        }
      }
    }
  }

  if (indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}