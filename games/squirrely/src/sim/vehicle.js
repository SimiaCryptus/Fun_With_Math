import { clamp, approach, wrapAngle } from '../core/math.js';

export const BODY_TYPES = {
   // agility scales lateral speed / wander; speedFactor scales the desired speed (motorcycles, SPEC §7.2)
   moto:   { length: 2.2,  width: 0.8, height: 1.3,  mass: 0.3, agility: 2.2, speedFactor: 1.25 },
   hatch:  { length: 3.9,  width: 1.7, height: 1.45, mass: 0.85 },
  sedan:  { length: 4.6,  width: 1.8, height: 1.45, mass: 1.0 },
  suv:    { length: 4.8,  width: 1.9, height: 1.75, mass: 1.2 },
  pickup: { length: 5.4,  width: 2.0, height: 1.85, mass: 1.3 },
  van:    { length: 5.2,  width: 1.9, height: 2.1,  mass: 1.25 },
  box:    { length: 7.5,  width: 2.4, height: 3.2,  mass: 2.0 },
  bus:    { length: 11.0, width: 2.5, height: 3.3,  mass: 2.6 },
};
export const OCCLUDERS = new Set(['van', 'box', 'bus']);

export function playerSnapshot() {
  return {
    visible: false, x: 0, z: 0, vx: 0, vz: 0, vAlong: 0, predictedX: 0, predictedZ: 0,
    gap: Infinity, ttc: Infinity, lateral: Infinity, inPath: false, predictedInPath: false,
    behind: false, dist: Infinity, crouched: false,
  };
}

/** Pooled vehicle state + integration (SPEC §7). */
export class Vehicle {
  constructor(tuning) {
    this.ring = Array.from({ length: tuning.reactionRingSize }, playerSnapshot);
    this.percept = {
      leader: null, follower: null, player: this.ring[0],
      _leader: { veh: null, s: 0 }, _follower: { veh: null, s: 0 }, _cur: playerSnapshot(),
    };
     this.intent = { targetLane: null, aLong: 0, emergency: false, ignoreLeader: false, horn: false, noMobil: false, slam: false };
    this.signals = { brake: false, indicator: 0, hazard: false, headlightFlash: 0 };
    this.effScratch = {};
  }

  reset(o) {
    const b = o.body;
    this.id = o.id; this.driverId = o.driverId; this.profile = o.profile; this.eff = o.profile;
    this.bodyType = o.bodyType; this.length = b.length; this.width = b.width; this.height = b.height; this.mass = b.mass;
     this.agility = b.agility ?? 1;
    this.ext = 0.5 * Math.sqrt(b.length * b.length + b.width * b.width);
    this.lane = o.lane; this.dir = o.lane.dir;
    this.x = o.x; this.v = o.v; this.a = 0; this.aCmd = 0; this.v0 = o.v0; this.v0Base = o.v0;
    this.z = o.lane.zCenter; this.vz = 0; this.heading = this.dir > 0 ? 0 : Math.PI;
    this.prevX = this.x; this.prevZ = this.z; this.prevHeading = this.heading;
    this.state = 'cruise'; this.mode = 'SCAN';
    this.lcTimer = 0; this.lcCooldown = 1.0; this.lcFrom = null; this.lcPending = null; this.lcPendingTimer = 0;
    this.rage = 0; this.panic = 0; this.lockTimer = 0; this.lockCooldown = 0; this.trackTimer = 0; this.startled = false;
    this.wander = 0; this.lateralOffset = 0; this.flinchTimer = 0; this.flinched = false; this.swerving = false;
    this.stabTimer = 0; this.stabAccel = 0; this.rollTimer = 0.25; this.triggerTimer = 0;
    this.noiseTimer = 0; this.brakeNoiseVal = 0; this.hornTimer = 0; this.nearMissed = false; this.lastLeaderId = -1;
    this.wx = 0; this.wz = 0; this.omega = 0; this.wreckTimer = 0;
    this.signals.brake = false; this.signals.indicator = 0; this.signals.hazard = false; this.signals.headlightFlash = 0;
    this.rng = o.rng; this.spawnTime = o.time; this.ringHead = 0;
    for (const r of this.ring) r.visible = false;
    this.percept._cur.visible = false;
    this.percept.player = this.ring[0];
    this.percept.leader = null; this.percept.follower = null;
    this.color = this.profile.colorHex;
  }

