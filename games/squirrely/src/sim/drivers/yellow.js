// 🟡 Yellow — The Panicker. Panics only about things close and *ahead* of it (the squirrel in its path, a car cutting
// in, a fresh wreck, a smoke bomb). Slams the brake far harder than anything warrants — hard enough to stop dead and
// collect the car behind — then gets rolling again (SPEC §9.4).
import { lerp } from '../../core/math.js';

export const id = 'yellow';

export function init(v) {
  v.panic = 0; v.stabTimer = 0; v.stabCooldown = 0; v.rollTimer = 0.25; v.triggerTimer = 0;
}

/** Side to move to in order to get away from the squirrel (random if it cannot see one). */
function awaySide(v, pl, rng) {
  return pl.visible ? (pl.z - v.z >= 0 ? -1 : 1) : (rng() < 0.5 ? -1 : 1);
}

export function tick(v, P, intent, ctx) {
  const dt = ctx.dt, eff = v.eff, ex = eff.extras, w = ctx.world, rng = v.rng, pl = P.player;
  v.panic = Math.max(0, v.panic - ex.panicDecay * dt);
  v.stabCooldown = Math.max(0, v.stabCooldown - dt);

  // the squirrel is a trigger only when it is close AND ahead, in (or hopping into) our path
  const squirrel = pl.visible && !pl.behind && pl.gap > 0 && pl.dist < ex.panicRange && (pl.inPath || pl.predictedInPath);

  v.triggerTimer -= dt;
  if (v.triggerTimer <= 0) {
    v.triggerTimer = 0.1;
    let add = 0;
    if (squirrel) add += 0.15 + 0.25 * (1 - pl.dist / ex.panicRange);
    for (const o of w.vehicles) {
      if (o === v) continue;
      const dx = v.dir * (o.x - v.x);                                  // only things ahead of us matter
      if (dx < -2 || dx > 20) continue;
      if (Math.abs(o.z - v.z) > 5) continue;                            // own lane and the immediate neighbours
      if (dx < 12 && (o.state === 'changing' || o.state === 'evading')) add += 0.10;
      if (o.state === 'wrecked' && o.wreckTimer > w.wreckLifetime - 0.3) add += 0.5;   // a crash just happened in front of us
    }
    const L = P.leader;
    if (L && L.s < 12 && L.veh.signals.brake && v.v - L.veh.v > 2) add += 0.08;      // leader brakes hard right ahead
    for (const s of w.items.smokes) {
      const dx = v.dir * (s.x - v.x);
      if (dx > -2 && dx < 25 && Math.abs(s.z - v.z) < 10) { add += 0.12; break; }
    }
    if (add > 0) {
      v.panic = Math.min(1, v.panic + add);
      if (v.stabTimer <= 0 && v.stabCooldown <= 0 && v.panic > 0.25 && rng() < Math.min(1, add * 2 + v.panic * 0.3)) {
         // the "stab": full force, held until the car is (nearly) stopped — the panic dictates how long it stays planted
         v.stabTimer = 0.2 + (v.v / eff.bMax) * lerp(0.5, 1.0, v.panic);
         v.stabCooldown = v.stabTimer + 1.0;
         v.stabAccel = -eff.bMax * lerp(0.8, 1.0, v.panic);
        if (rng() < 0.5) intent.horn = true;
        if (v.flinchTimer <= 0 && rng() < 0.6) {                          // in-lane flinch away from the scare
          v.lateralOffset = awaySide(v, pl, rng) * (0.4 + 0.5 * v.panic);
          v.flinchTimer = 0.4 + 0.3 * rng();
        }
      }
    }
  }

   if (v.stabTimer > 0) { v.stabTimer -= dt; intent.aLong = Math.min(intent.aLong, v.stabAccel); intent.slam = true; }
  else if (v.panic > 0.6) intent.aLong = Math.min(intent.aLong, eff.aMax * 0.5);   // rattled but rolling: soft throttle, never a standstill
   // squirrel right in front and closing: slam — no jerk limit, no brake noise
   if (squirrel && pl.ttc < 2.5) { intent.aLong = Math.min(intent.aLong, -eff.bMax); intent.slam = true; }

  v.rollTimer -= dt;
  if (v.rollTimer <= 0) {
    v.rollTimer = 0.25;
    if (v.panic > 0.5 && v.state === 'cruise' && v.lane.neighbors.length && rng() < ex.swerveChance * v.panic) {
      const side = awaySide(v, pl, rng);
      let lane = null;
      for (const nb of v.lane.neighbors) if (Math.sign(nb.zCenter - v.lane.zCenter) === side) lane = nb;
      if (!lane) lane = rng.pick(v.lane.neighbors);
      intent.targetLane = lane; intent.emergency = true; intent.noMobil = true;  // ignores MOBIL safety
      // over-swerve: overshoot the new lane centre, then wobble back
      v.lateralOffset = Math.sign(lane.zCenter - v.lane.zCenter) * (0.6 + 0.5 * v.panic);
      v.flinchTimer = 0.9;
      w.stats.swerves++;
      ctx.events.emit('yellow:swerve', { vehicle: v });
    }
  }
}