import { test, assert, IS_NODE } from './harness.js';
import { buildTree, split, gridSpec } from '../src/core/tree.js';
import { compileObs, compileAll, splitLeafIncremental } from '../src/core/compile.js';
import { cpUpper } from '../src/core/stats.js';
import { supportSolve } from '../src/core/support.js';
import { solveRun, updateOne } from '../src/core/solve.js';
import { bounds } from '../src/core/bounds.js';
import { Run, paramsForScenario } from '../src/controller.js';
import { resolvePreset } from '../src/presets.js';

const tree1 = () => buildTree(split(0, 0.5), 1);

test('compile: interval touching threshold from below routes left only', () => {
  const fr = compileObs(tree1(), [0.3], [0.5]);
  assert.equal(fr.length, 1); assert.equal(fr[0].leaf, 0);
});

test('compile: degenerate interval at threshold routes right', () => {
  const fr = compileObs(tree1(), [0.5], [0.5]);
  assert.equal(fr.length, 1); assert.equal(fr[0].leaf, 1); assert.equal(fr[0].pi, 1);
});

test('compile: straddling interval splits with length-ratio pi', () => {
  const fr = compileObs(tree1(), [0.4], [0.8]);
  assert.equal(fr.length, 2);
  assert.close(fr[0].pi, 0.25, 1e-12); assert.close(fr[1].pi, 0.75, 1e-12);
});

test('compile: incremental split equals full recompilation', () => {
  const t = buildTree(gridSpec(2, [[0.5], [0.5]]), 2);
  const obs = [{ lo: [0.1, 0.2], hi: [0.7, 0.9] }, { lo: [0.3, 0.3], hi: [0.3, 0.3] }, { lo: [0.05, 0.6], hi: [0.45, 0.95] }];
  const T0 = compileAll(t, obs);
  const T1 = splitLeafIncremental(t, T0, 0, 0, 0.25);
  const T2 = compileAll(t, obs);
  assert.equal(T1.n, T2.n);
  for (let f = 0; f < T1.n; f++) {
    assert.equal(T1.leaf[f], T2.leaf[f]); assert.close(T1.pi[f], T2.pi[f], 1e-12);
    for (let j = 0; j < 2; j++) { assert.close(T1.lo[f][j], T2.lo[f][j], 1e-15); assert.close(T1.hi[f][j], T2.hi[f][j], 1e-15); }
  }
});

test('Clopper–Pearson matches reference values', () => {
  assert.close(cpUpper(0, 10, 0.05), 1 - Math.pow(0.05, 0.1), 1e-6);
  assert.close(cpUpper(5, 10, 0.025), 0.812914, 1e-6);
  assert.equal(cpUpper(3, 3, 0.05), 1);
});

function s1Run(extra = {}) {
  return new Run({ ...paramsForScenario('S1', 3), N: 300, ...extra });
}

test('support: order invariance and monotonicity', () => {
  const r = s1Run();
  const prm = r.prm;
  const base = r.prob.obs.map(o => ({ ...o, lo: o.lo0.slice(), hi: o.hi0.slice() }));
  const a = base.map(o => ({ ...o, lo: o.lo.slice(), hi: o.hi.slice() }));
  supportSolve(r.tree, a, 2, prm);
  const perm = base.map((_, i) => i).reverse();
  const b = perm.map(i => ({ ...base[i], lo: base[i].lo.slice(), hi: base[i].hi.slice() }));
  supportSolve(r.tree, b, 2, prm);
  perm.forEach((i, k) => {
    for (let j = 0; j < 2; j++) {
      assert.equal(a[i].lo[j], b[k].lo[j], 'order'); assert.equal(a[i].hi[j], b[k].hi[j], 'order');
      assert.ok(a[i].lo[j] >= a[i].lo0[j] && a[i].hi[j] <= a[i].hi0[j], 'monotone');
      assert.ok(a[i].lo[j] <= a[i].hi[j], 'non-empty');
    }
  });
});

