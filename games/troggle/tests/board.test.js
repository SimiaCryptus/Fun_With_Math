import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateBoard, encodeSeed, parseSeed, dailySeed, boardFromSeedString,
  assessQuality, everySubBlockHasVowel, defaultMinWordLength, VOWEL_RANGE,
} from '../js/core/board.js';
import { Grid } from '../js/core/grid.js';
import { Trie } from '../js/core/trie.js';
import { getPool, isValidDie, POOL_SIZES } from '../js/data/dice.js';
import { vowelRatio } from '../js/core/dice.js';
import { Game, STATE, REASON } from '../js/core/game.js';

test('dice pools have the right size and satisfy die constraints', () => {
  for (const [size, count] of Object.entries(POOL_SIZES)) {
    const pool = getPool(Number(size));
    assert.equal(pool.length, count);
    for (const die of pool) assert.ok(isValidDie(die), `die ${die.join('')}`);
  }
  // Pools are constants: rebuilding yields the same faces.
  assert.deepEqual(getPool(4), getPool(4));
});

test('same seed → identical board; different seed → different board', () => {
  const a = generateBoard({ size: 4, seed: 12345 });
  const b = generateBoard({ size: 4, seed: 12345 });
  const c = generateBoard({ size: 4, seed: 12346 });
  assert.deepEqual(a.letters, b.letters);
  assert.equal(a.attempts, b.attempts);
  assert.notDeepEqual(a.letters, c.letters);
  assert.equal(a.letters.length, 64);
  assert.ok(a.grid instanceof Grid);
  assert.equal(a.seedString, 'troggle:4:corner:00003039');
});

test('seed strings round-trip and reject garbage', () => {
  const s = { size: 5, adjacency: 'edge', seed: 0x8f31c2ab };
  assert.equal(encodeSeed(s), 'troggle:5:edge:8f31c2ab');
  assert.deepEqual(parseSeed('troggle:5:edge:8f31c2ab'), s);
  assert.deepEqual(parseSeed(' TROGGLE:5:EDGE:8F31C2AB '), s);
  assert.equal(parseSeed('troggle:7:corner:00000001'), null);
  assert.equal(parseSeed('troggle:4:diag:00000001'), null);
  assert.equal(parseSeed('nope'), null);

  const fromString = boardFromSeedString('troggle:5:edge:8f31c2ab');
  const direct = generateBoard(s);
  assert.deepEqual(fromString.letters, direct.letters);
  assert.equal(fromString.adjacency, 'edge');
});

test('dailySeed is stable per date/size/adjacency', () => {
  const d = new Date('2025-01-15T12:00:00Z');
  assert.equal(dailySeed(d, 4, 'corner'), dailySeed('2025-01-15', 4, 'corner'));
  assert.notEqual(dailySeed(d, 4, 'corner'), dailySeed(d, 5, 'corner'));
  assert.notEqual(dailySeed(d, 4, 'corner'), dailySeed(new Date('2025-01-16T00:00:00Z'), 4, 'corner'));
});

test('defaultMinWordLength', () => {
  assert.equal(defaultMinWordLength(4), 3);
  assert.equal(defaultMinWordLength(5), 3);
  assert.equal(defaultMinWordLength(6), 4);
});

test('quality gate holds over 100 seeds (geometry checks, no dictionary)', () => {
  let passed = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const board = generateBoard({ size: 4, seed, trie: null });
    const ratio = vowelRatio(board.letters);
    assert.ok(ratio >= VOWEL_RANGE[0] && ratio <= VOWEL_RANGE[1], `seed ${seed} vowel ratio ${ratio}`);
    assert.ok(board.attempts >= 1 && board.attempts <= 12);
    if (board.quality.ok) passed++;
  }
  assert.ok(passed >= 80, `only ${passed}/100 boards passed every check`);
});

test('assessQuality reports individual failures', () => {
  const noVowels = new Grid(4, Array(64).fill('T'));
  const q = assessQuality(noVowels, null);
  assert.equal(q.ok, false);
  assert.deepEqual(q.failed.sort(), ['vowelBlocks', 'vowelRatio']);
  assert.equal(everySubBlockHasVowel(noVowels), false);

  const letters = Array(64).fill('T');
  letters[new Grid(4, letters).index(1, 1, 1)] = 'A'; // one vowel touches all 8 inner blocks
  // but corner blocks still lack a vowel:
  assert.equal(everySubBlockHasVowel(new Grid(4, letters)), false);
});

