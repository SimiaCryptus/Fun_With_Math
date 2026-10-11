import {LABEL} from './conventions.js';

/** Per-sample record layout (AoS: data[k*NF + F.name]). */
export const FIELD_NAMES = [
    'dE', 'dH', 'errEH', 'dE1', 'dvx', 'dvy', 'dvRx', 'dvRy',
    'A00', 'A01', 'A10', 'A11', 'bx', 'by', 'deltaEff', 's1', 's2', 'flip',
    'tau', 'rPeri', 'ftle', 'kappaE', 'gA', 'gB', 'alphaOut', 'betaOut', 'jacobiDrift', 'nPasses',
];
export const NF = FIELD_NAMES.length;
export const F = Object.fromEntries(FIELD_NAMES.map((n, i) => [n, i]));

export const MAX_N = 4096;
/** Odd factor ⇒ both the α nodes and the β cell centres of the coarse grid are nodes of the fine grid. */
export const REFINE_FACTOR = 3;

/**
 * Sample domains in world (plot) coordinates.
 * xNodes: x samples sit on nodes x0 + i·dx (else cell centres). periodicX: x wraps.
 */
export const FULL_DOMAIN = Object.freeze({
    x0: 0, x1: 2 * Math.PI, y0: -Math.PI / 2, y1: Math.PI / 2, xNodes: true, periodicX: true,
});
/** Spaceship burn manifold: x = 2π t / span (time along path), y = impulse angle θ ∈ [−π, π). */
export const SHIP_DOMAIN = Object.freeze({
    x0: 0, x1: 2 * Math.PI, y0: -Math.PI, y1: Math.PI, xNodes: false, periodicX: false,
});
export const windowDomain = (x0, x1, y0, y1) => ({x0, x1, y0, y1, xNodes: false, periodicX: false});
export const inDomain = (d, x, y) => x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1;

/** Next refinement level, or null at the ceiling. The last step is capped at MAX_N. */
export function nextN(N) {
    if (N >= MAX_N) return null;
    return Math.min(MAX_N, N * REFINE_FACTOR);
}

/** World coordinates of sample (i, j) of an N×N grid over dom. */
export function coordAt(i, j, N, dom = FULL_DOMAIN) {
    const dx = (dom.x1 - dom.x0) / N, dy = (dom.y1 - dom.y0) / N;
    return [dom.x0 + (i + (dom.xNodes ? 0 : 0.5)) * dx, dom.y0 + (j + 0.5) * dy];
}

/** Encounter-manifold coordinates for grid index (i, j) (convention C7). */
export const xiAt = (i, j, N) => coordAt(i, j, N, FULL_DOMAIN);

function centreParent(j, N, No) {
    const num = (2 * j + 1) * No - N;
    if (num < 0 || num % (2 * N) !== 0) return -1;
    const jo = num / (2 * N);
    return jo < No ? jo : -1;
}

export const parentX = (i, N, No, dom = FULL_DOMAIN) =>
    dom.xNodes ? ((i * No) % N === 0 ? (i * No) / N : -1) : centreParent(i, N, No);
export const parentY = (j, N, No) => centreParent(j, N, No);

/** Index into a coarse No×No grid of the sample that coincides exactly with node (i, j) of an N×N grid, or −1. */
export function exactParent(i, j, N, No, dom = FULL_DOMAIN) {
    const io = parentX(i, N, No, dom), jo = parentY(j, N, No);
    return io < 0 || jo < 0 ? -1 : jo * No + io;
}

export function createGrid(meta) {
    const N = meta.N;
    return {
        meta, N,
        dom: meta.dom ?? FULL_DOMAIN,
        label: new Uint8Array(N * N).fill(LABEL.PENDING),
        // Float32 keeps 4096² grids within reach of browser memory.
        data: new Float32Array(N * N * NF).fill(NaN),
        post: null,
        complete: false,
        key: null,
    };
}

export function nearestIndex(x, y, N, dom = FULL_DOMAIN) {
    const dx = (dom.x1 - dom.x0) / N, dy = (dom.y1 - dom.y0) / N;
    const clamp = (v) => Math.min(N - 1, Math.max(0, v));
    let i;
    if (dom.xNodes) {
        i = Math.round((x - dom.x0) / dx);
        i = dom.periodicX ? ((i % N) + N) % N : clamp(i);
    } else i = clamp(Math.floor((x - dom.x0) / dx));
    const j = clamp(Math.floor((y - dom.y0) / dy));
    return [i, j];
}