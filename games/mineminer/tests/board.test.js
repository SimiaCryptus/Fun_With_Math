import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid, MINE, EMPTY, INTACT, MARKED, MINED, SCAR } from '../src/game/Grid.js';
import { placeMines } from '../src/game/MineGenerator.js';
import { Board } from '../src/game/Board.js';
import { rngFromSeed } from '../src/core/rng.js';

function boardFrom(w, d, h, mines, seed, opts = {}) {
  const grid = new Grid(w, d, h, opts.adjacency ?? 26);
  placeMines(grid, mines, rngFromSeed(seed));
  return new Board(grid, { seed, ...opts });
}

function bruteCount(grid, i) {
  const { x, y, z } = grid.coords(i);
  let c = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        if (grid.adjacency === 6 && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) !== 1) continue;
        if (grid.inBounds(x + dx, y + dy, z + dz) && grid.content[grid.index(x + dx, y + dy, z + dz)] === MINE) c++;
      }
    }
  }
  return c;
}

test('26- and 6-adjacency counts match brute force', () => {
  for (const adjacency of [26, 6]) {
    const grid = new Grid(7, 5, 3, adjacency);
    placeMines(grid, 20, rngFromSeed('counts'));
    for (let i = 0; i < grid.cellCount; i++) assert.equal(grid.counts[i], bruteCount(grid, i));
  }
});

test('height 1 degenerates to the classic 8 neighbours', () => {
  const grid = new Grid(5, 5, 1);
  let n = 0;
  grid.forEachNeighbour(grid.index(2, 0, 2), () => n++);
  assert.equal(n, 8);
});

test('seeded placement is deterministic', () => {
  const a = boardFrom(10, 10, 2, 20, 'granite-42');
  const b = boardFrom(10, 10, 2, 20, 'granite-42');
  assert.deepEqual([...a.grid.content], [...b.grid.content]);
  const c = boardFrom(10, 10, 2, 20, 'granite-43');
  assert.notDeepEqual([...a.grid.content], [...c.grid.content]);
});

test('cascade never crosses a mark', () => {
  const grid = new Grid(5, 1, 1);
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false, strictMarks: false });
  assert.equal(board.toggleMark(2).kind, 'marked');
  const r = board.strike(0);
  assert.equal(r.kind, 'cleared');
  assert.deepEqual([...grid.state], [MINED, MINED, MARKED, INTACT, INTACT]);
  assert.equal(board.status, 'playing');
  assert.ok(r.revealed.find((x) => x.cell === 1).delay > 0, 'cascade shells carry delays');
});

test('safe first strike relocates mines out of the neighbourhood', () => {
  for (let s = 0; s < 40; s++) {
    const board = boardFrom(6, 6, 1, 12, `seed-${s}`);
    const centre = board.grid.index(3, 0, 3);
    const r = board.strike(centre);
    assert.notEqual(r.kind, 'boom');
    assert.equal(board.grid.counts[centre], 0);
    assert.equal(board.grid.content[centre], EMPTY);
    board.grid.forEachNeighbour(centre, (n) => assert.equal(board.grid.content[n], EMPTY));
    assert.equal(board.mineCount, 12);
    let mines = 0;
    for (const c of board.grid.content) if (c === MINE) mines++;
    assert.equal(mines, 12, 'mine count preserved after relocation');
  }
});

test('striking an unmarked mine detonates and ends the run on 1 life', () => {
  const grid = new Grid(3, 1, 1);
  grid.content[1] = MINE;
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false });
  const r = board.strike(1);
  assert.equal(r.kind, 'boom');
  assert.equal(board.status, 'lost');
  assert.equal(grid.state[1], SCAR);
});

test('a marked mine is safe to strike (defused); a marked safe cell misfires', () => {
  const grid = new Grid(3, 1, 1);
  grid.content[1] = MINE;
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false, lives: 3 });
  board.toggleMark(1);
  assert.equal(board.strike(1).kind, 'defused');
  assert.equal(board.defused, 1);
  assert.equal(board.lives, 3);
  board.toggleMark(0);
  assert.equal(board.strike(0).kind, 'misfire');
  assert.equal(board.lives, 2);
  assert.equal(board.misfires, 1);
});

test('win when every safe cell is mined; remaining marked mines auto-defuse', () => {
  const grid = new Grid(3, 3, 1);
  grid.content[4] = MINE;
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false });
  board.toggleMark(4);
  let last;
  for (let i = 0; i < 9; i++) if (i !== 4) last = board.strike(i);
  assert.equal(board.status, 'won');
  assert.ok(last.won);
  assert.equal(grid.state[4], MINED);
  assert.equal(board.minesRemaining, 0);
  assert.ok(board.isWon());
});

test('strict marks limits marks to the mine count', () => {
  const grid = new Grid(4, 1, 1);
  grid.content[3] = MINE;
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false });
  assert.equal(board.toggleMark(0).kind, 'marked');
  const r = board.toggleMark(1);
  assert.equal(r.kind, 'noop');
  assert.equal(r.reason, 'mark-limit');
});

test('probe strikes intact neighbours when marks match the number', () => {
  const grid = new Grid(4, 1, 1);
  grid.content[3] = MINE;
  grid.recomputeCounts();
  const board = new Board(grid, { safeFirstStrike: false, cascade: 'off' });
  assert.equal(board.strike(2).kind, 'cleared');
  assert.equal(board.probe(2).reason, 'marks-mismatch');
  board.toggleMark(3);
  const r = board.probe(2);
  assert.equal(r.kind, 'probe');
  assert.equal(grid.state[1], MINED);
  assert.equal(grid.state[0], INTACT);
  assert.equal(board.status, 'playing');
});

test('snapshot/restore round-trips and replays are exact', () => {
  const a = boardFrom(8, 8, 2, 12, 'undo');
  const snap = a.snapshot();
  a.strike(a.grid.index(4, 0, 4));
  a.toggleMark(0);
  const after = a.snapshot();
  a.restore(snap);
  assert.deepEqual([...a.grid.state], [...snap.state]);
  assert.equal(a.marks, 0);

  const b = boardFrom(8, 8, 2, 12, 'undo');
  b.replay(after.actionLog);
  assert.deepEqual([...b.grid.state], [...after.state]);
  assert.deepEqual([...b.grid.content], [...after.content]);
});