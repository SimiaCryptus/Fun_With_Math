// Tests 7-8 of plan.md §9: enclosure soundness and affine exactness.

import { describe, it, assert, note } from './run.js';
import { makeRng } from '../src/core/rng.js';
import { makeBox, boxCorners } from '../src/geometry/box.js';
import { AffineField, axisField } from '../src/geometry/predicates/affine.js';
import { enclosureViolations } from '../src/geometry/predicates/field.js';

function randomBox(rng, d = 3) {
  const lo = [], hi = [];
  for (let i = 0; i < d; i++) {
    const a = rng.range(-1, 1), b = a + rng.range(1e-3, 1);
    lo.push(a); hi.push(b);
  }
  return makeBox(lo, hi);
}

describe('7. enclosures contain samples (affine)', () => {
  it('no violations over 200 boxes x 500 samples', () => {
    const rng = makeRng(4242);
    let bad = 0;
    for (let t = 0; t < 200; t++) {
      const f = new AffineField(
        [rng.range(-3, 3), rng.range(-3, 3), rng.range(-3, 3)], rng.range(-1, 1)
      );
      bad += enclosureViolations(f, randomBox(rng), 500, rng);
    }
    note(`violations = ${bad} / 100000 samples`);
    assert(bad === 0, `${bad} enclosure violations`);
  });
});

describe('8. affine range is exact', () => {
  it('range equals the min/max over the 8 corners', () => {
    const rng = makeRng(8080);
    for (let t = 0; t < 300; t++) {
      const f = new AffineField(
        [rng.range(-5, 5), rng.range(-5, 5), rng.range(-5, 5)], rng.range(-2, 2)
      );
      const b = randomBox(rng);
      const r = f.range(b);
      let lo = Infinity, hi = -Infinity;
      for (const v of boxCorners(b)) {
        const z = f.eval(v);
        lo = Math.min(lo, z); hi = Math.max(hi, z);
      }
      assert(Math.abs(r.lo - lo) < 1e-12 && Math.abs(r.hi - hi) < 1e-12,
        `[${r.lo},${r.hi}] vs [${lo},${hi}]`);
    }
    note('300 random affine fields matched vertex extrema to < 1e-12');
  });

  it('axis fields read off the box bounds', () => {
    const b = makeBox([0.1, 0.2, 0.3], [0.4, 0.9, 0.35]);
    for (let k = 0; k < 3; k++) {
      const r = axisField(k).range(b);
      assert(Math.abs(r.lo - b.lo[k]) < 1e-15 && Math.abs(r.hi - b.hi[k]) < 1e-15);
    }
  });
});