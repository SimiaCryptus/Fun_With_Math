import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/serialize.js';
import { legalVerbs, difficultyAllows } from '../src/core/legality.js';

test('split is legal on a number', () => {
  const ast = parse('4 + 19');
  const verbs = legalVerbs(ast, ast.terms[0].id);
  assert.ok(verbs.includes('split'));
  assert.ok(verbs.includes('factorize'));
});

test('any adjacent number pair in a sum offers combine + swap', () => {
  const ast = parse('2 + 3 + 4');
  const first = legalVerbs(ast, [ast.terms[0].id, ast.terms[1].id]);
  assert.ok(first.includes('combine'));
  assert.ok(first.includes('swap'));
  const second = legalVerbs(ast, [ast.terms[1].id, ast.terms[2].id]);
  assert.ok(second.includes('combine'));
  assert.ok(second.includes('swap'));
});

test('cancel offered on inverse pair', () => {
  const ast = parse('7 + 3 - 3');
  assert.ok(legalVerbs(ast, [ast.terms[1].id, ast.terms[2].id]).includes('cancel'));
});

test('allowed filter restricts surfaced verbs', () => {
  const ast = parse('5 + 3');
  const verbs = legalVerbs(ast, [ast.terms[0].id, ast.terms[1].id], ['combine']);
  assert.deepEqual(verbs, ['combine']);
});
test('difficulty needs only 2 of 3 numbers to satisfy the condition', () => {
  // medium: threshold 10, factors [2,5]
  // 5 + 10 = 15: 5 (<10) ok, 10 (=10, factorable by 2*5) ok, 15 (not <10, 15=3*5 not fully factorable)
  // 2 of 3 satisfy -> allowed
  assert.ok(difficultyAllows('medium', [5, 10], 15));
  // 1 + 25 = 26: 1 (<10) ok, 25 (=5*5 factorable) ok, 26 (no) -> 2 of 3 -> allowed
  assert.ok(difficultyAllows('medium', [1, 25], 26));
  // 7 + 11 = 18: 7 (<10) ok, 11 (no), 18 (=2*9 no) -> only 1 -> rejected
  assert.ok(!difficultyAllows('medium', [7, 11], 18));
});
