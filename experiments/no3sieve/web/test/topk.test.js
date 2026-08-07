import test from 'node:test';
import assert from 'node:assert/strict';
import {setLevel} from '../js/util/log.js';
import {topWindows, windowPoints} from '../js/topk.js';

setLevel('silent');

test('topWindows finds the densest window and reports world coordinates', () => {
    const pts = Int32Array.from([0, 0, 0, 1, 1, 0, 5, 5]);
    const out = topWindows(pts, 5, 2, 8);
    assert.ok(out.length >= 1);
    assert.equal(out[0].pop, 3);
    assert.equal(out[0].s, 2);
    assert.equal(out[0].c, 1.5);
    assert.equal(out[0].x0, 0);
    assert.equal(out[0].y0, 0);
    for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].pop >= out[i].pop, 'not sorted');
});

test('topWindows suppresses near-duplicates (>50% overlap) and honours keep', () => {
    const pts = Int32Array.from([0, 0, 0, 1, 1, 0, 20, 20, 20, 21, 21, 20]);
    const out = topWindows(pts, 25, 4, 3);
    assert.ok(out.length <= 3);
    for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
            const ox = Math.min(out[i].x0 + 4, out[j].x0 + 4) - Math.max(out[i].x0, out[j].x0);
            const oy = Math.min(out[i].y0 + 4, out[j].y0 + 4) - Math.max(out[i].y0, out[j].y0);
            const frac = ox > 0 && oy > 0 ? (ox * oy) / 16 : 0;
            assert.ok(frac <= 0.5, `windows ${i} and ${j} overlap ${frac}`);
        }
    }
});

test('a window larger than the generated box yields nothing (and says so)', () => {
    assert.deepEqual(topWindows(Int32Array.from([0, 0]), 2, 99, 4), []);
});

test('topWindows validates its arguments', () => {
    const pts = Int32Array.from([0, 0]);
    assert.throws(() => topWindows(Int32Array.from([0, 0, 1]), 2, 2, 1), TypeError);
    assert.throws(() => topWindows(pts, -1, 2, 1), RangeError);
    assert.throws(() => topWindows(pts, 2, 0, 1), RangeError);
    assert.throws(() => topWindows(pts, 2, 2, 0), RangeError);
});

test('windowPoints translates into [0,s)^2 and drops everything else', () => {
    const pts = Int32Array.from([0, 0, 3, 4, -1, -1, 10, 10]);
    const w = windowPoints(pts, -1, -1, 6);
    assert.deepEqual(Array.from(w), [1, 1, 4, 5, 0, 0]);
    assert.ok(w instanceof Int32Array);
    assert.throws(() => windowPoints(pts, 0.5, 0, 4), TypeError);
    assert.throws(() => windowPoints(pts, 0, 0, 0), RangeError);
    assert.throws(() => windowPoints(Int32Array.from([1]), 0, 0, 4), TypeError);
});