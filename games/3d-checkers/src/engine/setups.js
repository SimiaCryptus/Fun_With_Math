import { CELLS, CY, LEVELS, N } from './geometry.js';
import { RED_MAN, BLACK_MAN } from './Board.js';

export const SETUPS = {
  standard: { label: 'Standard', ranks: 3 },
  light:    { label: 'Light',    ranks: 2 },
  skirmish: { label: 'Skirmish', ranks: 1 },
};

/**
 * Ranks filled per side for a setup on a `size`-wide board. Clamped so that at
 * least two ranks stay empty in the middle (e.g. 4×4 → 1 rank, 6×6 → 2 ranks).
 */
export function setupRanks(name = 'standard', size = N) {
  const ranks = (SETUPS[name] ?? SETUPS.standard).ranks;
  return Math.max(1, Math.min(ranks, (size >> 1) - 1));
}

export function createSetup(name = 'standard') {
  const ranks = setupRanks(name, N);
  const board = new Uint8Array(CELLS);
  for (let idx = 0; idx < CELLS; idx++) {
    if (CY[idx] < ranks) board[idx] = RED_MAN;
    else if (CY[idx] >= N - ranks) board[idx] = BLACK_MAN;
  }
  return board;
}

/** Pieces per side: `size / 2` playable cells per (rank, level) row. */
export const piecesPerSide = (name, size = N, levels = LEVELS) =>
  setupRanks(name, size) * (size >> 1) * Math.max(1, levels | 0);