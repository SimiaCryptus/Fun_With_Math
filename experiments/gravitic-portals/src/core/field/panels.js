// @ts-check
// Panel layout + softened-source kernel shared by the batch tabulator and the runtime.
// Using the *same* kernel for solve and evaluation makes the Dirichlet condition exact at
// every collocation point and keeps Φ smooth (no adaptive-quadrature switching seams).
import { fromLocal } from '../portal.js';

export const INV4PI = 1 / (4 * Math.PI);

/** rings: radial rings (ring 0 = central disk), sub: point sources per sector panel,
 * epsRel: softening relative to local panel spacing (this is the rim "s_min" knob). */
// sub=2 left the rim as beads ~0.13R apart (softened at ~0.065R), making the field lumpy
// within ~0.15R of the rim (17.7% RMS vs reference). More sources per panel refines the
// rim without growing the linear system (unknowns are per panel, not per source).
export const DEFAULT_LAYOUT = Object.freeze({ rings: 10, sectors: 24, sub: 6, epsRel: 0.5 });

export const panelCount = (o) => 1 + (o.rings - 1) * o.sectors;

/**
 * Panels on a disk frame {center,right,up,normal,radius}. Panel 0 is a central disk
 * collocated at the centre (the most common crossing point); outer rings are graded
 * toward the rim (sin spacing).
 */
export function diskLayout(frame, o) {
  const R = frame.radius;
  const rr = (i) => R * Math.sin((Math.PI / 2) * (i / o.rings));
  const coll = [];
  const pts = [];
  const rc0 = rr(1);
  coll.push({ ...frame.center });
  pts.push({ p: { ...frame.center }, w: Math.PI * rc0 * rc0, e2: (o.epsRel * rc0) ** 2, panel: 0 });
  const dth = (2 * Math.PI) / o.sectors;
  for (let i = 1; i < o.rings; i++) {
    const r0 = rr(i), r1 = rr(i + 1), dr = r1 - r0, rc = 0.5 * (r0 + r1);
    const area = rc * dr * dth;
    const eps = o.epsRel * Math.max(dr, (rc * dth) / o.sub);
    for (let j = 0; j < o.sectors; j++) {
      const panel = coll.length;
      const thc = (j + 0.5) * dth;
      coll.push(fromLocal(frame, { x: rc * Math.cos(thc), y: rc * Math.sin(thc), z: 0 }));
      for (let k = 0; k < o.sub; k++) {
        const th = j * dth + ((k + 0.5) * dth) / o.sub;
        pts.push({
          p: fromLocal(frame, { x: rc * Math.cos(th), y: rc * Math.sin(th), z: 0 }),
          w: area / o.sub,
          e2: eps * eps,
          panel,
        });
      }
    }
  }
  return { coll, pts, count: coll.length };
}

/** Dense collocation matrix A[i][panel] = Σ_sources w / (4π √(d² + ε²)). */
export function kernelSystem(layouts) {
  const coll = [];
  const pts = [];
  let off = 0;
  for (const L of layouts) {
    for (const c of L.coll) coll.push(c);
    for (const p of L.pts) pts.push({ ...p, panel: p.panel + off });
    off += L.count;
  }
  const n = off;
  const A = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const c = coll[i];
    const row = i * n;
    for (const s of pts) {
      const dx = c.x - s.p.x, dy = c.y - s.p.y, dz = c.z - s.p.z;
      A[row + s.panel] += (s.w * INV4PI) / Math.sqrt(dx * dx + dy * dy + dz * dz + s.e2);
    }
  }
  return { A, n };
}