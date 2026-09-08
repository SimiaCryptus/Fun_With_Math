import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, toHash, fromHash, encodeMoves, decodeMoves, SWAP } from '../src/config.js';
import { tilingIds } from '../src/tilings/registry.js';

test('move strings round-trip, including the pie-rule swap', () => {
  const moves = [0, 17, SWAP, 4094, 120, 3];
  const s = encodeMoves(moves);
  assert.equal(s.length, moves.length * 2);
  assert.deepEqual(decodeMoves(s), moves);
  assert.throws(() => encodeMoves([4095]));
});

test('config + moves round-trip through the URL hash', () => {
  const cfg = normalize({ tiling: 'triHex', outline: 'hexagon', size: 9, crossingMode: 'open', variants: ['pie', 'bogus'] }, tilingIds);
  assert.equal(cfg.players, 3);
  assert.deepEqual(cfg.variants, ['pie']);
  const moves = [5, 9, SWAP, 33];
  const hash = toHash(cfg, moves);
  const back = fromHash(hash, tilingIds);
  assert.deepEqual(back.config, cfg);
  assert.deepEqual(back.moves, moves);
  assert.ok(hash.length < 200, 'URL budget');
});

test('normalize repairs garbage', () => {
  const cfg = normalize({ tiling: 'nope', outline: 'blob', size: 999, edgeMode: 'x', crossingMode: 'y', goal: 'z' }, tilingIds);
  assert.equal(cfg.tiling, 'hex');
  assert.equal(cfg.outline, 'rhombus');
  assert.equal(cfg.size, 31);
  assert.equal(cfg.edgeMode, 'centroid');
  assert.equal(cfg.crossingMode, 'bridge');
  assert.equal(cfg.goal, 'opposite');
  assert.equal(cfg.players, 2);
});