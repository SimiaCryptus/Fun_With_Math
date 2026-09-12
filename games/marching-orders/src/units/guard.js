import { dirIndexFromVector } from './pathing.js';

/**
 * Guard definitions (idea.md §3.2, notes.md).
 *   reach       melee reach in cells (0 = never melees)
 *   range       ranged reach in cells (0 = never shoots); needs line of sight
 *   minRange    ranged attacks are withheld against troops closer than this
 *   projectile  'bullet' hits instantly (tracer); 'grenade' flies an arc and explodes with `splash` radius
 */
export const GUARD_TYPES = Object.freeze({
  sentry: {
    label: 'Sentry', hp: 30, attack: 4, cooldown: 1.2, reach: 1, range: 0,
    color: 0xd24a4a, muzzle: 1.0,
  },
  turret: {
    label: 'Turret', hp: 40, attack: 2, cooldown: 0.5, reach: 0, range: 6,
    projectile: 'bullet', color: 0x9aa3b8, muzzle: 0.85,
  },
  grenadier: {
    label: 'Grenadier', hp: 25, attack: 2, cooldown: 1.0, reach: 1,
    range: 7, minRange: 2, rangedCooldown: 3.0, rangedAttack: 6, splash: 1.5,
    projectile: 'grenade', color: 0xc27a2e, muzzle: 1.1,
  },
});

/**
 * Enemy guard. All guards are stationary: the Sentry melees anything in reach, the Turret shoots
 * troops in line of sight, the Grenadier lobs area-of-effect grenades (and melees adjacent troops).
 * State machine is idle -> engage (alert/retreat are stretch goals).
 */
export class Guard {
  constructor(id, type, x, y, z, dir = 2) {
    this.id = id;
    this.type = GUARD_TYPES[type] ? type : 'sentry';
    this.def = GUARD_TYPES[this.type];
    this.cell = { x, y, z };
    this.pos = { x: x + 0.5, y, z: z + 0.5 };
    this.dir = dir;
    this.maxHp = this.def.hp;
    this.hp = this.def.hp;
    this.attack = this.def.attack;
    this.cooldown = this.def.cooldown;
    this.reach = this.def.reach;
    this.attackTimer = 0;
    this.flash = 0;
    this.state = 'idle';
  }

  get alive() {
    return this.hp > 0;
  }

  update(dt, sim) {
    if (!this.alive) return;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.attackTimer > 0) this.attackTimer -= dt;

    let target = null;
    let ranged = false;
    if (this.def.reach > 0) target = sim.findTroopNear(this, this.def.reach);
    if (!target && this.def.range > 0) {
      target = sim.findTroopInRange(this, this.def.range, this.def.minRange ?? 0);
      ranged = !!target;
    }
    if (!target) {
      this.state = 'idle';
      return;
    }
    this.state = 'engage';

    const dx = target.cell.x - this.cell.x;
    const dz = target.cell.z - this.cell.z;
    if (dx !== 0 || dz !== 0) {
      this.dir = Math.abs(dx) >= Math.abs(dz) ? dirIndexFromVector(dx, 0) : dirIndexFromVector(0, dz);
    }
    if (this.attackTimer > 0) return;

    if (!ranged) {
      this.attackTimer = this.cooldown;
      target.takeDamage(this.attack, sim);
      return;
    }
    this.attackTimer = this.def.rangedCooldown ?? this.cooldown;
    if (this.def.projectile === 'grenade') {
      sim.throwGrenade(this, target.cell);
      return;
    }
    target.takeDamage(this.def.rangedAttack ?? this.attack, sim);
    sim.events.push({
      type: 'tracer',
      from: { x: this.pos.x, y: this.pos.y + this.def.muzzle, z: this.pos.z },
      to: { x: target.pos.x, y: target.pos.y + 0.6, z: target.pos.z },
      color: 0xff7a5a,
    });
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.flash = 1;
  }
}