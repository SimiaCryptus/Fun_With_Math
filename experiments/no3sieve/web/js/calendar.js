// calendar.js — line-event calendar (§3.3): bucket queue over rings [base, base+B)
// plus an overflow min-heap for r >= base+B, and a slab event pool with a free list.
//
// An event is a *monotone ray*: (base p, direction d, next parameter t, step s=±1).
// Monotonicity (guaranteed by the convexity split in sieve.js) is what makes the
// bucket queue sound: no event is ever scheduled into the past.
//
// Defensive posture: every value that reaches the Int32 slab is range-checked
// (silent truncation here corrupts geometry with no visible symptom), every event
// id is bounds-checked, and double frees / stale handles are fatal.
import {createLogger, getLevel, LEVELS} from './util/log.js';

const log = createLogger('calendar');

const F = 6; // px, py, dx, dy, t, s
const MAX_EVENTS = 1 << 24;   // refuse *before* the allocator OOMs the tab
const MAX_BAND = 1 << 20;
const isI32 = (v) => typeof v === 'number' && (v | 0) === v;

export class EventPool {
    constructor(cap = 1 << 12) {
        if (!Number.isInteger(cap) || cap <= 0 || cap > MAX_EVENTS)
            throw new RangeError(`EventPool: cap must be an integer in [1, ${MAX_EVENTS}] (got ${cap})`);
        this.buf = new Int32Array(cap * F);
        this.alive = new Uint8Array(cap);      // slot liveness: catches double free / stale ids
        this.cap = cap;
        this.n = 0;
        this.free = [];
        this.live = 0;
        this.peak = 0;
        this.allocs = 0;
        this.releases = 0;
        // Accessor bounds checks are on the drain hot path; enable them with #log=debug.
        this.checked = getLevel() >= LEVELS.debug;
    }

    alloc(px, py, dx, dy, t, s) {
        if (!isI32(px) || !isI32(py) || !isI32(dx) || !isI32(dy) || !isI32(t))
            throw new TypeError(
                `EventPool.alloc: non-int32 field (p=${px},${py} d=${dx},${dy} t=${t}) — Int32Array would truncate silently`);
        if (s !== 1 && s !== -1) throw new RangeError(`EventPool.alloc: step must be ±1 (got ${s})`);
        if (dx === 0 && dy === 0) throw new RangeError('EventPool.alloc: zero direction defines no ray');
        let i;
        if (this.free.length) i = this.free.pop();
        else {
            if (this.n === this.cap) {
                if (this.cap * 2 > MAX_EVENTS)
                    throw new RangeError(
                        `EventPool: refusing to grow past ${MAX_EVENTS} events (live=${this.live}, peak=${this.peak})`);
                this.cap *= 2;
                const nb = new Int32Array(this.cap * F);
                nb.set(this.buf);
                this.buf = nb;
                const na = new Uint8Array(this.cap);
                na.set(this.alive);
                this.alive = na;
                log.debug(`slab grew to ${this.cap} events (${(this.buf.byteLength / 1048576).toFixed(1)} MB)`);
            }
            i = this.n++;
        }
        const o = i * F, b = this.buf;
        b[o] = px;
        b[o + 1] = py;
        b[o + 2] = dx;
        b[o + 3] = dy;
        b[o + 4] = t;
        b[o + 5] = s;
        this.alive[i] = 1;
        this.live++;
        this.allocs++;
        if (this.live > this.peak) this.peak = this.live;
        return i;
    }

    release(i) {
        this._check(i);
        if (!this.alive[i]) throw new Error(`EventPool.release: double free / stale event id ${i}`);
        this.alive[i] = 0;
        this.free.push(i);
        this.releases++;
        if (--this.live < 0) throw new Error('EventPool: live count went negative (accounting bug)');
    }

    _check(i) {
        if (!Number.isInteger(i) || i < 0 || i >= this.n)
            throw new RangeError(`EventPool: event id ${i} outside [0, ${this.n})`);
        return i;
    }

    _o(i) {
        return (this.checked ? this._check(i) : i) * F;
    }

    px(i) {
        return this.buf[this._o(i)];
    }

    py(i) {
        return this.buf[this._o(i) + 1];
    }

    dx(i) {
        return this.buf[this._o(i) + 2];
    }

    dy(i) {
        return this.buf[this._o(i) + 3];
    }

    t(i) {
        return this.buf[this._o(i) + 4];
    }

    s(i) {
        return this.buf[this._o(i) + 5];
    }

    setT(i, t) {
        if (!isI32(t)) throw new TypeError(`EventPool.setT: t must be int32 (got ${t})`);
        this.buf[this._o(i) + 4] = t;
    }

    bytes() {
        return this.buf.byteLength + this.alive.byteLength;
    }

    stats() {
        return {
            cap: this.cap, n: this.n, live: this.live, peak: this.peak,
            allocs: this.allocs, releases: this.releases, free: this.free.length
        };
    }
}

