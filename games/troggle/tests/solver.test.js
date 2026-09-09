import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid, ADJACENCY } from '../js/core/grid.js';
import { Trie } from '../js/core/trie.js';
import { solve, findPath, findAllPaths, hasPath } from '../js/core/solver.js';

/**
 * Hand-built 3×3×3 board (index = x + 3y + 9z):
 *
 *   z=0        z=1        z=2
 *   C A T      E E E      S S S
 *   D O G      E E E      S S S
 *   B B B      E E E      S S S
 */
const LETTERS = [
  'C', 'A', 'T', 'D', 'O', 'G', 'B', 'B', 'B',
  ...Array(9).fill('E'),
  ...Array(9).fill('S'),
];
const DICT = ['cat', 'cot', 'dog', 'god', 'tag', 'act', 'does', 'dotes', 'sees', 'bees', 'zoo'];

const makeGrid = (mode = ADJACENCY.CORNER) => new Grid(3, LETTERS, mode);
const trie = Trie.fromWords(DICT);

test('trie basics', () => {
  assert.equal(trie.size, DICT.length);
  assert.equal(trie.isWord('cat'), true);
  assert.equal(trie.isWord('CAT'), true);
  assert.equal(trie.isWord('ca'), false);
  assert.equal(trie.hasPrefix('ca'), true);
  assert.equal(trie.hasPrefix('q'), false);
  assert.equal(Trie.fromWords(['ab', 'abc', 'x'.repeat(16), "don't"]).size, 1);
});

test('solve finds exactly the known words on the 3×3×3 board', () => {
  const words = solve(makeGrid(), trie);
  const found = [...words.keys()].sort();
  assert.deepEqual(found, ['bees', 'cat', 'cot', 'does', 'dog', 'dotes', 'god', 'sees', 'tag']);
  assert.equal(words.has('act'), false, 'C and T are not adjacent');
  assert.equal(words.has('zoo'), false, 'not on board');
});

test('solve keeps the best-scoring path per word', () => {
  const grid = makeGrid();
  const words = solve(grid, trie);
  // dotes: base 2 + 2 extra layers + volumetric 3 = 7
  assert.equal(words.get('dotes').score.total, 7);
  // does: base 1 + 2 extra layers + volumetric 3 (E/S chosen to spread in x and y) = 6
  assert.equal(words.get('does').score.total, 6);
  // cat: flat, single layer
  assert.equal(words.get('cat').score.total, 1);
  assert.deepEqual(words.get('cat').path, [0, 1, 2]);
});

test('every solved path is valid and spells its word', () => {
  const grid = makeGrid();
  for (const [word, { path }] of solve(grid, trie)) {
    assert.ok(grid.isValidPath(path), `${word} path valid`);
    assert.equal(grid.wordFromPath(path).toLowerCase(), word);
  }
});

test('findPath agrees with solve', () => {
  const grid = makeGrid();
  const words = solve(grid, trie);
  for (const word of DICT) {
    const p = findPath(grid, word);
    if (words.has(word)) {
      assert.ok(p, `${word} should be findable`);
      assert.ok(grid.isValidPath(p));
      assert.equal(grid.wordFromPath(p).toLowerCase(), word);
    } else {
      assert.equal(p, null, `${word} should not be findable`);
    }
  }
  assert.equal(hasPath(grid, 'cot'), true);
  assert.equal(hasPath(grid, ''), false);
});

test('findAllPaths enumerates and honours limit', () => {
  const grid = makeGrid();
  const all = findAllPaths(grid, 'does');
  assert.ok(all.length > 1);
  for (const p of all) assert.equal(grid.wordFromPath(p), 'DOES');
  assert.equal(findAllPaths(grid, 'does', { limit: 2 }).length, 2);
  assert.deepEqual(findAllPaths(grid, 'act'), []);
});

test('minWordLength filters solve results', () => {
  const words = solve(makeGrid(), trie, { minWordLength: 4 });
  assert.deepEqual([...words.keys()].sort(), ['bees', 'does', 'dotes', 'sees']);
});

test('adjacency mode changes what is findable', () => {
  // cot: C(0,0,0) → O(1,1,0) is an edge-diagonal step; not allowed in face mode.
  assert.equal(hasPath(makeGrid(ADJACENCY.FACE), 'cot'), false);
  assert.equal(hasPath(makeGrid(ADJACENCY.EDGE), 'cot'), true);
  assert.equal(hasPath(makeGrid(ADJACENCY.FACE), 'cat'), true);
});

test('Qu occupies one cube and consumes two trie characters', () => {
  const letters = Array(27).fill('B');
  letters[0] = 'Qu';
  letters[1] = 'I';
  letters[2] = 'T';
  const grid = new Grid(3, letters);
  const t = Trie.fromWords(['quit', 'bib']);
  const words = solve(grid, t);
  assert.ok(words.has('quit'));
  assert.deepEqual(words.get('quit').path, [0, 1, 2]);
  assert.equal(words.get('quit').score.total, 1);
  assert.deepEqual(findPath(grid, 'quit'), [0, 1, 2]);
  assert.equal(findPath(grid, 'qit'), null);
});