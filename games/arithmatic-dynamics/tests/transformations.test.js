import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize } from '../src/core/serialize.js';
import { evaluate } from '../src/core/value.js';
import { split, swap, group, ungroup, combine, cancel } from '../src/core/transformations.js';

test('split replaces a number with an equal expression', () => {
  const ast = parse('4 + 19');
  const rightId = ast.terms[1].id;
  const next = split(ast, rightId, { into: '30 - 11' });
  assert.equal(evaluate(next), evaluate(ast));
  assert.equal(serialize(next), '4 + (30 - 11)');
});

test('split rejects value-changing replacement', () => {
  const ast = parse('4 + 19');
  const rightId = ast.terms[1].id;
  assert.throws(() => split(ast, rightId, { into: '20 - 2' }), /value/);
});
test('split rejects parts that are not smaller', () => {
  // 4 -> 2 + 2 : 2*16=32, 2^2+2^2=8, 32<8 is false -> rejected
  const ast = parse('4 + 19');
  const leftId = ast.terms[0].id;
  assert.throws(() => split(ast, leftId, { into: '2 + 2' }), /smaller/);
});
test('split accepts parts spread away from the value', () => {
  // 19 -> 20 - 1 : 2*361=722, 400+1=401 ... 722<401 false -> rejected
  // 19 -> 30 - 11 : 2*361=722, 900+121=1021, 722<1021 true -> accepted
  const ast = parse('4 + 19');
  const rightId = ast.terms[1].id;
  const next = split(ast, rightId, { into: '30 - 11' });
  assert.equal(evaluate(next), evaluate(ast));
});

test('swap two adjacent sum members, value preserved', () => {
  const ast = parse('5 + 3');
  const next = swap(ast, ast.terms[0].id, ast.terms[1].id);
  assert.equal(serialize(next), '3 + 5');
  assert.equal(evaluate(next), evaluate(ast));
});

test('combine folds two adjacent numbers', () => {
  const ast = parse('25 - 2');
  const next = combine(ast, ast.terms[0].id, ast.terms[1].id);
  assert.equal(serialize(next), '23');
});

test('combine works on any adjacent pair in a+b+c', () => {
  const ast = parse('2 + 3 + 4');
  // combine first two
  const next = combine(ast, ast.terms[0].id, ast.terms[1].id);
  assert.equal(evaluate(next), 9);
  assert.equal(serialize(next), '5 + 4');
});

test('cancel removes an inverse pair', () => {
  const ast = parse('7 + 3 - 3');
  const next = cancel(ast, ast.terms[1].id, ast.terms[2].id);
  assert.equal(evaluate(next), 7);
  assert.equal(serialize(next), '7');
});

test('cancel works for multiply/divide', () => {
  const ast = parse('6 * 5 / 5');
  const next = cancel(ast, ast.factors[1].id, ast.factors[2].id);
  assert.equal(evaluate(next), 6);
});

test('group then ungroup round-trips value', () => {
  const ast = parse('2 + 3 + 4');
  const grouped = group(ast, [ast.terms[0].id, ast.terms[1].id]);
  assert.equal(evaluate(grouped), evaluate(ast));
  const gid = grouped.terms[0].id;
  const back = ungroup(grouped, gid);
  assert.equal(evaluate(back), evaluate(ast));
});
