import { propagate } from '../core/encounter.js';
import { computeFields } from '../core/fields.js';
import { NF, xiAt } from '../core/grid.js';

self.onmessage = (e) => {
  const { gen, tileId, p, j0, j1 } = e.data;
  const N = p.N, n = (j1 - j0) * N;
  const label = new Uint8Array(n);
  const data = new Float64Array(n * NF).fill(NaN);
  for (let j = j0; j < j1; j++) for (let i = 0; i < N; i++) {
    const k = (j - j0) * N + i;
    const [a, b] = xiAt(i, j, N);
    const r = propagate(a, b, p, { withSTM: true });
    label[k] = r.label;
    if (r.exitY) computeFields(r, p, data, k * NF);
  }
  self.postMessage({ gen, tileId, j0, j1, label, data }, [label.buffer, data.buffer]);
};