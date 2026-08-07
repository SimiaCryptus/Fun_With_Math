// order.js — intra-ring total orders (§2.1). Ties always broken lexicographically
// by (x, y) so `≺` is total and deterministic.
import {ringLength, perimeterToCell} from './lattice.js';

const cache = new Map(); // `${mode}:${R}` -> Int32Array of perimeter indices

export function ringOrder(R, mode = 'clockwise') {
    const ck = mode + ':' + R;
    const hit = cache.get(ck);
    if (hit) return hit;
    const n = ringLength(R);
    const idx = new Int32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    if (mode === 'nearest_first') {
        const c = [0, 0];
        const r2 = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            perimeterToCell(R, i, c);
            r2[i] = c[0] * c[0] + c[1] * c[1];
        }
        const arr = Array.from(idx).sort((a, b) => {
            if (r2[a] !== r2[b]) return r2[a] - r2[b];
            const ca = perimeterToCell(R, a, [0, 0]), cb = perimeterToCell(R, b, [0, 0]);
            if (ca[0] !== cb[0]) return ca[0] - cb[0];
            return ca[1] - cb[1];
        });
        idx.set(arr);
    }
    if (cache.size > 4096) cache.clear();
    cache.set(ck, idx);
    return idx;
}