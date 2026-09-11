import { Road } from './road.js';
import { Vehicle, BODY_TYPES } from './vehicle.js';
import { Player } from './player.js';
import { Perception } from './perception.js';
import { idmAccel } from './idm.js';
import { evaluateLaneChange } from './mobil.js';
import { detectCollisions, pointDistance } from './collision.js';
import { Spawner } from './spawner.js';
import { Scoring } from './scoring.js';
import { Items } from './items.js';
import { makeRng, splitmix32 } from '../core/rng.js';
import { clamp, approach, hashFloat } from '../core/math.js';

export const EMPTY_INTENT = Object.freeze({
  up: false, down: false, left: false, right: false, dash: false, taunt: false, crouch: false, drop: false,
});

/**
 * The simulation. Pure: no three.js, no DOM, no wall clock, no Math.random.
 * Step order follows SPEC §6.2; iteration is always ascending vehicle id.
 */
export class World {
  constructor({ level, drivers, tuning, seed = 1, events, carry = {} }) {
    this.level = level; this.drivers = drivers; this.tuning = tuning; this.events = events;
    this.seed = seed >>> 0;
    this.modifiers = level.modifiers ?? {};
    this.rng = makeRng(this.seed);
    this.road = new Road(level.rows, tuning, this.modifiers.rushHour ? 0.8 : 1);
    this.vehicles = []; this.pool = []; this._sorted = [];
    this.nextId = 1; this.time = 0; this.stepCount = 0;
    this.player = new Player(this.road, tuning);
    this.perception = new Perception(this);
    this.spawner = new Spawner(this, this.rng.fork(0x51));
    this.items = new Items(this, this.rng.fork(0xac));
    this.scoring = new Scoring(tuning, carry.score ?? 0);
    this.lives = carry.lives ?? tuning.lives;
    this.timeLimit = level.timeLimit ?? tuning.timeLimit;
    this.timer = this.timeLimit;
    this.wreckLifetime = level.wreckLifetime ?? tuning.wreckLifetime;
    this.hollows = tuning.hollowXs.map((x) => ({ x, filled: false }));
    this.hollowsFilled = 0;
    this.slowMoTimer = 0; this.slowMos = 0; this.tauntTimer = 0;
    this.status = 'playing';                   // 'playing' | 'complete' | 'gameover'
    this.warm = false;
    this.stats = { crashes: 0, bumps: 0, swerves: 0, locks: 0, deaths: 0, nearMisses: 0 };
    this.ctx = { world: this, road: this.road, events, tuning, dt: tuning.dt };
    this.warmUp(tuning.warmUpSeconds);
  }

  /** Fast-forward so the player arrives at a road in equilibrium (SPEC §12.4). */
  warmUp(seconds) {
    this.warm = true; this.player.frozen = true;
    const n = Math.round(seconds / this.tuning.dt);
    for (let i = 0; i < n; i++) this.step(this.tuning.dt, EMPTY_INTENT);
    this.player.frozen = false; this.warm = false; this.time = 0;
  }

  step(dt, intent = EMPTY_INTENT) {
    const warm = this.warm;
    this.ctx.dt = dt;
    if (!warm) this.player.step(dt, intent);                          // 1–2
    if (!warm && this.player.tauntFired) this.applyTaunt();
    if (!warm && intent.drop) this.items.drop();
    if (this.tauntTimer > 0) this.tauntTimer = Math.max(0, this.tauntTimer - dt);

    for (const v of this.vehicles) v.beginStep();
    this.perception.rebuild();                                        // 3
    for (const v of this.vehicles) if (v.state !== 'wrecked') this.drive(v, dt);   // 4
    for (const v of this.vehicles) v.integrate(dt, this.road);        // 5
    detectCollisions(this);                                           // 6
    this.cull();                                                      // 7
    this.spawner.step(dt);                                            // 8
    this.items.step(dt);                                              // 8b. acorns, smoke bombs, pickups
    if (!warm) this.session(dt);                                      // 9
    this.time += dt; this.stepCount++;
    if (warm) this.events.clear(); else this.events.flush();          // 10
  }

