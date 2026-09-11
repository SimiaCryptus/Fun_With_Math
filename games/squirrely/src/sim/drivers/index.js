import * as red from './red.js';
import * as yellow from './yellow.js';
import * as blue from './blue.js';
import * as green from './green.js';
import * as purple from './purple.js';
import * as white from './white.js';

const MODULES = { red, yellow, blue, green, purple, white };

/** Registry: id → { profile, tick, params?, init? }. Level modifiers (§13.4) are baked into the profile copies. */
export function createDriverRegistry(profiles, modifiers = {}) {
  const reg = {};
  for (const id in profiles) {
    const base = profiles[id];
    const p = { ...base, extras: { ...base.extras } };
    if (modifiers.night) p.detectRange *= 0.6;
    if (modifiers.rain) { p.bMax *= 0.65; p.bComf *= 0.7; }
    const mod = MODULES[id];
    if (!mod) throw new Error(`No driver module registered for '${id}'`);
    reg[id] = { id, profile: Object.freeze(p), tick: mod.tick, params: mod.params ?? null, init: mod.init ?? null };
  }
  return reg;
}

export const DRIVER_IDS = Object.keys(MODULES);