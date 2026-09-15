import { CX, CY, CZ, FILES, isPlayable, toIdx } from './geometry.js';
import { getLegalMoves, DEFAULT_RULES } from './moves.js';

/**
* Cell name `<file><rank><level>`, e.g. c14 = file c, rank 1, level 4.
* On boards wider than 9 the rank may take two digits (`c124` = c, rank 12,
* level 4); this stays unambiguous because the level is always a single digit.
*/
export function cellName(idx) {
  return FILES[CX[idx]] + (CY[idx] + 1) + (CZ[idx] + 1);
}

export function parseCell(str) {
  if (!str || str.length < 3 || str.length > 4) return -1;
  const x = FILES.indexOf(str[0]);
  const y = +str.slice(1, -1) - 1;
  const z = +str[str.length - 1] - 1;
  if (x < 0 || !Number.isInteger(y) || !Number.isInteger(z)) return -1;
  return isPlayable(x, y, z) ? toIdx(x, y, z) : -1;
}

export function toNotation(move) {
  return move.path.map(cellName).join(move.captured.length ? 'x' : '-');
}

export function fromNotation(str, state, rules = DEFAULT_RULES) {
  return getLegalMoves(state, state.turn, rules).find((m) => toNotation(m) === str) ?? null;
}