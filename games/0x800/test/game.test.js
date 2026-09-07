import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  createGame,
  move,
  isOver,
  serialize,
  deserialize,
  emptyCells,
  keepGoing,
  WIN_VALUE,
  VERSION,
  hex,
} from '../src/game.js';
import { DIRS, cellCount } from '../src/hex.js';
import { mulberry32, nth, counted } from '../src/rng.js';

/** Build a state with explicit tiles: spec = [[q, r, value], ...]. */
function board(radius, spec) {
  const base = createGame({ radius, seed: 7 });
  const tiles = spec.map(([q, r, value], i) => ({ id: i + 1, value, q, r }));
  return {
    ...base,
    tiles,
    nextTileId: tiles.length + 1,
    rngCalls: 0,
    spawnedTotal: tiles.reduce((a, t) => a + t.value, 0),
  };
}

const at = (state, q, r) => state.tiles.find((t) => t.q === q && t.r === r);
const originals = (res, n) => res.state.tiles.filter((t) => t.id <= n).sort((a, b) => a.id - b.id);
const sum = (tiles) => tiles.reduce((a, t) => a + t.value, 0);

test('rng: nth(seed, n) reproduces the mulberry32 stream', () => {
  for (const seed of [1, 0xdeadbeef, 123456789, 0]) {
    const g = mulberry32(seed);
    for (let n = 0; n < 20; n++) assert.equal(nth(seed, n), g(), `seed ${seed} n ${n}`);
    const c = counted(seed, 5);
    const g2 = mulberry32(seed);
    for (let i = 0; i < 5; i++) g2();
    assert.equal(c.next(), g2());
    assert.equal(c.calls, 6);
  }
});

test('hex labels are uppercase without prefix', () => {
  assert.equal(hex(1), '1');
  assert.equal(hex(16), '10');
  assert.equal(hex(2048), '800');
  assert.equal(hex(0x8000), '8000');
});

test('createGame spawns two tiles of value 1 or 2 and draws 4 random numbers', () => {
  const s = createGame({ radius: 2, seed: 42 });
  assert.equal(s.tiles.length, 2);
  for (const t of s.tiles) assert.ok(t.value === 1 || t.value === 2);
  assert.equal(s.rngCalls, 4);
  assert.equal(s.score, 0);
  assert.equal(s.moves, 0);
  assert.equal(s.spawnedTotal, sum(s.tiles));
  assert.equal(emptyCells(s).length, cellCount(2) - 2);
});

test('4 4 4 4 → 8 8 toward the destination edge', () => {
  const s = board(2, [
    [-2, 0, 4],
    [-1, 0, 4],
    [0, 0, 4],
    [1, 0, 4],
  ]);
  const res = move(s, 'E');
  assert.equal(res.moved, true);
  assert.equal(res.gained, 16);
  assert.equal(res.events.filter((e) => e.type === 'merge').length, 2);
  const kept = originals(res, 4);
  assert.deepEqual(
    kept.map((t) => [t.q, t.r, t.value]),
    [
      [1, 0, 8],
      [2, 0, 8],
    ]
  );
  assert.equal(res.state.score, 16);
});

test('4 4 4 → 8 4 with the merge at the destination edge', () => {
  const s = board(2, [
    [-2, 0, 4],
    [-1, 0, 4],
    [0, 0, 4],
  ]);
  const res = move(s, 'E');
  assert.equal(at(res.state, 2, 0).value, 8);
  assert.equal(at(res.state, 1, 0).value, 4);
  assert.equal(at(res.state, 1, 0).id, 1);
  assert.equal(res.gained, 8);
});

test('a tile never merges twice in one move (2 2 4 → 4 4)', () => {
  const s = board(2, [
    [-2, 0, 2],
    [-1, 0, 2],
    [0, 0, 4],
  ]);
  const res = move(s, 'E');
  const kept = originals(res, 3);
  assert.deepEqual(
    kept.map((t) => [t.q, t.r, t.value]),
    [
      [1, 0, 4],
      [2, 0, 4],
    ]
  );
  assert.equal(res.gained, 4);
});

test('merges work along diagonal lines (SW along constant s)', () => {
  const s = board(2, [
    [0, 0, 2],
    [1, -1, 2],
  ]);
  const res = move(s, 'SW');
  assert.equal(res.moved, true);
  const kept = originals(res, 2);
  assert.equal(kept.length, 1);
  assert.deepEqual([kept[0].q, kept[0].r, kept[0].value], [-2, 2, 4]);
});

test('illegal move returns moved:false, the same state object, and spawns nothing', () => {
  const s = board(2, [[2, 0, 4]]);
  const res = move(s, 'E');
  assert.equal(res.moved, false);
  assert.equal(res.state, s);
  assert.equal(res.events.length, 0);
  assert.equal(res.gained, 0);
  assert.equal(s.tiles.length, 1);
  assert.equal(s.moves, 0);
});

