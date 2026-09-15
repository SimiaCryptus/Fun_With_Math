import { CELLS } from './geometry.js';
import { pieceKey, SIDE_KEY, hashBoard } from './zobrist.js';

export const EMPTY = 0, RED_MAN = 1, RED_KING = 2, BLACK_MAN = 3, BLACK_KING = 4;
export const RED = 0, BLACK = 1;
export const PLAYER_NAMES = ['Red', 'Black'];

export const opponent = (p) => 1 - p;
export const colorOf = (piece) => (piece === EMPTY ? -1 : piece <= RED_KING ? RED : BLACK);
export const isKing = (piece) => piece === RED_KING || piece === BLACK_KING;
export const isMan = (piece) => piece === RED_MAN || piece === BLACK_MAN;
export const kingOf = (color) => (color === RED ? RED_KING : BLACK_KING);
export const manOf = (color) => (color === RED ? RED_MAN : BLACK_MAN);

export function createState(board = new Uint8Array(CELLS), turn = RED) {
  const state = { board, turn, halfmoveClock: 0, ply: 0, hash: 0, reps: {} };
  state.hash = hashBoard(board, turn);
  state.reps[state.hash] = 1;
  return state;
}

export function cloneState(s) {
  return {
    board: new Uint8Array(s.board), turn: s.turn, halfmoveClock: s.halfmoveClock,
    ply: s.ply, hash: s.hash, reps: { ...s.reps },
  };
}

/** Mutating make; returns an undo record for unmakeMove. Used by the search. */
export function makeMove(state, move) {
  const b = state.board;
  const piece = b[move.from];
  const undo = {
    move, piece, captured: new Uint8Array(move.captured.length),
    halfmoveClock: state.halfmoveClock, hash: state.hash,
  };
  let h = state.hash ^ pieceKey(piece, move.from);
  b[move.from] = EMPTY;
  for (let i = 0; i < move.captured.length; i++) {
    const c = move.captured[i];
    undo.captured[i] = b[c];
    h ^= pieceKey(b[c], c);
    b[c] = EMPTY;
  }
  const placed = move.becomesKing ? kingOf(colorOf(piece)) : piece;
  b[move.to] = placed;
  h ^= pieceKey(placed, move.to);
  h ^= SIDE_KEY;
  state.hash = h >>> 0;
  state.turn = 1 - state.turn;
  state.ply++;
  state.halfmoveClock = move.captured.length || isMan(piece) ? 0 : state.halfmoveClock + 1;
  return undo;
}

export function unmakeMove(state, undo) {
  const { move } = undo;
  const b = state.board;
  b[move.to] = EMPTY;
  for (let i = 0; i < move.captured.length; i++) b[move.captured[i]] = undo.captured[i];
  b[move.from] = undo.piece;
  state.turn = 1 - state.turn;
  state.ply--;
  state.halfmoveClock = undo.halfmoveClock;
  state.hash = undo.hash;
}

/** Copy-on-write apply used by the game controller (tracks repetitions). */
export function applyMove(state, move) {
  const next = cloneState(state);
  makeMove(next, move);
  if (next.halfmoveClock === 0) next.reps = {}; // irreversible: repetition impossible
  next.reps[next.hash] = (next.reps[next.hash] || 0) + 1;
  return next;
}