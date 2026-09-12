import { DIRS, nextStep, turnAround, supported } from './pathing.js';
import { VOXEL, isLethal } from '../world/voxel.js';
import { applySigns } from '../items/sign.js';

export const TROOP_STATE = Object.freeze({
  WALKING: 'walking',
  FALLING: 'falling',
  CLIMBING: 'climbing',
  DIGGING: 'digging',
  BUILDING: 'building', // placing a ladder segment
  FIGHTING: 'fighting',
  SHOOTING: 'shooting',
  WORKING: 'working', // executing a role (builder, ...)
  DEAD: 'dead',
  SAVED: 'saved',
});

const FALL_SPEED = 7; // voxels per second
const DIG_TIME = 0.6; // seconds per soft voxel
const LADDER_TIME = 0.7; // seconds per ladder segment
const CLIMB_SPEED = 0.8; // fraction of walking speed

/**
 * Base troop: a brawler that marches, turns, steps and falls. Equipment (crates) and
 * roles mutate its stats / behaviour; signs on the ground steer it. Movement is cell-to-cell
 * with interpolation so the simulation stays on the grid while rendering is smooth.
 */
export class Troop {
  constructor(id, x, y, z, dir) {
    this.id = id;
    this.cell = { x, y, z };
    this.pos = { x: x + 0.5, y, z: z + 0.5 }; // feet position at the centre of the cell floor
    this.dir = dir;
    this.target = null;
    this.moveSpeed = 0;
    this.state = TROOP_STATE.WALKING;

    // §2.2 stats
    this.maxHp = 10;
    this.hp = 10;
    this.armor = 0;
    this.speed = 2.5;
    this.attack = 2;
    this.range = 1;
    this.attackCooldown = 0.8;
    this.morale = 100;
    this.attackTimer = 0;

    // equipment
    this.equipment = null;
    this.canDig = false;
    this.digUses = 0;
    this.digTimer = 0;
    this.ladders = 0;

    // role
    this.role = null;
    this.roleData = null;

    this.fallDistance = 0;
    this.flash = 0;
  }

  get alive() {
    return this.state !== TROOP_STATE.DEAD && this.state !== TROOP_STATE.SAVED;
  }

  get facing() {
    return DIRS[this.dir];
  }

  snapToCell() {
    this.pos.x = this.cell.x + 0.5;
    this.pos.y = this.cell.y;
    this.pos.z = this.cell.z + 0.5;
  }

  update(dt, sim) {
    if (!this.alive) return;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.attackTimer > 0) this.attackTimer -= dt;

    if (this.target) {
      this.advance(dt, sim);
      return;
    }

