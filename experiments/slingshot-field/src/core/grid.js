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

/** Next refinement level, or null at the ceiling. The last step is capped at MAX_N. */
export function nextN(N) {
    if (N >= MAX_N) return null;
    return Math.min(MAX_N, N * REFINE_FACTOR);
}

/** Encounter-manifold coordinates for grid index (i, j) (convention C7). */
export const xiAt = (i, j, N) => [(i * 2 * Math.PI) / N, -Math.PI / 2 + ((j + 0.5) * Math.PI) / N];

/** Index into a coarse No×No grid of the sample that coincides exactly with node (i, j) of an N×N grid, or −1. */
export function exactParent(i, j, N, No) {
    if ((i * No) % N !== 0) return -1;
    const num = (2 * j + 1) * No - N;
    if (num < 0 || num % (2 * N) !== 0) return -1;
    const jo = num / (2 * N);
    return jo < No ? jo * No + (i * No) / N : -1;
}

export function createGrid(meta) {
    const N = meta.N;
    return {
        meta, N,
        label: new Uint8Array(N * N).fill(LABEL.PENDING),
        // Float32 keeps 4096² grids within reach of browser memory.
        data: new Float32Array(N * N * NF).fill(NaN),
        post: null,
        complete: false,
        key: null,
    };
}

export function nearestIndex(alpha, beta, N) {
    const da = (2 * Math.PI) / N, db = Math.PI / N;
    const i = ((Math.round(alpha / da) % N) + N) % N;
    const j = Math.min(N - 1, Math.max(0, Math.floor((beta + Math.PI / 2) / db)));
    return [i, j];
}