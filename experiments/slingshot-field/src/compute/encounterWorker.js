import {propagate} from '../core/encounter.js';
import {computeFields} from '../core/fields.js';
import {NF, xiAt} from '../core/grid.js';
import {LABEL} from '../core/conventions.js';

/** Tile job: rows j0..j1 of an N×N grid. mask (optional): 1 = compute, 0 = skip (reused from a coarser grid). */
self.onmessage = (e) => {
    const {gen, tileId, p, j0, j1, mask} = e.data;
    const N = p.N, n = (j1 - j0) * N;
    const label = new Uint8Array(n).fill(LABEL.PENDING);
    const data = new Float32Array(n * NF).fill(NaN);
    for (let j = j0; j < j1; j++) for (let i = 0; i < N; i++) {
        const k = (j - j0) * N + i;
        if (mask && !mask[k]) continue;
        const [a, b] = xiAt(i, j, N);
        const r = propagate(a, b, p, {withSTM: true});
        label[k] = r.label;
        if (r.exitY) computeFields(r, p, data, k * NF);
    }
    self.postMessage({gen, tileId, j0, j1, label, data}, [label.buffer, data.buffer]);
};