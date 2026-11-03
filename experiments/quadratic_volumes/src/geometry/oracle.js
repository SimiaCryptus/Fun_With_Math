// Certified measure oracle by adaptive box subdivision (idea.md §5.2).
// Every answer is an interval tagged with its provenance.

import { MaxHeap } from '../core/heap.js';
import { bisect, boxMaxWidth, boxVolume } from './box.js';
import { IN, OUT, UNKNOWN, constraintStatus } from './region.js';

const DEFAULTS = {
  maxBoxes: 20000,     // subdivision budget (boxes created)
  minWidth: 1 / 1024,  // resolution floor on box side length
  collect: false,      // return the IN / UNKNOWN box lists
};

/** Classify a box against its still-active constraints. */
export function classify(constraints, active, box) {
  const next = [];
  for (const ci of active) {
    const s = constraintStatus(constraints[ci], box);
    if (s === OUT) return { status: OUT, active: null };
    if (s === UNKNOWN) next.push(ci); // IN constraints are dropped (§5.2)
  }
  return { status: next.length ? UNKNOWN : IN, active: next };
}

/**
 * Bounds on mu(region). Returns
 * { lo, hi, kind:'certified', boxesIn, boxesUnknown, created }.
 */
export function measure(region, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const cons = region.constraints;
  const heap = new MaxHeap();
  const boxesIn = [];
  const boxesUnknown = [];
  let vIn = 0;
  let vUnk = 0;
  let created = 1;

  const seed = classify(cons, cons.map((_, i) => i), region.box);
  if (seed.status === IN) {
    const v = boxVolume(region.box);
    if (o.collect) boxesIn.push(region.box);
    return { lo: v, hi: v, kind: 'certified', boxesIn, boxesUnknown, created };
  }
  if (seed.status === OUT) {
    return { lo: 0, hi: 0, kind: 'certified', boxesIn, boxesUnknown, created };
  }
  heap.push(boxVolume(region.box), { box: region.box, active: seed.active });

  while (heap.size && created < o.maxBoxes) {
    const node = heap.pop();
    if (boxMaxWidth(node.box) <= o.minWidth) {
      vUnk += boxVolume(node.box);
      if (o.collect) boxesUnknown.push(node.box);
      continue;
    }
    for (const child of bisect(node.box)) {
      created++;
      const c = classify(cons, node.active, child);
      const v = boxVolume(child);
      if (c.status === IN) {
        vIn += v;
        if (o.collect) boxesIn.push(child);
      } else if (c.status === UNKNOWN) {
        heap.push(v, { box: child, active: c.active });
      }
    }
  }
  while (heap.size) {
    const node = heap.pop();
    vUnk += boxVolume(node.box);
    if (o.collect) boxesUnknown.push(node.box);
  }
  return {
    lo: vIn,
    hi: vIn + vUnk,
    kind: 'certified',
    boxesIn,
    boxesUnknown,
    created,
  };
}

/** Bounds on mu(A ∩ B) / mu(B), with interval arithmetic on the ratio. */
export function conditional(regionA, regionB, opts = {}) {
  const ab = measure(regionA.withAll(regionB.constraints), opts);
  const b = measure(regionB, opts);
  if (b.hi <= 0) return { lo: 0, hi: 1, kind: 'certified' };
  return {
    lo: b.hi > 0 ? ab.lo / b.hi : 0,
    hi: b.lo > 0 ? Math.min(1, ab.hi / b.lo) : 1,
    kind: 'certified',
  };
}

export { IN, OUT, UNKNOWN };