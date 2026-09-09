import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../js/core/grid.js';
import { baseScore, scoreWord, bestScore, totalScore, BONUS } from '../js/core/scoring.js';

const fill = (n, l = 'A') => Array.from({ length: n ** 3 }, () => l);

test('baseScore table (idea.md §2.3)', () => {
  const table = { 0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 3, 7: 5, 8: 11, 9: 15, 10: 19, 12: 27 };
  for (const [len, pts] of Object.entries(table)) {
    assert.equal(baseScore(Number(len)), pts, `length ${len}`);
  }
});

test('too-short words score zero regardless of geometry', () => {
  const grid = new Grid(4, fill(4));
  const s = scoreWord('aa', [grid.index(0, 0, 0), grid.index(1, 1, 1)], grid);
  assert.deepEqual(s, { total: 0, base: 0, layerBonus: 0, volumeBonus: 0, interior: false });
});

test('layer bonus: +1 per extra Z layer', () => {
  const grid = new Grid(4, fill(4));
  const i = (x, y, z) => grid.index(x, y, z);
  const s = scoreWord('aaa', [i(0, 0, 0), i(0, 0, 1), i(0, 0, 2)], grid);
  assert.equal(s.base, 1);
  assert.equal(s.layerBonus, 2 * BONUS.PER_EXTRA_LAYER);
  assert.equal(s.volumeBonus, 0, 'a straight line is not volumetric');
  assert.equal(s.total, 3);
});

test('volume bonus: bounding box spans all three axes by ≥ 2', () => {
  const grid = new Grid(4, fill(4));
  const i = (x, y, z) => grid.index(x, y, z);
  const s = scoreWord('aaa', [i(0, 0, 0), i(1, 1, 1), i(2, 2, 2)], grid);
  assert.equal(s.volumeBonus, BONUS.VOLUMETRIC);
  assert.equal(s.layerBonus, 2);
  assert.equal(s.total, 1 + 2 + 3);
  assert.equal(s.interior, false);
});

test('deep bonus applies only for N ≥ 5', () => {
  const g4 = new Grid(4, fill(4));
  const i4 = (x, y, z) => g4.index(x, y, z);
  // All interior on a 4³ board, but no multiplier.
  const s4 = scoreWord('aaa', [i4(1, 1, 1), i4(2, 2, 2), i4(1, 2, 2)], g4);
  assert.equal(s4.interior, false);
  assert.equal(s4.total, 6);

  const g5 = new Grid(5, fill(5));
  const i5 = (x, y, z) => g5.index(x, y, z);
  const s5 = scoreWord('aaa', [i5(1, 1, 1), i5(2, 2, 2), i5(3, 3, 3)], g5);
  assert.equal(s5.interior, true);
  assert.equal(s5.total, Math.ceil(6 * BONUS.INTERIOR_MULTIPLIER)); // 9

  // Touching the shell disables it.
  const s5b = scoreWord('aaa', [i5(0, 1, 1), i5(1, 2, 2), i5(2, 3, 3)], g5);
  assert.equal(s5b.interior, false);
  assert.equal(s5b.total, 6);
});

test('Qu counts as two letters for length but one cube for geometry', () => {
  const letters = fill(3, 'B');
  letters[0] = 'Qu';
  letters[1] = 'I';
  letters[2] = 'T';
  const grid = new Grid(3, letters);
  const word = grid.wordFromPath([0, 1, 2]).toLowerCase();
  assert.equal(word, 'quit');
  const s = scoreWord(word, [0, 1, 2], grid);
  assert.equal(s.base, baseScore(4));
  assert.equal(s.layerBonus, 0);
  assert.equal(s.total, 1);
});

test('bestScore picks the highest-scoring path', () => {
  const grid = new Grid(4, fill(4));
  const i = (x, y, z) => grid.index(x, y, z);
  const flat = [i(0, 0, 0), i(1, 0, 0), i(2, 0, 0)];
  const deep = [i(0, 0, 0), i(1, 1, 1), i(2, 2, 2)];
  const best = bestScore('aaa', [flat, deep], grid);
  assert.deepEqual(best.path, deep);
  assert.equal(best.score.total, 6);
  assert.equal(bestScore('aaa', [], grid).score.total, 1, 'no paths → geometry-free score');
});

test('totalScore sums a found map', () => {
  const found = new Map([
    ['a', { score: { total: 3 } }],
    ['b', { score: { total: 11 } }],
  ]);
  assert.equal(totalScore(found), 14);
});