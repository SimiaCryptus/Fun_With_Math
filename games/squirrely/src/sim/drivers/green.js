// 🟢 Green — The Road Rager. Rage ramps parameters; dangerous to everyone else (SPEC §9.6).
import { lerp } from '../../core/math.js';

export const id = 'green';

export function init(v) {
  v.rage = 0; v.rollTimer = 0.5;
  Object.assign(v.effScratch, v.profile);
  v.eff = v.effScratch;
}

/** Effective parameters interpolated with rage (arrows in SPEC §9.2). */
export function params(v) {
  const p = v.profile, e = v.effScratch, r = v.rage;
  Object.assign(e, p);
  e.T = lerp(0.9, 0.45, r);
  e.lcThreshold = lerp(0.2, 0.03, r);
  e.aMax = lerp(3.0, 4.0, r);
  e.v0Factor = lerp(1.15, 1.5, r);
  if (r > 0.5) e.s0 = p.s0 * 0.6;                      // tailgate
  return e;
}

export function tick(v, P, intent, ctx) {
  const dt = ctx.dt, eff = v.eff, ex = v.profile.extras, L = P.leader, pl = P.player;
  if (v.v < 0.7 * v.v0 && L && L.s < 25) v.rage = Math.min(1, v.rage + ex.rageRate * dt);
  if (v.v > 0.9 * v.v0) v.rage = Math.max(0, v.rage - ex.rageDecay * dt);

  const lid = L ? L.veh.id : -1;
  if (lid !== v.lastLeaderId) {                        // someone new in front: were we cut off?
    if (L && (L.veh.state === 'changing' || L.veh.state === 'evading')) {
      const closing = v.v - L.veh.v;
      if (closing > 0 && L.s / closing < 1.5) { v.rage = Math.min(1, v.rage + 0.25); intent.horn = true; }
    }
    v.lastLeaderId = lid;
  }

  v.v0 = v.v0Base * (eff.v0Factor / v.profile.v0Factor);
  if (v.rage > 0.5 && L && L.s < 12 && (ctx.world.time % 2) < 0.5) v.signals.headlightFlash = 0.25;

  // Boxed in and furious: bully into whichever neighbour lane has the best gap. No MOBIL, no indicator, no safety margin.
  v.rollTimer -= dt;
  if (v.rollTimer <= 0) {
    v.rollTimer = 0.5;
    if (v.rage > 0.6 && v.state === 'cruise' && v.lcCooldown <= 0 && L && L.s < 15 && L.veh.v < 0.85 * v.v0) {
      const per = ctx.world.perception;
      let best = null, bs = L.s + 5;
      for (const nb of v.lane.neighbors) {
        const nl = per.leaderIn(nb, v), nf = per.followerIn(nb, v);
        const lg = nl ? per.gap(v, nl) : Infinity, fg = nf ? per.gap(v, nf) : Infinity;
        if (lg < 3 || fg < 2) continue;
        if (nl && nl.state === 'wrecked' && lg < 15) continue;
        const score = Math.min(lg, 60) + Math.min(fg, 10) * 0.3;
        if (score > bs) { bs = score; best = nb; }
      }
      if (best) {
        intent.targetLane = best; intent.emergency = true; intent.noMobil = true; intent.horn = true;
        v.signals.headlightFlash = 0.4;
        ctx.events.emit('green:overtake', { vehicle: v });
      }
    }
  }

  // The squirrel: brakes only if it costs nothing; otherwise leans on the horn and keeps its foot down.
  if (pl.visible && !pl.behind && pl.inPath && pl.gap > 0) {
    const aStop = -(v.v * v.v) / (2 * Math.max(pl.gap - 1, 0.5));
    if (aStop > -eff.bComf * (1 - 0.5 * v.rage)) intent.aLong = Math.min(intent.aLong, aStop);
    else {
      intent.horn = true;
      v.signals.headlightFlash = Math.max(v.signals.headlightFlash, 0.2);
      if (v.rage <= 0.3) intent.aLong = Math.min(intent.aLong, -eff.bComf);   // calm: a token, insufficient dab
    }
  }
}