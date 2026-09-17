import { chaikin, add, polylineLength } from './geom.js';
import { cellsToWorld } from './generators/common.js';

/**
 * Stage 2½ (problem.md §4.8 step 3): cells → world centrelines, organic jitter, manifold port
 * stubs through the plate, Chaikin smoothing. Produces ch.path (final centreline), ch.ports and
 * ch.length.
 *
 * Only the in‑cartridge part of the path is smoothed: the port stubs (z ∈ [zPort, 0]) stay
 * exactly vertical so they line up with the holes in the manifold plate.
 */
export function postprocess(routing, spec, rng) {
  const zPort = -(spec.plate.thickness + spec.plate.barb);
  const maxD = Math.max(...spec.channels.map((c) => c.diameter));
  const slack = Math.max(0, spec.grid.pitch - maxD - spec.clearanceMin);
  const amp = spec.organic * (0.45 * slack + 0.2 * spec.clearanceMin);   // validator reports any loss

  for (const ch of routing.channels) {
    const pts = ch.cells ? cellsToWorld(ch.cells, routing.grid) : (ch.centreline || []).map((p) => p.slice());
    if (pts.length < 2) { ch.path = []; ch.ports = null; ch.length = 0; continue; }
    if (amp > 0) {
      const a = amp / Math.sqrt(3);
      for (let i = 1; i + 1 < pts.length; i++) {          // never move the port cells
        pts[i] = add(pts[i], [a * (2 * rng() - 1), a * (2 * rng() - 1), a * (2 * rng() - 1)]);
      }
    }
    const f = pts[0], l = pts[pts.length - 1];
    const inner = [[f[0], f[1], 0], ...pts];
    if (!ch.deadEnd) inner.push([l[0], l[1], 0]);
    const smooth = chaikin(inner, spec.smoothing);       // endpoints are fixed by Chaikin
    const path = [[f[0], f[1], zPort], ...smooth];
    if (!ch.deadEnd) path.push([l[0], l[1], zPort]);
    ch.path = path;
    ch.length = polylineLength(path);
    ch.ports = { inlet: [f[0], f[1]], outlet: ch.deadEnd ? null : [l[0], l[1]] };
  }
  return routing;
}