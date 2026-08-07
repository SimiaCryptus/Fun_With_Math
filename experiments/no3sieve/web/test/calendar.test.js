import test from 'node:test';
import assert from 'node:assert/strict';
import {setLevel} from '../js/util/log.js';
import {EventPool, Calendar} from '../js/calendar.js';

setLevel('silent');   // the calendar warns about tiny bands; keep the run quiet

test('EventPool round-trips every field of an event', () => {
    const p = new EventPool(4);
    const i = p.alloc(1, -2, 3, -4, 5, -1);
    assert.equal(i, 0);
    assert.equal(p.px(i), 1);
    assert.equal(p.py(i), -2);
    assert.equal(p.dx(i), 3);
    assert.equal(p.dy(i), -4);
    assert.equal(p.t(i), 5);
    assert.equal(p.s(i), -1);
    p.setT(i, 77);
    assert.equal(p.t(i), 77);
    assert.equal(p.live, 1);
    assert.equal(p.peak, 1);
    assert.ok(p.bytes() > 0);
});

test('EventPool refuses values Int32Array would silently truncate', () => {
    const p = new EventPool(2);
    assert.throws(() => p.alloc(1.5, 0, 1, 0, 0, 1), TypeError);
    assert.throws(() => p.alloc(0, 0, 1, 0, 2 ** 40, 1), TypeError);
    assert.throws(() => p.alloc(0, 0, 1, 0, 0, 0), RangeError);      // step must be ±1
    assert.throws(() => p.alloc(0, 0, 0, 0, 0, 1), RangeError);      // zero direction
    assert.throws(() => p.setT(0, 0.5), TypeError);
    assert.throws(() => new EventPool(0), RangeError);
    assert.throws(() => new EventPool(2.5), RangeError);
    assert.throws(() => new EventPool(1 << 25), RangeError);
});

test('EventPool grows without losing data', () => {
    const p = new EventPool(1);
    const ids = [];
    for (let n = 0; n < 5; n++) ids.push(p.alloc(n, -n, 1, 0, n, 1));
    assert.deepEqual(ids, [0, 1, 2, 3, 4]);
    assert.ok(p.cap >= 5);
    for (const i of ids) {
        assert.equal(p.px(i), i);
         assert.equal(p.py(i), -i || 0);   // Int32Array normalises -0 to 0
        assert.equal(p.t(i), i);
    }
    assert.equal(p.live, 5);
    assert.equal(p.stats().allocs, 5);
});

test('release recycles slots and double free / stale ids are fatal', () => {
    const p = new EventPool(4);
    const a = p.alloc(1, 1, 1, 0, 0, 1);
    const b = p.alloc(2, 2, 0, 1, 0, 1);
    p.release(a);
    assert.equal(p.live, 1);
    assert.equal(p.alloc(9, 9, 1, 1, 0, 1), a, 'free list should hand back the freed slot');
    assert.throws(() => p.release(b + 99), RangeError);
    assert.throws(() => p.release(-1), RangeError);
    p.release(b);
    assert.throws(() => p.release(b), /double free/);
    const st = p.stats();
    assert.equal(st.allocs, 3);
    assert.equal(st.releases, 2);
    assert.equal(st.live, 1);
});

test('accessor bounds checks switch on at #log=debug', () => {
    setLevel('debug');
    try {
        const p = new EventPool(2);
        p.alloc(0, 0, 1, 0, 0, 1);
        assert.equal(p.checked, true);
        assert.throws(() => p.px(5), RangeError);
    } finally {
        setLevel('silent');
    }
});

test('Calendar validates its band', () => {
    assert.throws(() => new Calendar(0), RangeError);
    assert.throws(() => new Calendar(1.5), RangeError);
    assert.throws(() => new Calendar(1 << 21), RangeError);
    assert.equal(new Calendar(8).B, 8);
});

test('Calendar delivers in-band events in FIFO order per ring', () => {
    const cal = new Calendar(8);
    cal.push(0, 10);
    cal.push(0, 11);
    cal.push(3, 30);
    cal.beginRing(0);
    assert.equal(cal.takeNext(), 10);
    assert.equal(cal.takeNext(), 11);
    assert.equal(cal.takeNext(), -1);
    cal.beginRing(3);
    assert.equal(cal.takeNext(), 30);
    assert.equal(cal.takeNext(), -1);
    assert.equal(cal.stats().scheduled, 3);
});

test('events re-pushed into the ring being drained come back later (flat-face case)', () => {
    const cal = new Calendar(8);
    cal.push(2, 1);
    cal.beginRing(2);
    assert.equal(cal.takeNext(), 1);
    cal.push(2, 2);            // §3.7(2): same ring, still legal
    assert.equal(cal.takeNext(), 2);
    assert.equal(cal.takeNext(), -1);
});

test('far events spill to the overflow heap and migrate back in ring order', () => {
    const cal = new Calendar(8);
    cal.push(100, 7);
    cal.push(40, 6);
    cal.push(1, 5);
    let st = cal.stats();
    assert.equal(st.spilled, 2);
    assert.equal(st.heap, 2);
    cal.beginRing(1);
    assert.equal(cal.takeNext(), 5);
    assert.equal(cal.takeNext(), -1);
    cal.beginRing(40);
    assert.equal(cal.takeNext(), 6);
    assert.equal(cal.takeNext(), -1);
    cal.beginRing(100);
    assert.equal(cal.takeNext(), 7);
    assert.equal(cal.takeNext(), -1);
    st = cal.stats();
    assert.equal(st.heap, 0);
    assert.equal(st.base, 100);
});

test('the overflow heap really is a min-heap (randomised)', () => {
    const cal = new Calendar(8);
    const rings = [];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 300; i++) {
        const r = 20 + Math.floor(rnd() * 400);
        rings.push(r);
        cal.push(r, i);
    }
    rings.sort((a, b) => a - b);
    let seen = 0;
    for (let r = 0; r <= 500; r++) {
        cal.beginRing(r);
        while (cal.takeNext() >= 0) {
            assert.equal(rings[seen], r, `event delivered out of ring order at ${seen}`);
            seen++;
        }
    }
    assert.equal(seen, rings.length);
});

test('the calendar refuses to schedule into the past or skip an undrained bucket', () => {
    const cal = new Calendar(8);
    cal.beginRing(5);
    assert.throws(() => cal.push(4, 1), /into the past/);
    assert.throws(() => cal.beginRing(4), /backwards/);
    assert.throws(() => cal.push(5.5, 1), TypeError);
    assert.throws(() => cal.push(5, -1), TypeError);

    const c2 = new Calendar(8);
    c2.push(0, 1);
    assert.throws(() => c2.beginRing(1), /not drained/);

    const c3 = new Calendar(8);
    assert.throws(() => c3.takeNext(), /beginRing\(\) has not been called/);
});