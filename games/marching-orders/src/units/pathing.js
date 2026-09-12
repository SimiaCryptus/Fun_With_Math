import { VOXEL, isDiggable, isClimbable } from '../world/voxel.js';

/** Cardinal facings, indexed clockwise (seen from above) from +x. */
export const DIRS = Object.freeze([
  { dx: 1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: -1 },
]);

/** Human-readable names for DIRS entries (used in hints). */
export const DIR_LABELS = Object.freeze(['east (+x)', 'south (+z)', 'west (−x)', 'north (−z)']);

export function dirIndexFromVector(dx, dz) {
  const sx = Math.sign(dx), sz = Math.sign(dz);
  const i = DIRS.findIndex((d) => d.dx === sx && d.dz === sz);
  return i < 0 ? 0 : i;
}

export function turnAround(dirIndex) {
  return (dirIndex + 2) % 4;
}

export function turnRight(dirIndex) {
  return (dirIndex + 1) % 4;
}

export function turnLeft(dirIndex) {
  return (dirIndex + 3) % 4;
}

/** A unit in air cell (x, y, z) is supported by solid ground below or by the ladder it is on. */
export function supported(world, x, y, z) {
  return world.isSolid(x, y - 1, z) || isClimbable(world.get(x, y, z));
}

/**
 * Grid step / fall / turn rules shared by troops and guards (idea.md §2.1).
 * The unit stands in air cell (x, y, z) on top of solid (x, y-1, z) or on a ladder.
 *
 * opts: { canDig, ladders }  — pickaxe available / ladder segments the unit may still place.
 *
 * Returns { action, target } with action one of:
 *   'fall'      — nothing below, drop one cell
 *   'walk'      — move forward on the same level (may walk off an edge)
 *   'stepUp'    — 1-voxel ledge ahead with headroom
 *   'stepDown'  — 1-voxel drop ahead
 *   'climb'     — tall wall ahead and a ladder above: climb one cell
 *   'climbDown' — hanging on a ladder facing away from the wall: descend one cell
 *   'ladder'    — tall wall ahead and the unit can extend a ladder into the cell above
 *   'dig'       — soft wall ahead and the unit can dig
 *   'turn'      — wall taller than one voxel, reverse facing
 */
export function nextStep(world, x, y, z, dirIndex, opts = {}) {
  if (!supported(world, x, y, z)) return { action: 'fall', target: { x, y: y - 1, z } };

  const { dx, dz } = DIRS[dirIndex];
  const tx = x + dx, tz = z + dz;
  const onLadder = isClimbable(world.get(x, y, z));

  if (world.isSolid(tx, y, tz)) {
    if (!world.isSolid(tx, y + 1, tz)) return { action: 'stepUp', target: { x: tx, y: y + 1, z: tz } };
    // The wall is at least two high: climb an existing ladder, extend one, dig, or give up.
    if (isClimbable(world.get(x, y + 1, z))) return { action: 'climb', target: { x, y: y + 1, z } };
    // The wall continues at y+1 (checked above), so a ladder placed here always leans on
    // something solid — troops never build a ladder into the air.
    if ((opts.ladders ?? 0) > 0 && world.inBounds(x, y + 1, z) && world.get(x, y + 1, z) === VOXEL.AIR) {
      return { action: 'ladder', target: { x, y: y + 1, z } };
    }
    if (opts.canDig && isDiggable(world.get(tx, y, tz))) return { action: 'dig', target: { x: tx, y, z: tz } };
    return { action: 'turn', target: null };
  }
  // Hanging on a ladder with nothing ahead (e.g. after turning at the top): climb back down.
  if (onLadder && !world.isSolid(x, y - 1, z) && isClimbable(world.get(x, y - 1, z))) {
    return { action: 'climbDown', target: { x, y: y - 1, z } };
  }
  if (world.isSolid(tx, y - 1, tz)) return { action: 'walk', target: { x: tx, y, z: tz } };
  if (world.isSolid(tx, y - 2, tz)) return { action: 'stepDown', target: { x: tx, y: y - 1, z: tz } };
  return { action: 'walk', target: { x: tx, y, z: tz } }; // walks off the ledge; gravity takes over
}