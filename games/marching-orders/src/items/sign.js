import { DIRS, turnAround, turnLeft, turnRight } from '../units/pathing.js';

const QUARTER = Math.PI / 2;

/**
 * Sign definitions (notes.md). Signs are player-placed markers on walkable cells that shape the
 * flow of the column. Directional signs have a facing; troops marching the opposite way see the
 * reflected effect, so a path that bends one way out also bends correctly on the way back:
 *   turn left  <->  turn right
 *   fan out    <->  funnel (divert) of radius 1
 *   divert     <->  fan out
 * `arrows` are rendering hints in the sign's local frame: yaw in radians (+ = left) and a
 * lateral offset `ox` (+ = left).
 */
export const SIGNS = Object.freeze({
  blocker: {
    name: 'blocker', label: 'Blocker Sign', color: 0xe04848, directional: false, bar: true, arrows: [],
    describe: 'troops that bump into it turn around',
  },
  turnLeft: {
    name: 'turnLeft', label: 'Turn Left Sign', color: 0x4ad0c0, directional: true,
    arrows: [{ yaw: QUARTER }],
    describe: 'the column turns left (right when marching back)',
  },
  turnRight: {
    name: 'turnRight', label: 'Turn Right Sign', color: 0x3f8fe0, directional: true,
    arrows: [{ yaw: -QUARTER }],
    describe: 'the column turns right (left when marching back)',
  },
  fanOut: {
    name: 'fanOut', label: 'Fan Out Sign', color: 0xc47ae8, directional: true,
    arrows: [{ yaw: 0 }, { yaw: QUARTER / 2, ox: 0.22 }, { yaw: -QUARTER / 2, ox: -0.22 }],
    describe: 'spreads the column over three lanes (funnels it when marching back)',
  },
  divert: {
    name: 'divert', label: 'Divert Sign', color: 0xf0a030, directional: true, radius: 2,
    arrows: [{ yaw: -QUARTER / 2, ox: 0.25 }, { yaw: 0 }, { yaw: QUARTER / 2, ox: -0.25 }],
    describe: 'funnels troops within 2 cells onto this cell (fans out when marching back)',
  },
});

/** A placed sign. `dir` is a DIRS index; `counter` drives the round-robin distributor. */
export class Sign {
  constructor(id, kind, x, y, z, dir) {
    this.id = id;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.z = z;
    this.dir = dir;
    this.counter = 0;
  }

  get def() {
    return SIGNS[this.kind];
  }

  get cell() {
    return { x: this.x, y: this.y, z: this.z };
  }

  rotate() {
    this.dir = turnRight(this.dir);
  }
}

const LEGS = [0, -1, 1]; // straight, one lane left, one lane right

/**
 * Where a single diagonal step (one forward along `fd`, one sideways: -1 = left, +1 = right)
 * from `c` lands, following the same ledge rules as `nextStep`. Null when it is not walkable.
 */
export function diagonalTarget(sim, c, fd, side) {
  const world = sim.world;
  const f = DIRS[fd], r = DIRS[turnRight(fd)];
  const tx = c.x + f.dx + side * r.dx;
  const tz = c.z + f.dz + side * r.dz;
  let target = null;
  if (world.isSolid(tx, c.y, tz)) {
    if (!world.isSolid(tx, c.y + 1, tz)) target = { x: tx, y: c.y + 1, z: tz };
  } else if (world.isSolid(tx, c.y - 1, tz)) {
    target = { x: tx, y: c.y, z: tz };
  } else if (world.isSolid(tx, c.y - 2, tz)) {
    target = { x: tx, y: c.y - 1, z: tz };
  }
  if (!target || sim.isBlocked(target) || sim.guardAt(target)) return null;
  return target;
}

/** Round-robin 3-leg distributor: straight, forward-left, forward-right. */
function distribute(troop, sign, fd, sim) {
  const side = LEGS[sign.counter++ % LEGS.length];
  if (side === 0) return true;
  const target = diagonalTarget(sim, troop.cell, fd, side);
  if (target) troop.setTarget(target, troop.speed);
  return true;
}

/**
 * Funnel: a troop approaching along `fd`, off to the side of the sign's lane and within
 * `radius` cells of it, takes a diagonal step toward the lane. Repeated each cell, this lands the
 * column on the sign's lane before (or as) it passes the sign.
 */
function funnel(troop, sign, fd, radius, sim) {
  const f = DIRS[fd], r = DIRS[turnRight(fd)];
  const dx = troop.cell.x - sign.x, dz = troop.cell.z - sign.z;
  const along = dx * f.dx + dz * f.dz;   // < 0: still approaching the sign's row
  const across = dx * r.dx + dz * r.dz;  // > 0: right of the sign's lane
  if (across === 0 || Math.abs(across) > radius || along < -radius || along > -1) return false;
  if (Math.abs(troop.cell.y - sign.y) > 1) return false;
  const target = diagonalTarget(sim, troop.cell, fd, across > 0 ? -1 : 1);
  if (!target) return false;
  troop.setTarget(target, troop.speed);
  return true;
}

/**
 * Called when a troop finishes a step. Applies the first sign whose rule matches the troop's
 * cell and facing. Returns true when a sign changed the troop's facing or gave it a diagonal step.
 */
export function applySigns(troop, sim) {
  const c = troop.cell;
  for (const sign of sim.signs) {
    const def = SIGNS[sign.kind];
    if (!def.directional) continue;
    const here = sign.x === c.x && sign.y === c.y && sign.z === c.z;
    const sd = sign.dir, back = turnAround(sd);
    switch (sign.kind) {
      case 'turnLeft':
        if (!here) break;
        if (troop.dir === sd) { troop.dir = turnLeft(sd); return true; }
        if (troop.dir === turnRight(sd)) { troop.dir = back; return true; } // reflected: a right turn
        break;
      case 'turnRight':
        if (!here) break;
        if (troop.dir === sd) { troop.dir = turnRight(sd); return true; }
        if (troop.dir === turnLeft(sd)) { troop.dir = back; return true; } // reflected: a left turn
        break;
      case 'fanOut':
        if (here && troop.dir === sd) return distribute(troop, sign, sd, sim);
        if (troop.dir === back && funnel(troop, sign, back, 1, sim)) return true;
        break;
      case 'divert':
        if (troop.dir === sd && funnel(troop, sign, sd, def.radius, sim)) return true;
        if (here && troop.dir === back) return distribute(troop, sign, back, sim);
        break;
      default:
        break;
    }
  }
  return false;
}