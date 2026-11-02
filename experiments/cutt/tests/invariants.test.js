// Randomized §7 property suite.
import { test, assert } from './harness.js';
import { mulberry32 } from '../src/core/rng.js';
import { buildTree, split } from '../src/core/tree.js';
import { compileAll } from '../src/core/compile.js';
import { logVolume } from '../src/core/box.js';
import { supportSolve } from '../src/core/support.js';
import { solveRun } from '../src/core/solve.js';
import { checkInvariants } from '../src/core/invariants.js';
import { resolvePreset } from '../src/presets.js';

function randomSpec(rng, d, depth) {
  if (depth === 0 || rng() < 0.2) return null;
  const t = [0.25, 0.5, 0.75, Math.round(rng() * 20) / 20][Math.floor(rng() * 4)] || 0.5;
  return split(Math.floor(rng() * d), Math.min(0.95, Math.max(0.05, t)), randomSpec(rng, d, depth - 1), randomSpec(rng, d, depth - 1));
}

function randomObs(rng, d, n) {
  const obs = [];
  for (let i = 0; i < n; i++) {
    const lo = [], hi = [];
    for (let j = 0; j < d; j++) {
      const r = rng();
      if (r < 0.2) { const v = [0.25, 0.5, 0.75][Math.floor(rng() * 3)]; lo.push(v); hi.push(v); }
      else if (r < 0.35) { const v = [0.25, 0.5, 0.75][Math.floor(rng() * 3)]; lo.push(v); hi.push(Math.min(1, v + rng() * 0.4)); }
      else { const a = rng(), w = rng() * 0.5; lo.push(a); hi.push(Math.min(1, a + w)); }
    }
    obs.push({ lo: lo.slice(), hi: hi.slice(), lo0: lo, hi0: hi, Y: 1 << Math.floor(rng() * 2) | (rng() < 0.1 ? 3 : 0) });
  }
  return obs;
}

test('randomized §7 invariants (200 problems)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = mulberry32(seed);
    const d = 1 + Math.floor(rng() * 3);
    const tree = buildTree(randomSpec(rng, d, 4), d);
    const obs = randomObs(rng, d, 30);
    const T = compileAll(tree, obs);
    try {
      for (let i = 0; i < T.N; i++) {
        let s = 0, vol = 0;
        const o = obs[i];
        for (let f = T.start[i]; f < T.start[i + 1]; f++) {
          s += T.pi[f];
          vol += Math.exp(logVolume(T.lo[f], T.hi[f]));
          for (let g = f + 1; g < T.start[i + 1]; g++) {
            let inter = true;
            for (let j = 0; j < d; j++) {
              const nd = o.hi[j] - o.lo[j] > 1e-12;
              const ov = Math.min(T.hi[f][j], T.hi[g][j]) - Math.max(T.lo[f][j], T.lo[g][j]);
              if (nd ? ov <= 1e-12 : ov < 0) inter = false;
            }
            assert.ok(!inter, 'fragments overlap');
          }
        }
        assert.close(s, 1, 1e-9, 'pi sums to 1');
        assert.close(vol, Math.exp(logVolume(o.lo, o.hi)), 1e-9, 'partition exactness');
      }
      const prm = { ...resolvePreset('exploratory'), restarts: 1 };
      supportSolve(tree, obs, 2, prm);
      const T2 = compileAll(tree, obs);
      const th = solveRun(T2, { d, C: 2, obs }, prm, { maxIter: 50 });
      const v = checkInvariants({ table: T2, obs, theories: [th] });
      assert.equal(v.length, 0, v.join('; '));
    } catch (e) {
      throw new Error(`seed ${seed}: ${e.message}`);
    }
  }
});