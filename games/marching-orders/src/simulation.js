import { Troop, TROOP_STATE } from './units/troop.js';
import { Guard } from './units/guard.js';
import { Crate } from './items/crate.js';
import { EQUIPMENT } from './items/equipment.js';
import { Sign, SIGNS } from './items/sign.js';
import { ROLES } from './units/roles/index.js';
import { dirIndexFromVector } from './units/pathing.js';
import { VOXEL } from './world/voxel.js';

export const GAME_STATUS = Object.freeze({ PLAYING: 'playing', WON: 'won', LOST: 'lost' });

const center = (c) => ({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 });

/**
 * Deterministic game state: troops, guards, crates, signs, projectiles, budgets and the objective.
 * No randomness is used here so replays / level validation stay reproducible.
 */
export class Simulation {
  constructor(world, level) {
    this.world = world;
    this.level = level;
    this.time = 0;
    this.status = GAME_STATUS.PLAYING;
    this.loseReason = '';
    this.events = [];
    this.nextId = 1;

    this.troops = [];
    this.guards = [];
    this.crates = [];
    this.signs = [];
    this.projectiles = [];

    const sp = level.spawn;
    this.spawn = {
      x: sp.pos[0], y: sp.pos[1], z: sp.pos[2],
      dir: dirIndexFromVector(sp.dir[0], sp.dir[1]),
      rate: sp.rate ?? 1.5,
    };
    this.pool = sp.count;
    this.spawnTimer = 0.5;

    this.objective = level.objective;
    this.saved = 0;
    this.lost = 0;
    this.lethalFall = level.lethalFall ?? 4;
    this.timeLimit = level.timeLimit ?? 0;

    this.budget = {
      crates: { ...(level.budget?.crates || {}) },
      signs: { ...(level.budget?.signs || {}) },
      roles: { ...(level.budget?.roles || {}) },
    };

    for (const g of level.guards || []) {
      const dir = g.dir ? dirIndexFromVector(g.dir[0], g.dir[1]) : 2;
      this.guards.push(new Guard(this.nextId++, g.type, g.pos[0], g.pos[1], g.pos[2], dir));
    }
  }

  // ---- main step ------------------------------------------------------------

  step(dt) {
    if (this.status !== GAME_STATUS.PLAYING) return;
    this.time += dt;

    if (this.pool > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTroop();
        this.spawnTimer += this.spawn.rate;
      }
    }

    for (const t of this.troops) t.update(dt, this);
    for (const g of this.guards) g.update(dt, this);
    this.updateProjectiles(dt);

    this.troops = this.troops.filter((t) => t.alive);
    this.guards = this.guards.filter((g) => g.alive);
    this.crates = this.crates.filter((c) => !c.depleted);

