import { Aggregator } from '../engine/aggregator.js';

self.onmessage = ({ data }) => {
  try {
    const agg = new Aggregator(data);
    while (!agg.done()) {
      const r = agg.step();
      self.postMessage({ type: 'level', level: r.level, K: r.K, totalValues: r.totalValues, entries: r.entries });
    }
    self.postMessage({ type: 'done', level: agg.level, totalValues: agg.best.size });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};