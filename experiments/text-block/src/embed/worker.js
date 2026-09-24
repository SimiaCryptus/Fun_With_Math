/**
 * Optional Web Worker wrapper around Embedder (not wired by default; at n ≤ 256 the
 * main thread is sufficient). Usage:
 *   const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
 *   w.postMessage({ type: 'init', dim, seed, params });
 *   w.postMessage({ type: 'sync', ids, codes, chars });
 *   w.postMessage({ type: 'graph', graph });
 *   w.postMessage({ type: 'step', k: 10 });   // → { type: 'snapshot', loss, iter, ids, dim, X }
 */
import { Embedder } from './embedder.js';

let emb = null;

function snapshot(extra) {
  const X = emb.matrix().slice();
  self.postMessage({ type: 'snapshot', ...extra, ids: emb.ids, dim: emb.dim, X }, [X.buffer]);
}

self.onmessage = (e) => {
  const { type, ...m } = e.data;
  switch (type) {
    case 'init':
      emb = new Embedder({ dim: m.dim, seed: m.seed });
      if (m.params) emb.setParams(m.params);
      break;
    case 'sync':
      emb.sync(m.ids, m.codes ?? null, m.chars ?? null);
      break;
    case 'graph':
      emb.setGraph(m.graph);
      break;
    case 'params':
      emb.setParams(m.params);
      break;
    case 'step':
      snapshot(emb.step(m.k ?? 1));
      break;
    case 'solve':
      snapshot(emb.solve(m.opts ?? {}));
      break;
    case 'reseed':
      emb.reseed();
      snapshot({ loss: emb.loss, iter: emb.iter });
      break;
    default:
  }
};