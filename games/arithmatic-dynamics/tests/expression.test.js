import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize, structurallyEqual } from '../src/core/serialize.js';
import { findNode, replaceNode, num, collectIds } from '../src/core/expression.js';

test('serialize round-trips', () => {
  for (const s of ['4 + 19', '20 + 5 - 1 - 1', '(2 + 3) * 4', '2 + 3 * 4']) {
    assert.equal(serialize(parse(s)), s);
  }
});

test('parse then structural equality holds regardless of ids', () => {
  const a = parse('4 + 19');
  const b = parse('4 + 19');
  assert.ok(structurallyEqual(a, b));
});

test('findNode locates parent and side', () => {
  const ast = parse('4 + 19');
  const rightId = ast.right.id;
  const found = findNode(ast, rightId);
  assert.equal(found.side, 'right');
  assert.equal(found.parent.id, ast.id);
});

test('replaceNode preserves value and swaps subtree', () => {
  const ast = parse('4 + 19');
  const next = replaceNode(ast, ast.left.id, num(5));
  assert.equal(serialize(next), '5 + 19');
});

test('collectIds yields unique ids per node', () => {
  const ast = parse('(2 + 3) * 4');
  const ids = collectIds(ast);
  assert.ok(ids.size >= 4);
});
