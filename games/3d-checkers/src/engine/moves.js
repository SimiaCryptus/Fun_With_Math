import { CELLS, N, NDIRS, STEP, JUMP, CY, RED_FWD, BLACK_FWD, LATERAL, ALL_DIRS } from './geometry.js';
import { EMPTY, RED_MAN, BLACK_MAN, colorOf, isKing } from './Board.js';

export const DEFAULT_RULES = { forcedCapture: true, menSideways: false, drawMoves: 40 };

function dirsFor(piece, rules) {
  if (isKing(piece)) return ALL_DIRS;
  const fwd = piece === RED_MAN ? RED_FWD : BLACK_FWD;
  return rules.menSideways ? fwd.concat(LATERAL) : fwd;
}

export function promotes(piece, idx) {
  return (piece === RED_MAN && CY[idx] === N - 1) || (piece === BLACK_MAN && CY[idx] === 0);
}

function capturesFrom(board, from, piece, rules, out) {
  const dirs = dirsFor(piece, rules);
  const color = colorOf(piece);
  const path = [from];
  const captured = [];
  board[from] = EMPTY; // the moving piece leaves its origin (it may be jumped back onto)

  const dfs = (cur) => {
    let extended = false;
    for (let k = 0; k < dirs.length; k++) {
      const d = dirs[k];
      const over = STEP[cur * NDIRS + d];
      if (over < 0) continue;
      const land = JUMP[cur * NDIRS + d];
      if (land < 0) continue;
      const op = board[over];
      if (op === EMPTY || colorOf(op) === color || captured.includes(over)) continue;
      if (board[land] !== EMPTY) continue;
      extended = true;
      path.push(land);
      captured.push(over);
      if (promotes(piece, land)) {
        // Kinging ends the move.
        out.push({ from, to: land, path: path.slice(), captured: captured.slice(), becomesKing: true });
      } else {
        dfs(land);
      }
      path.pop();
      captured.pop();
    }
    if (!extended && captured.length) {
      out.push({ from, to: cur, path: path.slice(), captured: captured.slice(), becomesKing: promotes(piece, cur) });
    }
  };
  dfs(from);
  board[from] = piece;
}

export function getCaptures(state, player = state.turn, rules = DEFAULT_RULES, out = []) {
  const b = state.board;
  for (let idx = 0; idx < CELLS; idx++) {
    const p = b[idx];
    if (p !== EMPTY && colorOf(p) === player) capturesFrom(b, idx, p, rules, out);
  }
  return out;
}

export function getQuietMoves(state, player = state.turn, rules = DEFAULT_RULES, out = []) {
  const b = state.board;
  for (let idx = 0; idx < CELLS; idx++) {
    const p = b[idx];
    if (p === EMPTY || colorOf(p) !== player) continue;
    const dirs = dirsFor(p, rules);
    for (let k = 0; k < dirs.length; k++) {
      const to = STEP[idx * NDIRS + dirs[k]];
      if (to >= 0 && b[to] === EMPTY) {
        out.push({ from: idx, to, path: [idx, to], captured: [], becomesKing: promotes(p, to) });
      }
    }
  }
  return out;
}

/** All legal moves for `player`; if forced capture is on and a capture exists, only captures. */
export function getLegalMoves(state, player = state.turn, rules = DEFAULT_RULES) {
  const caps = getCaptures(state, player, rules);
  if (caps.length && rules.forcedCapture !== false) return caps;
  return getQuietMoves(state, player, rules, caps);
}

export const movesFrom = (moves, idx) => moves.filter((m) => m.from === idx);
export const sameMove = (a, b) => a.path.length === b.path.length && a.path.every((c, i) => c === b.path[i]);