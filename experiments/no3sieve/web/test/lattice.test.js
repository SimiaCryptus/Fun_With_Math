import test from 'node:test';
import assert from 'node:assert/strict';
import {
    gcd, primdir, linfIndex, ringLength, perimeterToCell, cellToPerimeter, key2, KEY_LIMIT,
} from '../js/lattice.js';
import {rng, randInt} from './helpers.js';

test('gcd is non-negative, total on int32, and rejects non-integers', () => {
    assert.equal(gcd(0, 0), 0);
    assert.equal(gcd(12, 18), 6);
    assert.equal(gcd(-12, 18), 6);
    assert.equal(gcd(-12, -18), 6);
    assert.equal(gcd(7, 0), 7);
    assert.equal(gcd(0, 7), 7);
    assert.throws(() => gcd(1.5, 2), TypeError);
    assert.throws(() => gcd('4', 2), TypeError);
});

test('primdir normalises sign (x>0, or x==0 && y>0) and is scale invariant', () => {
    assert.deepEqual(primdir(2, 4), [1, 2]);
    assert.deepEqual(primdir(-2, -4), [1, 2]);
    assert.deepEqual(primdir(0, -3), [0, 1]);
    assert.deepEqual(primdir(0, 3), [0, 1]);
    assert.deepEqual(primdir(-3, 3), [1, -1]);
    assert.deepEqual(primdir(5, 0), [1, 0]);
    assert.deepEqual(primdir(-5, 0), [1, 0]);
    assert.throws(() => primdir(0, 0), /undefined/);
    assert.throws(() => primdir(1.5, 0), TypeError);
});

test('primdir(v) === primdir(-v) === primdir(n·v) for random vectors', () => {
    const rand = rng(11);
    for (let i = 0; i < 500; i++) {
        let x = randInt(rand, -50, 50), y = randInt(rand, -50, 50);
        if (x === 0 && y === 0) x = 1;
        const n = randInt(rand, 1, 7);
        const d = primdir(x, y);
        assert.deepEqual(primdir(-x, -y), d);
        assert.deepEqual(primdir(x * n, y * n), d);
        assert.equal(gcd(d[0], d[1]), 1);
        assert.ok(d[0] > 0 || (d[0] === 0 && d[1] > 0));
    }
});

test('linfIndex is the Chebyshev norm', () => {
    assert.equal(linfIndex(0, 0), 0);
    assert.equal(linfIndex(-7, 3), 7);
    assert.equal(linfIndex(3, -7), 7);
    assert.throws(() => linfIndex(0.5, 0), TypeError);
});

test('ringLength: |S_inf(R)| = 8R, and 1 at the origin', () => {
    assert.equal(ringLength(0), 1);
    assert.equal(ringLength(1), 8);
    assert.equal(ringLength(37), 8 * 37);
    assert.throws(() => ringLength(-1), RangeError);
    assert.throws(() => ringLength(1.5), RangeError);
});

test('perimeter indexing is a bijection onto S_inf(R) for R <= 40 (corners once)', () => {
    for (let R = 0; R <= 40; R++) {
        const n = ringLength(R);
        const seen = new Set();
        const c = [0, 0];
        for (let i = 0; i < n; i++) {
            perimeterToCell(R, i, c);
            assert.equal(linfIndex(c[0], c[1]), R, `i=${i} R=${R} left the ring`);
            const kk = key2(c[0], c[1]);
            assert.ok(!seen.has(kk), `duplicate cell (${c[0]},${c[1]}) at i=${i}, R=${R}`);
            seen.add(kk);
            assert.equal(cellToPerimeter(R, c[0], c[1]), i, `round trip failed at i=${i}, R=${R}`);
        }
        assert.equal(seen.size, n);
        if (R > 0) {
            // all four corners are reachable, exactly once each
            for (const [x, y] of [[R, R], [R, -R], [-R, -R], [-R, R]]) {
                assert.ok(seen.has(key2(x, y)), `corner (${x},${y}) missing on ring ${R}`);
            }
        }
    }
});

test('perimeter walk starts at (0,R) and moves clockwise', () => {
    const c = [0, 0];
    perimeterToCell(4, 0, c);
    assert.deepEqual(c, [0, 4]);
    perimeterToCell(4, 4, c);
    assert.deepEqual(c, [4, 4]);
    perimeterToCell(4, 12, c);
    assert.deepEqual(c, [4, -4]);
    perimeterToCell(4, 20, c);
    assert.deepEqual(c, [-4, -4]);
    perimeterToCell(4, 28, c);
    assert.deepEqual(c, [-4, 4]);
    perimeterToCell(0, 0, c);
    assert.deepEqual(c, [0, 0]);
});

test('perimeterToCell / cellToPerimeter reject nonsense loudly', () => {
    assert.throws(() => perimeterToCell(3, 24), RangeError);   // == ringLength
    assert.throws(() => perimeterToCell(3, -1), RangeError);
    assert.throws(() => perimeterToCell(-1, 0), RangeError);
    assert.throws(() => perimeterToCell(3, 0, [0]), TypeError);
    assert.throws(() => cellToPerimeter(3, 1, 1), /not on S_inf/);
    assert.throws(() => cellToPerimeter(3, 0.5, 3), TypeError);
});

test('key2 is injective on the documented range and refuses to collide outside it', () => {
    const seen = new Map();
    for (let x = -40; x <= 40; x++) {
        for (let y = -40; y <= 40; y++) {
            const kk = key2(x, y);
            assert.ok(!seen.has(kk), `key collision for (${x},${y}) and ${seen.get(kk)}`);
            seen.set(kk, `${x},${y}`);
            assert.ok(Number.isSafeInteger(kk));
        }
    }
    assert.equal(KEY_LIMIT, 1 << 21);
    assert.throws(() => key2(KEY_LIMIT, 0), RangeError);
    assert.throws(() => key2(0, -KEY_LIMIT), RangeError);
});