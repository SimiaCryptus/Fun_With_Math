import { BODY_TYPES } from './vehicle.js';
import { clamp } from '../core/math.js';

/** Cox-process arrivals per lane with thinning, platoons and driver-mix constraints (SPEC §12). */
export class Spawner {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    const lv = world.level;
    this.platoonChance = lv.platoonChance ?? 0.2;
    this.densityScale = lv.modifiers?.rushHour ? 1.4 : 1;
    this.lanes = world.road.lanes.map((lane) => ({
      lane, phase: rng() * Math.PI * 2, period: 25 + 15 * rng(), platoon: 0,
    }));
  }

  step(dt) {
    const w = this.world, t = w.time;
    for (const s of this.lanes) {
      const lane = s.lane;
      if (s.platoon > 0) {
        if (this.trySpawn(lane, true, null)) s.platoon--;
        else if (this.rng() < 0.2 * dt) s.platoon = 0;      // give up if the entry never clears
        continue;
      }
      const base = (lane.density * this.densityScale * lane.speedLimit) / 1000;
      const rate = base * (1 + 0.4 * Math.sin((2 * Math.PI * t) / s.period + s.phase));
      if (this.rng() < rate * dt) {
        const platoon = this.rng() < this.platoonChance;
        const v = this.trySpawn(lane, false, platoon && w.level.mix.white ? 'white' : null);
        if (v && platoon) s.platoon = 1 + this.rng.int(4);
      }
    }
  }

  trySpawn(lane, tight, forcedDriver) {
    const w = this.world, tn = w.tuning;
    const entryX = lane.dir > 0 ? tn.xMin - tn.spawnMargin : tn.xMax + tn.spawnMargin;
    let leader = null, ld = Infinity;
    for (const o of w.vehicles) {
      if (o.lane !== lane && o.lcFrom !== lane) continue;
      const d = lane.dir * (o.x - entryX);
      if (d >= 0 && d < ld) { ld = d; leader = o; }
    }
    const driverId = forcedDriver ?? this.chooseDriver(lane);
    if (!driverId) return null;
    const prof = w.drivers[driverId].profile;
    const bodyType = this.rng.weighted(prof.bodyWeights);
    const body = BODY_TYPES[bodyType];
     let v0 = lane.speedLimit * prof.v0Factor * (body.speedFactor ?? 1) * (1 + prof.v0Jitter * this.rng.norm());
    v0 = Math.max(v0, lane.speedLimit * 0.6);
    let vInit = v0 * 0.9;
    if (leader) {
      const gap = ld - (leader.length + body.length) * 0.5;
      vInit = clamp(leader.v, v0 * 0.5, v0);
      const need = (prof.s0 + vInit * prof.T) * (tight ? 0.6 : 1.0);
      if (gap < need) return null;                          // thinning → platoons
    }
    return w.spawnVehicle({ lane, driverId, bodyType, x: entryX, v: vInit, v0 });
  }

  chooseDriver(lane) {
    const w = this.world, mix = w.level.mix;
    let total = 0, blues = 0, redsInLane = 0, whitesInLane = 0, inLane = 0;
    for (const o of w.vehicles) {
      total++;
      if (o.driverId === 'blue') blues++;
      if (o.lane === lane) {
        inLane++;
        if (o.driverId === 'red') redsInLane++;
        if (o.driverId === 'white') whitesInLane++;
      }
    }
    if (lane.anchor && mix.white && inLane >= 5 && whitesInLane * 6 < inLane) return 'white';
    const weights = {};
    for (const k in mix) {
      let wgt = mix[k];
      if (lane.chaos && (k === 'yellow' || k === 'green')) wgt *= 1.6;
      if (k === 'blue' && total >= 6 && blues / total >= 0.30) wgt = 0;
      if (k === 'red' && redsInLane >= 2) wgt = 0;
      weights[k] = wgt;
    }
    return this.rng.weighted(weights);
  }
}