  get speed() {
    return this.state === 'wrecked' ? Math.sqrt(this.wx * this.wx + this.wz * this.wz) : this.v;
  }

  beginStep() {
    this.prevX = this.x; this.prevZ = this.z; this.prevHeading = this.heading;
  }

  integrate(dt, road) {
    if (this.state === 'wrecked') return this.integrateWreck(dt, road);
    const eff = this.eff;
    this.a = this.aCmd;
    this.v = Math.max(0, this.v + this.a * dt);
    this.x += this.dir * this.v * dt;

    if (eff.steerNoise > 0) {
       const wMax = 0.4 * Math.min(this.agility, 1.5);            // motorcycles weave inside the lane
       this.wander += eff.steerNoise * this.agility * this.rng.norm() * Math.sqrt(dt);
      this.wander -= this.wander * 0.5 * dt;
       this.wander = clamp(this.wander, -wMax, wMax);
    }
    if (this.flinchTimer > 0) {
      this.flinchTimer -= dt;
      if (this.flinchTimer <= 0) this.lateralOffset = 0;
    }

    const emergency = this.state === 'evading';
     // a car only moves sideways by rolling forward: cap lateral speed by forward speed (kills the low-speed "spin")
      const vzMax = Math.min(emergency ? eff.vzMaxEmergency : eff.vzMax, Math.max(0.35, this.v * 0.3)) * this.agility;
    const targetZ = this.lane.zCenter + this.lateralOffset + this.wander;
    const dz = targetZ - this.z;
    const desired = clamp(dz * (emergency ? 4 : 2.5), -vzMax, vzMax);
     this.vz = approach(this.vz, desired, (emergency ? 12 : 6) * this.agility * dt);
    this.z += this.vz * dt;

    if (this.state === 'changing' || this.state === 'evading') {
      this.lcTimer += dt;
      const settled = Math.abs(this.z - this.lane.zCenter) < 0.35 * this.lane.width && Math.abs(dz) < 0.6;
      if (settled || this.lcTimer > 5) {
        this.state = 'cruise'; this.lcFrom = null; this.signals.indicator = 0;
      }
    }
     const want = Math.atan2(this.vz, this.dir * Math.max(this.v, 2.0));
     this.heading += clamp(wrapAngle(want - this.heading), -3 * dt, 3 * dt);   // yaw-rate limited
  }

  integrateWreck(dt, road) {
    const sp = Math.sqrt(this.wx * this.wx + this.wz * this.wz);
    if (sp > 0.01) {
      const ns = Math.max(0, sp - 6 * dt);
      this.wx *= ns / sp; this.wz *= ns / sp;
    }
    this.x += this.wx * dt; this.z += this.wz * dt;
    this.z = clamp(this.z, road.laneZMin + 1.0, road.laneZMax - 1.0);
    this.heading += this.omega * dt;
    this.omega = approach(this.omega, 0, 2.5 * dt);
    this.v = 0; this.vz = 0; this.a = 0;
    this.wreckTimer -= dt;
  }

  wreck(vx, vz, omega, lifetime) {
    this.state = 'wrecked'; this.mode = 'WRECKED';
    this.wx = vx; this.wz = vz; this.omega = omega; this.wreckTimer = lifetime;
    this.v = 0; this.aCmd = 0; this.lcPending = null;
    this.signals.hazard = true; this.signals.indicator = 0; this.signals.brake = false;
  }
}