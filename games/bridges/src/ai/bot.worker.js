// Runs the pure engine + search off the main thread.  No three.js, no DOM.
import { tilings } from '../tilings/registry.js';
import { generateBoard } from '../tilings/Tiling.js';
import { Game } from '../engine/Game.js';
import { chooseMove } from './search.js';

let board = null, boardKey = '';

self.onmessage = ({ data }) => {
  const { id, config, moves, level, budgetMs, seed } = data;
  try {
    const key = JSON.stringify([config.tiling, config.outline, config.size, config.edgeMode, config.players]);
    if (key !== boardKey) { board = generateBoard(tilings[config.tiling], config); boardKey = key; }
    const game = new Game(board, config);
    game.replay(moves);
    const move = chooseMove(game, { level, budgetMs, seed });
    self.postMessage({ id, move });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};