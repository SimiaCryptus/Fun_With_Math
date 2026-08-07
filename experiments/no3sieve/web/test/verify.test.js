import test from 'node:test';
import assert from 'node:assert/strict';
import {setLevel} from '../js/util/log.js';
import {verify, verifyBruteForce} from '../js/verify.js';
import {collinearTriple, rng, randInt} from './helpers.js';

setLevel('silent');

test('a valid set certifies, with method and rMax reported', () => {
    const pts = Int32Array.from([0, 0, 1, 0, 0, 1, 2, 3]);
    const v = verify(pts);
    assert.equal(v.ok, true);
    assert.equal(v.k, 4);
    assert.equal(v.rMax, 3);
    assert.match(v.method, /primdir-hash/);
    assert.ok(typeof v.ms === 'number');
    assert.equal(verify(new Int32Array(0)).ok, true, 'the empty set is vacuously valid');
});

test('a collinear triple is reported explicitly, not just as false', () => {
    const v = verify(Int32Array.from([0, 0, 1, 1, 2, 2]));
    assert.equal(v.ok, false);
    assert.equal(v.method, 'primdir-hash');
    assert.ok(Array.isArray(v.triple) && v.triple.length === 3);
    const flat = v.triple.flat();
    assert.deepEqual(flat.sort((a, b) => a - b), [0, 0, 1, 1, 2, 2]);
});

test('duplicates fail as duplicates instead of crashing primdir(0,0)', () => {
    const v = verify(Int32Array.from([0, 0, 3, 3, 0, 0]));
    assert.equal(v.ok, false);
    assert.equal(v.method, 'duplicate');
    assert.deepEqual(v.duplicate[0], [0, 0]);
});

test('non-lattice input is rejected as input, not silently truncated', () => {
    const v = verify([0, 0, 1.5, 2]);
    assert.equal(v.ok, false);
    assert.equal(v.method, 'input');
    assert.match(v.reason, /not an int32/);
    assert.throws(() => verify(Int32Array.from([0, 0, 1])), RangeError);
    assert.throws(() => verify(null), TypeError);
});

test('brute force skips above maxK and agrees below it', () => {
    const pts = Int32Array.from([0, 0, 1, 0, 0, 1]);
    assert.equal(verifyBruteForce(pts).ok, true);
    const skipped = verifyBruteForce(pts, 1);
    assert.equal(skipped.skipped, true);
    assert.match(skipped.reason, /k > 1/);
    const bad = verifyBruteForce(Int32Array.from([0, 0, 2, 2, 4, 4]));
    assert.equal(bad.ok, false);
    assert.equal(bad.method, 'cross-product');
    assert.throws(() => verifyBruteForce(pts, -1), RangeError);
});

test('verify and the C(k,3) oracle agree on random sets (both verdicts)', () => {
    const rand = rng(21);
    let sawBad = false, sawGood = false;
    for (let trial = 0; trial < 60; trial++) {
        const k = randInt(rand, 3, 9);
        const pts = new Int32Array(2 * k);
        const used = new Set();
        for (let i = 0; i < k; i++) {
            let x, y, kk;
            do {
                x = randInt(rand, -4, 4);
                y = randInt(rand, -4, 4);
                kk = `${x},${y}`;
            } while (used.has(kk));
            used.add(kk);
            pts[2 * i] = x;
            pts[2 * i + 1] = y;
        }
        const oracle = collinearTriple(pts) === null;
        const got = verify(pts).ok;
        assert.equal(got, oracle, `disagreement on ${Array.from(pts)}`);
        assert.equal(verifyBruteForce(pts).ok, oracle);
        sawBad ||= !oracle;
        sawGood ||= oracle;
    }
    assert.ok(sawBad && sawGood, 'the fixture should exercise both verdicts');
});