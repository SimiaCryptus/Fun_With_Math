// 🟣 Purple — The Oblivious. Sees late, reacts late, flinches insufficiently (SPEC §9.7).
export const id = 'purple';

export function init(v) {
  v.flinched = false;
}

export function tick(v, P, intent, ctx) {
  const pl = P.player, eff = v.eff;
  const threat = pl.visible && pl.inPath && pl.gap > 0 && !pl.behind;
  if (threat && !v.flinched) {
    intent.aLong = -eff.bMax;                                       // slam
    const side = pl.z - v.z >= 0 ? -1 : 1;                          // partial swerve away
    v.lateralOffset = side * eff.extras.flinch;
    v.flinchTimer = 1.0;
    v.flinched = true;
    ctx.events.emit('purple:flinch', { vehicle: v });
  } else if (threat) {
    intent.aLong = Math.min(intent.aLong, -eff.bMax * 0.8);
  }
  if (!pl.visible) v.flinched = false;
}