// M4 additions to plan.md §9 test 7/9: quadratic enclosures and volumes.

import { describe, it, assert, note } from './run.js';
import { makeRng } from '../src/core/rng.js';
import { makeBox, unitBox } from '../src/geometry/box.js';
import { QuadraticField } from '../src/geometry/predicates/quadratic.js';
import { enclosureViolations } from '../src/geometry/predicates/field.js';
import { Region, constraint } from '../src/geometry/region.js';
import { measure } from '../src/geometry/oracle.js';

function randomBox(rng) {
  const lo = [], hi = [];
  for (let i = 0; i < 3; i++) {
    const a = rng.range(-1, 1);
    lo.push(a); hi.push(a + rng.range(1e-3, 0.8));
  }
  return makeBox(lo, hi);
}

function randomQuad(rng, kind) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) M[i][j] = rng.range(-1, 1);
  // Q = M^T M is PSD; negate for concave; add skew/indefinite otherwise.
  const Q = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) Q[i][j] += M[k][i] * M[k][j];
  if (kind === 'concave') {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Q[i][j] *= -1;
  } else if (kind === 'indefinite') {
    Q[0][0] -= 2.5; // break definiteness
  }
  return new QuadraticField(
    Q, [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)], rng.range(-1, 1)
  );
}

describe('7b. quadratic enclosures contain samples', () => {
  for (const kind of ['convex', 'concave', 'indefinite']) {
    it(`${kind} case: no violations`, () => {
      const rng = makeRng(2718 + kind.length);
      let bad = 0, seen = 0;
      for (let t = 0; t < 120; t++) {
        const f = randomQuad(rng, kind);
        if (kind !== 'indefinite' && f.curvature === 'indefinite') continue;
        seen++;
        bad += enclosureViolations(f, randomBox(rng), 400, rng);
      }
      note(`${seen} fields, violations = ${bad}`);
      assert(bad === 0, `${bad} enclosure violations`);
    });
  }

  it('classifies curvature from the Hessian', () => {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const N = [[-1, 0, 0], [0, -1, 0], [0, 0, -1]];
    const S = [[1, 0, 0], [0, -1, 0], [0, 0, 1]];
    assert(new QuadraticField(I, [0, 0, 0], 0).curvature === 'convex');
    assert(new QuadraticField(N, [0, 0, 0], 0).curvature === 'concave');
    assert(new QuadraticField(S, [0, 0, 0], 0).curvature === 'indefinite');
  });
});

describe('9b. ball volume is bracketed by the certified oracle', () => {
  it('|x-c|² < r² brackets 4/3 pi r³', () => {
    const r = 0.3, c = 0.5;
    // (x-c)² + (y-c)² + (z-c)² - r² < 0
    const Q = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const a = [-2 * c, -2 * c, -2 * c];
    const k = 3 * c * c - r * r;
    const f = new QuadraticField(Q, a, k);
    const reg = new Region(unitBox(3), [constraint(f, 'lt', 0)]);
    const m = measure(reg, { maxBoxes: 400000, minWidth: 1 / 64 });
    const truth = (4 / 3) * Math.PI * r * r * r;
    note(`[${m.lo.toFixed(5)}, ${m.hi.toFixed(5)}] truth = ${truth.toFixed(5)}`);
    assert(m.lo <= truth + 1e-9 && truth <= m.hi + 1e-9, 'truth outside interval');
    assert(m.hi - m.lo < 0.03, `gap ${m.hi - m.lo} too wide`);
  });

  it('a shell slab has positive certified measure', () => {
    const Q = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const a = [-1, -1, -1];
    const f = new QuadraticField(Q, a, 0.75); // |x-0.5|²
    const reg = new Region(unitBox(3), [constraint(f, 'slabIn', 0.04, 0.09)]);
    const m = measure(reg, { maxBoxes: 400000, minWidth: 1 / 64 });
    const truth = (4 / 3) * Math.PI * (Math.pow(0.3, 3) - Math.pow(0.2, 3));
    note(`shell [${m.lo.toFixed(5)}, ${m.hi.toFixed(5)}] truth ≈ ${truth.toFixed(5)}`);
    assert(m.lo <= truth + 1e-9 && truth <= m.hi + 1e-9, 'truth outside interval');
  });
});