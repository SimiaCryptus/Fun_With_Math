import * as THREE from 'three';
import { MINE, INTACT, MARKED, MINED, SCAR } from '../game/Grid.js';
import { BlockRenderer } from './BlockRenderer.js';
import { GhostRenderer } from './GhostRenderer.js';
import { DigitAtlas, GLYPH_X, glyphForCount, numberColour } from './DigitAtlas.js';
import { NumberSprites } from './NumberSprites.js';

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const ZERO_GHOST = new THREE.Color(0x141a24);
const DEFUSED_GHOST = new THREE.Color(0xff3a2a);
const DEFUSED_DIGIT = new THREE.Color(0xff6a5a);
const SCAR_GHOST = new THREE.Color(0x5a0a0a);
const SCAR_DIGIT = new THREE.Color(0x8a2a2a);

/** Aggregates every renderer for one board so App only talks to a single object. */
export class BoardView {
   constructor(scene, grid, { colourblind = false, hideSatisfied = true } = {}) {
    this.grid = grid;
     this.hideSatisfied = hideSatisfied;
    this.atlas = new DigitAtlas({ colourblind });
    this.blocks = new BlockRenderer(scene, grid);
    this.ghosts = new GhostRenderer(scene, grid);
    this.digits = new NumberSprites(scene, grid, this.atlas);
  }

  get minesRevealed() {
    return this.blocks.minesRevealed;
  }

  set minesRevealed(v) {
    this.blocks.minesRevealed = v;
  }
   /**
    * A number is "satisfied" when nothing around it is unknown any more: every
    * neighbour is cleared, marked, defused or scarred, AND the weights of the
    * claimed mines add up to the number. Such a label carries no information, so
    * it is hidden. If the marks contradict the number it stays visible — that is
    * a real mistake the player still needs to see.
    */
   isSatisfied(i) {
     if (!this.hideSatisfied) return false;
     const { grid } = this;
     if (grid.state[i] !== MINED || grid.content[i] === MINE) return false;
     if (!(grid.counts[i] > 0)) return false;
     let unknown = 0;
     let claimed = 0;
     grid.forEachNeighbour(i, (n, w) => {
       const s = grid.state[n];
       if (s === INTACT) unknown += w;
       else if (s === MARKED || s === SCAR || (s === MINED && grid.content[n] === MINE)) claimed += w;
     });
     return unknown === 0 && Math.abs(claimed - grid.counts[i]) < 1e-6;
   }
   /** Adds `i` and its neighbourhood to `set`; satisfaction depends on neighbours. */
   markDirty(i, set) {
     set.add(i);
     this.grid.forEachNeighbour(i, (n) => set.add(n));
     return set;
   }
   syncDirty(set) {
     for (const i of set) this.syncCell(i);
     set.clear();
   }
   syncNeighbourhood(i) {
     this.syncCell(i);
     this.grid.forEachNeighbour(i, (n) => this.syncCell(n));
   }
   setHideSatisfied(on) {
     if (this.hideSatisfied === on) return;
     this.hideSatisfied = on;
     this.syncAll();
   }


  syncCell(i) {
    const { grid } = this;
    const s = grid.state[i];
    this.blocks.syncCell(i);

    if (s === MINED) {
      if (grid.content[i] === MINE) {
        this.ghosts.show(i, DEFUSED_GHOST, 0.62);
        this.digits.setGlyph(i, GLYPH_X, DEFUSED_DIGIT);
      } else {
        const n = grid.counts[i];
         if (n > 0 && !this.isSatisfied(i)) {
          numberColour(n, _c);
          _c2.copy(_c).multiplyScalar(0.55);
          this.ghosts.show(i, _c2, 1);
           this.digits.setGlyph(i, glyphForCount(n), _c);
        } else {
          this.ghosts.show(i, ZERO_GHOST, 0.96);
          this.digits.hide(i);
        }
      }
    } else if (s === SCAR) {
      this.ghosts.show(i, SCAR_GHOST, 0.9);
      this.digits.setGlyph(i, GLYPH_X, SCAR_DIGIT);
    } else {
      this.ghosts.hide(i);
      this.digits.hide(i);
    }
  }

  syncAll() {
    for (let i = 0; i < this.grid.cellCount; i++) this.syncCell(i);
  }

  revealMines() {
    this.blocks.revealMines();
  }

  setLayerFocus(layer) {
    this.blocks.setLayerFocus(layer);
    this.ghosts.setLayerFocus(layer);
    this.digits.setLayerFocus(layer);
  }

  setXray(on) {
    this.blocks.setXray(on);
  }

  dispose() {
    this.blocks.dispose();
    this.ghosts.dispose();
    this.digits.dispose();
    this.atlas.dispose();
  }
}