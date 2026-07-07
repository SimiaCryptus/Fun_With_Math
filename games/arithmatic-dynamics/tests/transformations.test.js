import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize } from '../src/core/serialize.js';
import { evaluate } from '../src/core/value.js';
import { split, swap, group, ungroup, combine, cancel } from '../src/core/transformations.js';

test('split replaces a number with an equal expression', () => {
  const ast = parse('4 + 19');
  const next = split(ast, ast.right.id, { into: '20 - 1' });
  assert.equal(evaluate(next), evaluate(ast));
  assert.equal(serialize(next), '4 + (20 - 1)');
});

test('split rejects value-changing replacement', () => {
  const ast = parse('4 + 19');
  assert.throws(() => split(ast, ast.right.id, { into: '20 - 2' }), /value/);
});

test('swap only across commutative ops, value preserved', () => {
  const ast = parse('5 + 3');
  const next = swap(ast, ast.id);
  assert.equal(serialize(next), '3 + 5');
  assert.equal(evaluate(next), evaluate(ast));

  const sub = parse('5 - 3');
  assert.throws(() => swap(sub, sub.id), /commutative/);
});

test('combine folds two numbers', () => {
  const ast = parse('25 - 2');
  const next = combine(ast, ast.id);
  assert.equal(serialize(next), '23');
});

test('group and ungroup round-trip on safe expressions', () => {
  const ast = parse('4 + 19');
  const grouped = group(ast, ast.id);
  assert.equal(serialize(grouped), '(4 + 19)');
  const back = ungroup(grouped, grouped.id);
  assert.equal(evaluate(back), evaluate(ast));
});

test('ungroup refuses precedence-unsafe removal', () => {
  const ast = parse('(2 + 3) * 4');
  // ast is op '*'; its left is the group.
  const groupNode = ast.left;
  assert.throws(() => ungroup(ast, groupNode.id), /precedence|value/);
});

test('cancel removes an inverse pair', () => {
  const ast = parse('(7 + 3) - 3');
  const next = cancel(ast, ast.id);
  assert.equal(evaluate(next), 7);
});

test('cancel works for multiply/divide', () => {
  const ast = parse('(6 * 5) / 5');
  const next = cancel(ast, ast.id);
  assert.equal(evaluate(next), 6);
});

test('INVARIANT: transformations preserve value across a worked example', () => {
  let ast = parse('4 + 19');
  const v = evaluate(ast);
  ast = split(ast, ast.right.id, { into: '20 - 1' });
  assert.equal(evaluate(ast), v);
  // combine the inner group operator
  const innerOp = ast.right.child; // group -> op
  ast = combine(ast, innerOp.id);
  assert.equal(evaluate(ast), v);
});
