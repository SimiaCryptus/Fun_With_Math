// @ts-check
import * as V from '../vec3.js';
import { toLocal } from '../portal.js';

/**
 * Earliest front→back crossing of segment x0→x1 through any portal disk.
 * Portals are one-sided: back→front passes straight through.
 */
export function findCrossing(x0, x1, entries, excludeId = null) {
  let best = null;
  for (const e of entries) {
    const p = e.portal;
    if (p.id === excludeId) continue;
    const d0 = V.dot(V.sub(x0, p.center), p.normal);
    const d1 = V.dot(V.sub(x1, p.center), p.normal);
    if (!(d0 > 0 && d1 <= 0)) continue;
    const s = d0 / (d0 - d1);
    const hit = V.lerp(x0, x1, s);
    const l = toLocal(p, hit);
    if (l.x * l.x + l.y * l.y > p.radius * p.radius) continue;
    if (!best || s < best.s) best = { s, hit, entry: e };
  }
  return best;
}

/**
 * Apply T to a drift segment. Position uses the full map (incl. λ); velocity uses
 * the rotation part only (phase 1: no momentum scaling, see plan R2).
 *
 * seamError accumulates Φ(hit) − Φ(T hit): exactly 0 if the boundary condition holds.
 * With energyCorrection, speed is adjusted so ½v² + Φ is continuous — the approximate
 * model can then only ever *remove* energy at a seam, never create it.
 */
export function crossPortals(x0, x1, vel, entries, { potential = null, energyCorrection = false, maxHops = 4 } = {}) {
  let a = x0, b = x1, v = vel, count = 0, seamError = 0, exclude = null;
  for (let hop = 0; hop < maxHops; hop++) {
    const c = findCrossing(a, b, entries, exclude);
    if (!c) break;
    const map = c.entry.map;
    const exitPoint = map.point(c.hit);
    const rest = V.scale(map.dir(V.sub(b, c.hit)), map.lambda);
    let vOut = map.dir(v);
    if (potential) {
      const mismatch = potential(c.hit) - potential(exitPoint);
      seamError += mismatch;
      if (energyCorrection) {
        const sp2 = V.lengthSq(vOut);
        const target = sp2 + 2 * mismatch;
        if (sp2 > 0) vOut = target > 0 ? V.scale(vOut, Math.sqrt(target / sp2)) : { x: 0, y: 0, z: 0 };
      }
    }
    a = exitPoint;
    b = V.add(exitPoint, rest);
    v = vOut;
    count++;
    exclude = c.entry.exit.id;
  }
  return { pos: b, vel: v, count, seamError };
}