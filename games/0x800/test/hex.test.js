import assert from 'node:assert/strict';
import { test } from './harness.js';
import {
  DIRS,
  dir,
  cells,
  cellCount,
  key,
  neighbors,
  isRim,
  lines,
  dot,
  invariant,
  ring,
  spiral,
  toPixel,
  boardSize,
  distance,
  SQRT3,
} from '../src/hex.js';
import { snapDirection, directionForKey } from '../src/input.js';

test('cellCount matches 3N²+3N+1 and cells(N).length for N = 0..4', () => {
  const expected = [1, 7, 19, 37, 61];
  for (let n = 0; n <= 4; n++) {
    assert.equal(cellCount(n), expected[n]);
    assert.equal(cells(n).length, expected[n]);
  }
});

test('cells are in canonical order (row-major by r, then q) with unique keys', () => {
  for (let n = 0; n <= 4; n++) {
    const list = cells(n);
    const keys = new Set(list.map((c) => key(c.q, c.r)));
    assert.equal(keys.size, list.length);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1],
        b = list[i];
      assert.ok(a.r < b.r || (a.r === b.r && a.q < b.q), `out of order at ${i}`);
    }
  }
  assert.deepEqual(cells(2)[0], { q: 0, r: -2 });
  assert.deepEqual(cells(2)[18], { q: 0, r: 2 });
});

test('every cell has ≤6 neighbours, exactly 6 iff not on the rim', () => {
  for (let n = 1; n <= 4; n++) {
    for (const c of cells(n)) {
      const ns = neighbors(c, n);
      assert.ok(ns.length <= 6);
      assert.equal(ns.length === 6, !isRim(c, n), `cell ${key(c.q, c.r)} radius ${n}`);
      for (const nb of ns) assert.equal(distance(c, nb), 1);
    }
  }
});

test('DIRS: six directions, each leaves exactly one cube coordinate constant', () => {
  assert.equal(DIRS.length, 6);
  for (const d of DIRS) {
    const zeros = [d.q, d.r, -d.q - d.r].filter((v) => v === 0).length;
    assert.equal(zeros, 1, d.name);
    assert.equal(dir(d.name), d);
  }
  assert.throws(() => dir('N'));
});

test('lines() partitions the board for all six directions', () => {
  for (let n = 0; n <= 4; n++) {
    for (const d of DIRS) {
      const ls = lines(n, d);
      assert.equal(ls.length, 2 * n + 1);
      const seen = new Set();
      for (const line of ls) {
        const inv = invariant(line[0], d);
        for (const c of line) {
          assert.equal(invariant(c, d), inv, 'invariant constant along a line');
          const k = key(c.q, c.r);
          assert.ok(!seen.has(k), `duplicate ${k}`);
          seen.add(k);
        }
      }
      assert.equal(seen.size, cellCount(n));
    }
  }
});

test('dot product decreases by exactly 2 along each line (far edge first)', () => {
  for (const d of DIRS) {
    for (const line of lines(3, d)) {
      for (let i = 1; i < line.length; i++) {
        assert.equal(dot(line[i - 1], d) - dot(line[i], d), 2);
        // consecutive cells are one step apart in direction d
        assert.deepEqual(
          { q: line[i].q + d.q, r: line[i].r + d.r },
          { q: line[i - 1].q, r: line[i - 1].r }
        );
      }
    }
  }
});

test('pixel layout: neighbours are equidistant and direction angles match DIRS.angle', () => {
  const size = 10;
  const o = toPixel(0, 0, size);
  for (const d of DIRS) {
    const p = toPixel(d.q, d.r, size);
    const dist = Math.hypot(p.x - o.x, p.y - o.y);
    assert.ok(Math.abs(dist - SQRT3 * size) < 1e-9, `distance for ${d.name}`);
    const ang = ((Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI + 360) % 360;
    assert.ok(Math.abs(ang - d.angle) < 1e-9, `${d.name}: ${ang} vs ${d.angle}`);
  }
  assert.deepEqual(boardSize(2, 10), { width: 10 * SQRT3 * 5, height: 80 });
});

test('ring(k) has 6k cells and spiral(N) covers the board exactly', () => {
  assert.equal(ring(0).length, 1);
  for (let k = 1; k <= 4; k++) {
    const r = ring(k);
    assert.equal(r.length, 6 * k);
    for (const c of r) assert.equal(distance(c, { q: 0, r: 0 }), k);
  }
  for (let n = 0; n <= 3; n++) {
    const s = spiral(n)
      .map((c) => key(c.q, c.r))
      .sort();
    const all = cells(n)
      .map((c) => key(c.q, c.r))
      .sort();
    assert.deepEqual(s, all);
  }
});

test('snapDirection covers the whole circle with ±30° tolerance', () => {
  for (const d of DIRS) {
    for (const off of [-29, -15, 0, 15, 29]) {
      const a = ((d.angle + off) * Math.PI) / 180;
      assert.equal(snapDirection(Math.cos(a), Math.sin(a)).name, d.name, `${d.name} ${off}`);
    }
  }
});

test('keyboard mapping: WEADZC hexagon, numpad and arrows', () => {
  const k = (code, shiftKey = false) => directionForKey({ code, shiftKey });
  assert.equal(k('KeyW'), 'NW');
  assert.equal(k('KeyE'), 'NE');
  assert.equal(k('KeyA'), 'W');
  assert.equal(k('KeyD'), 'E');
  assert.equal(k('KeyZ'), 'SW');
  assert.equal(k('KeyC'), 'SE');
  assert.equal(k('Numpad7'), 'NW');
  assert.equal(k('Numpad3'), 'SE');
  assert.equal(k('ArrowUp'), 'NW');
  assert.equal(k('ArrowUp', true), 'NE');
  assert.equal(k('ArrowDown'), 'SE');
  assert.equal(k('ArrowDown', true), 'SW');
  assert.equal(k('KeyS'), null);
});
