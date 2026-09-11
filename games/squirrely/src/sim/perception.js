import { OCCLUDERS } from './vehicle.js';
import { clamp } from '../core/math.js';

const DEG = Math.PI / 180;
const byX = (a, b) => (a.x - b.x) || (a.id - b.id);

/** Neighbor queries + phantom-player sensing with per-driver reaction delay (SPEC §8). */
export class Perception {
  constructor(world) {
    this.world = world;
    this.laneLists = world.road.lanes.map(() => []);
    this._occ = [];
  }

  /** Lanes a vehicle occupies for gap purposes (straddle rule: |z - center| > 0.35 width). */
  occupiedLanes(v) {
    const occ = this._occ;
    occ.length = 0;
    const lane = v.lane;
    if (!lane) return occ;
    occ.push(lane);
    const off = v.z - lane.zCenter;
    if (Math.abs(off) > 0.35 * lane.width) {
      const row = this.world.road.rows[lane.row.index + (off > 0 ? -1 : 1)];
      if (row?.lane) occ.push(row.lane);
    }
    return occ;
  }

  rebuild() {
    const road = this.world.road;
    for (const l of this.laneLists) l.length = 0;
    for (const v of this.world.vehicles) {
      if (v.state === 'wrecked') v.lane = road.laneAt(v.z) ?? v.lane;
      const occ = this.occupiedLanes(v);
      for (let k = 0; k < occ.length; k++) this.laneLists[occ[k].index].push(v);
    }
    for (const l of this.laneLists) l.sort(byX);
  }

  leaderIn(lane, v) {
    let best = null, bd = Infinity;
    for (const o of this.laneLists[lane.index]) {
      if (o === v) continue;
      const d = v.dir * (o.x - v.x);
      if (d > 0 && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  followerIn(lane, v) {
    let best = null, bd = Infinity;
    for (const o of this.laneLists[lane.index]) {
      if (o === v) continue;
      const d = v.dir * (o.x - v.x);
      if (d <= 0 && -d < bd) { bd = -d; best = o; }
    }
    return best;
  }

  gap(v, o) {
    return Math.abs(o.x - v.x) - (o.length + v.length) * 0.5;
  }

  sense(v, eff, dt) {
    const P = v.percept;
    let L = null, F = null, lg = Infinity, fg = Infinity;
    const occ = this.occupiedLanes(v);
    for (let k = 0; k < occ.length; k++) {
      const lane = occ[k];
      const l = this.leaderIn(lane, v);
      if (l) { const g = this.gap(v, l); if (g < lg) { lg = g; L = l; } }
      const f = this.followerIn(lane, v);
      if (f) { const g = this.gap(v, f); if (g < fg) { fg = g; F = f; } }
    }
    if (L && lg <= eff.sensorRange) { P.leader = P._leader; P.leader.veh = L; P.leader.s = lg; } else P.leader = null;
    if (F && fg <= eff.sensorRange) { P.follower = P._follower; P.follower.veh = F; P.follower.s = fg; } else P.follower = null;
    this.sensePlayer(v, eff, dt);
    return P;
  }

  sensePlayer(v, eff, dt) {
    const w = this.world, pl = w.player, P = v.percept, cur = P._cur, tn = w.tuning;
    const alive = pl.alive && !pl.frozen;
    const dx = pl.x - v.x, dz = pl.z - v.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    let range = eff.detectRange;
    if (pl.crouched) range *= 0.45;
    if (w.tauntTimer > 0) range += 30;
    const ahead = v.dir * dx;
    const angle = Math.atan2(Math.abs(dz), ahead);
    let visible = alive && dist <= range && angle <= eff.coneHalfAngle * DEG;
    if (visible && this.occluded(v, pl.x, pl.z)) visible = dist <= range * eff.occlusionPenalty;
    if (visible) v.trackTimer = eff.trackHold;
    else if (v.trackTimer > 0) { v.trackTimer -= dt; visible = alive; }
    if (visible && !cur.visible) v.startled = v.rng() < eff.startleFactor;

    const gap = ahead - v.length * 0.5 - tn.phantomLength * 0.5;
     const vAlong = clamp(v.dir * pl.vx, -3, 3);            // hop velocities are instantaneous spikes; cap at a squirrel's sprint
    const closing = v.v - vAlong;
    const behind = ahead < -v.length * 0.5;
    const ttc = behind ? Infinity : gap > 0 ? gap / Math.max(closing, 0.01) : 0;
    const halfPath = v.width * 0.5 + tn.phantomWidth * 0.5 + eff.pathMargin;
     // prediction: follow the current hop to its landing spot, then (for far-sighted drivers) assume one more hop in the same rhythm
     const tRem = pl.hopping ? Math.max(0, pl.dur - pl.t) : 0;
     const tHop = Math.min(tRem, eff.predictionTime);
     let px = pl.x + pl.vx * tHop, pz = pl.z + pl.vz * tHop;
     if (pl.trendTimer > 0) {
       const k = clamp((eff.predictionTime - tRem) / 0.4, 0, 1);
       px += pl.trendDx * k; pz += pl.trendDz * k;
     }


    cur.visible = visible; cur.x = pl.x; cur.z = pl.z; cur.vx = pl.vx; cur.vz = pl.vz; cur.vAlong = vAlong;
     cur.predictedX = px; cur.predictedZ = pz;
    cur.gap = gap; cur.ttc = ttc; cur.lateral = Math.abs(dz);
    cur.inPath = cur.lateral < halfPath;
    cur.predictedInPath = Math.abs(cur.predictedZ - v.z) < halfPath;
    cur.behind = behind; cur.dist = dist; cur.crouched = pl.crouched;

    // reaction delay ring buffer (nearest sample, no interpolation)
    const ring = v.ring;
    Object.assign(ring[v.ringHead], cur);
    const delaySteps = Math.min(ring.length - 1, Math.round(eff.reactionTime / dt));
    const idx = (v.ringHead - delaySteps + ring.length) % ring.length;
    v.ringHead = (v.ringHead + 1) % ring.length;
    const bypass = visible && v.startled && ttc < eff.panicTTC;   // startle: emergency percept skips the buffer
    P.player = bypass ? cur : ring[idx];
  }

  /** Is a van/box/bus — or a smoke plume — between the driver and the point (px, pz)? */
  occluded(v, px, pz) {
    const span = v.dir * (px - v.x);
    if (span <= 0) return false;
    for (const o of this.world.vehicles) {
      if (o === v || !OCCLUDERS.has(o.bodyType)) continue;
      const ox = v.dir * (o.x - v.x);
      if (ox <= 0 || ox >= span) continue;
      const t = ox / span;
      const zLine = v.z + t * (pz - v.z);
      if (Math.abs(zLine - o.z) < o.width * 0.5 + 0.4) return true;
    }
    const r = this.world.tuning.smokeRadius;
    for (const s of this.world.items.smokes) {
      const ox = v.dir * (s.x - v.x);
      if (ox <= -r || ox >= span + r) continue;
      const t = clamp(ox / span, 0, 1);
      const zLine = v.z + t * (pz - v.z);
      if (Math.abs(zLine - s.z) < r) return true;
    }
    return false;
  }
}