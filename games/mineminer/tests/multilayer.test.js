import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid, MINE, MINED, INTACT } from '../src/game/Grid.js';
import { placeMines } from '../src/game/MineGenerator.js';
import { Board } from '../src/game/Board.js';
import { rngFromSeed } from '../src/core/rng.js';

test('a single mine in the middle layer is counted by every cell above and below it', () => {
  const grid = new Grid(3, 3, 3);
  const centre = grid.index(1, 1, 1);
  grid.content[centre] = MINE;
  grid.recomputeCounts();
  for (let i = 0; i < grid.cellCount; i++) {
    assert.equal(grid.counts[i], i === centre ? 0 : 1, `cell ${i} (y=${grid.y(i)})`);
  }
});

test('mine layouts are not repeated layer by layer', () => {
  const grid = new Grid(10, 10, 3);
  placeMines(grid, 27, rngFromSeed('triple-threat'));
  const layer = (y) => [...grid.content.slice(y * grid.layerSize, (y + 1) * grid.layerSize)].join('');
  assert.notEqual(layer(0), layer(1));
  assert.notEqual(layer(1), layer(2));
  let total = 0;
  for (const c of grid.content) if (c === MINE) total++;
  assert.equal(total, 27);
});

test('a cascade started on the top layer tunnels down through the slab', () => {
  const grid = new Grid(3, 3, 2);
  grid.content[grid.index(2, 0, 2)] = MINE; // lone mine, bottom layer corner
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false });

  const start = grid.index(0, 1, 0); // top layer, opposite corner -> count 0
  assert.equal(grid.counts[start], 0);
  const r = board.strike(start);

  assert.equal(r.kind, 'cleared');
  assert.equal(grid.state[grid.index(0, 0, 0)], MINED, 'bottom layer was reached');
  assert.ok(r.revealed.some((x) => grid.y(x.cell) === 0 && x.delay > 0), 'lower-layer reveals are delayed');
  assert.equal(grid.state[grid.index(2, 0, 2)], INTACT, 'the mine itself is never mined');
});

test('single-layer cascade never leaves its own layer', () => {
  const grid = new Grid(4, 4, 2);
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false, cascade: 'single-layer' });
  board.strike(grid.index(0, 1, 0));
  for (let i = 0; i < grid.cellCount; i++) {
    if (grid.y(i) === 0) assert.equal(grid.state[i], INTACT, `cell ${i} should be untouched`);
  }
});