test('legal move spawns exactly one tile in an empty cell and bumps the counter', () => {
  const s = board(2, [[0, 0, 1]]);
  const res = move(s, 'E');
  assert.equal(res.moved, true);
  assert.equal(res.state.tiles.length, 2);
  assert.equal(res.state.moves, 1);
  const spawns = res.events.filter((e) => e.type === 'spawn');
  assert.equal(spawns.length, 1);
  const spawned = res.state.tiles.find((t) => t.id === spawns[0].id);
  assert.ok(spawned);
  assert.ok(!(spawned.q === 2 && spawned.r === 0), 'spawn does not land on the moved tile');
  assert.equal(res.state.rngCalls, 2);
});

test('move never mutates its input', () => {
  const s = board(2, [
    [-2, 0, 4],
    [-1, 0, 4],
    [0, 0, 2],
  ]);
  const before = serialize(s);
  move(s, 'E');
  move(s, 'NW');
  assert.equal(serialize(s), before);
});

test('full but mergeable board is not over; full and unmergeable board is', () => {
  // radius 1: centre + six ring cells (DIRS order walks around the ring)
  const ring = (vals) => DIRS.map((d, i) => [d.q, d.r, vals[i]]);
  const over = board(1, [[0, 0, 1], ...ring([2, 4, 2, 4, 2, 4])]);
  assert.equal(over.tiles.length, cellCount(1));
  assert.equal(isOver(over), true);

  const mergeable = board(1, [[0, 0, 1], ...ring([2, 2, 4, 2, 4, 8])]);
  assert.equal(isOver(mergeable), false);

  // equal values across the centre are not adjacent
  const opposite = board(1, [[0, 0, 1], ...ring([2, 4, 8, 2, 16, 32])]);
  assert.equal(isOver(opposite), true);

  const notFull = board(1, [[0, 0, 1], ...ring([2, 4, 2, 4, 2, 4]).slice(0, 5)]);
  assert.equal(isOver(notFull), false);
});

test('a move on an over state is refused', () => {
  const s = { ...board(1, [[0, 0, 1]]), over: true };
  const res = move(s, 'E');
  assert.equal(res.moved, false);
  assert.equal(res.state, s);
});

test('reaching 0x800 sets won and emits a single win event', () => {
  const s = board(2, [
    [0, 0, 0x400],
    [1, 0, 0x400],
  ]);
  const res = move(s, 'E');
  assert.equal(res.state.won, true);
  assert.equal(res.events.filter((e) => e.type === 'win').length, 1);
  assert.ok(res.state.tiles.some((t) => t.value === WIN_VALUE));
  assert.equal(keepGoing(res.state).keptGoing, true);
  assert.equal(res.state.keptGoing, false);
});

test('score equals the sum of all merge results and value is conserved', () => {
  const pick = mulberry32(2024);
  let s = createGame({ radius: 2, seed: 77 });
  let merged = 0;
  let legal = 0;
  for (let i = 0; i < 400 && !s.over; i++) {
    const res = move(s, DIRS[Math.floor(pick() * 6)].name);
    if (!res.moved) continue;
    legal++;
    merged += res.events.filter((e) => e.type === 'merge').reduce((a, e) => a + e.value, 0);
    assert.equal(
      res.gained,
      res.events.filter((e) => e.type === 'merge').reduce((a, e) => a + e.value, 0)
    );
    s = res.state;
    assert.equal(sum(s.tiles), s.spawnedTotal, 'conservation of value');
    assert.ok(s.tiles.length <= cellCount(2));
    const keys = new Set(s.tiles.map((t) => `${t.q},${t.r}`));
    assert.equal(keys.size, s.tiles.length, 'no two tiles share a cell');
  }
  assert.ok(legal > 10);
  assert.equal(s.score, merged);
  assert.equal(s.moves, legal);
  assert.ok(s.best >= s.score);
});

test('serialize/deserialize is a deep-equal round trip', () => {
  let s = createGame({ radius: 2, seed: 99 });
  s = move(s, 'E').state;
  s = move(s, 'SW').state;
  const back = deserialize(serialize(s));
  assert.deepEqual(back, s);
});

test('deserialize rejects garbage and unknown versions', () => {
  assert.equal(deserialize('not json'), null);
  assert.equal(deserialize('null'), null);
  assert.equal(deserialize(JSON.stringify({ version: VERSION + 1, radius: 2, tiles: [] })), null);
  assert.equal(
    deserialize(JSON.stringify({ version: VERSION, radius: 2, tiles: [{ id: 'x' }] })),
    null
  );
  assert.ok(deserialize(serialize(createGame({ radius: 1, seed: 3 }))));
});

test('fixed seed + fixed move list reproduces the same board (golden)', () => {
  const script = 'DEWACZDDEEWWAAZZCC'
    .split('')
    .map((k) => ({ D: 'E', E: 'NE', W: 'NW', A: 'W', Z: 'SW', C: 'SE' })[k]);
  const play = (seed) => {
    let s = createGame({ radius: 2, seed, now: 0 });
    for (const d of script) s = move(s, d).state;
    return s;
  };
  const a = play(0x800);
  const b = play(0x800);
  assert.equal(serialize(a), serialize(b));
  assert.notEqual(serialize(play(0x801)), serialize(a));
  assert.equal(sum(a.tiles), a.spawnedTotal);
});
