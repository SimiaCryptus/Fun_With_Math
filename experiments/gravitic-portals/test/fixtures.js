// Shared test fixtures (no tests here).
import { createUniformGravity } from '../src/core/background.js';
import { makePortal } from '../src/core/portal.js';
import { createPair } from '../src/core/portalMap.js';
import { World } from '../src/core/sim/world.js';

export const G = 9.81;
export const bg = createUniformGravity({ g: G });

export function floorCeilingPortals(h = 2, R = 1) {
  return [
    makePortal({ id: 1, center: [0, 0, 0], normal: [0, 1, 0], up: [0, 0, -1], radius: R, linkId: 2 }),
    makePortal({ id: 2, center: [0, h, 0], normal: [0, -1, 0], up: [0, 0, -1], radius: R, linkId: 1 }),
  ];
}

export function floorCeilingPair(h = 2, R = 1) {
  const [a, b] = floorCeilingPortals(h, R);
  return createPair(a, b, bg);
}

export function tiltedPortals() {
  const s = Math.SQRT1_2;
  return [
    makePortal({ id: 1, center: [0, 0, 0], normal: [0, 1, 0], up: [0, 0, -1], radius: 1, linkId: 2 }),
    makePortal({ id: 2, center: [3, 2, 0], normal: [-s, -s, 0], radius: 1, linkId: 1 }),
  ];
}

/** Coefficients pinned for tests so `tools/fit.js --write` cannot change outcomes. */
export const TEST_COEF = { gapFadeLo: 3, gapFadeHi: 8 };

export function makeWorld(portals, opts = {}) {
  return new World({ background: bg, portals, dt: 1 / 120, coef: TEST_COEF, ...opts });
}

export const close = (a, b, eps) => Math.abs(a - b) <= eps;