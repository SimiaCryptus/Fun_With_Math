import { VOXEL } from '../../world/voxel.js';
import { turnAround } from '../pathing.js';

const BUILD_TIME = 0.5; // seconds per plank
const BRICKS = 12;

/**
 * Builds a diagonal staircase forward and upward, one plank at a time, then steps onto it.
 * Stops when it runs out of planks, when the stair meets existing terrain (walks on), or
 * when something blocks the next plank (turns around, Lemmings-style).
 */
export const BuilderRole = Object.freeze({
  name: 'builder',
  label: 'Builder',
  color: 0xf0d040,

  start(troop) {
    troop.roleData = { bricks: BRICKS, placed: 0, timer: 0 };
  },

  update(troop, dt, sim) {
    const d = troop.roleData;
    const { dx, dz } = troop.facing;
    const c = troop.cell;
    const world = sim.world;
    const brick = { x: c.x + dx, y: c.y, z: c.z + dz };
    const stand = { x: brick.x, y: brick.y + 1, z: brick.z };

    if (!world.inBounds(brick.x, brick.y, brick.z) ||
        world.isSolid(brick.x, brick.y, brick.z) ||
        world.isSolid(stand.x, stand.y, stand.z) ||
        sim.isBlocked(stand)) {
      troop.clearRole(sim);
      troop.dir = turnAround(troop.dir);
      return true;
    }

    // Stair has reached ground that's already walkable: the job is done, march on.
    if (d.placed > 0 && world.isSolid(brick.x, brick.y - 1, brick.z)) {
      troop.clearRole(sim);
      return true;
    }

    d.timer += dt;
    if (d.timer < BUILD_TIME) return true;
    d.timer = 0;

    sim.placeVoxel(brick, VOXEL.PLANK);
    d.placed++;
    d.bricks--;
    troop.setTarget(stand, troop.speed);
    if (d.bricks <= 0) troop.clearRole(sim);
    return true;
  },
});