import { BuilderRole } from './builder.js';

/**
 * Role interface:
 *   start(troop, sim)          — called once when assigned
 *   update(troop, dt, sim)     — called when the troop is idle in a cell; return true if handled
 *   stop(troop, sim)           — called when the role ends (finished, fell, died)
  *
  * Roles are Lemmings-style commands given to an individual troop. Blocking is no longer a role:
  * soldiers follow signs (see items/sign.js), so the Blocker is a placeable sign instead.
 */
export const ROLES = Object.freeze({
  builder: BuilderRole,
});