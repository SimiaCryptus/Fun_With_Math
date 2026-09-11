import { coordKey, tileOccludes } from './Tile.js';

export const SMOKE_EXTINCTION = 0.65;
export const VISIBILITY_CUTOFF = 0.15;

export function smokeDensityAt(state, key) {
  const c = state.hazards.smokeCells.get(key);
  return c ? c.density : 0;
}

/** Integer 3D Bresenham line from a to b (inclusive). */
export function bresenham3D(a, b) {
  const pts = [];
  let { x, y, z } = a;
  const dx = Math.abs(b.x - x), dy = Math.abs(b.y - y), dz = Math.abs(b.z - z);
  const sx = b.x > x ? 1 : -1, sy = b.y > y ? 1 : -1, sz = b.z > z ? 1 : -1;
  pts.push({ x, y, z });
  if (dx >= dy && dx >= dz) {
    let p1 = 2 * dy - dx, p2 = 2 * dz - dx;
    while (x !== b.x) {
      x += sx;
      if (p1 >= 0) { y += sy; p1 -= 2 * dx; }
      if (p2 >= 0) { z += sz; p2 -= 2 * dx; }
      p1 += 2 * dy; p2 += 2 * dz; pts.push({ x, y, z });
    }
  } else if (dy >= dx && dy >= dz) {
    let p1 = 2 * dx - dy, p2 = 2 * dz - dy;
    while (y !== b.y) {
      y += sy;
      if (p1 >= 0) { x += sx; p1 -= 2 * dy; }
      if (p2 >= 0) { z += sz; p2 -= 2 * dy; }
      p1 += 2 * dx; p2 += 2 * dz; pts.push({ x, y, z });
    }
  } else {
    let p1 = 2 * dy - dz, p2 = 2 * dx - dz;
    while (z !== b.z) {
      z += sz;
      if (p1 >= 0) { y += sy; p1 -= 2 * dz; }
      if (p2 >= 0) { x += sx; p2 -= 2 * dz; }
      p1 += 2 * dy; p2 += 2 * dx; pts.push({ x, y, z });
    }
  }
  return pts;
}

/**
 * Raycast visibility on the origin's floor with smoke attenuation:
 *   V = V0 * Π(1 - α·D_i), terminating when V < 0.15 or an occluder is hit (the occluder itself is seen).
 */
export function computeVisibility(state, origin, radius = 12) {
  const grid = state.grid;
  const visible = new Set([coordKey(origin.x, origin.y, origin.z)]);
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2 || (dx === 0 && dy === 0)) continue;
      const target = { x: origin.x + dx, y: origin.y + dy, z: origin.z };
      if (!grid.get(target.x, target.y, target.z)) continue;
      const line = bresenham3D(origin, target);
      let v = 1;
      for (let i = 1; i < line.length; i++) {
        const c = line[i];
        const key = coordKey(c.x, c.y, c.z);
        const tile = grid.getByKey(key);
        if (!tile) break;
        v *= 1 - SMOKE_EXTINCTION * smokeDensityAt(state, key);
        visible.add(key);
        if (v < VISIBILITY_CUTOFF || tileOccludes(tile)) break;
      }
    }
  }
  return visible;
}

export function hasLineOfSight(state, from, to, maxDist = 14) {
  if (from.z !== to.z) return false;
  const line = bresenham3D(from, to);
  if (line.length - 1 > maxDist) return false;
  let v = 1;
  for (let i = 1; i < line.length; i++) {
    const c = line[i];
    const key = coordKey(c.x, c.y, c.z);
    const tile = state.grid.getByKey(key);
    if (!tile) return false;
    if (i === line.length - 1) return true;
    v *= 1 - SMOKE_EXTINCTION * smokeDensityAt(state, key);
    if (v < VISIBILITY_CUTOFF || tileOccludes(tile)) return false;
  }
  return true;
}