// Tests 1-6 of plan.md §9: code-length identities.

import { describe, it, assert, assertClose, note } from './run.js';
import { makeRng } from '../src/core/rng.js';
import { log2, h2, klBits } from '../src/core/special.js';
import {
  kt,
  h2plug,
  gainFromVolumes,
  gainAtShare,
  partitionCodeLength,
  piecewiseUniformNLL,
  baselineBits,
} from '../src/core/codelength.js';

describe('1. split gain is a KL divergence', () => {
  it('G + C_split = n * KL(p || q) for random splits', () => {
    const rng = makeRng(12345);
    for (let trial = 0; trial < 200; trial++) {
      const nL = 1 + rng.int(500);
      const nR = 1 + rng.int(500);
      const n = nL + nR;
      const VL = rng.range(1e-4, 1);
      const VR = rng.range(1e-4, 1);
      const VP = VL + VR;
      const direct = gainFromVolumes({
        nL, nR, VL, VR, branchBits: h2plug(nL, nR), cSplit: 0,
      });
      const kl = n * klBits([nL / n, nR / n], [VL / VP, VR / VP]);
      assert(Math.abs(direct - kl) < 1e-8, `trial ${trial}: ${direct} vs ${kl}`);
    }
    note('200 random splits matched to < 1e-8 bits');
  });
});

describe('2. multiway identity', () => {
  it('sum n_j log2(mu(D)/mu(R_j)) - N H(P) = N KL(P||Q)', () => {
    const rng = makeRng(777);
    for (let trial = 0; trial < 100; trial++) {
      const k = 2 + rng.int(6);
      const ns = [], vs = [];
      let N = 0, muD = 0;
      for (let j = 0; j < k; j++) {
        const nj = 1 + rng.int(200);
        const vj = rng.range(1e-3, 1);
        ns.push(nj); vs.push(vj); N += nj; muD += vj;
      }
      const P = ns.map((x) => x / N);
      const Q = vs.map((x) => x / muD);
      let lhs = 0;
      for (let j = 0; j < k; j++) lhs += ns[j] * log2(muD / vs[j]);
      let H = 0;
      for (const p of P) H -= p * log2(p);
      lhs -= N * H;
      assertClose(lhs, N * klBits(P, Q), 1e-7, `k=${k}`);
    }
  });
});

describe('3. blob example (§3.3)', () => {
  it('98% of points in 1% of volume gives ~6.37 bits/point', () => {
    const g = klBits([0.98, 0.02], [0.01, 0.99]);
    note(`gain = ${g.toFixed(4)} bits/point`);
    assertClose(g, 6.37, 0.01, 'blob gain');
  });
});

describe('4. noisy line (§7.2)', () => {
  it('a band of area 0.02 holding all mass buys log2(1/0.02) bits', () => {
    assertClose(log2(1 / 0.02), 5.6438561898, 1e-8, 'log2(50)');
    const g = klBits([1 - 1e-12, 1e-12], [0.02, 0.98]);
    assertClose(g, log2(1 / 0.02), 1e-6, 'KL ≈ log2(1/q)');
  });
});

describe('5. Krichevsky-Trofimov branch code', () => {
  it('matches the product form for small n', () => {
    // KT probability of a sequence with nL ones: prod (i-1/2)/(j) factors.
    const seqs = [
      [1, 0], [2, 0], [1, 1], [3, 1], [2, 2], [5, 3],
    ];
    for (const [nL, nR] of seqs) {
      // direct: product over the sequence L^nL then R^nR
      let logp = 0, a = 0, b = 0;
      for (let i = 0; i < nL; i++) { logp += Math.log((a + 0.5) / (a + b + 1)); a++; }
      for (let i = 0; i < nR; i++) { logp += Math.log((b + 0.5) / (a + b + 1)); b++; }
      assertClose(kt(nL, nR), -logp / Math.LN2, 1e-9, `KT(${nL},${nR})`);
    }
  });

  it('kt ~ n H2 + 1/2 log2 n + O(1)', () => {
    for (const n of [64, 256, 1024, 4096]) {
      const nL = Math.round(0.3 * n);
      const regret = kt(nL, n - nL) - h2plug(nL, n - nL) - 0.5 * log2(n);
      note(`n=${n}: regret = ${regret.toFixed(4)} bits`);
      assert(Math.abs(regret) < 1.5, `regret ${regret} not O(1)`);
    }
  });

  it('is finite when one side is empty', () => {
    for (const n of [1, 10, 1000]) {
      const v = kt(n, 0);
      note(`kt(${n},0) = ${v.toFixed(4)} bits (plug-in would be 0)`);
      assert(Number.isFinite(v) && v > 0, 'kt(n,0) must be finite and positive');
    }
  });
});

describe('6. piecewise-uniform equivalence (§3.2)', () => {
  it('code length equals the NLL of the piecewise-uniform density', () => {
    const rng = makeRng(2024);
    const leaves = [];
    let N = 0;
    for (let j = 0; j < 7; j++) {
      const n = 1 + rng.int(300);
      leaves.push({ n, V: rng.range(1e-3, 0.5) });
      N += n;
    }
    assertClose(
      partitionCodeLength(leaves, N),
      piecewiseUniformNLL(leaves, N),
      1e-8,
      'code length vs NLL'
    );
  });

  it('no-model cost at eps = 2^-10 in 3D is 30 bits/point', () => {
    assertClose(baselineBits(1, Math.pow(2, -30)), 30, 1e-12, 'baseline');
  });

  it('gainAtShare agrees with gainFromVolumes', () => {
    const rng = makeRng(99);
    for (let t = 0; t < 100; t++) {
      const nL = 1 + rng.int(200), nR = 1 + rng.int(200);
      const VL = rng.range(1e-3, 1), VR = rng.range(1e-3, 1);
      const bb = kt(nL, nR), c = rng.range(0, 20);
      const a = gainAtShare(VL / (VL + VR), nL, nR, bb, c);
      const b = gainFromVolumes({ nL, nR, VL, VR, branchBits: bb, cSplit: c });
      assert(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);
    }
    note('share form and volume form agree to < 1e-8 bits');
  });
});