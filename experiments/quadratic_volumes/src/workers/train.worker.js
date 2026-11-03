// Module worker: generates the dataset, trains, and streams progress.

import { MSG } from './protocol.js';
import { getDataset } from '../../datasets/index.js';
import { makeRng } from '../core/rng.js';
import { epsToVEps } from '../config.js';
import { trainTree } from '../tree/train.js';
import { evaluate, descend } from '../tree/evaluate.js';
import {
  countNodes, treeText, walkLeaves, collectSplits, collectLeafBoxes,
} from '../tree/node.js';

self.onmessage = (e) => {
  const cfg = e.data;
  if (cfg.cmd !== MSG.TRAIN) return;
  try {
    const ds = getDataset(cfg.dataset);
    const xs = ds.generate(cfg.params, makeRng(cfg.seed), cfg.N);
    const vEps = epsToVEps(cfg.epsK, 3);
    const t0 = performance.now();

    const { tree, stats } = trainTree(xs, {
      maxDepth: cfg.maxDepth,
      nMin: cfg.nMin ?? 50,
      vEps,
      families: cfg.families,
      slabs: cfg.slabs !== false,
      measureOpts: { maxBoxes: 40000, minWidth: 1 / 64, collect: true },
      treeOpts: { maxBoxes: 40000, minWidth: 1 / 64 },
      refineBudget: 2000,
      maxThresholds: 24,
      onEvent: (ev) => {
        if (ev.type === 'accepted') {
          postMessage({
            type: MSG.PROGRESS,
            text: `d${ev.depth} ${ev.best.family}: ${ev.best.label} ` +
                  `G∈[${ev.best.gain.lo.toFixed(2)}, ${ev.best.gain.hi.toFixed(2)}]`,
          });
        }
      },
    });
    const ms = performance.now() - t0;

    const N = xs.length / 3;
    const idx = [...Array(N).keys()];
    const ev = evaluate(tree, xs, idx, {
      vEps, modelBits: stats.modelBits, nTrain: N,
    });

    const leaves = [...walkLeaves(tree)];
    const leafIndex = new Map(leaves.map((L, i) => [L, i]));
    const leafIds = new Int32Array(N);
    const x = new Float64Array(3);
    for (let i = 0; i < N; i++) {
      x[0] = xs[i * 3]; x[1] = xs[i * 3 + 1]; x[2] = xs[i * 3 + 2];
      leafIds[i] = leafIndex.get(descend(tree, x));
    }

    const { boxes, boxLeafIds } = collectLeafBoxes(tree);
    const points = Float32Array.from(xs);
    const counts = countNodes(tree);

    postMessage(
      {
        type: MSG.DONE,
        points, leafIds, boxes, boxLeafIds,
        splits: collectSplits(tree),
        text: treeText(tree),
        stats: { ...stats, ...counts, ms },
        evaluation: ev,
        baseline: 3 * cfg.epsK,
      },
      [points.buffer, leafIds.buffer, boxes.buffer, boxLeafIds.buffer]
    );
  } catch (err) {
    postMessage({ type: MSG.ERROR, text: String(err && err.stack || err) });
  }
};