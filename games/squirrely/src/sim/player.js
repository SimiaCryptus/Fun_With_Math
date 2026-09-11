import { lerp, clamp } from '../core/math.js';

function hopFromIntent(intent) {
  if (intent.dash) return 'dash';
  if (intent.up) return 'up';
  if (intent.down) return 'down';
  if (intent.left) return 'left';
  if (intent.right) return 'right';
  return null;
}

/** Squirrel state machine (SPEC §11). Collision position is continuous mid-hop. */
export class Player {
  constructor(road, tuning) {
    this.road = road;
    this.tuning = tuning;
    this.frozen = false;
    this.reset();
  }

  reset() {
    const start = this.road.rows[0];
    this.row = 0; this.x = 0; this.z = start.zCenter; this.y = 0;
    this.prevX = this.x; this.prevZ = this.z; this.prevY = 0;
    this.vx = 0; this.vz = 0; this.facing = 0;
    this.state = 'idle';
    this.t = 0; this.dur = 0; this.arc = 0; this.x0 = this.x1 = this.x; this.z0 = this.z1 = this.z;
    this.graceTimer = 0; this.cooldown = 0; this.dashCooldown = 0; this.standTimer = 0;
    this.tauntAnim = 0; this.tauntCooldown = 0; this.tauntFired = false;
    this.queued = null; this.queueTimer = 0;
    this.furthestRow = 0; this.justLanded = false;
    this.mouth = [];                                            // held items: 'acorn' | 'smoke' (§11.7)
     this.trendDx = 0; this.trendDz = 0; this.trendTimer = 0;   // last hop vector; drivers extrapolate it (§8.2)
    this.deathTimer = 0; this.goalTimer = 0; this.squashedBy = null; this.cause = null;
  }

  get alive() { return this.state !== 'squashed' && this.state !== 'goal'; }
  get crouched() { return this.state === 'crouch' || this.state === 'standing'; }
   get hopping() { return this.state === 'hopping' || this.state === 'nudged'; }

  step(dt, intent) {
    this.prevX = this.x; this.prevZ = this.z; this.prevY = this.y;
    this.tauntFired = false;
    this.graceTimer = Math.max(0, this.graceTimer - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
     this.trendTimer = Math.max(0, this.trendTimer - dt);
    this.tauntAnim = Math.max(0, this.tauntAnim - dt);
    this.tauntCooldown = Math.max(0, this.tauntCooldown - dt);
    if (this.queued) { this.queueTimer -= dt; if (this.queueTimer <= 0) this.queued = null; }

    const hop = hopFromIntent(intent);
    if (hop) { this.queued = hop; this.queueTimer = this.tuning.inputBuffer; }

    switch (this.state) {
      case 'idle':
        if (intent.crouch) { this.state = 'crouch'; this.vx = this.vz = 0; break; }
        if (intent.taunt && this.tauntCooldown <= 0) {
          this.tauntAnim = 0.4; this.tauntCooldown = 1.0; this.tauntFired = true;
        }
        if (this.cooldown <= 0 && this.queued && this.tauntAnim <= 0) {
          const q = this.queued; this.queued = null; this.tryHop(q);
        }
        break;
      case 'hopping':
      case 'nudged':
        this.advanceHop(dt);
        break;
      case 'crouch':
        if (!intent.crouch) { this.state = 'standing'; this.standTimer = this.tuning.standTime; }
        break;
      case 'standing':
        this.standTimer -= dt;
        if (this.standTimer <= 0) this.state = 'idle';
        break;
      default:
        break;
    }
  }

  tryHop(kind) {
    const tn = this.tuning, rows = this.road.rows;
    let tx = this.x, tz = this.z, dur = tn.hopTime, arc = tn.hopArc;
    if (kind === 'dash') {
      if (this.dashCooldown > 0) return;
      const r = Math.min(rows.length - 1, this.row + 2);
      if (r === this.row) return;
      tz = rows[r].zCenter; dur = tn.dashTime; arc = tn.hopArc * 1.3;
      this.dashCooldown = tn.dashCooldown; this.facing = 0;
    } else if (kind === 'up') {
      if (this.row >= rows.length - 1) return;
      tz = rows[this.row + 1].zCenter; this.facing = 0;
    } else if (kind === 'down') {
      if (this.row <= 0) return;
      tz = rows[this.row - 1].zCenter; this.facing = Math.PI;
    } else if (kind === 'left') {
      tx = Math.max(-tn.playerXLimit, this.x - tn.lateralHop); dur = tn.lateralHopTime;
      if (tx === this.x) return;
      this.facing = Math.PI / 2;
    } else if (kind === 'right') {
      tx = Math.min(tn.playerXLimit, this.x + tn.lateralHop); dur = tn.lateralHopTime;
      if (tx === this.x) return;
      this.facing = -Math.PI / 2;
    }
    this.startHop(tx, tz, dur, arc, 'hopping');
  }

  startHop(tx, tz, dur, arc, state) {
    this.x0 = this.x; this.z0 = this.z; this.x1 = tx; this.z1 = tz;
    this.dur = dur; this.arc = arc; this.t = 0; this.state = state;
    this.vx = (tx - this.x) / dur; this.vz = (tz - this.z) / dur;
     this.trendDx = clamp(tx - this.x, -3.5, 3.5); this.trendDz = clamp(tz - this.z, -3.5, 3.5);
     this.trendTimer = 0.6;
    this.graceTimer = 0;                   // collidable throughout the hop
  }

  advanceHop(dt) {
    this.t += dt;
    const p = Math.min(1, this.t / this.dur);
    this.x = lerp(this.x0, this.x1, p);
    this.z = lerp(this.z0, this.z1, p);
    this.y = this.arc * Math.sin(Math.PI * p);
    if (p >= 1) this.land();
  }

  land() {
    this.x = this.x1; this.z = this.z1; this.y = 0; this.vx = this.vz = 0;
    this.state = 'idle';
    this.cooldown = this.tuning.hopCooldown;
    this.graceTimer = this.tuning.grace;
    const row = this.road.rowAt(this.z);
    if (row) this.row = row.index;
    this.justLanded = true;
  }

  nudge() {
    const r = Math.max(0, this.row - 1);
    this.startHop(this.x, this.road.rows[r].zCenter, 0.3, 0.3, 'nudged');
    this.graceTimer = 0.5;
    this.queued = null;
  }

  squash(byVehicle, cause) {
    this.state = 'squashed'; this.deathTimer = this.tuning.deathCam;
    this.vx = this.vz = 0; this.y = 0; this.squashedBy = byVehicle; this.cause = cause;
  }

  reachGoal() {
    this.state = 'goal'; this.goalTimer = 0.8; this.vx = this.vz = 0;
  }
}