// Geometry of the N×N×L board (N = 4..12 files/ranks, even; L = 1..8 levels):
// playable-cell parity, packed indexing and precomputed STEP / JUMP tables for
// the 12 face-diagonal directions. Both dimensions are configurable at runtime
// via configureBoard(); L = 1 gives the traditional 2D game.

export const MIN_N = 4;
export const MAX_N = 12;
export const MAX_LEVELS = 8;
export const MAX_CELLS = (MAX_N * MAX_N * MAX_LEVELS) / 2; // 576 — buffer capacity
export const NDIRS = 12;
export const FILES = 'abcdefghijkl';
export const SIZES = [4, 6, 8, 10, 12];

// Live bindings: importers see the current board size.
export let N = 8;                          // files (x) and ranks (y)
export let LEVELS = MAX_LEVELS;            // levels (z)
export let ROW = N >> 1;                   // playable cells per (rank, level) row
export let CELLS = (N * N * LEVELS) / 2;

// [dx, dy, dz] — every legal step changes exactly two coordinates by ±1.
export const DIRS = [
  [ 1,  1,  0], [-1,  1,  0], [ 1, -1,  0], [-1, -1,  0], // file+rank
  [ 0,  1,  1], [ 0,  1, -1], [ 0, -1,  1], [ 0, -1, -1], // rank+level
  [ 1,  0,  1], [-1,  0,  1], [ 1,  0, -1], [-1,  0, -1], // file+level (lateral)
];
export const RED_FWD   = [0, 1, 4, 5];   // dy = +1
export const BLACK_FWD = [2, 3, 6, 7];   // dy = -1
export const LATERAL   = [8, 9, 10, 11]; // dy = 0
export const ALL_DIRS  = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Allocated once at maximum size; only the first CELLS entries are meaningful.
export const CX = new Uint8Array(MAX_CELLS);
export const CY = new Uint8Array(MAX_CELLS);
export const CZ = new Uint8Array(MAX_CELLS);
export const STEP = new Int16Array(MAX_CELLS * NDIRS).fill(-1);
export const JUMP = new Int16Array(MAX_CELLS * NDIRS).fill(-1);

export function inBounds(x, y, z) {
  return x >= 0 && x < N && y >= 0 && y < N && z >= 0 && z < LEVELS;
}
export function isPlayable(x, y, z) {
  return inBounds(x, y, z) && ((x + y + z) & 1) === 1;
}
export function toIdx(x, y, z) {
  return (y * LEVELS + z) * ROW + (x >> 1);
}
export function fromIdx(idx) {
  return [CX[idx], CY[idx], CZ[idx]];
}
export function step(idx, d) { return STEP[idx * NDIRS + d]; }
export function jump(idx, d) { return JUMP[idx * NDIRS + d]; }

const listeners = new Set();
/** Notified whenever the board size changes (views rebuild lazily anyway). */
export function onGeometryChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Clamp a requested file/rank count to an even value in MIN_N..MAX_N. */
export function normalizeSize(size) {
  let s = Math.round(+size) || 8;
  s = Math.max(MIN_N, Math.min(MAX_N, s));
  return s & 1 ? s + 1 : s; // the checkerboard packing needs an even width
}
/** Clamp a requested level count to 1..MAX_LEVELS. */
export function normalizeLevels(levels) {
  return Math.max(1, Math.min(MAX_LEVELS, Math.round(+levels) || MAX_LEVELS));
}

/**
 * Rebuild the board tables for a `size`×`size`×`levels` board.
 * Returns the normalised `{ size, levels }`.
 */
export function configureBoard(size = N, levels = LEVELS) {
  const S = normalizeSize(size);
  const L = normalizeLevels(levels);
  N = S;
  LEVELS = L;
  ROW = S >> 1;
  CELLS = (S * S * L) / 2;

  CX.fill(0); CY.fill(0); CZ.fill(0);
  STEP.fill(-1); JUMP.fill(-1);

  for (let idx = 0; idx < CELLS; idx++) {
    const row = (idx / ROW) | 0;
    const col = idx - row * ROW;
    const y = (row / L) | 0;
    const z = row - y * L;
    CX[idx] = (col << 1) + ((y + z + 1) & 1);
    CY[idx] = y;
    CZ[idx] = z;
  }
  for (let idx = 0; idx < CELLS; idx++) {
    const x = CX[idx], y = CY[idx], z = CZ[idx];
    for (let d = 0; d < NDIRS; d++) {
      const [dx, dy, dz] = DIRS[d];
      if (!isPlayable(x + dx, y + dy, z + dz)) continue;
      STEP[idx * NDIRS + d] = toIdx(x + dx, y + dy, z + dz);
      if (isPlayable(x + 2 * dx, y + 2 * dy, z + 2 * dz)) {
        JUMP[idx * NDIRS + d] = toIdx(x + 2 * dx, y + 2 * dy, z + 2 * dz);
      }
    }
  }
  const info = { size: S, levels: L };
  for (const fn of listeners) fn(info);
  return info;
}

/** Backwards-compatible helper: change only the level count. Returns the level count. */
export function configureLevels(levels) {
  return configureBoard(N, levels).levels;
}

configureBoard(8, MAX_LEVELS);