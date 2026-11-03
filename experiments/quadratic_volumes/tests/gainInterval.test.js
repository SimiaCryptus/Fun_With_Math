// Tests 13-14 of plan.md §9: gain-interval containment and convexity.

import { describe, it, assert, note } from './run.js';
import { makeRng } from '../src/core/rng.js';
import { kt, gainAtShare, gainFromVolumes, gainInterval } from '../src/core/codelength.js';

const V_EPS = Math.pow(2, -30);

describe('13. gain interval containment', () => {
  it('[G-, G+] brackets G(true q) for random volume intervals', () => {
    const rng = makeRng(31337);
    for (let t = 0; t < 500; t++) {
      const nL = rng.int(400), nR = 1 + rng.int(400);
      const VLtrue = rng.range(1e-6, 1), VRtrue = rng.range(1e-6, 1);
      // oracle-style brackets around the truth
      const VL = { lo: VLtrue * rng.range(0.2, 1), hi: VLtrue * rng.range(1, 3), kind: 'certified' };
      const VR = { lo: VRtrue * rng.range(0.2, 1), hi: VRtrue * rng.range(1, 3), kind: 'certified' };
      const branchBits = kt(nL, nR), cSplit = rng.range(0, 30);
      const iv = gainInterval({ nL, nR, VL, VR, vEps: V_EPS, branchBits, cSplit });
      const gTrue = gainFromVolumes({ nL, nR, VL: VLtrue, VR: VRtrue, branchBits, cSplit });
      assert(iv.lo <= gTrue + 1e-6 && gTrue <= iv.hi + 1e-6,
        `t=${t}: ${gTrue} not in [${iv.lo}, ${iv.hi}]`);
    }
    note('500 random cases contained');
  });

  it('G+ stays finite at cold start (V- = 0)', () => {
    const iv = gainInterval({
      nL: 100, nR: 100,
      VL: { lo: 0, hi: 0.5, kind: 'certified' },
      VR: { lo: 0, hi: 0.5, kind: 'certified' },
      vEps: V_EPS, branchBits: kt(100, 100), cSplit: 0,
    });
    note(`cold-start interval = [${iv.lo.toFixed(2)}, ${iv.hi.toFixed(2)}]`);
    assert(Number.isFinite(iv.hi), 'G+ must be finite');
    assert(iv.hi <= 100 * 30 + 1e-6, 'G+ cannot exceed full-resolution saving');
  });

  it('tightens monotonically as the oracle brackets narrow', () => {
    const nL = 300, nR = 20, branchBits = kt(nL, nR);
    let prev = null;
    for (const shrink of [1, 0.5, 0.25, 0.05, 0.001]) {
      const VL = { lo: 0.01 * (1 - shrink), hi: 0.01 * (1 + shrink), kind: 'certified' };
      const VR = { lo: 0.99 * (1 - shrink), hi: 0.99 * (1 + shrink), kind: 'certified' };
      const iv = gainInterval({ nL, nR, VL, VR, vEps: V_EPS, branchBits, cSplit: 0 });
      const w = iv.hi - iv.lo;
      note(`shrink=${shrink}: width = ${w.toFixed(4)} bits`);
      if (prev !== null) assert(w <= prev + 1e-9, 'interval widened under refinement');
      prev = w;
    }
  });
});

describe('14. convexity of G in the share q_L', () => {
  it('G is convex and minimized at q_L = p_L (plug-in branch code)', () => {
    const rng = makeRng(555);
    for (let t = 0; t < 50; t++) {
      const nL = 1 + rng.int(500), nR = 1 + rng.int(500);
      const n = nL + nR, pL = nL / n;
      const bb = n * (-(pL * Math.log2(pL) + (1 - pL) * Math.log2(1 - pL)));
      const f = (q) => gainAtShare(q, nL, nR, bb, 0);
      // convexity by second difference
      for (let i = 1; i < 40; i++) {
        const q = i / 40, h = 1 / 400;
        if (q - h <= 0 || q + h >= 1) continue;
        assert(f(q - h) + f(q + h) - 2 * f(q) > -1e-6, 'not convex at q=' + q);
      }
      // argmin at pL, value 0
      assert(Math.abs(f(pL)) < 1e-8, `min value ${f(pL)} != 0`);
      for (const d of [-0.05, -0.01, 0.01, 0.05]) {
        const q = Math.min(0.999, Math.max(0.001, pL + d));
        assert(f(q) >= f(pL) - 1e-9, 'pL is not the argmin');
      }
    }
    note('50 random count pairs: convex, argmin at pL, G(pL) = 0');
  });
});