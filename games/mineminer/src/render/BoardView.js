import * as THREE from 'three';
import { MINE, MINED, SCAR } from '../game/Grid.js';
import { BlockRenderer } from './BlockRenderer.js';
import { GhostRenderer } from './GhostRenderer.js';
import { DigitAtlas, GLYPH_X, numberColour } from './DigitAtlas.js';
import { NumberSprites } from './NumberSprites.js';
import { MarkRenderer } from './MarkRenderer.js';

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const ZERO_GHOST = new THREE.Color(0x141a24);
const DEFUSED_GHOST = new THREE.Color(0xff3a2a);
const DEFUSED_DIGIT = new THREE.Color(0xff6a5a);
const SCAR_GHOST = new THREE.Color(0x5a0a0a);
const SCAR_DIGIT = new THREE.Color(0x8a2a2a);

/** Aggregates every renderer for one board so App only talks to a single object. */
export class BoardView {
  constructor(scene, grid, { colourblind = false } = {}) {
    this.grid = grid;
    this.atlas = new DigitAtlas({ colourblind });
    this.blocks = new BlockRenderer(scene, grid);
    this.ghosts = new GhostRenderer(scene, grid);
    this.digits = new NumberSprites(scene, grid, this.atlas);
    this.marks = new MarkRenderer(scene, grid);
  }

  get minesRevealed() {
    return this.blocks.minesRevealed;
  }

  set minesRevealed(v) {
    this.blocks.minesRevealed = v;
  }

  syncCell(i) {
    const { grid } = this;
    const s = grid.state[i];
    this.blocks.syncCell(i);
    this.marks.syncCell(i);
    if (grid.y(i) > 0) this.marks.syncCell(i - grid.layerSize); // headroom of the mark below may change

    if (s === MINED) {
      if (grid.content[i] === MINE) {
        this.ghosts.show(i, DEFUSED_GHOST, 0.62);
        this.digits.setGlyph(i, GLYPH_X, DEFUSED_DIGIT);
      } else {
        const n = grid.counts[i];
        if (n > 0) {
          numberColour(n, _c);
          _c2.copy(_c).multiplyScalar(0.55);
          this.ghosts.show(i, _c2, 1);
          this.digits.setGlyph(i, n, _c);
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
    this.marks.setLayerFocus(layer);
  }

  setXray(on) {
    this.blocks.setXray(on);
  }

  dispose() {
    this.blocks.dispose();
    this.ghosts.dispose();
    this.digits.dispose();
    this.marks.dispose();
    this.atlas.dispose();
  }
}