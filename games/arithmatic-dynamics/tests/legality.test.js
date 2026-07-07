import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../src/core/serialize.js';
import {legalVerbs} from '../src/core/legality.js';

test('split is legal on a number', () => {
    const ast = parse('4 + 19');
    assert.deepEqual(legalVerbs(ast, ast.left.id), ['split']);
});

test('commutative op offers swap + group', () => {
    const ast = parse('5 + 3');
    const verbs = legalVerbs(ast, ast.id);
    assert.ok(verbs.includes('swap'));
    assert.ok(verbs.includes('group'));
    assert.ok(verbs.includes('combine'));
});

test('subtraction op does not offer swap', () => {
    const ast = parse('5 - 3');
    const verbs = legalVerbs(ast, ast.id);
    assert.ok(!verbs.includes('swap'));
});

test('cancel offered on inverse pair', () => {
    const ast = parse('(7 + 3) - 3');
    assert.ok(legalVerbs(ast, ast.id).includes('cancel'));
});

test('allowed filter restricts surfaced verbs', () => {
    const ast = parse('5 + 3');
    const verbs = legalVerbs(ast, ast.id, ['combine']);
    assert.deepEqual(verbs, ['combine']);
});