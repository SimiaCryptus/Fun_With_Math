// Module worker: generates the dataset, trains honestly (train/test split),
// scores baselines, and streams progress plus race snapshots.

import { MSG } from './protocol.js';
import { getDataset } from '../../datasets/index.js';
import { makeRng } from '../core/rng.js';
import { epsToVEps } from '../config.js';
import { trainTree } from '../tree/train.js';
import { evaluate, descend } from '../tree/evaluate.js';
import { profile, estimatedCodim } from '../tree/profile.js';
import { recover } from '../tree/recovery.js';
import { sampleFromTree } from '../tree/sample.js';
import { mdlHistogram } from '../baselines/mdlHistogram.js';
import { kdeBaseline } from '../baselines/kde.js';
import {
  countNodes, treeText, walkLeaves, collectSplits, collectLeafBoxes,
} from '../tree/node.js';

function trainOnce(xs, cfg, vEps, trainIdx, onEvent, multiplier) {
  return trainTree(xs, {
    idx: trainIdx,
    maxDepth: cfg.maxDepth,
    nMin: cfg.nMin ?? 50,
    vEps,
    seed: cfg.seed,
    families: cfg.families,
    slabs: cfg.slabs !== false,
    protocol: cfg.protocol || 'fullSample',
    holdoutFrac: cfg.protocol === 'conditional' ? 0.5 : 0.5,
    complexityMultiplier: multiplier,
    measureOpts: { maxBoxes: 40000, minWidth: 1 / 64, collect: true },
    treeOpts: { maxBoxes: 60000, minWidth: 1 / 64, initialBoxes: 4000 },
    raceBudget: cfg.raceBudget ?? 8000,
    raceStep: cfg.raceStep ?? 750,
    maxThresholds: 24,
    onEvent,
  });
}

self.onmessage = (e) => {
  const cfg = e.data;
  if (cfg.cmd !== MSG.TRAIN) return;
  try {
    const ds = getDataset(cfg.dataset);
    const xs = ds.generate(cfg.params, makeRng(cfg.seed), cfg.N);
    const vEps = epsToVEps(cfg.epsK, 3);
    const N = xs.length / 3;

    const rng = makeRng(cfg.seed + 1013);
    const parts = rng.splitIndices(N, 0.8);
    const trainIdx = Array.from(parts.first);
    const testIdx = Array.from(parts.second);

    const t0 = performance.now();
    const { tree, stats } = trainOnce(xs, cfg, vEps, trainIdx, (ev) => {
      if (ev.type === 'accepted') {
        postMessage({
          type: MSG.PROGRESS,
          text: `d${ev.depth} ${ev.best.family}: ${ev.best.label} ` +
                `G∈[${ev.best.gain.lo.toFixed(2)}, ${ev.best.gain.hi.toFixed(2)}]`,
        });
      } else if (ev.type === 'raceStep') {
        postMessage({ type: MSG.RACE, bars: ev.bars, note: `d${ev.depth} ${ev.note}` });
      }
    }, cfg.complexityMultiplier ?? 1);
    const ms = performance.now() - t0;

    const evTest = evaluate(tree, xs, testIdx, {
      vEps, modelBits: stats.modelBits, nTrain: trainIdx.length,
    });
    const evTrain = evaluate(tree, xs, trainIdx, {
      vEps, modelBits: stats.modelBits, nTrain: trainIdx.length,
    });
    const evTestUpper = evaluate(tree, xs, testIdx, {
      vEps, estimator: 'upper', modelBits: stats.modelBits,
      nTrain: trainIdx.length,
    });

    // baselines
    const baselines = [
      { name: 'uniform cube', bitsPerPoint: 3 * cfg.epsK, modelBitsPerTrainPoint: 0 },
    ];
    if (cfg.baselines !== false) {
      const h = mdlHistogram(xs, trainIdx, testIdx, { vEps });
      if (h) baselines.push(h);
      baselines.push(kdeBaseline(xs, trainIdx, testIdx, { vEps }));
      const det = trainOnce(xs, { ...cfg, families: ['axis'] }, vEps, trainIdx, null, 1);
      const detEv = evaluate(tree === det.tree ? tree : det.tree, xs, testIdx, {
        vEps, modelBits: det.stats.modelBits, nTrain: trainIdx.length,
      });
      baselines.push({
        name: 'axis DET (same codec)',
        bitsPerPoint: detEv.bitsPerPoint,
        modelBitsPerTrainPoint: detEv.modelBitsPerTrainPoint,
      });
    }

    // bits vs model-bits curve
    let curve = null;
    if (cfg.curve) {
      curve = [];
      for (const lam of [0.25, 0.5, 1, 2, 4, 8]) {
        const r = trainOnce(xs, cfg, vEps, trainIdx, null, lam);
        const ee = evaluate(r.tree, xs, testIdx, {
          vEps, modelBits: r.stats.modelBits, nTrain: trainIdx.length,
        });
        curve.push({
          lambda: lam,
          modelBits: r.stats.modelBits,
          splits: r.stats.splits,
          testBits: ee.bitsPerPoint,
        });
        postMessage({ type: MSG.PROGRESS, text: `curve λ=${lam}: ${ee.bitsPerPoint.toFixed(3)} bits/pt` });
      }
    }

    const leaves = [...walkLeaves(tree)];
    const leafIndex = new Map(leaves.map((L, i) => [L, i]));
    const leafIds = new Int32Array(N);
    const x = new Float64Array(3);
    for (let i = 0; i < N; i++) {
      x[0] = xs[i * 3]; x[1] = xs[i * 3 + 1]; x[2] = xs[i * 3 + 2];
      leafIds[i] = leafIndex.get(descend(tree, x));
    }

    const paths = profile(tree, { vEps });
    const { boxes, boxLeafIds } = collectLeafBoxes(tree);
    const points = Float32Array.from(xs);
    const counts = countNodes(tree);
     const sampled = sampleFromTree(
       tree,
       Math.max(0, Math.round(cfg.sampleCount ?? 8000)),
       makeRng(cfg.seed + 7717)
     );

    postMessage(
      {
        type: MSG.DONE,
         points, leafIds, boxes, boxLeafIds, sampled,
        splits: collectSplits(tree),
        text: treeText(tree),
        stats: { ...stats, ...counts, ms, nTrain: trainIdx.length, nTest: testIdx.length },
        evaluation: evTest,
        evaluationTrain: evTrain,
        evaluationUpper: evTestUpper,
        baselines,
        curve,
        profile: paths.slice(0, 24),
        codim: estimatedCodim(paths),
        recovery: recover(tree, ds.truth),
        baseline: 3 * cfg.epsK,
      },
       [points.buffer, leafIds.buffer, boxes.buffer, boxLeafIds.buffer,
        sampled.buffer]
    );
  } catch (err) {
    postMessage({ type: MSG.ERROR, text: String(err && err.stack || err) });
  }
};