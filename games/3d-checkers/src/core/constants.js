import { CX, CY, CZ, LEVELS, N } from '../engine/geometry.js';

export const CELL = 1;
export const DEFAULT_LEVEL_GAP = 1.6; // extra spacing per level at explode = 1

let levelGap = DEFAULT_LEVEL_GAP;
/** Configure the vertical separation between levels (at explode = 1). */
export function setLevelGap(v) { levelGap = Math.max(0, +v || 0); return levelGap; }
export function getLevelGap() { return levelGap; }


// World layout: file → +X, level → +Y, rank → -Z (Red's home face is at +Z).
export function levelY(z, explode) {
  return (z - (LEVELS - 1) / 2) * (1 + explode * levelGap);
}
export function cellWorld(idx, explode, out) {
  const half = (N - 1) / 2; // N is a live binding — the board size can change per game
  out.set(CX[idx] - half, levelY(CZ[idx], explode), half - CY[idx]);
  return out;
}