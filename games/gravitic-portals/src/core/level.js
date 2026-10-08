// @ts-check
import { createUniformGravity } from './background.js';
import { makePortal } from './portal.js';
import { World } from './sim/world.js';
import { createEmitter } from './sim/emitter.js';

/** Shared by the browser app and the headless runner. */
export function createWorldFromLevel(level, overrides = {}) {
  const background = createUniformGravity(level.gravity ?? {});
  const portals = (level.portals ?? []).map((p) => makePortal(p));
  const world = new World({
    background,
    portals,
    dt: level.dt ?? 1 / 120,
    coef: level.field?.coefficients ?? {},
    terms: level.field?.terms ?? {},
    ...overrides,
  });
  for (const p of level.particles ?? []) world.addParticle(p.pos, p.vel ?? [0, 0, 0]);
  const emitter = level.emitter ? createEmitter(level.emitter) : null;
  return { world, emitter };
}