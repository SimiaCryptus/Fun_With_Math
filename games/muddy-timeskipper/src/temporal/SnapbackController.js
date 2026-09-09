import { GEARS, gearById } from './gears.js';
import { SNAP, V88 } from '../core/constants.js';
import { clamp, clamp01, lerp, msToMph } from '../core/MathX.js';
import * as V from '../core/Vec3.js';

const _tmpF = V.v3();
const _tmpNew = V.v3();

/**
 * Owns arming, cooldowns, gear switching and the actual velocity overwrite.
 * Positions / orientation / mud / lap progress are NEVER modified here.
 */
export class SnapbackController {
  constructor({ player, ais, bus, rng }) {
    this.player = player;
    this.ais = ais;
    this.bus = bus;
    this.rng = rng;

    this.gearId = 'T2';
    this.cooldowns = new Map(GEARS.map((g) => [g.id, 0]));
    this.switchLockout = 0;
    this.armLatch = 0;
    this.rhythm = 0;              // snapbacks used this lap
    this.lastEvent = null;
  }

  get gear() { return gearById(this.gearId); }
  get cooldown() { return this.cooldowns.get(this.gearId) || 0; }
  get armed() { return this.armLatch > 0; }
  get ready() { return this.armed && this.cooldown <= 0 && this.switchLockout <= 0; }

  /** 0..1 "temporal strain" for HUD thermometer / cartoon rig. */
  get strain() {
    const s = Math.hypot(this.player.body.vel.x, this.player.body.vel.z);
    return clamp01((s / V88 - 0.82) / (1 - 0.82));
  }

  selectGear(id) {
    if (id === this.gearId) return false;
    if (!GEARS.some((g) => g.id === id)) return false;
    this.gearId = id;
    this.switchLockout = SNAP.SWITCH_LOCKOUT;
    this.bus.emit('gearSwitch', { gearId: id, lockoutS: this.switchLockout });
    return true;
  }

  fixedUpdate(dt) {
    const speed = Math.hypot(this.player.body.vel.x, this.player.body.vel.z);
    if (speed >= V88) this.armLatch = SNAP.ARM_GRACE;
    else this.armLatch = Math.max(0, this.armLatch - dt);

    for (const [id, cd] of this.cooldowns) {
      if (cd > 0) this.cooldowns.set(id, Math.max(0, cd - dt));
    }
    this.switchLockout = Math.max(0, this.switchLockout - dt);
  }

  onLapComplete() { this.rhythm = 0; }

  /** @returns {object|null} the emitted snapback event, or null if not permitted. */
  activate(tick = 0) {
    if (!this.ready) return null;
    const gear = this.gear;

    const pastP = this.player.history.sample(gear.offset);
    const deltaP = applySnapback(this.player.body, pastP, gear, gear.blend, true);

    const affected = [];
    const px = this.player.body.pos.x, pz = this.player.body.pos.z;
    for (const ai of this.ais) {
      if (gear.chaosRadius >= 0) {
        const dx = ai.body.pos.x - px, dz = ai.body.pos.z - pz;
        if (dx * dx + dz * dz > gear.chaosRadius * gear.chaosRadius) continue;
      }
      const past = ai.history.sample(gear.offset);
      const dv = applySnapback(ai.body, past, gear, gear.aiBlend, false);
      ai.driver?.panic(gear.panic, this.rng);
      affected.push({ id: ai.id, deltaV: dv });
    }

    // rhythm abuse penalty (spec §10)
    this.rhythm++;
    if (this.rhythm > SNAP.RHYTHM_LIMIT) {
      this.player.body.mudLoad = clamp01(this.player.body.mudLoad + SNAP.RHYTHM_MUD_PENALTY);
    }

    this.cooldowns.set(gear.id, pastP.clamped ? gear.cooldown * 0.5 : gear.cooldown);
    this.armLatch = 0; // must re-earn 88 mph

    const ev = {
      gearId: gear.id,
      tick,
      playerDeltaV: deltaP,
      pastSpeedMph: msToMph(pastP.speed),
      clamped: pastP.clamped,
      affected,
      x: px, z: pz,
      shake: gear.shake,
      sfx: gear.sfx
    };
    this.lastEvent = ev;
    this.bus.emit('snapback', ev);
    return ev;
  }
}

/**
 * Pure-ish helper: overwrite `body`'s velocity with the past vector per gear rules.
 * Exported for unit tests.
 * @returns {number} magnitude of the horizontal velocity delta (for fx/audio).
 */
export function applySnapback(body, past, gear, blend, isPlayer) {
  const curX = body.vel.x, curY = body.vel.y, curZ = body.vel.z;

  // 1. horizontal blend toward the past vector
  let nx = lerp(curX, past.vx, blend);
  let nz = lerp(curZ, past.vz, blend);

  // 2. heading realign: rotate the resulting vector toward the CURRENT heading
  if (gear.headingRealign > 0) {
    const mag = Math.hypot(nx, nz);
    if (mag > 1e-4) {
      V.forwardFromYaw(_tmpF, body.yaw);
      const fx = _tmpF.x, fz = _tmpF.z;
      const ux = nx / mag, uz = nz / mag;
      const bx = lerp(ux, fx, gear.headingRealign);
      const bz = lerp(uz, fz, gear.headingRealign);
      const bm = Math.hypot(bx, bz) || 1;
      nx = (bx / bm) * mag; nz = (bz / bm) * mag;
    }
  }

  // 3. anti-degenerate forward-gain cap (players only; AI chaos is the point)
  if (isPlayer) {
    V.forwardFromYaw(_tmpF, body.yaw);
    const curFwd = curX * _tmpF.x + curZ * _tmpF.z;
    const newFwd = nx * _tmpF.x + nz * _tmpF.z;
    const cap = Math.max(0, curFwd) * SNAP.GAIN_CAP;
    if (newFwd > cap && newFwd > 1e-4) {
      const excess = newFwd - cap;
      nx -= _tmpF.x * excess;
      nz -= _tmpF.z * excess;
      body.fx.deniedBoost = excess;   // render as cartoon boost that does nothing
    } else {
      body.fx.deniedBoost = 0;
    }
  }

  // 4. vertical: heavily damped so snapbacks never launch or bury a vehicle
  const ny = clamp(lerp(curY, past.vy * SNAP.VERTICAL_SCALE, blend), -SNAP.MAX_FALL, 6);

  // 5. global sanity cap
  V.set(_tmpNew, nx, ny, nz);
  V.clampLen(_tmpNew, SNAP.MAX_SPEED);

  body.vel.x = _tmpNew.x; body.vel.y = _tmpNew.y; body.vel.z = _tmpNew.z;
  body.yawRate = lerp(body.yawRate, past.yawRate, blend * gear.angularBlend);

  const dvx = body.vel.x - curX, dvz = body.vel.z - curZ;
  const dv = Math.hypot(dvx, dvz);

  // cartoon-only state (never affects physics)
  body.fx.snapImpulse = Math.min(1.6, (dv / 30) * gear.impulseScale * 1.6);
  body.fx.snapDirX = dv > 1e-4 ? dvx / dv : 0;
  body.fx.snapDirZ = dv > 1e-4 ? dvz / dv : 0;
  body.fx.screamT = 0.45;
  return dv;
}