    this.checkEnd();
  }

  spawnTroop() {
    const s = this.spawn;
    const troop = new Troop(this.nextId++, s.x, s.y, s.z, s.dir);
    this.troops.push(troop);
    this.pool--;
    this.events.push({ type: 'spawn', pos: { ...troop.pos } });
  }

  // ---- spatial queries -------------------------------------------------------

  /** A cell troops refuse to walk into (they turn around instead): a Blocker sign. */
  isBlocked(c) {
    const sign = this.signAt(c);
    return !!sign && sign.kind === 'blocker';
  }

  troopAt(c) {
    for (const t of this.troops) {
      if (t.alive && t.cell.x === c.x && t.cell.y === c.y && t.cell.z === c.z) return t;
    }
    return null;
  }

  guardAt(c) {
    for (const g of this.guards) {
      if (g.alive && g.cell.x === c.x && g.cell.y === c.y && g.cell.z === c.z) return g;
    }
    return null;
  }

  crateAt(c) {
    for (const cr of this.crates) {
      if (!cr.depleted && cr.x === c.x && cr.y === c.y && cr.z === c.z) return cr;
    }
    return null;
  }

  signAt(c) {
    for (const s of this.signs) {
      if (s.x === c.x && s.y === c.y && s.z === c.z) return s;
    }
    return null;
  }

  signById(id) {
    return this.signs.find((s) => s.id === id) || null;
  }

  /**
   * Nearest guard a troop can hit: adjacent for melee; anything within range and line of sight
   * for ranged troops (so riflemen return fire on turrets shooting at them from any side).
   */
  findGuardInRange(troop) {
    const c = troop.cell;
    let best = null;
    let bestDist = Infinity;
    for (const g of this.guards) {
      if (!g.alive) continue;
      const dx = g.cell.x - c.x, dy = g.cell.y - c.y, dz = g.cell.z - c.z;
      const manhattan = Math.abs(dx) + Math.abs(dz);
      let dist;
      if (manhattan <= 1 && Math.abs(dy) <= 1) {
        dist = manhattan;
      } else if (troop.range > 1) {
        dist = Math.hypot(dx, dy, dz);
        if (dist > troop.range) continue;
        if (dist >= bestDist) continue;
        if (!this.hasLOS(c, g.cell)) continue;
      } else {
        continue;
      }
      if (dist < bestDist) { bestDist = dist; best = g; }
    }
    return best;
  }

  findTroopNear(guard, reach) {
    for (const t of this.troops) {
      if (!t.alive) continue;
      if (Math.abs(t.cell.x - guard.cell.x) <= reach &&
          Math.abs(t.cell.z - guard.cell.z) <= reach &&
          Math.abs(t.cell.y - guard.cell.y) <= 1) return t;
    }
    return null;
  }

  /** Nearest troop a ranged guard can see within [minRange, range]. */
  findTroopInRange(guard, range, minRange = 0) {
    let best = null;
    let bestDist = Infinity;
    for (const t of this.troops) {
      if (!t.alive) continue;
      const dx = t.cell.x - guard.cell.x, dy = t.cell.y - guard.cell.y, dz = t.cell.z - guard.cell.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > range || dist < minRange || dist >= bestDist) continue;
      if (!this.hasLOS(guard.cell, t.cell)) continue;
      best = t;
      bestDist = dist;
    }
    return best;
  }

  hasLOS(a, b) {
    const ax = a.x + 0.5, ay = a.y + 0.7, az = a.z + 0.5;
    const bx = b.x + 0.5, by = b.y + 0.7, bz = b.z + 0.5;
    const dist = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(1, Math.ceil(dist * 4));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const px = Math.floor(ax + (bx - ax) * t);
      const py = Math.floor(ay + (by - ay) * t);
      const pz = Math.floor(az + (bz - az) * t);
      // The blocks either unit stands on never occlude (a turret on a parapet can shoot down it).
      if (px === a.x && pz === a.z && py <= a.y) continue;
      if (px === b.x && pz === b.z && py <= b.y) continue;
      if (this.world.isSolid(px, py, pz)) return false;
    }
    return true;
  }

  inObjective(c) {
    const o = this.objective;
    if (!o || o.type !== 'reach') return false;
    return c.x >= o.from[0] && c.x <= o.to[0] &&
           c.y >= o.from[1] && c.y <= o.to[1] &&
           c.z >= o.from[2] && c.z <= o.to[2];
  }

  // ---- world edits ------------------------------------------------------------

  digVoxel(c) {
    if (this.world.set(c.x, c.y, c.z, VOXEL.AIR)) this.events.push({ type: 'dig', pos: center(c) });
  }

  placeVoxel(c, type) {
    if (this.world.set(c.x, c.y, c.z, type)) this.events.push({ type: 'build', pos: center(c) });
  }

  // ---- projectiles --------------------------------------------------------------

  /** A grenadier lobs a grenade on a parabolic arc; it explodes on arrival (idea.md §6 Physics). */
  throwGrenade(guard, targetCell) {
    const from = { x: guard.pos.x, y: guard.pos.y + (guard.def.muzzle ?? 1), z: guard.pos.z };
    const to = { x: targetCell.x + 0.5, y: targetCell.y, z: targetCell.z + 0.5 };
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    this.projectiles.push({
      id: this.nextId++,
      kind: 'grenade',
      from,
      to,
      t: 0,
      duration: 0.4 + dist * 0.1,
      height: 1 + dist * 0.2,
      damage: guard.def.rangedAttack ?? guard.attack,
      radius: guard.def.splash ?? 1,
      pos: { ...from },
    });
  }

  updateProjectiles(dt) {
    if (!this.projectiles.length) return;
    for (const p of this.projectiles) {
      p.t += dt;
      const k = Math.min(1, p.t / p.duration);
      p.pos.x = p.from.x + (p.to.x - p.from.x) * k;
      p.pos.z = p.from.z + (p.to.z - p.from.z) * k;
      p.pos.y = p.from.y + (p.to.y - p.from.y) * k + p.height * 4 * k * (1 - k);
      if (k >= 1) {
        p.done = true;
        this.explode(p.to, p.damage, p.radius);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  /** Area-of-effect damage to every troop within `radius` (horizontal) of `pos`. */
  explode(pos, damage, radius) {
    this.events.push({ type: 'explosion', pos: { ...pos } });
    for (const t of [...this.troops]) {
      if (!t.alive) continue;
      if (Math.abs(t.pos.y - pos.y) > 1.5) continue;
      if (Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z) > radius) continue;
      t.takeDamage(damage, this);
    }
  }

  // ---- combat & objective callbacks ----------------------------------------------

  damageGuard(guard, amount) {
    guard.takeDamage(amount);
    this.events.push({ type: 'hit', pos: { x: guard.pos.x, y: guard.pos.y + 0.6, z: guard.pos.z } });
    if (!guard.alive) this.events.push({ type: 'guardDead', pos: { ...guard.pos } });
  }

  onTroopDied(troop, cause) {
    this.lost++;
    this.events.push({ type: 'death', pos: { ...troop.pos }, cause });
  }

  troopReachedObjective(troop) {
    this.saved++;
    this.events.push({ type: 'saved', pos: { ...troop.pos } });
  }

  tryPickupCrate(troop) {
    if (troop.equipment) return; // one equipment slot per troop
    const crate = this.crateAt(troop.cell);
    if (!crate) return;
    const def = EQUIPMENT[crate.kind];
    crate.remaining--;
    def.apply(troop);
    troop.equipment = crate.kind;
    this.events.push({ type: 'pickup', pos: { ...troop.pos }, color: def.color });
  }

  // ---- player actions -----------------------------------------------------------

  budgetFor(kind, key) {
    const table = kind === 'crate' ? this.budget.crates : kind === 'sign' ? this.budget.signs : this.budget.roles;
    return table[key] ?? 0;
  }

  /** A free, walkable cell: in bounds, air, solid floor, no crate / sign / guard. */
  isFreeFloorCell(c) {
    const w = this.world;
    return w.inBounds(c.x, c.y, c.z) &&
      w.get(c.x, c.y, c.z) === VOXEL.AIR &&
      w.isSolid(c.x, c.y - 1, c.z) &&
      !this.crateAt(c) &&
      !this.signAt(c) &&
      !this.guardAt(c);
  }

  canPlaceCrate(kind, c) {
    return this.status === GAME_STATUS.PLAYING &&
      !!EQUIPMENT[kind] &&
      this.budgetFor('crate', kind) > 0 &&
      this.isFreeFloorCell(c);
  }

  placeCrate(kind, c) {
    if (!this.canPlaceCrate(kind, c)) return false;
    this.budget.crates[kind]--;
    const def = EQUIPMENT[kind];
    this.crates.push(new Crate(this.nextId++, kind, c.x, c.y, c.z, def.capacity));
    this.events.push({ type: 'crate', pos: center(c), color: def.color });
    return true;
  }

  canPlaceSign(kind, c) {
    return this.status === GAME_STATUS.PLAYING &&
      !!SIGNS[kind] &&
      this.budgetFor('sign', kind) > 0 &&
      this.isFreeFloorCell(c) &&
      (kind !== 'blocker' || !this.troopAt(c)); // a blocker never traps a troop inside it
  }

  placeSign(kind, c, dir) {
    if (!this.canPlaceSign(kind, c)) return false;
    this.budget.signs[kind]--;
    const sign = new Sign(this.nextId++, kind, c.x, c.y, c.z, dir);
    this.signs.push(sign);
    this.events.push({ type: 'sign', pos: center(c), color: SIGNS[kind].color });
    return true;
  }

  /** Signs return to the inventory at no cost. */
  pickUpSign(sign) {
    const i = this.signs.indexOf(sign);
    if (i < 0) return false;
    this.signs.splice(i, 1);
    this.budget.signs[sign.kind] = (this.budget.signs[sign.kind] ?? 0) + 1;
    this.events.push({ type: 'pickupSign', pos: center(sign.cell), color: SIGNS[sign.kind].color });
    return true;
  }

  rotateSign(sign) {
    if (!SIGNS[sign.kind]?.directional) return false;
    sign.rotate();
    return true;
  }

  assignRole(troop, roleName) {
    const role = ROLES[roleName];
    if (!role || !troop || !troop.alive) return false;
    if (this.status !== GAME_STATUS.PLAYING) return false;
    if (this.budgetFor('role', roleName) <= 0) return false;
    if (troop.role === role) return false;
    if (troop.state === TROOP_STATE.FALLING || troop.state === TROOP_STATE.CLIMBING) return false;
    this.budget.roles[roleName]--;
    troop.setRole(role, this);
    this.events.push({ type: 'role', pos: { ...troop.pos }, color: role.color });
    return true;
  }

  // ---- end conditions -------------------------------------------------------------

  checkEnd() {
    if (this.saved >= this.objective.required) {
      this.status = GAME_STATUS.WON;
      return;
    }
    if (this.timeLimit > 0 && this.time >= this.timeLimit) {
      this.status = GAME_STATUS.LOST;
      this.loseReason = 'Time expired';
      return;
    }
    if (this.pool <= 0 && this.troops.length === 0) {
      this.status = GAME_STATUS.LOST;
      this.loseReason = 'Reinforcements exhausted';
    }
  }
}