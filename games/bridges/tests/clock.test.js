import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Clock, formatClock } from '../src/engine/Clock.js';
import { tilings, tilingIds } from '../src/tilings/registry.js';
import { generateBoard } from '../src/tilings/Tiling.js';
import { normalize } from '../src/config.js';
import { Game } from '../src/engine/Game.js';

test('clock charges the active seat and pays the Fischer increment', () => {
  let t = 0;
  const clock = new Clock(2, 60, 5, () => t);
  assert.equal(clock.active, -1);
  clock.switchTo(0);                 // first move made: seat 0's clock starts
  t = 10;
  assert.equal(clock.tick(), -1);
  assert.equal(clock.remainingOf(0), 50);
  clock.switchTo(1, 0);              // seat 0 moved: +5, seat 1 now running
  assert.equal(clock.remainingOf(0), 55);
  t = 40;
  assert.equal(clock.remainingOf(1), 30);
  assert.equal(clock.remainingOf(0), 55, 'idle seat does not tick');
  t = 80;
  assert.equal(clock.tick(), 1, 'seat 1 flags');
  assert.equal(clock.remainingOf(1), 0);
  assert.ok(!clock.running);
  assert.equal(clock.flagged, 1);
  clock.switchTo(0, 1);
  assert.ok(!clock.running, 'a flagged clock stays stopped');
});

test('formatClock', () => {
  assert.equal(formatClock(600), '10:00');
  assert.equal(formatClock(65.4), '1:05');
  assert.equal(formatClock(9.96), '10.0');
  assert.equal(formatClock(3.21), '3.2');
  assert.equal(formatClock(-1), '0.0');
});

test('timeout ends the game for the other player and survives undo', () => {
  const cfg = normalize({ tiling: 'hex', outline: 'rhombus', size: 4 }, tilingIds);
  const game = new Game(generateBoard(tilings.hex, cfg), cfg);
  let ended = null;
  game.on('end', e => { ended = e; });
  game.play(0); game.play(1);
  assert.ok(game.timeout(0));
  assert.equal(game.phase, 'timeout');
  assert.equal(game.winner, 1);
  assert.equal(ended.loser, 0);
  assert.ok(!game.isLegal(2));
  game.undo();
  assert.equal(game.phase, 'timeout', 'no take-backs on the clock');
  assert.ok(!game.timeout(1), 'cannot flag a finished game');
});