  drive(v, dt) {
    const drv = this.drivers[v.driverId], tn = this.tuning;
    const eff = drv.params ? drv.params(v, dt, this.ctx) : drv.profile;
    v.eff = eff;
    v.signals.headlightFlash = Math.max(0, v.signals.headlightFlash - dt);
    v.hornTimer = Math.max(0, v.hornTimer - dt);
    v.lcCooldown = Math.max(0, v.lcCooldown - dt);

    const P = this.perception.sense(v, eff, dt);                       // a. sensors
    let aLong = P.leader
      ? idmAccel(eff, v.v, v.v0, P.leader.s, v.v - P.leader.veh.v)
      : idmAccel(eff, v.v, v.v0, Infinity, 0);

    // phantom player as a slow obstacle for drivers that care about it
    const pl = P.player;
    if (eff.playerGain > 0.25 && pl.visible && pl.inPath && pl.gap > 0) {
      const aP = idmAccel(eff, v.v, v.v0, Math.max(pl.gap - 0.5, 0.1), v.v - pl.vAlong);
      aLong = Math.min(aLong, aP);
    }
    // a lit smoke bomb is a roadside spectacle: everyone but Purple eases off to gawk (§11.7)
    if (v.driverId !== 'purple') {
      for (const s of this.items.smokes) {
        const ahead = v.dir * (s.x - v.x);
        if (ahead > -6 && ahead < tn.smokeDistract && Math.abs(s.z - v.z) < 14) {
          aLong = Math.min(aLong, idmAccel(eff, v.v, v.v0 * tn.smokeSlow, Infinity, 0));
          break;
        }
      }
    }


    const intent = v.intent;                                           // b. driver hook
    intent.targetLane = null; intent.aLong = aLong; intent.emergency = false;
     intent.ignoreLeader = false; intent.horn = false; intent.noMobil = false; intent.slam = false;
    drv.tick(v, P, intent, this.ctx);
     // motorcycles dodge inside their lane instead of standing on the brakes (Red aims at the squirrel, so it is excluded)
     if (v.agility > 1 && eff.playerGain > 0 && pl.visible && !pl.behind && pl.gap > 0 && (pl.inPath || pl.predictedInPath)
         && v.state === 'cruise' && !intent.targetLane) {
       const lane = v.lane, maxOff = lane.width * 0.5 - v.width * 0.5 - 0.45;
       const side = pl.predictedZ >= lane.zCenter ? -1 : 1;
       const zNew = lane.zCenter + side * maxOff;
       const halfPath = v.width * 0.5 + tn.phantomWidth * 0.5 + eff.pathMargin;
       v.lateralOffset = side * maxOff; v.flinchTimer = 0.8;
       if (!intent.slam && Math.abs(pl.predictedZ - zNew) > halfPath + 0.2 && Math.abs(pl.z - zNew) > halfPath + 0.2) {
         intent.aLong = Math.max(intent.aLong, -eff.bComf * 0.5);      // the dodge clears the squirrel: only ease off
       }
     }


    if (!intent.targetLane && !intent.noMobil && v.state === 'cruise' && v.lcCooldown <= 0 && !v.lcPending) {
      const t = evaluateLaneChange(this, v, eff, P);
      if (t) intent.targetLane = t;
    }
    if (intent.ignoreLeader) intent.aLong = eff.aMax;

    const tl = intent.targetLane;                                      // lane-change scheduling with indicator lead
     if (tl && tl !== v.lane && tl.dir === v.dir) {
       // emergency swerves start at once and may re-target mid-swerve (Red chasing a hopping squirrel)
       if (intent.emergency) this.beginLaneChange(v, tl, true);
       else if (v.state === 'cruise') {
         if (eff.indicatorLead <= 0.05) this.beginLaneChange(v, tl, false);
         else if (!v.lcPending) {
           v.lcPending = tl; v.lcPendingTimer = eff.indicatorLead;
           v.signals.indicator = Math.sign(tl.zCenter - v.lane.zCenter);
         }
      }
    }
    if (v.lcPending) {
      v.lcPendingTimer -= dt;
      if (v.lcPendingTimer <= 0) {
        const t = v.lcPending; v.lcPending = null;
        if (t !== v.lane && v.state === 'cruise') this.beginLaneChange(v, t, false);
        else v.signals.indicator = 0;
      }
    }

    let a = intent.aLong;                                              // c. control: noise, clamp, jerk limit
    v.noiseTimer -= dt;
    if (v.noiseTimer <= 0) { v.noiseTimer = 0.25; v.brakeNoiseVal = eff.brakeNoise ? eff.brakeNoise * v.rng.norm() : 0; }
     if (a < 0 && v.brakeNoiseVal && !intent.slam) a *= Math.max(0.2, 1 + v.brakeNoiseVal);
    a = clamp(a, -eff.bMax, eff.aMax);
     v.aCmd = intent.slam ? a : approach(v.aCmd, a, tn.jerkMax * dt);   // a slam is a foot through the floor: no jerk limit
    v.signals.brake = v.aCmd < -1.5;
    if (intent.horn) this.honk(v);
  }

