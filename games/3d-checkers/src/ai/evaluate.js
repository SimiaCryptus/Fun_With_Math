import { CELLS, MAX_CELLS, CX, CY, CZ, LEVELS, N } from '../engine/geometry.js';
import { RED, RED_MAN, colorOf, isKing } from '../engine/Board.js';

// Centre weight: highest in the core, falling to 0 on the outer shell.
// Rebuilt whenever the board size or level count changes.
const CENTRE = new Float32Array(MAX_CELLS);
let centreKey = -1;
const geometryKey = () => N * 16 + LEVELS;
function buildCentre() {
  const c = (N - 1) / 2;
  const cz = (LEVELS - 1) / 2;
  for (let i = 0; i < CELLS; i++) {
    const d = Math.max(Math.abs(CX[i] - c), Math.abs(CY[i] - c), Math.abs(CZ[i] - cz));
    CENTRE[i] = c - d;
  }
  centreKey = geometryKey();
}

export const WEIGHTS = { man: 100, king: 160, advance: 6, backGuard: 8, centre: 3, kingCentre: 5 };

/** Static evaluation from the side-to-move's perspective. */
export function evaluate(state, w = WEIGHTS) {
  if (centreKey !== geometryKey()) buildCentre();
  const b = state.board;
  let score = 0;
  for (let idx = 0; idx < CELLS; idx++) {
    const p = b[idx];
    if (!p) continue;
    let v;
    if (isKing(p)) {
      v = w.king + CENTRE[idx] * w.kingCentre;
    } else {
      const adv = p === RED_MAN ? CY[idx] : N - 1 - CY[idx];
      v = w.man + adv * w.advance + CENTRE[idx] * w.centre;
      if (adv === 0) v += w.backGuard; // occupying the home face blocks enemy kinging
    }
    score += colorOf(p) === RED ? v : -v;
  }
  return state.turn === RED ? score : -score;
}