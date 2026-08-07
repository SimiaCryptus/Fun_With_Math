import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LEVELS, setLevel, getLevel, createLogger, history, clearHistory,
    check, invariant, isInt32, requireInt32, requireFinite, requireNonNegInt, requireEvenLenPairs,
} from '../js/util/log.js';

test('setLevel accepts known names only', () => {
    const before = getLevel();
    assert.equal(setLevel('debug'), LEVELS.debug);
    assert.equal(getLevel(), LEVELS.debug);
    assert.throws(() => setLevel('loud'), RangeError);
    setLevel('silent');
    assert.equal(getLevel(), LEVELS.silent);
    assert.ok(before >= 0);
});

test('history records every record regardless of level, and is bounded', () => {
    setLevel('silent');
    clearHistory();
    const log = createLogger('t');
    log.error('boom');
    log.trace('quiet');
    const h = history();
    assert.equal(h.length, 2, 'silent must still record for bug reports');
    assert.equal(h[0].lvl, 'error');
    assert.equal(h[0].ns, 't');
    assert.match(h[0].msg, /boom/);
    for (let i = 0; i < 600; i++) log.info(`line ${i}`);
    assert.ok(history().length <= 512, 'the ring buffer must be capped');
});

test('once() fires a single time per key and namespace', () => {
    setLevel('silent');
    clearHistory();
    const a = createLogger('a'), b = createLogger('b');
    for (let i = 0; i < 5; i++) a.once('k', 'warn', 'flood');
    b.once('k', 'warn', 'other namespace');
    assert.equal(history().length, 2);
    clearHistory();
    a.once('k', 'warn', 'again after clearHistory');
    assert.equal(history().length, 1);
});

test('enabled() reflects the active level; child() namespaces', () => {
    setLevel('warn');
    const log = createLogger('ns');
    assert.equal(log.enabled('error'), true);
    assert.equal(log.enabled('warn'), true);
    assert.equal(log.enabled('debug'), false);
    assert.equal(log.enabled('bogus'), true, 'unknown names degrade to "always"');
    assert.equal(log.child('sub').ns, 'ns:sub');
    assert.equal(createLogger('').ns, 'app');
    setLevel('silent');
});

test('check warns and returns; invariant throws', () => {
    setLevel('silent');
    clearHistory();
    assert.equal(check(true, 'fine'), true);
    assert.equal(check(0, 'nope', {a: 1}), false);
    assert.equal(history().length, 1);
    assert.doesNotThrow(() => invariant(true, 'ok'));
    assert.throws(() => invariant(false, 'broken', {x: 1}), /invariant: broken/);
});

test('require* guards', () => {
    assert.equal(isInt32(5), true);
    assert.equal(isInt32(5.5), false);
    assert.equal(isInt32('5'), false);
    assert.equal(requireInt32(-3, 'v'), -3);
    assert.throws(() => requireInt32(1.5, 'v'), TypeError);
    assert.equal(requireFinite(1.5, 'v'), 1.5);
    assert.throws(() => requireFinite(NaN, 'v'), TypeError);
    assert.equal(requireNonNegInt(0, 'v'), 0);
    assert.throws(() => requireNonNegInt(-1, 'v'), RangeError);
    assert.throws(() => requireEvenLenPairs([1, 2, 3], 'p'), RangeError);
    assert.throws(() => requireEvenLenPairs(null, 'p'), TypeError);
});