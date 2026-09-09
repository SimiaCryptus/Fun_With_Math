/**
 * Temporal Gear table. `offset` = how far back the velocity vector is pulled from.
 *   blend           how much of the past vector the PLAYER receives (1 = fully)
 *   aiBlend         how much AI receive (lower = they merely wobble)
 *   headingRealign  0..1 rotate the resulting vector toward current heading
 *                   (high = corrective/tidy, low = violent sideways yank)
 *   angularBlend    how much past yawRate is restored
 *   chaosRadius     metres of AI blast radius, -1 = entire field
 *   panic           AI FLAIL intensity 0..1
 */
export const GEARS = [
  {
    id: 'T1', name: "Lil' Skipper", offset: 8, cooldown: 6,
    blend: 1.0, aiBlend: 0.55, headingRealign: 0.55, angularBlend: 0.6,
    chaosRadius: 35, panic: 0.35, impulseScale: 0.35,
    sfx: 'boink', shake: 0.35, unlocked: true,
    blurb: 'Tiny cartoon lever. Fixes a micro-slide. boink!'
  },
  {
    id: 'T2', name: "Big Ol' Skipper", offset: 20, cooldown: 12,
    blend: 1.0, aiBlend: 0.80, headingRealign: 0.25, angularBlend: 0.9,
    chaosRadius: 80, panic: 0.70, impulseScale: 0.7,
    sfx: 'blorp', shake: 0.7, unlocked: true,
    blurb: 'Huge red plunger. Undoes a bad line. BLORP!'
  },
  {
    id: 'T3', name: 'Grandpappy Skipper', offset: 40, cooldown: 22,
    blend: 1.0, aiBlend: 1.0, headingRealign: 0.0, angularBlend: 1.0,
    chaosRadius: -1, panic: 1.0, impulseScale: 1.0,
    sfx: 'skree', shake: 1.0, unlocked: true,
    blurb: 'Rusty crank with a screaming face. SKREEEEEE!'
  },
  // --- unlockables (M8) ---
  {
    id: 'T0', name: 'Twitch', offset: 3, cooldown: 3.5,
    blend: 1.0, aiBlend: 0.3, headingRealign: 0.85, angularBlend: 0.4,
    chaosRadius: 18, panic: 0.2, impulseScale: 0.2,
    sfx: 'boink', shake: 0.2, unlocked: false,
    blurb: 'Barely a hiccup. For surgeons.'
  },
  {
    id: 'T4', name: 'Geezer', offset: 70, cooldown: 35,
    blend: 1.0, aiBlend: 1.0, headingRealign: 0.0, angularBlend: 1.0,
    chaosRadius: -1, panic: 1.0, impulseScale: 1.25,
    sfx: 'skree', shake: 1.25, unlocked: false,
    blurb: 'Remembers the starting line. Terrifying.'
  }
];

export const gearById = (id) => GEARS.find((g) => g.id === id) || GEARS[0];
export const unlockedGears = (unlocks = []) =>
  GEARS.filter((g) => g.unlocked || unlocks.includes(g.id));

/** Longest offset we must retain history for, given available gears. */
export const maxGearOffset = () => GEARS.reduce((m, g) => Math.max(m, g.offset), 0);