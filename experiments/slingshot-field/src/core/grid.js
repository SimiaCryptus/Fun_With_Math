import { LABEL } from './conventions.js';

/** Per-sample record layout (AoS: data[k*NF + F.name]). */
export const FIELD_NAMES = [
  'dE', 'dH', 'errEH', 'dE1', 'dvx', 'dvy', 'dvRx', 'dvRy',
  'A00', 'A01', 'A10', 'A11', 'bx', 'by', 'deltaEff', 's1', 's2', 'flip',
  'tau', 'rPeri', 'ftle', 'kappaE', 'gA', 'gB', 'alphaOut', 'betaOut', 'jacobiDrift', 'nPasses',
];
export const NF = FIELD_NAMES.length;
export const F = Object.fromEntries(FIELD_NAMES.map((n, i) => [n, i]));

/** Encounter-manifold coordinates for grid index (i, j) (convention C7). */
export const xiAt = (i, j, N) => [(i * 2 * Math.PI) / N, -Math.PI / 2 + ((j + 0.5) * Math.PI) / N];

export function createGrid(meta) {
  const N = meta.N;
  return {
    meta, N,
    label: new Uint8Array(N * N).fill(LABEL.PENDING),
    data: new Float64Array(N * N * NF).fill(NaN),
    post: null,
  };
}

export function nearestIndex(alpha, beta, N) {
  const da = (2 * Math.PI) / N, db = Math.PI / N;
  const i = ((Math.round(alpha / da) % N) + N) % N;
  const j = Math.min(N - 1, Math.max(0, Math.floor((beta + Math.PI / 2) / db)));
  return [i, j];
}