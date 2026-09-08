import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tilings, tilingIds } from '../src/tilings/registry.js';
import { generateBoard } from '../src/tilings/Tiling.js';
import { normalize, SWAP } from '../src/config.js';
import { Game } from '../src/engine/Game.js';
import { chooseMove } from '../src/ai/search.js';

const setup = partial => {
  const cfg = normalize(partial, tilingIds);
  const board = generateBoard(tilings[cfg.tiling], cfg);
  return { cfg, board, game: new Game(board, cfg), at: (x, y) => board.cellAt(x, y) };
};

test('every level returns a legal move on the default (triangular) board', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const { game } = setup({ size: 5 });
    for (let i = 0; i < 6; i++) {
      const m = chooseMove(game, { level, budgetMs: 40, seed: i + 1 });
      assert.ok(game.isLegal(m), `${level} returned ${m}`);
      game.play(m);
    }
  }
});

test('three-player boards work for every level', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const { game } = setup({ tiling: 'hex', outline: 'hexagon', size: 5 });
    const m = chooseMove(game, { level, budgetMs: 30, seed: 3 });
    assert.ok(game.isLegal(m));
  }
});

// square + square outline: P0 owns bottom/top (connects vertically), P1 left/right.
test('medium takes an immediate win', () => {
  const { game, at } = setup({ tiling: 'square', outline: 'square', size: 4, crossingMode: 'strict' });
  for (const [x, y] of [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [3, 3]]) game.play(at(x, y));
  assert.equal(game.turn, 0);
  assert.equal(chooseMove(game, { level: 'medium' }), at(0, 3));
});

test('medium blocks an immediate threat', () => {
  const { game, at } = setup({ tiling: 'square', outline: 'square', size: 4, crossingMode: 'strict' });
  for (const [x, y] of [[0, 0], [0, 1], [3, 3], [1, 1], [1, 3], [2, 1]]) game.play(at(x, y));
  assert.equal(game.turn, 0);
  assert.equal(chooseMove(game, { level: 'medium' }), at(3, 1));
  assert.equal(chooseMove(game, { level: 'hard', budgetMs: 30 }), at(3, 1));
});

test('bots swap a central opening under the pie rule', () => {
  const { game, board } = setup({ tiling: 'hex', outline: 'rhombus', size: 7, variants: ['pie'] });
  const centre = board.cellAt(board.center[0], board.center[1]);
  assert.ok(centre >= 0);
  game.play(centre);
  assert.equal(chooseMove(game, { level: 'medium' }), SWAP);
  const corner = board.cells.find(c => c.arcs.length === 2).id;
  const other = setup({ tiling: 'hex', outline: 'rhombus', size: 7, variants: ['pie'] });
  other.game.play(corner);
  assert.notEqual(chooseMove(other.game, { level: 'medium' }), SWAP);
});

test('search is deterministic for a given seed', () => {
  const a = setup({ size: 6 }), b = setup({ size: 6 });
  for (let i = 0; i < 5; i++) {
    const ma = chooseMove(a.game, { level: 'medium', seed: 99 });
    const mb = chooseMove(b.game, { level: 'medium', seed: 99 });
    assert.equal(ma, mb);
    a.game.play(ma); b.game.play(mb);
  }
});