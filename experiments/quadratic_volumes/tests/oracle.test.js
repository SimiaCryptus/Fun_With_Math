// Tests 9 (affine cases) and 11 of plan.md §9.

import { describe, it, assert, assertClose, note } from './run.js';
import { makeRng } from '../src/core/rng.js';
import { unitBox, makeBox } from '../src/geometry/box.js';
import { AffineField, axisField } from '../src/geometry/predicates/affine.js';
import { Region, constraint } from '../src/geometry/region.js';
import { measure } from '../src/geometry/oracle.js';
import { FieldBoxTree } from '../src/geometry/fieldBoxTree.js';

describe('9. monotone tightening and analytic volumes (affine)', () => {
  it('axis half-space volume is exact and certified', () => {
    for (const t of [0.1, 0.25, 0.5, 0.75]) {
      const r = new Region(unitBox(3), [constraint(axisField(0), 'lt', t)]);
      const m = measure(r, { maxBoxes: 20000, minWidth: 1 / 256 });
      note(`x<${t}: [${m.lo.toFixed(6)}, ${m.hi.toFixed(6)}] true=${t}`);
      assert(m.lo <= t + 1e-12 && t <= m.hi + 1e-12, 'truth outside interval');
      assertClose(m.lo, t, 1e-9, `axis-cut lower bound t=${t}`);
    }
  });

  it('oblique half-space ∩ cube: interval contains the truth and tightens', () => {
    // x + y + z < 1 cuts a corner simplex of volume 1/6.
    const f = new AffineField([1, 1, 1], 0);
    const r = new Region(unitBox(3), [constraint(f, 'lt', 1)]);
    const truth = 1 / 6;
    let plo = -Infinity, phi = Infinity;
    for (const mw of [1 / 8, 1 / 16, 1 / 32, 1 / 64]) {
      const m = measure(r, { maxBoxes: 400000, minWidth: mw });
      note(`minWidth=${mw}: [${m.lo.toFixed(6)}, ${m.hi.toFixed(6)}] gap=${(m.hi - m.lo).toExponential(2)}`);
      assert(m.lo <= truth + 1e-12 && truth <= m.hi + 1e-12, 'truth outside interval');
      assert(m.lo >= plo - 1e-12, 'lower bound decreased');
      assert(m.hi <= phi + 1e-12, 'upper bound increased');
      plo = m.lo; phi = m.hi;
    }
    assert(phi - plo < 0.02, `final gap ${phi - plo} too wide`);
  });

  it('slab volume: |x+y+z-1.5| < 0.1 brackets a quadrature reference', () => {
    const f = new AffineField([1, 1, 1], 0);
    const r = new Region(unitBox(3), [constraint(f, 'slabIn', 1.4, 1.6)]);
    const m = measure(r, { maxBoxes: 300000, minWidth: 1 / 64 });
    // Monte-Carlo reference with a fixed seed.
    const rng = makeRng(5);
    let hits = 0, M = 400000;
    for (let i = 0; i < M; i++) {
      const s = rng.uniform() + rng.uniform() + rng.uniform();
      if (s >= 1.4 && s < 1.6) hits++;
    }
    const mc = hits / M;
    note(`certified [${m.lo.toFixed(5)}, ${m.hi.toFixed(5)}], MC ≈ ${mc.toFixed(5)}`);
    assert(m.lo - 0.005 <= mc && mc <= m.hi + 0.005, 'MC estimate outside interval');
  });

  it('an empty region measures to [0,0]', () => {
    const r = new Region(unitBox(3), [
      constraint(axisField(0), 'lt', 0.2),
      constraint(axisField(0), 'ge', 0.8),
    ]);
    const m = measure(r, { minWidth: 1 / 64 });
    assert(m.lo === 0 && m.hi === 0, `expected [0,0], got [${m.lo},${m.hi}]`);
  });
});

describe('11. shared sweep agrees with independent oracle calls', () => {
  it('FieldBoxTree bounds bracket measure() for every threshold', () => {
    const rng = makeRng(31);
    const region = new Region(unitBox(3), [
      constraint(axisField(2), 'lt', 0.8),
    ]);
    const f = new AffineField([0.6, -0.5, 0.3], -0.05);
    const tree = new FieldBoxTree(region, f, { minWidth: 1 / 64, maxBoxes: 200000 });
    const ts = [-0.2, -0.05, 0.0, 0.08, 0.2];
    tree.refine(ts, 20000);
    for (const t of ts) {
      const b = tree.bounds(t);
      const mL = measure(region.with(constraint(f, 'lt', t)),
        { minWidth: 1 / 64, maxBoxes: 200000 });
      const mR = measure(region.with(constraint(f, 'ge', t)),
        { minWidth: 1 / 64, maxBoxes: 200000 });
      note(`t=${t}: sweep VL=[${b.VL.lo.toFixed(4)},${b.VL.hi.toFixed(4)}] ` +
           `oracle=[${mL.lo.toFixed(4)},${mL.hi.toFixed(4)}]`);
      // Both are valid enclosures of the same volume: their intervals must meet.
      assert(b.VL.lo <= mL.hi + 1e-9 && mL.lo <= b.VL.hi + 1e-9, 'VL intervals disjoint');
      assert(b.VR.lo <= mR.hi + 1e-9 && mR.lo <= b.VR.hi + 1e-9, 'VR intervals disjoint');
      assert(b.VL.lo <= b.VL.hi && b.VR.lo <= b.VR.hi, 'malformed interval');
    }
  });

  it('children measures sum to the parent measure', () => {
    const region = new Region(unitBox(3));
    const f = new AffineField([1, 0.4, -0.7], -0.2);
    const tree = new FieldBoxTree(region, f, { minWidth: 1 / 64 });
    tree.refine([0, 0.1], 20000);
    const P = tree.parentMeasure();
    for (const t of [0, 0.1]) {
      const b = tree.bounds(t);
      assert(b.VL.lo + b.VR.lo <= P.hi + 1e-9, 'lower bounds exceed parent');
      assert(b.VL.hi + b.VR.hi >= P.lo - 1e-9, 'upper bounds below parent');
    }
    note(`parent measure = [${P.lo.toFixed(6)}, ${P.hi.toFixed(6)}] (truth 1)`);
  });

  it('refinement never loosens the sweep bounds', () => {
    const region = new Region(unitBox(3));
    const f = new AffineField([0.9, 0.2, 0.3], -0.6);
    const tree = new FieldBoxTree(region, f, { minWidth: 1 / 128 });
    let prev = null;
    for (let k = 0; k < 4; k++) {
      tree.refine([0], 500);
      const b = tree.bounds(0);
      if (prev) {
        assert(b.VL.lo >= prev.VL.lo - 1e-12, 'VL lower decreased');
        assert(b.VL.hi <= prev.VL.hi + 1e-12, 'VL upper increased');
      }
      prev = b;
    }
    note(`final VL gap = ${(prev.VL.hi - prev.VL.lo).toExponential(2)}`);
  });
});