import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tilings, tilingIds } from '../src/tilings/registry.js';
import { generateBoard } from '../src/tilings/Tiling.js';
import { normalize } from '../src/config.js';
import { Game } from '../src/engine/Game.js';

const setup = (crossingMode, size = 3) => {
  const cfg = normalize({ tiling: 'square', outline: 'square', size, crossingMode }, tilingIds);
  const board = generateBoard(tilings.square, cfg);
  return { board, game: new Game(board, cfg), at: (x, y) => board.cellAt(x, y) };
};

test('bridge: the older chord bridges over, the newer one is severed', () => {
  const { game, at } = setup('bridge');
  game.play(at(0, 0));   // P0
  game.play(at(2, 2));   // P1
  const r1 = game.play(at(1, 1)); // P0 completes diagonal (0,0)-(1,1)
  assert.equal(r1.unions.length, 1);
  assert.ok(game.conn.same(0, at(0, 0), at(1, 1)));
  game.play(at(1, 0));   // P1
  game.play(at(0, 2));   // P0
  const r2 = game.play(at(0, 1)); // P1 completes crossing diagonal (1,0)-(0,1)
  assert.equal(r2.unions.length, 0, 'severed chord does not connect');
  assert.equal(r2.bridges.length, 1);
  assert.equal(r2.bridges[0].owner, 0, 'P0 bridges over');
  assert.equal(r2.bridges[0].underOwner, 1);
  assert.ok(!game.conn.same(1, at(1, 0), at(0, 1)));
  assert.ok(game.chords.nonCrossing());
});

test('strict: diagonals never connect', () => {
  const { game, at } = setup('strict');
  game.play(at(0, 0)); game.play(at(2, 2)); game.play(at(1, 1));
  assert.ok(!game.conn.same(0, at(0, 0), at(1, 1)));
});

test('open: crossing diagonals both connect', () => {
  const { game, at } = setup('open');
  game.play(at(0, 0)); game.play(at(1, 0)); game.play(at(1, 1)); game.play(at(0, 1));
  assert.ok(game.conn.same(0, at(0, 0), at(1, 1)));
  assert.ok(game.conn.same(1, at(1, 0), at(0, 1)));
});

test('bridge: the live chord set stays non-crossing on degree-6 vertices', () => {
  const cfg = normalize({ tiling: 'triangle', outline: 'rhombus', size: 5, crossingMode: 'bridge' }, tilingIds);
  const board = generateBoard(tilings.triangle, cfg);
  let s = 42;
  for (let trial = 0; trial < 10; trial++) {
    const game = new Game(board, cfg);
    const cells = [...Array(board.cells.length).keys()];
    for (let i = cells.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    for (const c of cells) if (game.phase === 'playing') game.play(c);
    assert.ok(game.chords.nonCrossing(), `trial ${trial}`);
  }
});