    // Standing in a cell: gravity always wins first (a ladder counts as support).
    if (!supported(sim.world, this.cell.x, this.cell.y, this.cell.z)) {
      this.beginFall(sim);
      return;
    }
    if (this.role && this.role.update(this, dt, sim)) return;
    if (this.tryCombat(dt, sim)) return;
    this.decideStep(dt, sim);
  }

  // ---- movement -----------------------------------------------------------------

  setTarget(cell, speed) {
    this.target = cell;
    this.moveSpeed = speed;
    this.digTimer = 0;
  }

  beginFall(sim) {
    if (this.role) this.clearRole(sim);
    this.state = TROOP_STATE.FALLING;
    this.setTarget({ x: this.cell.x, y: this.cell.y - 1, z: this.cell.z }, FALL_SPEED);
  }

  advance(dt, sim) {
    const tx = this.target.x + 0.5, ty = this.target.y, tz = this.target.z + 0.5;
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    const step = this.moveSpeed * dt;
    if (step >= dist) {
      this.arrive(sim);
    } else {
      const k = step / dist;
      this.pos.x += dx * k;
      this.pos.y += dy * k;
      this.pos.z += dz * k;
    }
  }

  arrive(sim) {
    const wasFalling = this.state === TROOP_STATE.FALLING;
    if (wasFalling) this.fallDistance++;
    this.cell = this.target;
    this.target = null;
    this.snapToCell();

    const world = sim.world;
    const { x, y, z } = this.cell;
    const below = world.get(x, y - 1, z);
    if (isLethal(below)) { this.die(sim, 'hazard'); return; }
    if (!supported(world, x, y, z)) return; // still airborne, next tick keeps falling

    if (wasFalling) {
      if (this.fallDistance > sim.lethalFall) { this.die(sim, 'fall'); return; }
      sim.events.push({ type: 'land', pos: { ...this.pos } });
      this.state = TROOP_STATE.WALKING;
    }
    this.fallDistance = 0;

    if (sim.inObjective(this.cell)) {
      this.state = TROOP_STATE.SAVED;
      if (this.role) this.clearRole(sim);
      sim.troopReachedObjective(this);
      return;
    }
    sim.tryPickupCrate(this);
    // Signs steer the column; a troop busy with a role ignores them.
    if (!this.role) applySigns(this, sim);
  }

  decideStep(dt, sim) {
    const c = this.cell;
    const step = nextStep(sim.world, c.x, c.y, c.z, this.dir, {
      canDig: this.canDig && this.digUses > 0,
      ladders: this.ladders,
    });
    switch (step.action) {
      case 'fall':
        this.beginFall(sim);
        break;
      case 'turn':
        this.dir = turnAround(this.dir);
        this.state = TROOP_STATE.WALKING;
        this.digTimer = 0;
        break;
      case 'dig':
        this.state = TROOP_STATE.DIGGING;
        this.digTimer += dt;
        if (this.digTimer >= DIG_TIME) {
          this.digTimer = 0;
          sim.digVoxel(step.target);
          if (--this.digUses <= 0) {
            this.canDig = false;
            this.equipment = null; // pickaxe worn out
          }
        }
        break;
      case 'climb':
      case 'climbDown':
        this.state = TROOP_STATE.CLIMBING;
        this.setTarget(step.target, this.speed * CLIMB_SPEED);
        break;
      case 'ladder':
        this.state = TROOP_STATE.BUILDING;
        this.digTimer += dt;
        if (this.digTimer >= LADDER_TIME) {
          this.digTimer = 0;
          sim.placeVoxel(step.target, VOXEL.LADDER);
          if (sim.world.get(c.x, c.y, c.z) === VOXEL.AIR) sim.placeVoxel(c, VOXEL.LADDER); // foot of the ladder
          if (--this.ladders <= 0) {
            this.ladders = 0;
            this.equipment = null; // ladder kit used up
          }
        }
        break;
      default: // walk / stepUp / stepDown
        if (sim.isBlocked(step.target) || sim.guardAt(step.target)) {
          this.dir = turnAround(this.dir);
          break;
        }
        this.state = TROOP_STATE.WALKING;
        this.setTarget(step.target, this.speed);
    }
  }

  // ---- combat -------------------------------------------------------------------

  /** Returns true when the troop is busy fighting this tick. */
  tryCombat(dt, sim) {
    const guard = sim.findGuardInRange(this);
    if (!guard) {
      if (this.state === TROOP_STATE.FIGHTING || this.state === TROOP_STATE.SHOOTING) this.state = TROOP_STATE.WALKING;
      return false;
    }
    const ranged = this.range > 1;
    this.state = ranged ? TROOP_STATE.SHOOTING : TROOP_STATE.FIGHTING;
    if (this.attackTimer <= 0) {
      this.attackTimer = this.attackCooldown;
      sim.damageGuard(guard, this.attack, this);
      if (ranged) {
        sim.events.push({
          type: 'tracer',
          from: { x: this.pos.x, y: this.pos.y + 0.7, z: this.pos.z },
          to: { x: guard.pos.x, y: guard.pos.y + 0.8, z: guard.pos.z },
        });
      }
    }
    return true;
  }

  takeDamage(amount, sim) {
    const dmg = Math.max(1, amount - this.armor);
    this.hp -= dmg;
    this.flash = 1;
    sim.events.push({ type: 'hit', pos: { x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z } });
    if (this.hp <= 0) this.die(sim, 'combat');
  }

  die(sim, cause) {
    if (!this.alive) return;
    this.state = TROOP_STATE.DEAD;
    if (this.role) this.clearRole(sim);
    sim.onTroopDied(this, cause);
  }

  // ---- roles --------------------------------------------------------------------

  setRole(role, sim) {
    if (this.role) this.clearRole(sim);
    this.role = role;
    this.roleData = {};
    this.state = TROOP_STATE.WORKING;
    role.start(this, sim);
  }

  clearRole(sim) {
    const role = this.role;
    this.role = null;
    this.roleData = null;
    if (role && role.stop) role.stop(this, sim);
    if (this.alive && this.state === TROOP_STATE.WORKING) this.state = TROOP_STATE.WALKING;
  }
}