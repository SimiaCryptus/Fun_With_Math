import test from 'node:test';
import assert from 'node:assert/strict';
import {setLevel} from '../js/util/log.js';
import {
    DEFAULT_CONFIG, normalizeConfig, convexitySplit, SieveEngine, referenceRun,
} from '../js/sieve.js';
import {linfIndex, primdir, ringLength} from '../js/lattice.js';
import {verify, verifyBruteForce} from '../js/verify.js';
import {rng, randInt, gOf, collinearTriple, toArr} from './helpers.js';

setLevel('silent');

// ------------------------------------------------------------------ config
test('normalizeConfig fills defaults and never mutates the caller object', () => {
    const input = {rMax: 12};
    const c = normalizeConfig(input);
    assert.deepEqual(input, {rMax: 12});
    assert.equal(c.rMax, 12);
    assert.equal(c.ringMetric, DEFAULT_CONFIG.ringMetric);
    assert.equal(c.intraRingOrder, 'clockwise');
    assert.equal(c.markMode, 'outward_only');
    assert.equal(typeof c.version, 'string');
    assert.deepEqual(c.seedPoints, [[0, 0]]);
});

test('unimplemented switches fail loudly rather than falling back', () => {
    assert.throws(() => normalizeConfig({ringMetric: 'euclidean'}), /chebyshev/);
    assert.throws(() => normalizeConfig({intraRingOrder: 'spiral'}), /intra_ring_order/);
    assert.throws(() => normalizeConfig({markMode: 'full_line'}), /outward_only/);
    assert.throws(() => normalizeConfig(null), TypeError);
    assert.throws(() => normalizeConfig([]), TypeError);
    assert.throws(() => normalizeConfig({rMax: NaN}), TypeError);
    assert.throws(() => normalizeConfig({rMax: 1 << 20}), RangeError);
    assert.throws(() => normalizeConfig({band: 0}), RangeError);
    assert.throws(() => normalizeConfig({version: ''}), TypeError);
    assert.equal(normalizeConfig({rMax: -5}).rMax, 0);
    assert.equal(normalizeConfig({rMax: 7.9}).rMax, 7);
});

test('seed points are de-duplicated and sorted ring-major then lexicographically', () => {
    const c = normalizeConfig({seedPoints: [[1, 1], [0, 0], [0, 0], [1, -1], [0, 1]]});
    assert.deepEqual(c.seedPoints, [[0, 0], [0, 1], [1, -1], [1, 1]]);
    assert.throws(() => normalizeConfig({seedPoints: 'x'}), /must be an array/);
    assert.throws(() => normalizeConfig({seedPoints: [[1]]}), /\[x, y\]/);
    assert.throws(() => normalizeConfig({seedPoints: [[0.5, 0]]}), /lattice point/);
    assert.throws(() => normalizeConfig({seedPoints: [[1 << 21, 0]]}), /2\^21/);
});

// ------------------------------------------------------------ convexity split
test('convexitySplit returns the smallest integer minimiser of g', () => {
    const rand = rng(31);
    for (let i = 0; i < 200; i++) {
        const px = randInt(rand, -40, 40), py = randInt(rand, -40, 40);
        let vx = randInt(rand, -9, 9), vy = randInt(rand, -9, 9);
        if (vx === 0 && vy === 0) vx = 1;
        const [dx, dy] = primdir(vx, vy);
        const t = convexitySplit(px, py, dx, dy, 40);
        const g = (u) => gOf(px, py, dx, dy, u);
        let best = Infinity;
        for (let u = t - 300; u <= t + 300; u++) best = Math.min(best, g(u));
        assert.equal(g(t), best, `t*=${t} is not a minimiser for p=(${px},${py}) d=(${dx},${dy})`);
        assert.ok(g(t - 1) >= g(t), 'not the smallest minimiser');
        for (let u = t; u < t + 40; u++) assert.ok(g(u + 1) >= g(u), 'forward ray not monotone');
        for (let u = t; u > t - 40; u--) assert.ok(g(u - 1) >= g(u), 'backward ray not monotone');
    }
});

test('convexitySplit validates its ray', () => {
    assert.throws(() => convexitySplit(0, 0, 0, 0, 10), RangeError);
    assert.throws(() => convexitySplit(0.5, 0, 1, 0, 10), TypeError);
    assert.throws(() => convexitySplit(0, 0, 1, 0, -1), RangeError);
    assert.throws(() => convexitySplit(0, 0, 1, 0, 1.5), RangeError);
});

// -------------------------------------------------------------------- engine
test('R_max = 0 places exactly the origin seed', () => {
    const eng = new SieveEngine({rMax: 0});
    const rep = eng.stepRing();
    assert.equal(rep.r, 0);
    assert.equal(rep.cells, 1);
    assert.equal(rep.accepted, 1);
    assert.equal(rep.blocked, 1, 'the seed masks its own cell');
    assert.deepEqual(toArr(rep.added), [0, 0]);
    assert.equal(eng.stepRing(), null, 'the engine latches off after r_max');
    const snap = eng.snapshot();
    assert.deepEqual(toArr(snap.points), [0, 0]);
    assert.equal(snap.rGen, 0);
});

