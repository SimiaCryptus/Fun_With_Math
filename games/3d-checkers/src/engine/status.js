import { CELLS } from './geometry.js';
import { RED, colorOf, isKing } from './Board.js';
import { getLegalMoves, DEFAULT_RULES } from './moves.js';

export function countPieces(state) {
  const c = { red: { men: 0, kings: 0, total: 0 }, black: { men: 0, kings: 0, total: 0 } };
  for (let i = 0; i < CELLS; i++) {
    const p = state.board[i];
    if (!p) continue;
    const side = colorOf(p) === RED ? c.red : c.black;
    side.total++;
    if (isKing(p)) side.kings++; else side.men++;
  }
  return c;
}

/** @returns {{status: 'playing'|'red_wins'|'black_wins'|'draw', reason: string}} */
export function getGameResult(state, rules = DEFAULT_RULES) {
  const me = state.turn;
  const counts = countPieces(state);
  const mine = me === RED ? counts.red.total : counts.black.total;
  const winner = me === RED ? 'black_wins' : 'red_wins';
  if (mine === 0) return { status: winner, reason: 'noPieces' };
  if (getLegalMoves(state, me, rules).length === 0) return { status: winner, reason: 'noMoves' };
  if (state.halfmoveClock >= (rules.drawMoves ?? 40) * 2) return { status: 'draw', reason: 'quietMoves' };
  if ((state.reps?.[state.hash] || 0) >= 3) return { status: 'draw', reason: 'repetition' };
  return { status: 'playing', reason: '' };
}

export function getGameStatus(state, rules = DEFAULT_RULES) {
  return getGameResult(state, rules).status;
}