// 🔴 Red — The Psycho. SCAN → LOCKED → COMMIT → RECOVER (SPEC §9.3). Steers *at* the squirrel's predicted position.
import { clamp } from '../../core/math.js';

export const id = 'red';

export function init(v) {
  v.mode = 'SCAN'; v.lockTimer = 0; v.lockCooldown = 0;
}

function stepToward(lane, target) {
  const want = Math.sign(target.zCenter - lane.zCenter);
  for (const nb of lane.neighbors) if (Math.sign(nb.zCenter - lane.zCenter) === want) return nb;
  return null;
}

/** Swerve toward the lane the squirrel is heading for, then put the bumper on it inside that lane. */
function aim(v, pl, target, intent) {
  if (target && target !== v.lane) {
    const nb = stepToward(v.lane, target);
    if (nb) { intent.targetLane = nb; intent.emergency = true; }   // no indicator, no MOBIL safety, re-targets mid-swerve
  }
  const ref = intent.targetLane ?? v.lane;
  v.lateralOffset = clamp(pl.predictedZ - ref.zCenter, -0.85, 0.85);
  v.flinchTimer = 0.3;                                             // integrate() zeroes the offset shortly after the lock ends
}

export function tick(v, P, intent, ctx) {
  const dt = ctx.dt, eff = v.eff, ex = eff.extras, pl = P.player;
  v.lockCooldown = Math.max(0, v.lockCooldown - dt);

  // the lane the squirrel is (about to be) in — only if it is on our carriageway or its edge
  const target = pl.visible ? ctx.road.laneNearest(pl.predictedZ, v.dir) : null;
  const reachable = !!target && Math.abs(target.zCenter - pl.predictedZ) <= target.width;

  switch (v.mode) {
    case 'SCAN':
      if (pl.visible && !pl.crouched && !pl.behind && reachable && pl.ttc < ex.lockTTC && v.lockCooldown <= 0) {
        v.mode = 'LOCKED'; v.lockTimer = 0;
        v.signals.headlightFlash = 0.8;                 // telegraph
        intent.horn = true;
        ctx.world.stats.locks++;
        ctx.events.emit('red:lock', { vehicle: v });
      }
      break;

    case 'LOCKED':
      v.lockTimer += dt;
      intent.noMobil = true;
      if (!pl.visible || pl.behind || v.lockTimer > ex.lockDuration) { v.mode = 'RECOVER'; break; }
      aim(v, pl, target, intent);
      if (!(P.leader && P.leader.s < 6)) intent.aLong = Math.max(intent.aLong, eff.aMax * 0.6);   // minimal braking
      if (reachable && pl.ttc < ex.commitTTC) v.mode = 'COMMIT';
      break;

    case 'COMMIT':
      intent.noMobil = true;
      if (!pl.visible || pl.behind || pl.ttc > 1.5) { v.mode = 'RECOVER'; break; }
      intent.ignoreLeader = true;                      // will rear-end others to reach the player
      intent.aLong = eff.aMax;
      aim(v, pl, target, intent);
      break;

    case 'RECOVER':
      v.lockCooldown = ex.cooldown;                    // guaranteed window after every attempt
      v.lateralOffset = 0; v.flinchTimer = 0;
      v.mode = 'SCAN';
      break;

    default:
      v.mode = 'SCAN';
  }
}