// 🔵 Blue — The Hero. Predictive avoider; brakes first, swerves (unsafely, and too far) if that is not enough (SPEC §9.5).
export const id = 'blue';

function safestAdjacent(v, pz, world) {
  const per = world.perception;
  let best = null, bs = -Infinity;
  for (const nb of v.lane.neighbors) {
    const L = per.leaderIn(nb, v), F = per.followerIn(nb, v);
    const lg = L ? per.gap(v, L) : Infinity, fg = F ? per.gap(v, F) : Infinity;
    if (lg < 1 || fg < 1) continue;                     // physically blocked; safety otherwise relaxed
    const score = Math.abs(nb.zCenter - pz) * 2 + Math.min(lg, 15) * 0.2 + Math.min(fg, 15) * 0.1;
    if (score > bs) { bs = score; best = nb; }
  }
  return best;
}

export function tick(v, P, intent, ctx) {
  const pl = P.player, eff = v.eff, ex = eff.extras;
  if (v.state === 'cruise' && !intent.emergency) v.swerving = false;
  if (!pl.visible || pl.behind || pl.gap <= 0) return;
  if (!(pl.predictedInPath || pl.inPath)) return;
  if (pl.gap > v.v * ex.horizon + 5) return;           // outside the 2.5 s horizon

  const aStop = -(v.v * v.v) / (2 * Math.max(pl.gap - 1.5, 0.5));
  if (aStop < -eff.bComf * 0.9 && v.state === 'cruise') {           // braking alone would be uncomfortable: swerve
    const lane = safestAdjacent(v, pl.predictedZ, ctx.world);
    if (lane) {
      intent.targetLane = lane; intent.emergency = true; intent.noMobil = true;
      // overcompensation: overshoot the new lane centre by a quarter lane, then settle back
      v.lateralOffset = Math.sign(lane.zCenter - v.lane.zCenter) * (ex.overcompensate - 1) * lane.width;
      v.flinchTimer = 1.2;
      if (!v.swerving) {
        ctx.world.stats.swerves++;
        v.signals.headlightFlash = 0.4;                 // "I see you"
        ctx.events.emit('blue:swerve', { vehicle: v });
      }
      v.swerving = true;
    }
  }
  intent.aLong = Math.min(intent.aLong, Math.max(aStop, -eff.bMax));
}