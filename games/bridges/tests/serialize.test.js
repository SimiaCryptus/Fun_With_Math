import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, toHash, fromHash, encodeMoves, decodeMoves, SWAP, PASS } from '../src/config.js';
import { tilingIds } from '../src/tilings/registry.js';

test('move strings round-trip, including the pie-rule swap and passes', () => {
   const moves = [0, 17, SWAP, 4093, PASS, 120, 3];
  const s = encodeMoves(moves);
  assert.equal(s.length, moves.length * 2);
  assert.deepEqual(decodeMoves(s), moves);
  assert.throws(() => encodeMoves([4095]));
   assert.throws(() => encodeMoves([4094]));
});

test('config + moves round-trip through the URL hash', () => {
   const cfg = normalize({
     tiling: 'triHex', outline: 'hexagon', size: 9, crossingMode: 'open', variants: ['pie', 'bogus'],
     bots: ['human', 'hard', 'nope'], time: 300, increment: 3,
   }, tilingIds);
  assert.equal(cfg.players, 3);
  assert.deepEqual(cfg.variants, ['pie']);
   assert.deepEqual(cfg.bots, ['human', 'hard', 'human']);
   assert.equal(cfg.time, 300);
   assert.equal(cfg.increment, 3);
  const moves = [5, 9, SWAP, 33];
  const hash = toHash(cfg, moves);
  const back = fromHash(hash, tilingIds);
  assert.deepEqual(back.config, cfg);
  assert.deepEqual(back.moves, moves);
  assert.ok(hash.length < 200, 'URL budget');
});

test('normalize repairs garbage', () => {
  const cfg = normalize({ tiling: 'nope', outline: 'blob', size: 999, edgeMode: 'x', crossingMode: 'y', goal: 'z' }, tilingIds);
   assert.equal(cfg.tiling, 'triangle');
  assert.equal(cfg.outline, 'rhombus');
  assert.equal(cfg.size, 31);
  assert.equal(cfg.edgeMode, 'centroid');
  assert.equal(cfg.crossingMode, 'bridge');
  assert.equal(cfg.goal, 'opposite');
  assert.equal(cfg.players, 2);
   assert.deepEqual(cfg.bots, ['human', 'human']);
   assert.equal(cfg.time, 0);
   assert.equal(normalize({ increment: 5 }, tilingIds).increment, 0, 'no increment without main time');
});
test('an untimed all-human game keeps the URL short', () => {
   const hash = toHash(normalize({}, tilingIds));
   assert.ok(!hash.includes('b=') && !hash.includes('k='));
});