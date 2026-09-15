import { CELLS, MAX_CELLS } from './geometry.js';

function xorshift32(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s;
  };
}

const rnd = xorshift32(0x9e3779b9);
// index: piece (1..4) * MAX_CELLS + cell (stride is fixed so hashes stay stable
// across level-count changes and match the worker's tables)
export const PIECE_KEYS = new Uint32Array(5 * MAX_CELLS);
for (let i = MAX_CELLS; i < PIECE_KEYS.length; i++) PIECE_KEYS[i] = rnd();
export const SIDE_KEY = rnd();

export function pieceKey(piece, idx) { return PIECE_KEYS[piece * MAX_CELLS + idx]; }

export function hashBoard(board, turn) {
  let h = 0;
  for (let idx = 0; idx < CELLS; idx++) if (board[idx]) h ^= pieceKey(board[idx], idx);
  if (turn) h ^= SIDE_KEY;
  return h >>> 0;
}