test('generated sets are certified valid and ring-major ordered', () => {
    const snap = new SieveEngine({rMax: 32}).run();
    assert.ok(snap.k > 8);
    const v = verify(snap.points);
    assert.equal(v.ok, true, JSON.stringify(v.triple || v));
    let prev = -1;
    for (let i = 0; i < snap.k; i++) {
        const R = linfIndex(snap.points[2 * i], snap.points[2 * i + 1]);
        assert.ok(R <= 32, 'point outside B_inf(r_max)');
        assert.ok(R >= prev, 'I3: ring index must be non-decreasing');
        prev = R;
    }
    assert.equal(snap.rGen, 32);
});

test('the calendar backend equals the exact-check reference engine (differential)', () => {
    for (const order of ['clockwise', 'nearest_first']) {
        const cfg = {rMax: 16, intraRingOrder: order, paranoid: true};
        const fast = new SieveEngine(cfg).run();
        const slow = referenceRun(cfg);
        assert.equal(fast.k, slow.k, `k differs for ${order}`);
        assert.deepEqual(toArr(fast.points), toArr(slow.points), `point stream differs for ${order}`);
    }
});

test('paranoid mode asserts I4 in both directions without firing', () => {
    assert.doesNotThrow(() => new SieveEngine({rMax: 24, paranoid: true}).run());
});

test('run(onRing) streams every ring exactly once, in order', () => {
    const seen = [];
    const snap = new SieveEngine({rMax: 10}).run((rep) => {
        seen.push(rep.r);
        assert.equal(rep.cells, ringLength(rep.r));
        assert.equal(rep.accepted, rep.added.length / 2);
        assert.ok(rep.accepted + rep.blocked <= rep.cells + rep.accepted);
    });
    assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(snap.rGen, 10);
    assert.throws(() => new SieveEngine({rMax: 1}).run(42), TypeError);
});

test('a ring report is self-consistent with the point store', () => {
    const eng = new SieveEngine({rMax: 6});
    let k = 0;
    eng.run((rep) => {
        k += rep.added.length / 2;
        assert.equal(rep.k, k);
        for (let i = 0; i < rep.added.length; i += 2) {
            assert.equal(linfIndex(rep.added[i], rep.added[i + 1]), rep.r, 'point not on its ring');
        }
        assert.ok(rep.liveEvents >= 0);
        assert.ok(rep.peakEvents >= rep.liveEvents);
        assert.ok(rep.eventBytes > 0);
    });
});

test('explicit seeds are placed, in order, and the result stays valid', () => {
    const cfg = {rMax: 8, seedPoints: [[0, 0], [0, 1], [1, 1], [1, 0]]};
    const snap = new SieveEngine(cfg).run();
    const set = new Set();
    for (let i = 0; i < snap.k; i++) set.add(`${snap.points[2 * i]},${snap.points[2 * i + 1]}`);
    for (const s of ['0,0', '0,1', '1,1', '1,0']) assert.ok(set.has(s), `seed ${s} missing`);
    assert.equal(verify(snap.points).ok, true);
    assert.equal(collinearTriple(snap.points), null, 'brute force disagrees with the engine');
});

test('an inadmissible seed is refused instead of quietly corrupting the set', () => {
    const eng = new SieveEngine({rMax: 4, seedPoints: [[0, 0], [1, 1], [2, 2]]});
    assert.throws(() => eng.run(), /collinear with two earlier points/);
    assert.equal(eng.done, true, 'the engine must latch off after an abort');
});

test('exactCheck / blockers name the pair that blocks a cell', () => {
    const eng = new SieveEngine({rMax: 2});
    eng._pushPoint(0, 0);
    eng._pushPoint(1, 1);
    assert.equal(eng.exactCheck(2, 2), false);
    assert.deepEqual(eng.blockers(2, 2), [0, 1]);
    assert.equal(eng.exactCheck(2, 1), true);
    assert.equal(eng.blockers(2, 1), null);
    assert.throws(() => eng._pushPoint(0, 0), /already occupied/);
    assert.throws(() => eng._pushPoint(0.5, 0), TypeError);
});

test('I2 bookkeeping: at most two points per row and per column', () => {
    const snap = new SieveEngine({rMax: 20}).run();
    const rows = new Map(), cols = new Map();
    for (let i = 0; i < snap.k; i++) {
        const x = snap.points[2 * i], y = snap.points[2 * i + 1];
        rows.set(y, (rows.get(y) || 0) + 1);
        cols.set(x, (cols.get(x) || 0) + 1);
    }
    for (const [y, n] of rows) assert.ok(n <= 2, `row ${y} holds ${n} points`);
    for (const [x, n] of cols) assert.ok(n <= 2, `col ${x} holds ${n} points`);
});

test('referenceRun on its own is a valid, brute-force-checked set', () => {
    const snap = referenceRun({rMax: 8});
    assert.equal(verify(snap.points).ok, true);
    assert.equal(verifyBruteForce(snap.points).ok, true);
});