  beginLaneChange(v, lane, emergency) {
    if (lane === v.lane) return;
    v.lcFrom = v.lane; v.lane = lane;
    v.state = emergency ? 'evading' : 'changing';
    v.lcTimer = 0; v.lcCooldown = v.eff.lcCooldown; v.lcPending = null;
    v.signals.indicator = Math.sign(lane.zCenter - v.lcFrom.zCenter);
    this.events.emit('lanechange', { vehicle: v, from: v.lcFrom, to: lane, emergency });
  }

  honk(v) {
    if (v.hornTimer > 0) return;
    if (v.rng() < v.eff.hornChance) { v.hornTimer = 1.5; this.events.emit('horn', { vehicle: v }); }
  }

  spawnVehicle({ lane, driverId, bodyType, x, v, v0 }) {
    const veh = this.pool.pop() ?? new Vehicle(this.tuning);
    const id = this.nextId++;
    const drv = this.drivers[driverId];
    veh.reset({
      id, driverId, profile: drv.profile, body: BODY_TYPES[bodyType], bodyType, lane, x, v, v0,
      rng: makeRng(splitmix32(this.seed ^ Math.imul(id, 0x9e3779b9))), time: this.time,
    });
    if (drv.init) drv.init(veh);
    this.vehicles.push(veh);
    this.events.emit('spawn', { vehicle: veh });
    return veh;
  }

  cull() {
    const tn = this.tuning, m = tn.spawnMargin + 5;
    let w = 0;
    for (const v of this.vehicles) {
      let dead = false;
      if (v.state === 'wrecked') dead = v.wreckTimer <= 0 || Math.abs(v.x) > tn.xMax + m;
      else dead = v.dir > 0 ? v.x > tn.xMax + m : v.x < tn.xMin - m;
      if (dead) { this.pool.push(v); this.events.emit('despawn', { vehicle: v }); }
      else this.vehicles[w++] = v;
    }
    this.vehicles.length = w;
  }

  onCollision(a, b, dv, severity, x, z) {
    if (severity === 'bump') {
      this.stats.bumps++;
      this.honk(a); this.honk(b);
      this.events.emit('bump', { a, b, dv, x, z });
      return;
    }
    this.stats.crashes++;
    const p = this.player, dx = x - p.x, dz = z - p.z;
    if (!this.warm && this.status === 'playing' && p.alive && dx * dx + dz * dz < 225) this.scoring.chaos();
    this.events.emit('crash', { a, b, dv, x, z, severity });
  }

  hitPlayer(v) {
    const p = this.player;
    if (!p.alive || p.graceTimer > 0 || this.status !== 'playing') return;
    if (v.state === 'wrecked') {
      if (v.speed < 0.5) return;                                     // resting wreck = legal cover
    } else if (Math.abs(v.a) > 7 && v.v < 3) {
      p.nudge();                                                     // braking car nudges, no life lost
      this.events.emit('player:nudge', { vehicle: v });
      return;
    }
    this.killPlayer(v, 'hit');
  }

