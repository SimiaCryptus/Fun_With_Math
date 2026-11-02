import { test, assert } from './harness.js';
import { mulberry32 } from '../src/core/rng.js';
import { split } from '../src/core/tree.js';
import { learnTree } from '../src/core/learn.js';
import { Run, paramsForScenario } from '../src/controller.js';

// Independent reference CART (Gini, midpoint thresholds, same stopping rules).
function cart(X, y, C, d, { dMax, mLeaf, minGain }) {
  const g = idx => {
    const v = new Float64Array(C);
    for (const i of idx) v[y[i]]++;
    let s = 0;
    for (const x of v) s += x * x;
    return idx.length ? idx.length - s / idx.length : 0;
  };
  const rec = (idx, depth) => {
    if (idx.length < mLeaf || depth >= dMax) return null;
    let best = null;
    for (let j = 0; j < d; j++) {
      const vals = [...new Set(idx.map(i => X[i][j]))].sort((a, b) => a - b);
      for (let k = 0; k + 1 < vals.length; k++) {
        const t = (vals[k] + vals[k + 1]) / 2;
        const L = idx.filter(i => X[i][j] < t), R = idx.filter(i => X[i][j] >= t);
        const sc = g(idx) - g(L) - g(R);
        if (!best || sc > best.sc) best = { j, t, sc, L, R };
      }
    }
    if (!best || !(best.sc > minGain)) return null;
    return split(best.j, best.t, rec(best.L, depth + 1), rec(best.R, depth + 1));
  };
  return rec(X.map((_, i) => i), 0);
}

test('E0: learner on exact data reproduces CART (S1)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const rng = mulberry32(seed);
    const X = [], y = [], obs = [];
    for (let i = 0; i < 80; i++) {
      const x = [rng(), rng()];
      const c = (x[0] > 0.4) !== (x[1] > 0.6) ? 1 : 0;
      X.push(x); y.push(c);
      obs.push({ lo: x.slice(), hi: x.slice(), Y: 1 << c });
    }
    const cfg = { dMax: 4, mLeaf: 3, minGain: 0 };
    const ref = cart(X, y, 2, 2, cfg);
    const { spec } = learnTree(obs, 2, 2, { ...cfg, crit: 'S1' });
    assert.equal(JSON.stringify(spec), JSON.stringify(ref), `seed ${seed}`);
  }
});

test('learner respects fragment budget', () => {
  const r = new Run({ ...paramsForScenario('S5', 2), N: 200, width: 0.3, fragBudget: 1.5 });
  assert.ok(r.learnStats.frags <= 1.5 * 200, 'budget');
  assert.ok(r.table.n <= 1.5 * 200 + 1e-9, 'table within budget');
});

test('rebuild loop: supports only shrink, invariants hold (P6)', () => {
  const r = new Run({ ...paramsForScenario('S8', 3), N: 300 });
  r.rebuild();
  for (const o of r.prob.obs) for (let j = 0; j < 2; j++) {
    assert.ok(o.lo[j] >= o.lo0[j] - 1e-12 && o.hi[j] <= o.hi0[j] + 1e-12, 'monotone');
    assert.ok(o.lo[j] <= o.hi[j], 'non-empty');
  }
  assert.ok(r.rebuildLog.length >= 1);
  assert.equal(r.violations.length, 0);
});

test('S5 headless: learned circle, no false exclusion, S3 criterion runs', () => {
  for (const crit of ['S1', 'S3']) {
    const r = new Run({ ...paramsForScenario('S5', 1), N: 300, crit });
    r.runAll();
    assert.equal(r.metrics().falseExcl, 0, crit);
    assert.equal(r.violations.length, 0, crit);
  }
});