test('support: only singleton-label anchors with enough count exclude; contradictions never empty', () => {
  const t = tree1();
  const obs = [];
  for (let k = 0; k < 40; k++) obs.push({ lo: [0.1], hi: [0.2], lo0: [0.1], hi0: [0.2], Y: 1 });
  for (let k = 0; k < 40; k++) obs.push({ lo: [0.7], hi: [0.8], lo0: [0.7], hi0: [0.8], Y: 2 });
  obs.push({ lo: [0.3], hi: [0.9], lo0: [0.3], hi0: [0.9], Y: 1 });   // should trim to [0.3, 0.5]
  obs.push({ lo: [0.3], hi: [0.9], lo0: [0.3], hi0: [0.9], Y: 3 });   // partial label: no trim
  const res = supportSolve(t, obs, 2, resolvePreset('balanced'));
  assert.close(obs[80].hi[0], 0.5, 0, 'trimmed');
  assert.close(obs[81].hi[0], 0.9, 0, 'partial not trimmed');
  assert.equal(res.contradictions.length, 0);
});

test('solve: leave-one-out update ignores own previous masses', () => {
  const r = s1Run({ width: 0.3 });
  const T = r.table;
  let i = 0;
  while (T.start[i + 1] - T.start[i] < 2) i++;
  const w1 = Float64Array.from(T.pi), w2 = Float64Array.from(T.pi);
  w2[T.start[i]] = 0.999; w2[T.start[i] + 1] = 1 - 0.999 - (T.start[i + 1] - T.start[i] - 2) * 0;
  for (let f = T.start[i] + 2; f < T.start[i + 1]; f++) w2[f] = 0;
  const u1 = updateOne(T, r.prob, r.prm, w1, i, true), u2 = updateOne(T, r.prob, r.prm, w2, i, true);
  for (let k = 0; k < u1.length; k++) assert.close(u1[k], u2[k], 1e-10);
});

test('solve: beta = infinity reproduces the prior', () => {
  const r = new Run({ ...paramsForScenario('S1', 2), N: 200, width: 0.3, overrides: { beta: 'inf' } });
  const th = solveRun(r.table, r.prob, r.prm, {});
  for (let f = 0; f < r.table.n; f++) assert.close(th.w[f], r.table.pi[f], 1e-12);
});

test('bounds: ensemble envelope nested in local envelope within [0,1]', () => {
  const r = s1Run({ width: 0.3 });
  r.solve();
  const b = bounds(r.table, r.prob, r.prm, {}, r.theories);
  for (let f = 0; f < r.table.n; f++) {
    assert.ok(b.lLo[f] <= b.eLo[f] + 1e-9 && b.eHi[f] <= b.lHi[f] + 1e-9, 'nesting');
    assert.ok(b.lLo[f] >= 0 && b.lHi[f] <= 1, 'unit range');
  }
});

test('challenge: no new theory at beta = infinity', () => {
  const r = new Run({ ...paramsForScenario('S1', 4), N: 200, width: 0.3, overrides: { beta: 'inf', restarts: 2 } });
  r.solve(); r.challenge();
  assert.equal(r.theories.length, 1);
});

test('E0 reduction: exact data', () => {
  const r = new Run({ ...paramsForScenario('S0', 1), N: 200 });
  r.runAll();
  for (let i = 0; i < r.table.N; i++) assert.equal(r.table.start[i + 1] - r.table.start[i], 1);
  assert.equal(r.sup.prov.length, 0);
  assert.equal(r.theories.length, 1);
  assert.equal(r.violations.length, 0);
});

test('S1 headless: no false exclusion under clean labels', () => {
  const r = s1Run({ N: 500 });
  r.compile(); r.support(); r.solve();
  assert.equal(r.metrics().falseExcl, 0);
  assert.equal(r.violations.length, 0);
});

test('firewall: no core module reads latent truth', async () => {
  if (!IS_NODE) return;
  const fs = await import('node:fs');
  const dir = new URL('../src/core/', import.meta.url);
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/xStar|yStar|evalRec/.test(src), `${f} references latent truth`);
  }
});