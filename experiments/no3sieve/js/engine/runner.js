// runner.js — owns the engine, in a module Worker when the environment allows it
// (needs http(s) + module workers) and on the main thread in time-sliced chunks
// otherwise (e.g. file://). Both paths emit the identical ring stream.
import { SieveEngine } from '../sieve.js';
import { key2 } from '../lattice.js';
import { createLogger } from '../util/log.js';

const log = createLogger('runner');
const WORKER_HANDSHAKE_MS = 4000; // no 'started' by then ⇒ assume the worker is dead
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

export class PointStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.points = new Int32Array(2048);
    this.k = 0;
    this.rGen = -1;
    this.occ = new Map(); // key2(x,y) -> index (inspector / blocked-by)
    this.kOfRing = [];
    // I2 ledger: a line holding 2 points is DEAD for the rest of the run, at any
    // distance. These maps are what turn "mysterious 2-wide empty strips" into a
    // drawable, checkable fact (see renderer `_drawDead`).
    this.sat = { row: new Map(), col: new Map(), diag: new Map(), anti: new Map() };
  }

  _grow(need) {
    if (!Number.isInteger(need) || need < 0)
      throw new RangeError(`PointStore._grow: bad need ${need}`);
    if (need * 2 <= this.points.length) return;
    let cap = this.points.length;
    while (cap < need * 2) {
      cap *= 2;
      if (cap > 1 << 28) throw new RangeError(`PointStore: refusing to grow past ${cap} ints`);
    }
    const n = new Int32Array(cap);
    n.set(this.points.subarray(0, this.k * 2));
    this.points = n;
  }

  addRing(rep) {
    if (!rep || typeof rep !== 'object')
      throw new TypeError('PointStore.addRing: report must be an object');
    if (!Number.isInteger(rep.r) || rep.r < 0)
      throw new RangeError(`addRing: bad ring index ${rep.r}`);
    if (rep.r <= this.rGen)
      throw new Error(
        `addRing: ring ${rep.r} arrived after ${this.rGen} — the stream is out of order`
      );
    const add = rep.added;
    if (!add || typeof add.length !== 'number' || add.length % 2)
      throw new TypeError(`addRing: ring ${rep.r} carries a malformed \`added\` payload`);
    const m = add.length / 2;
    this._grow(this.k + m);
    for (let i = 0; i < m; i++) {
      const x = add[2 * i],
        y = add[2 * i + 1];
      const kk = key2(x, y); // range-checked; also rejects non-int32
      if (this.occ.has(kk))
        throw new Error(
          `addRing: duplicate point (${x},${y}) already stored at index ${this.occ.get(kk)}`
        );
      this.points[2 * (this.k + i)] = x;
      this.points[2 * (this.k + i) + 1] = y;
      this.occ.set(kk, this.k + i);
      bump(this.sat.row, y);
      bump(this.sat.col, x);
      bump(this.sat.diag, x - y);
      bump(this.sat.anti, x + y);
    }
    this.k += m;
    this.rGen = rep.r;
    this.kOfRing[rep.r] = this.k;
  }

  has(x, y) {
    if ((x | 0) !== x || (y | 0) !== y) return false;
    if (Math.abs(x) >= 1 << 21 || Math.abs(y) >= 1 << 21) return false;
    return this.occ.has(key2(x, y));
  }

  snapshot() {
    return {
      points: this.points.subarray(0, this.k * 2),
      k: this.k,
      rGen: this.rGen,
      sat: this.sat,
    };
  }
}

export class EngineRunner {
  constructor(store, on) {
    if (!store || typeof store.addRing !== 'function')
      throw new TypeError('EngineRunner: `store` must be a PointStore');
    on = on || {};
    for (const hook of ['ring', 'done', 'status']) {
      if (typeof on[hook] !== 'function') {
        log.warn(`EngineRunner: missing "${hook}" callback; substituting a no-op`);
        on[hook] = () => {};
      }
    }
    this.store = store;
    this.on = on; // { ring(rep), done(info), status(str) }
    this.worker = null;
    this.engine = null;
    this.mode = 'idle';
    this.running = false;
    this.stats = {
      marks: 0,
      liveEvents: 0,
      peakEvents: 0,
      eventBytes: 0,
      ms: 0,
      cells: 0,
      blocked: 0,
      accepted: 0,
      satRows: 0,
      satCols: 0,
    };
    this._t0 = 0;
    this._fellBack = false;
    this._handshake = null;
  }

