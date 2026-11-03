// Test 16 of plan.md §9: the null control, plus a positive-control sanity
// check that the same machinery does split when structure is present.

import { describe, it, assert, note } from './run.js';
import { makeRng } from '../src/core/rng.js';
import { trainTree } from '../src/tree/train.js';
import { evaluate } from '../src/tree/evaluate.js';
import { countNodes } from '../src/tree/node.js';
import uniform from '../datasets/uniform.js';
import blob from '../datasets/blob.js';

const V_EPS = Math.pow(2, -30);
const OPTS = {
  vEps: V_EPS, maxDepth: 3, nMin: 200,
  measureOpts: { maxBoxes: 40000, minWidth: 1 / 64 },
  treeOpts: { maxBoxes: 40000, minWidth: 1 / 64 },
  refineBudget: 2000, maxThresholds: 16,
};

describe('16. null control on uniform data', () => {
  it('makes at most one split and codes at ~30 bits/point', () => {
    const rng = makeRng(7);
    const N = 8000;
    const xs = uniform.generate({}, rng, N);
    const { tree, stats } = trainTree(xs, OPTS);
    const c = countNodes(tree);
    const idx = [...Array(N).keys()];
    const ev = evaluate(tree, xs, idx, {
      vEps: V_EPS, modelBits: stats.modelBits, nTrain: N,
    });
    note(`splits = ${c.splits}, leaves = ${c.leaves}`);
    note(`test bits/pt = ${ev.bitsPerPoint.toFixed(4)} (no model = 30)`);
    assert(c.splits <= 1, `expected <= 1 split, got ${c.splits}`);
    assert(ev.bitsPerPoint >= 30 - 0.05,
      `uniform data compressed to ${ev.bitsPerPoint}, which must not happen`);
  });
});

describe('positive control: the blob must split', () => {
  it('finds at least one split and compresses below 30 bits/point', () => {
    const rng = makeRng(11);
    const N = 8000;
    const xs = blob.generate({ frac: 0.98 }, rng, N);
    const { tree, stats } = trainTree(xs, { ...OPTS, maxDepth: 5, nMin: 100 });
    const c = countNodes(tree);
    const idx = [...Array(N).keys()];
    const ev = evaluate(tree, xs, idx, {
      vEps: V_EPS, modelBits: stats.modelBits, nTrain: N,
    });
    note(`splits = ${c.splits}, test bits/pt = ${ev.bitsPerPoint.toFixed(3)}`);
    assert(c.splits >= 1, 'blob produced no split');
    assert(ev.bitsPerPoint < 29, `expected compression, got ${ev.bitsPerPoint}`);
  });
});