import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tilings, tilingIds } from '../src/tilings/registry.js';
import { generateBoard } from '../src/tilings/Tiling.js';
import { normalize, toHash, fromHash, encodeMoves, decodeMoves, PASS, SWAP } from '../src/config.js';
import { Game } from '../src/engine/Game.js';
import { chooseMove } from '../src/ai/search.js';

const setup = partial => {
  const cfg = normalize({ goal: 'go', tiling: 'square', outline: 'square', size: 5, ...partial }, tilingIds);
  const board = generateBoard(tilings[cfg.tiling], cfg);
  return { cfg, board, game: new Game(board, cfg), at: (x, y) => board.cellAt(x, y) };
};
const playAll = (game, at, coords) => { for (const [x, y] of coords) game.play(at(x, y)); };

test('a surrounded stone is captured and the point becomes empty', () => {
  const { game, at } = setup();
  playAll(game, at, [[1, 0], [1, 1], [0, 1], [4, 4], [2, 1], [4, 3]]);
  assert.equal(game.turn, 0);
  const res = game.play(at(1, 2));
  assert.deepEqual(res.captured, [at(1, 1)]);
  assert.equal(game.owner[at(1, 1)], -1);
  assert.equal(game.go.captures[0], 1);
  assert.equal(game.claims, 7);
  // P1 to move: playing back into the surrounded point is suicide
  assert.equal(game.turn, 1);
  assert.ok(!game.isLegal(at(1, 1)));
  assert.ok(!game.legalCells().includes(at(1, 1)));
  assert.ok(game.isLegal(at(0, 0)));
});

test('simple ko forbids an immediate retake, then allows it', () => {
  const { game, at } = setup();
  playAll(game, at, [[1, 1], [2, 1], [2, 0], [3, 0], [2, 2], [3, 2], [0, 4], [4, 1]]);
  assert.equal(game.turn, 0);
  const res = game.play(at(3, 1));
  assert.deepEqual(res.captured, [at(2, 1)]);
  assert.equal(game.turn, 1);
  assert.ok(!game.isLegal(at(2, 1)), 'ko');
  game.play(at(4, 4));
  game.play(at(0, 0));
  assert.ok(game.isLegal(at(2, 1)), 'ko lifted after a move elsewhere');
  const back = game.play(at(2, 1));
  assert.deepEqual(back.captured, [at(3, 1)]);
});

test('a full round of passes ends the game with area scoring; undo and URLs work', () => {
  const { cfg, game, at } = setup({ size: 3 });
  const c = at(1, 1);
  game.play(c);
  assert.ok(game.canPass());
  game.pass();
  assert.equal(game.phase, 'playing');
  assert.equal(game.turn, 0);
  game.pass();
  assert.equal(game.phase, 'won');
  assert.equal(game.winner, 0);
  assert.deepEqual(game.winningCells, [c]);
  const s = game.go.score();
  assert.equal(s.stones[0], 1);
  assert.equal(s.territory[0], 8);
  assert.equal(s.area[0], 9);
  assert.equal(s.area[1], 0);
  assert.ok(!game.canPass());
  assert.ok(!game.isLegal(at(0, 0)));
  assert.deepEqual(game.moves, [c, PASS, PASS]);

  const { moves } = fromHash(toHash(cfg, game.moves), tilingIds);
  assert.deepEqual(moves, [c, PASS, PASS]);

  game.undo();
  assert.equal(game.phase, 'playing');
  assert.equal(game.go.passes, 1);
  assert.equal(game.turn, 0);
});

test('an empty board where everyone passes is a draw', () => {
  const { game } = setup({ size: 3 });
  game.pass(); game.pass();
  assert.equal(game.phase, 'draw');
  assert.equal(game.winner, -1);
});

test('PASS round-trips through the move codec next to SWAP', () => {
  const moves = [3, PASS, SWAP, 4093, PASS];
  assert.deepEqual(decodeMoves(encodeMoves(moves)), moves);
  assert.throws(() => encodeMoves([4094]));
});

test('go bots return a legal move or pass, on hexagonal and three-player boards', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const { game } = setup({ tiling: 'hex', outline: 'rhombus', size: 5 });
    for (let i = 0; i < 8; i++) {
      const m = chooseMove(game, { level, budgetMs: 40, seed: i + 1 });
      assert.ok(m === PASS || game.isLegal(m), `${level} returned ${m}`);
      if (m === PASS) game.pass(); else game.play(m);
    }
  }
  const three = setup({ tiling: 'hex', outline: 'hexagon', size: 5 });
  assert.equal(three.game.players, 3);
  const m = chooseMove(three.game, { level: 'medium', seed: 2 });
  assert.ok(three.game.isLegal(m));
});

test('bots pass once only eye-filling moves remain', () => {
  const { game, at } = setup({ size: 3 });
  // P0 owns every point except the centre, which is P0's eye; P1 has nothing left to do
  for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]]) {
    game.play(at(x, y));
    if (game.turn === 1) game.pass();
  }
  assert.equal(game.turn, 0);
  assert.equal(chooseMove(game, { level: 'medium', seed: 1 }), PASS);
});

test('timeout in go awards the game to the colour with the larger area', () => {
  const { game, at } = setup({ size: 3 });
  game.play(at(1, 1)); game.play(at(0, 0));
  game.timeout(1);
  assert.equal(game.phase, 'timeout');
  assert.equal(game.winner, 0);
});