class MinHeap {
    constructor() {
        this.k = [];
        this.v = [];
    }

    get size() {
        return this.k.length;
    }

    push(key, val) {
        if (typeof key !== 'number' || !Number.isFinite(key))
            throw new TypeError(`MinHeap.push: key must be a finite number (got ${key})`);
        const k = this.k, v = this.v;
        k.push(key);
        v.push(val);
        let i = k.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (k[p] <= k[i]) break;
            [k[p], k[i]] = [k[i], k[p]];
            [v[p], v[i]] = [v[i], v[p]];
            i = p;
        }
    }

    peekKey() {
        if (!this.k.length) throw new Error('MinHeap.peekKey(): heap is empty');
        return this.k[0];
    }

    pop() {
        const k = this.k, v = this.v;
        if (!k.length) throw new Error('MinHeap.pop(): heap is empty');
        const top = v[0];
        const lk = k.pop(), lv = v.pop();
        if (k.length) {
            k[0] = lk;
            v[0] = lv;
            let i = 0;
            for (; ;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < k.length && k[l] < k[m]) m = l;
                if (r < k.length && k[r] < k[m]) m = r;
                if (m === i) break;
                [k[m], k[i]] = [k[i], k[m]];
                [v[m], v[i]] = [v[i], v[m]];
                i = m;
            }
        }
        return top;
    }
}

export class Calendar {
    constructor(band = 64) {
        if (!Number.isInteger(band) || band < 1 || band > MAX_BAND)
            throw new RangeError(`Calendar: band must be an integer in [1, ${MAX_BAND}] (got ${band})`);
        if (band < 8) log.warn(`Calendar: band=${band} is very small; most events will spill to the heap`);
        this.B = band;
        this.base = 0;
        this.buckets = Array.from({length: band}, () => []);
        this.cursor = 0;         // read pointer inside the current bucket
        this.cur = -1;           // ring currently being drained
        this.heap = new MinHeap();
        this.scheduled = 0;
        this.spilled = 0;        // how many events went to the overflow heap
        this.peakHeap = 0;
    }

    /** Schedule an event index for ring r. r must be >= the ring being drained. */
    push(r, ev) {
        if (!Number.isInteger(r)) throw new TypeError(`calendar.push: ring must be an integer (got ${r})`);
        if (!Number.isInteger(ev) || ev < 0) throw new TypeError(`calendar.push: bad event id ${ev}`);
        this.scheduled++;
        if (r < this.base) throw new Error(`calendar: event scheduled into the past (${r} < ${this.base})`);
        if (r < this.base + this.B) this.buckets[r % this.B].push(ev);
        else {
            this.heap.push(r, ev);
            this.spilled++;
            if (this.heap.size > this.peakHeap) {
                this.peakHeap = this.heap.size;
                if (this.peakHeap === 1 << 20)
                    log.warn(`calendar: overflow heap reached ${this.peakHeap} entries; consider a larger band (B=${this.B})`);
            }
        }
    }

    /** Move every heap entry that is now inside [base, base+B) into its bucket. */
    _migrate() {
        while (this.heap.size && this.heap.peekKey() < this.base + this.B) {
            const key = this.heap.peekKey();
            if (key < this.base) throw new Error(`calendar: heap entry ${key} is behind base ${this.base}`);
            this.buckets[key % this.B].push(this.heap.pop());
        }
    }

    /** Make ring r current: slide the band and migrate newly in-range heap entries. */
    beginRing(r) {
        if (!Number.isInteger(r) || r < 0)
            throw new TypeError(`calendar.beginRing: ring must be a non-negative integer (got ${r})`);
        if (r < this.base) throw new Error('calendar: beginRing went backwards');
        while (this.base < r) {
            const b = this.buckets[this.base % this.B];
            if (b.length) throw new Error(`calendar: bucket ${this.base} not drained (${b.length} event(s) left)`);
            this.base++;
            // Newly reachable ring at base+B-1 may have heap entries; migrate below.
            this._migrate();
        }
        this._migrate();
        this.cur = r;
        this.cursor = 0;
    }

    /**
     * Pop the next event of the current ring, or -1. Events re-pushed into the
     * *current* ring while draining (the flat-face / ContainedInSide case, §3.7(2))
     * are returned by a later call — the bucket is a growable queue on purpose.
     */
    takeNext() {
        if (this.cur < 0) throw new Error('calendar.takeNext(): beginRing() has not been called');
        if (this.cur !== this.base)
            throw new Error(`calendar: draining ring ${this.cur} but base is ${this.base}`);
        const b = this.buckets[this.cur % this.B];
        if (this.cursor < b.length) return b[this.cursor++];
        b.length = 0;
        this.cursor = 0;
        return -1;
    }

    stats() {
        return {
            base: this.base, band: this.B, heap: this.heap.size,
            peakHeap: this.peakHeap, spilled: this.spilled, scheduled: this.scheduled
        };
    }
}