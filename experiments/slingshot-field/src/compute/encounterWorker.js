import {propagate} from '../core/encounter.js';
import {computeFields} from '../core/fields.js';
import {coordAt, FULL_DOMAIN, NF} from '../core/grid.js';
import {LABEL} from '../core/conventions.js';
import {BasisWalker, propagateShip} from '../core/ship.js';

/**
 * Tile job: rows j0..j1 of an N×N grid over p.dom (full manifold, a locked view window or the burn manifold).
 * mask (optional): 1 = compute, 0 = skip (reused from a coarser grid).
 */
self.onmessage = (e) => {
    const {gen, tileId, p, j0, j1, mask} = e.data;
    const N = p.N, dom = p.dom ?? FULL_DOMAIN, n = (j1 - j0) * N;
    const label = new Uint8Array(n).fill(LABEL.PENDING);
    const data = new Float32Array(n * NF).fill(NaN);
    const store = (k, r) => {
        label[k] = r.label;
        if (r.exitY) computeFields(r, p, data, k * NF);
    };

    if (p.mode === 'ship') {
        // Columns in increasing time along the basis path: one forward walk per tile.
        const walker = new BasisWalker(p.ship.s0, p), scale = p.ship.span / (2 * Math.PI);
        for (let i = 0; i < N; i++) {
            let need = !mask;
            if (mask) for (let j = j0; j < j1 && !need; j++) need = !!mask[(j - j0) * N + i];
            if (!need) continue;
            const sb = walker.at(Math.max(0, coordAt(i, j0, N, dom)[0] * scale));
            for (let j = j0; j < j1; j++) {
                const k = (j - j0) * N + i;
                if (mask && !mask[k]) continue;
                if (!sb) {
                    label[k] = LABEL.COLLISION; // the basis path itself has collided before this point
                    continue;
                }
                store(k, propagateShip(sb, coordAt(i, j, N, dom)[1], p));
            }
        }
    } else {
        for (let j = j0; j < j1; j++) for (let i = 0; i < N; i++) {
            const k = (j - j0) * N + i;
            if (mask && !mask[k]) continue;
            const [a, b] = coordAt(i, j, N, dom);
            store(k, propagate(a, b, p, {withSTM: true}));
        }
    }
    self.postMessage({gen, tileId, j0, j1, label, data}, [label.buffer, data.buffer]);
};