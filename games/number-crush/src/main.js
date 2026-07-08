// Entry point: bootstrap the game onto the canvas.

import { Game } from './game/Game.js';
import { sumEquals } from './rules/rules/sumEquals.js';

const canvas = document.getElementById('board');

const game = new Game(canvas, {
  cols: 8,
  rows: 9,
  size: 28,
  valueRange: [1, 9],
  rule: sumEquals(10),
  minSelection: 2,
  maxSelection: 4,
});

// Expose for debugging in the console.
window.__numberCrush = game;
