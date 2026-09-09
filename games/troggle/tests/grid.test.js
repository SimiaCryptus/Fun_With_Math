import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid, ADJACENCY } from '../js/core/grid.js';

const fill = (n, l = 'A') => Array.from({ length: n ** 3 }, () => l);
const allModes = (n) =>
  Object.fromEntries(Object.values(ADJACENCY).map((m) => [m, new Grid(n, fill(n), m)]));

test('neighbour counts at corner / edge / face / interior positions (N=4)', () => {
  const g = allModes(4);
  const cases = [
    [[0, 0, 0], { face: 3, edge: 6, corner: 7 }],
    [[1, 0, 0], { face: 4, edge: 9, corner: 11 }],
    [[1, 1, 0], { face: 5, edge: 13, corner: 17 }],
    [[1, 1, 1], { face: 6, edge: 18, corner: 26 }],
  ];
  for (const [[x, y, z], expect] of cases) {
    for (const mode of Object.keys(expect)) {
      const grid = g[mode];
      const n = grid.neighbours(grid.index(x, y, z)).length;
      assert.equal(n, expect[mode], `${mode} @ (${x},${y},${z})`);
    }
  }
});

test('neighbour lists never contain self or out-of-range indices', () => {
  for (const grid of Object.values(allModes(5))) {
    for (let i = 0; i < grid.count; i++) {
      for (const j of grid.neighbours(i)) {
        assert.notEqual(j, i);
        assert.ok(j >= 0 && j < grid.count);
        assert.ok(grid.isAdjacent(j, i), 'adjacency is symmetric');
      }
    }
  }
});

test('index / coords round-trip', () => {
  const grid = new Grid(6, fill(6));
  for (let i = 0; i < grid.count; i++) {
    const { x, y, z } = grid.coords(i);
    assert.equal(grid.index(x, y, z), i);
  }
  assert.deepEqual(grid.coords(grid.index(2, 3, 5)), { x: 2, y: 3, z: 5 });
});

test('constructor validates letters length and adjacency', () => {
  assert.throws(() => new Grid(4, fill(3)));
  assert.throws(() => new Grid(4, fill(4), 'diagonal'));
});

test('isValidPath rejects repeats, non-adjacent steps and bad indices', () => {
  const grid = new Grid(4, fill(4));
  const i = (x, y, z) => grid.index(x, y, z);
  assert.equal(grid.isValidPath([i(0, 0, 0), i(1, 1, 1), i(2, 2, 2)]), true);
  assert.equal(grid.isValidPath([i(0, 0, 0), i(1, 1, 1), i(0, 0, 0)]), false, 'repeat');
  assert.equal(grid.isValidPath([i(0, 0, 0), i(2, 0, 0)]), false, 'non-adjacent');
  assert.equal(grid.isValidPath([i(0, 0, 0), i(0, 0, 0)]), false, 'immediate repeat');
  assert.equal(grid.isValidPath([]), false, 'empty');
  assert.equal(grid.isValidPath([-1]), false);
  assert.equal(grid.isValidPath([64]), false);
  assert.equal(grid.isValidPath([1.5]), false);
});

test('face adjacency rejects diagonal steps that corner adjacency allows', () => {
  const face = new Grid(4, fill(4), ADJACENCY.FACE);
  const edge = new Grid(4, fill(4), ADJACENCY.EDGE);
  const corner = new Grid(4, fill(4), ADJACENCY.CORNER);
  const a = face.index(0, 0, 0);
  const edgeDiag = face.index(1, 1, 0);
  const cornerDiag = face.index(1, 1, 1);
  assert.equal(face.isAdjacent(a, edgeDiag), false);
  assert.equal(edge.isAdjacent(a, edgeDiag), true);
  assert.equal(edge.isAdjacent(a, cornerDiag), false);
  assert.equal(corner.isAdjacent(a, cornerDiag), true);
});

test('isInterior', () => {
  const grid = new Grid(5, fill(5));
  assert.equal(grid.isInterior(grid.index(0, 2, 2)), false);
  assert.equal(grid.isInterior(grid.index(1, 1, 1)), true);
  assert.equal(grid.isInterior(grid.index(3, 3, 3)), true);
  assert.equal(grid.isInterior(grid.index(4, 3, 3)), false);
});

test('pathMetrics: layers, span, volumetric, interior', () => {
  const grid = new Grid(5, fill(5));
  const i = (x, y, z) => grid.index(x, y, z);

  const flat = grid.pathMetrics([i(0, 0, 0), i(1, 0, 0), i(2, 1, 0)]);
  assert.equal(flat.layers, 1);
  assert.deepEqual(flat.span, { x: 3, y: 2, z: 1 });
  assert.equal(flat.isVolumetric, false);
  assert.equal(flat.allInterior, false);

  const deep = grid.pathMetrics([i(1, 1, 1), i(2, 2, 2), i(3, 3, 3)]);
  assert.equal(deep.layers, 3);
  assert.deepEqual(deep.span, { x: 3, y: 3, z: 3 });
  assert.equal(deep.isVolumetric, true);
  assert.equal(deep.allInterior, true);

  assert.equal(grid.pathMetrics([]).allInterior, false);
});

test('wordFromPath expands Qu and upper-cases letters', () => {
  const letters = fill(3, 'b');
  letters[0] = 'Qu';
  letters[1] = 'i';
  letters[2] = 't';
  const grid = new Grid(3, letters);
  assert.equal(grid.wordFromPath([0, 1, 2]), 'QUIT');
  assert.equal(grid.letterAt(0), 'QU');
});