  killPlayer(v, cause) {
    this.player.squash(v, cause);
    this.scoring.death();
    this.events.emit('player:death', { driverId: v ? v.driverId : null, cause, vehicle: v });
  }

  applyTaunt() {
    this.tauntTimer = 1.0;
    const p = this.player;
    for (const v of this.vehicles) {
      const dx = v.x - p.x, dz = v.z - p.z;
      if (dx * dx + dz * dz > 400) continue;
      if (v.driverId === 'yellow') v.panic = Math.min(1, v.panic + 0.35);
      if (v.driverId === 'green') v.rage = Math.min(1, v.rage + 0.2);
    }
    this.scoring.taunt();
    this.events.emit('taunt', {});
  }

  session(dt) {
    if (this.status !== 'playing') return;
    const p = this.player;
    this.slowMoTimer = Math.max(0, this.slowMoTimer - dt);
    this.scoring.step(dt, p, this.road);
    if (p.state === 'squashed') { p.deathTimer -= dt; if (p.deathTimer <= 0) this.respawnAfterDeath(); return; }
    if (p.state === 'goal') { p.goalTimer -= dt; if (p.goalTimer <= 0) this.respawnAfterGoal(); return; }
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0; this.killPlayer(null, 'timer'); return; }
    if (p.justLanded) {
      p.justLanded = false;
      const row = this.road.rowAt(p.z);
      if (row) {
        if (row.index > p.furthestRow) { p.furthestRow = row.index; this.scoring.advance(); }
        if (row.goal) { this.items.bank(); this.tryHollow(); }
      }
    }
    this.nearMiss();
  }

  tryHollow() {
    const p = this.player;
    let best = null, bd = 3;
    for (const h of this.hollows) {
      if (h.filled) continue;
      const d = Math.abs(h.x - p.x);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    best.filled = true; this.hollowsFilled++;
    p.x = best.x;
    this.scoring.hollow(this.timer);
    p.reachGoal();
    this.events.emit('hollow', { index: this.hollows.indexOf(best), remaining: this.hollows.length - this.hollowsFilled });
    if (this.hollowsFilled >= this.hollows.length) {
      this.scoring.complete();
      this.status = 'complete';
      this.events.emit('level:complete', { score: this.scoring.score });
    }
  }

  nearMiss() {
    const p = this.player, tn = this.tuning;
    if (!p.alive) return;
    for (const v of this.vehicles) {
      if (Math.abs(v.x - p.x) > v.ext + 4) { v.nearMissed = false; continue; }
      const d = pointDistance(v, p.x, p.z);
      if (d > 3) { v.nearMissed = false; continue; }
      if (!v.nearMissed && d < tn.nearMissRadius && v.speed > tn.nearMissSpeed) {
        v.nearMissed = true;
        this.stats.nearMisses++;
        this.scoring.nearMiss();
        if (this.slowMos < tn.slowMoCap) { this.slowMos++; this.slowMoTimer = tn.slowMoTime; }
        this.events.emit('nearmiss', { vehicle: v });
      }
    }
  }

  respawnAfterDeath() {
    this.lives--; this.stats.deaths++;
    if (this.lives <= 0) {
      this.status = 'gameover';
      this.events.emit('game:over', { score: this.scoring.score });
      return;
    }
    this.player.reset(); this.timer = this.timeLimit; this.slowMos = 0;
    this.events.emit('player:respawn', {});
  }

  respawnAfterGoal() {
     const p = this.player, smokes = p.mouth.filter((k) => k === 'smoke');   // smoke bombs are never banked: they ride along
     p.reset(); p.mouth.push(...smokes);
     this.timer = this.timeLimit; this.slowMos = 0;
  }

  /** Deterministic state hash for tests/replays (SPEC §19.1). */
  hash() {
    let h = 2166136261;
    for (const v of this.vehicles) { h = hashFloat(h, v.x); h = hashFloat(h, v.z); h = hashFloat(h, v.v); }
    for (const it of this.items.list) { h = hashFloat(h, it.x); h = hashFloat(h, it.z); }
    h = hashFloat(h, this.player.x); h = hashFloat(h, this.player.z);
    return h;
  }
}