import {lagrangePoints} from './lagrange.js';

/** Names of the closest-approach fields, in tracker order: P1, P2, L1..L5. */
export const APPROACH_FIELDS = ['rMin1', 'rMin2', 'dL1', 'dL2', 'dL3', 'dL4', 'dL5'];

let cacheMu = NaN, cachePts = null;

/** Rotating-frame positions of P1, P2, L1..L5 as [x0, y0, x1, y1, …] (cached per μ). */
export function approachTargets(mu) {
    if (mu !== cacheMu) {
        const pts = [-mu, 0, 1 - mu, 0];
        for (const L of lagrangePoints(mu)) pts.push(L.x, L.y);
        cachePts = Float64Array.from(pts);
        cacheMu = mu;
    }
    return cachePts;
}

/** Tracks the minimum distance of a state sequence to P1, P2 and L1..L5. */
export function approachTracker(mu) {
    const P = approachTargets(mu), n = P.length >> 1, d2 = new Float64Array(n).fill(Infinity);
    return {
        update(v) {
            const x = v[0], y = v[1];
            for (let k = 0; k < n; k++) {
                const dx = x - P[2 * k], dy = y - P[2 * k + 1], r = dx * dx + dy * dy;
                if (r < d2[k]) d2[k] = r;
            }
        },
        result: () => Array.from(d2, (v) => Math.sqrt(v)),
    };
}