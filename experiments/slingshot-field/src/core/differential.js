import {F, FULL_DOMAIN, NF} from './grid.js';
import {isExitLabel} from './conventions.js';

/**
 * Hessian of ΔE by centred differences of the analytic gradient (§8.3 method a).
 * Stencils that touch a different label or an orientation flip are masked (NaN).
 * Works on any grid domain (full manifold, locked view window, burn manifold).
 * Signature classes: 0 = (+,+), 1 = (−,−), 2 = (+,−), 3 = degenerate.
 */
export function postprocess(grid) {
    const {N, label, data} = grid;
    const dom = grid.dom ?? FULL_DOMAIN;
    const n = N * N, da = (dom.x1 - dom.x0) / N, db = (dom.y1 - dom.y0) / N;
    const H00 = new Float32Array(n).fill(NaN), H01 = H00.slice(), H11 = H00.slice();
    const detH = H00.slice(), sig = H00.slice(), asym = H00.slice();
    const ok = (k, l) => label[k] === l && data[k * NF + F.flip] === 0 && Number.isFinite(data[k * NF + F.gA]);
    const g = (k, c) => data[k * NF + c];
    const diff = (k, l, km, kp, h, allowOneSided) => {
        const okm = km >= 0 && ok(km, l), okp = kp >= 0 && ok(kp, l);
        if (okm && okp) return [(g(kp, F.gA) - g(km, F.gA)) / (2 * h), (g(kp, F.gB) - g(km, F.gB)) / (2 * h)];
        if (!allowOneSided) return null;
        if (okp) return [(g(kp, F.gA) - g(k, F.gA)) / h, (g(kp, F.gB) - g(k, F.gB)) / h];
        if (okm) return [(g(k, F.gA) - g(km, F.gA)) / h, (g(k, F.gB) - g(km, F.gB)) / h];
        return null;
    };

    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, l = label[k];
        if (!isExitLabel(l) || !ok(k, l)) continue;
        let kL, kR;
        if (dom.periodicX) {
            kL = j * N + ((i - 1 + N) % N);
            kR = j * N + ((i + 1) % N);
        } else {
            kL = i > 0 ? k - 1 : -1;
            kR = i < N - 1 ? k + 1 : -1;
        }
        const dx = diff(k, l, kL, kR, da, !dom.periodicX);
        if (!dx) continue;
        const dy = diff(k, l, j > 0 ? k - N : -1, j < N - 1 ? k + N : -1, db, true);
        if (!dy) continue;
        const [dAa, dBa] = dx, [dAb, dBb] = dy;
        const h00 = dAa, h11 = dBb, h01 = 0.5 * (dAb + dBa);
        H00[k] = h00;
        H11[k] = h11;
        H01[k] = h01;
        asym[k] = Math.abs(dAb - dBa);
        const det = h00 * h11 - h01 * h01;
        detH[k] = det;
        const tol = 1e-8 * (h00 * h00 + h11 * h11 + 2 * h01 * h01);
        sig[k] = Math.abs(det) <= tol ? 3 : det > 0 ? (h00 > 0 ? 0 : 1) : 2;
    }
    grid.post = {H00, H01, H11, detH, sig, asym};
    return grid.post;
}