test('generateBoard with a dictionary attaches solved words and checks counts', () => {
  const trie = Trie.fromWords(['tea', 'eat', 'ate', 'net', 'ten', 'one', 'ion', 'rat', 'tar', 'art']);
  const board = generateBoard({ size: 4, seed: 42, trie, minWords: 1 });
  assert.ok(board.words instanceof Map);
  assert.equal(typeof board.quality.checks.wordCount, 'boolean');
  assert.equal(typeof board.quality.checks.longWords, 'boolean');
  assert.equal(board.quality.checks.longWords, false, 'tiny dictionary has no 7+ letter words');
});

test('game round: countdown → playing → results with scoring and misses', () => {
  let clock = 1_000_000;
  const now = () => clock;
  const trie = Trie.fromWords(['cat', 'cot', 'dog', 'god', 'tag', 'act', 'does', 'dotes', 'sees', 'bees']);
  const letters = ['C', 'A', 'T', 'D', 'O', 'G', 'B', 'B', 'B', ...Array(9).fill('E'), ...Array(9).fill('S')];
  const grid = new Grid(3, letters);
  const { solve } = /** @type {any} */ (globalThis.__solver ?? {});
  void solve;
  const board = { size: 3, adjacency: 'corner', seedString: 'test', minWordLength: 3, letters, grid, trie, words: null };

  const game = new Game({ duration: 10, countdown: 3, now, autoTick: false });
  const events = [];
  for (const t of ['state', 'word', 'miss', 'end']) {
    game.addEventListener(t, (e) => events.push([t, e.detail]));
  }

  assert.equal(game.state, STATE.LOBBY);
  assert.equal(game.submitWord('cat').reason, REASON.NOT_PLAYING);

  game.start(board);
  assert.equal(game.state, STATE.COUNTDOWN);
  assert.equal(game.submitWord('cat').reason, REASON.NOT_PLAYING);
  assert.equal(game.misses, 0);

  clock += 3000;
  game.tick();
  assert.equal(game.state, STATE.PLAYING);
  assert.equal(Math.round(game.remaining()), 10);

  assert.equal(game.submitWord('CAT').ok, true);
  assert.equal(game.submitWord('cat').reason, REASON.ALREADY_FOUND);
  assert.equal(game.submitWord('act').reason, REASON.NO_PATH);
  assert.equal(game.submitWord('cog').reason, REASON.NOT_A_WORD);
  assert.equal(game.submitWord('ca').reason, REASON.TOO_SHORT);
  assert.equal(game.submitWord('dótes').ok, true, 'accent folding');
  assert.equal(game.submitWord('', [3, 4, 5]).ok, true, 'path-only submit (dog)');
  assert.equal(game.submitWord('god', [3, 4, 5]).reason, REASON.BAD_PATH, 'word/path mismatch');
  assert.equal(game.submitWord('', [0, 2]).reason, REASON.BAD_PATH, 'non-adjacent path');

  assert.equal(game.score, 1 + 7 + 1);
  assert.equal(game.misses, 5);

  clock += 10_000;
  game.tick();
  assert.equal(game.state, STATE.RESULTS);
  const results = game.results;
  assert.equal(results.score, 9);
  assert.equal(results.found.length, 3);
  assert.equal(results.best.word, 'dotes');
  assert.equal(results.misses, 5);
  assert.equal(game.submitWord('tag').reason, REASON.NOT_PLAYING);

  const states = events.filter(([t]) => t === 'state').map(([, d]) => d.to);
  assert.deepEqual(states, [STATE.COUNTDOWN, STATE.PLAYING, STATE.RESULTS]);
  assert.equal(events.filter(([t]) => t === 'word').length, 3);
  assert.equal(events.filter(([t]) => t === 'miss').length, 5);
  assert.equal(events.filter(([t]) => t === 'end').length, 1);
});