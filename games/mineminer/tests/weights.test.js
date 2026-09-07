import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid, MINE, INTACT, MINED, normaliseWeights, quantiseWeight } from '../src/game/Grid.js';
import { Board } from '../src/game/Board.js';

test('weights are quantised to 0 / 0.5 / 1', () => {
  assert.equal(quantiseWeight(0.4), 0.5);
  assert.equal(quantiseWeight(0.1), 0);
  assert.equal(quantiseWeight(2), 1);
  assert.deepEqual(normaliseWeights(6), { face: 1, edge: 0, corner: 0 });
  assert.deepEqual(normaliseWeights(26), { face: 1, edge: 1, corner: 1 });
});

test('edge and corner weights scale a cell count', () => {
  const grid = new Grid(3, 3, 3, { face: 1, edge: 0.5, corner: 0 });
  const centre = grid.index(1, 1, 1);
  grid.content[grid.index(0, 1, 1)] = MINE; // face   -> 1
  grid.content[grid.index(0, 0, 1)] = MINE; // edge   -> 0.5
  grid.content[grid.index(0, 0, 0)] = MINE; // corner -> 0
  grid.recomputeCounts();
  assert.equal(grid.counts[centre], 1.5);
});

test('zero-weight classes drop out of the neighbourhood entirely', () => {
  const faces = new Grid(3, 3, 3, { face: 1, edge: 0, corner: 0 });
  let n = 0;
  faces.forEachNeighbour(faces.index(1, 1, 1), () => n++);
  assert.equal(n, 6);
  assert.equal(faces.adjacency, 6);

  const noCorners = new Grid(3, 3, 3, { face: 1, edge: 0.5, corner: 0 });
  n = 0;
  let total = 0;
  noCorners.forEachNeighbour(noCorners.index(1, 1, 1), (_, w) => {
    n++;
    total += w;
  });
  assert.equal(n, 18);
  assert.equal(total, 6 * 1 + 12 * 0.5);
  assert.equal(noCorners.maxCount(), 12);
});

test('half-weighted mines still gate the cascade', () => {
  const grid = new Grid(3, 3, 1, { face: 1, edge: 0.5, corner: 1 });
  grid.content[grid.index(2, 0, 2)] = MINE;
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false });
  const start = grid.index(0, 0, 0);
  assert.equal(grid.counts[start], 0);
  board.strike(start);
  // The mine is never mined, and its edge neighbours stop the flood with a "½".
  assert.equal(grid.state[grid.index(2, 0, 2)], INTACT);
  assert.equal(grid.counts[grid.index(1, 0, 2)], 0.5);
  assert.equal(grid.state[grid.index(1, 0, 2)], MINED);
});

test('chording sums mark weights, not mark counts', () => {
  const grid = new Grid(3, 3, 1, { face: 1, edge: 0.5, corner: 1 });
  grid.content[grid.index(0, 0, 1)] = MINE; // face neighbour of the centre -> 1
  grid.content[grid.index(0, 0, 0)] = MINE; // edge neighbour of the centre -> 0.5
  grid.recomputeCounts();
  const centre = grid.index(1, 0, 1);
  assert.equal(grid.counts[centre], 1.5);

  const board = new Board(grid, { safeFirstStrike: false, cascade: 'off', strictMarks: false });
  assert.equal(board.strike(centre).kind, 'cleared');

  board.toggleMark(grid.index(0, 0, 1)); // weight 1 only -> still short of 1.5
  assert.equal(board.probe(centre).reason, 'marks-mismatch');

  board.toggleMark(grid.index(0, 0, 0)); // + weight 0.5 -> exactly 1.5
  assert.equal(board.probe(centre).kind, 'probe');
  assert.equal(grid.state[grid.index(2, 0, 2)], MINED);
  assert.equal(board.status, 'playing');
});