  start(cfg) {
    this.stop();
    this.store.reset();
    this._t0 = performance.now();
    this.running = true;
    this._fellBack = false;
    try {
      this.worker = new Worker(new URL('./sieve.worker.js', import.meta.url), { type: 'module' });
      this.worker.onerror = (e) => {
        log.warn(
          `worker error (${e && e.message ? e.message : 'unknown'}) — falling back to the main thread`
        );
        this._fallback(cfg);
      };
      this.worker.onmessageerror = (e) => {
        log.error('worker sent an unstructured-clonable message; falling back', e);
        this._fallback(cfg);
      };
      this.worker.onmessage = (e) => {
        try {
          this._onMsg(e.data, cfg);
        } catch (err) {
          log.error('worker message handling failed:', err);
          this._fallback(cfg);
        }
      };
      this.worker.postMessage({ type: 'start', cfg });
      // If the worker never answers (CSP, MIME, module support), don't hang forever.
      this._handshake = setTimeout(() => {
        if (this.mode === 'worker' && this.store.rGen < 0) {
          log.warn(`worker did not respond within ${WORKER_HANDSHAKE_MS} ms; falling back`);
          this._fallback(cfg);
        }
      }, WORKER_HANDSHAKE_MS);
      this.mode = 'worker';
      this.on.status(`running (worker)`);
    } catch (err) {
      log.warn('worker construction failed:', err);
      this._fallback(cfg);
    }
  }

  _fallback(cfg) {
    // A worker that dies *mid-run* used to leave its partial rings in the store
    // and then replay from R=0 on the main thread: duplicated points, a
    // rewound rGen, and a picture that is not any run's output. Restart clean.
    if (this._fellBack) return;
    this._fellBack = true;
    if (this._handshake) {
      clearTimeout(this._handshake);
      this._handshake = null;
    }
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (_) {}
      this.worker = null;
    }
    this.store.reset();
    this._t0 = performance.now();
    this.running = true;
    this.mode = 'main';
    try {
      this.engine = new SieveEngine(cfg);
    } catch (e) {
      this.running = false;
      this.engine = null;
      log.error('engine construction failed:', e);
      this.on.status(`config error: ${e && e.message ? e.message : e}`);
      return;
    }
    this.on.status('running (main thread — worker unavailable)');
    const tick = () => {
      if (!this.running || !this.engine) return;
      const t0 = performance.now();
      let rep;
      try {
        while (performance.now() - t0 < 8 && (rep = this.engine.stepRing())) this._ring(rep);
      } catch (e) {
        this.running = false;
        log.error(`main-thread run aborted at R=${this.store.rGen + 1}:`, e);
        this.on.status(`ABORTED at R=${this.store.rGen}: ${e && e.message ? e.message : e}`);
        return;
      }
      if (this.engine.done) {
        this._done();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _onMsg(m, cfg) {
    if (!m || typeof m.type !== 'string') {
      log.warn('worker sent a message with no type:', m);
      return;
    }
    switch (m.type) {
      case 'started':
        if (this._handshake) {
          clearTimeout(this._handshake);
          this._handshake = null;
        }
        log.debug('worker handshake ok');
        break;
      case 'rings':
        if (!Array.isArray(m.batch)) {
          log.error('worker "rings" without a batch array');
          return;
        }
        for (const rep of m.batch) this._ring(rep);
        break;
      case 'done':
        this._done();
        break;
      case 'stopped':
        log.debug(`worker stopped at k=${m.k}`);
        break;
      case 'error':
        this.running = false;
        log.error(`worker engine error: ${m.message}\n${m.stack || ''}`);
        this.on.status(`ABORTED at R=${this.store.rGen}: ${m.message}`);
        break;
      default:
        log.warn(`unknown worker message type "${m.type}"`);
    }
  }

  _ring(rep) {
    if (!rep || typeof rep !== 'object') {
      log.error('ignoring malformed ring report', rep);
      return;
    }
    this.store.addRing(rep);
    this.stats.marks = rep.marks;
    this.stats.liveEvents = rep.liveEvents;
    this.stats.peakEvents = rep.peakEvents;
    this.stats.eventBytes = rep.eventBytes;
    this.stats.cells = rep.cells | 0;
    this.stats.blocked = rep.blocked | 0;
    this.stats.accepted = rep.accepted | 0;
    this.stats.satRows = rep.satRows | 0;
    this.stats.satCols = rep.satCols | 0;
    this.stats.ms = performance.now() - this._t0;
    this.on.ring(rep);
  }

  _done() {
    this.running = false;
    this.stats.ms = performance.now() - this._t0;
    this.on.done({ k: this.store.k, rGen: this.store.rGen, ms: this.stats.ms });
    this.on.status(`done · ${this.store.k} points · ${(this.stats.ms / 1000).toFixed(2)} s`);
  }

  stop() {
    this.running = false;
    if (this._handshake) {
      clearTimeout(this._handshake);
      this._handshake = null;
    }
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'stop' });
      } catch (e) {
        log.warn('could not post stop to the worker; terminating', e);
        try {
          this.worker.terminate();
        } catch (_) {}
        this.worker = null;
      }
    }
    this.engine = null;
  }
}
