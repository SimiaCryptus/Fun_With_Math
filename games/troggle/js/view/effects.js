/**
* effects.js — "seeing inside" (§5.3): peel / exploded view + focus dimming.
* Layer slicing and x-ray were removed (they earned nothing over peel).
 * Owns view state, computes per-cube targets and pushes them into the CubeField.
 */
import { OPACITY } from './cubes.js';
/**
  * Cubes are translucent glass on a dark background, so cube colours are tints
  * and letter colours are bright. State is never colour-only (§10): selected /
  * legal / cursor / hint also get a glow and a scale change.
  */

export const PALETTE = Object.freeze({
   base: 0x9fc3e6, baseLetter: 0xf6f8fb,
   dim: 0x3c4a5c, dimLetter: 0x7a8794,
   selected: 0x2ec4b6, selectedLetter: 0xffffff,
   legal: 0xffd166, legalLetter: 0xfff3c4,
   cursor: 0x8ecae6, cursorLetter: 0xffffff,
   hint: 0xff9f1c, hintLetter: 0xffffff,
});


export class Effects {
  /** @param {import('./cubes.js').CubeField} cubes */
  constructor(cubes, { reducedMotion = false } = {}) {
    this.cubes = cubes;
    this.grid = cubes.grid;
    this.reducedMotion = reducedMotion;

    this.peel = 0;
    this.peelTarget = 0;

    this.selection = [];
    this.legal = new Set();
    this.cursor = -1;
    this.hint = -1;

  }

  // ------------------------------------------------------------ controls





  /** 0 = packed block, 1 = fully exploded (§5.3.2). */
  setPeel(v) {
    this.peelTarget = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.reducedMotion) this.peel = this.peelTarget;
    return this.peelTarget;
  }

  /** Focus dimming + legal-next glow (§5.3.4). */
  setFocus(path, legal) {
    this.selection = path ?? [];
    this.legal = legal instanceof Set ? legal : new Set();
  }

  // -------------------------------------------------------------- update

  update(dt) {
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    this.peel += (this.peelTarget - this.peel) * k;

    const cubes = this.cubes;
    const grid = this.grid;
    const hasPath = this.selection.length > 0;
    const sel = this.selection;

    cubes.pickGhost = false;
    cubes.setSolidOpacity(OPACITY.SOLID);
    cubes.setGhostOpacity(OPACITY.GHOST);

    for (let i = 0; i < grid.count; i++) {

      // peel / exploded view
      const p = this.peel * 1.6;
      cubes.setOffset(
        i,
        cubes.base[i * 3] * p,
        cubes.base[i * 3 + 1] * p,
        cubes.base[i * 3 + 2] * p,
      );

      const selIdx = sel.indexOf(i);
      const isSel = selIdx >= 0;
      const isLegal = this.legal.has(i);

      let color = PALETTE.base;
      let letter = PALETTE.baseLetter;
      let scale = 1;
       let glow = 0;

      if (isSel) {
        color = PALETTE.selected;
        letter = PALETTE.selectedLetter;
        scale = 1.06;
         glow = 1;
      } else if (isLegal) {
        color = PALETTE.legal;
        letter = PALETTE.legalLetter;
        scale = 1.01;
         glow = 0.45;
      } else if (hasPath) {
        color = PALETTE.dim;
        letter = PALETTE.dimLetter;
      }
       if (i === this.hint) { color = PALETTE.hint; letter = PALETTE.hintLetter; scale = 1.08; glow = 1; }
       if (i === this.cursor && !isSel) {
         color = PALETTE.cursor; letter = PALETTE.cursorLetter; scale = 1.05; glow = 0.7;
       }


      // Every letter is drawn and pickable; depth + peel do the rest.
      cubes.setTarget(i, { color, letter, scale, alpha: 1, tier: 1, glow });
    }

    cubes.update(dt);
  }
}

export default Effects;