import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game/session.js';
import { evaluateStars } from '../src/game/stars.js';
import { defineLevel, Stars } from '../src/game/level.js';
import { parse } from '../src/core/serialize.js';

test('session applies verbs and tracks metrics', () => {
  const level = defineLevel({ id: 't1', start: '25 - 2', allowedVerbs: ['combine'] });
  const s = new GameSession(level);
  s.apply('combine', s.expr.id);
  assert.equal(s.serialize(), '23');
  assert.equal(s.moveCount, 1);
  assert.ok(s.verbsUsed.has('combine'));
  assert.ok(s.isSolved());
});

test('session refuses disallowed verbs', () => {
  const level = defineLevel({ id: 't2', start: '5 + 3', allowedVerbs: ['combine'] });
  const s = new GameSession(level);
  assert.throws(() => s.apply('swap', s.expr.id), /not allowed/);
});

test('undo and redo restore state and metrics', () => {
  const level = defineLevel({ id: 't3', start: '25 - 2', allowedVerbs: ['combine'] });
  const s = new GameSession(level);
  s.apply('combine', s.expr.id);
  assert.equal(s.moveCount, 1);
  s.undo();
  assert.equal(s.serialize(), '25 - 2');
  assert.equal(s.moveCount, 0);
  s.redo();
  assert.equal(s.serialize(), '23');
  assert.equal(s.moveCount, 1);
});

test('reset returns to the start expression', () => {
  const level = defineLevel({ id: 't4', start: '5 + 3', allowedVerbs: ['combine'] });
  const s = new GameSession(level);
  s.apply('combine', s.expr.id);
  s.reset();
  assert.equal(s.serialize(), '5 + 3');
  assert.equal(s.moveCount, 0);
  assert.equal(s.verbsUsed.size, 0);
});

test('changed/solved events fire', () => {
  const level = defineLevel({ id: 't5', start: '25 - 2', allowedVerbs: ['combine'] });
  const s = new GameSession(level);
  let changed = 0,
    solved = 0;
  s.on('changed', () => changed++);
  s.on('solved', () => solved++);
  s.apply('combine', s.expr.id);
  assert.equal(changed, 1);
  assert.equal(solved, 1);
});

test('star evaluation reports earned stars', () => {
  const level = defineLevel({
    id: 't6',
    start: '25 - 2',
    allowedVerbs: ['combine'],
    stars: [Stars.solve(), Stars.fewMoves(1), Stars.onlyVerbs(['combine'])],
  });
  const s = new GameSession(level);
  s.apply('combine', s.expr.id);
  const { earned } = evaluateStars(s, level);
  assert.deepEqual(earned.sort(), ['few-moves', 'only-verbs', 'solve']);
});

test('worked example: 4 + 19 solvable via split/combine', () => {
  const level = defineLevel({ id: 't7', start: '4 + 19' });
  const s = new GameSession(level);
  s.apply('split', s.expr.right.id, { into: '20 - 1' });
  // now: 4 + (20 - 1); combine inner group op
  const innerOp = s.expr.right.child;
  s.apply('combine', innerOp.id);
  // now: 4 + 19  -> ungroup happened implicitly? No: group holds a num.
  assert.equal(s.serialize(), '4 + (19)');
});
