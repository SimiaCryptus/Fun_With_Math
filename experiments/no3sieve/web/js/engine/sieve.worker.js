// sieve.worker.js — ES module worker: runs the calendar backend and streams rings.
// Semantics are identical to the main-thread path; this is an execution strategy
// only (§0.1.7, §4.5). Output must stay bit-identical.
//
// Failure policy: the worker never dies silently. Any throw — construction,
// stepRing, or postMessage — is reported to the host as {type:'error'} so the
// runner can surface it instead of showing a frozen, half-generated picture.
import {SieveEngine} from '../sieve.js';
import {createLogger} from '../util/log.js';

const log = createLogger('worker');
let engine = null;
let running = false;

function fail(where, err) {
    running = false;
    const message = err && err.message ? err.message : String(err);
    log.error(`${where}: ${message}`);
    try {
        self.postMessage({type: 'error', where, message, stack: err && err.stack ? String(err.stack) : null});
    } catch (_) { /* the host is gone; nothing left to do */
    }
}

function pump() {
    if (!running || !engine) return;
    const t0 = performance.now();
    const batch = [];
    let rep;
    try {
        while (performance.now() - t0 < 12 && (rep = engine.stepRing())) {
            batch.push(rep);
            if (batch.length > 256) break;
        }
    } catch (e) {
        // Emit whatever completed cleanly before the failure, then report.
        if (batch.length) {
            try {
                self.postMessage({type: 'rings', batch}, batch.map((b) => b.added.buffer));
            } catch (_) {
            }
        }
        fail(`stepRing at R=${engine ? engine.r : '?'}`, e);
        return;
    }
    if (batch.length) {
        try {
            const transfer = batch.map((b) => b.added.buffer);
            self.postMessage({type: 'rings', batch}, transfer);
        } catch (e) {
            fail('postMessage(rings)', e);
            return;
        }
    }
    if (engine.done) {
        running = false;
        self.postMessage({type: 'done', k: engine.pointCount, rGen: engine.r - 1});
        return;
    }
    setTimeout(pump, 0);
}

self.onmessage = (e) => {
    const m = e && e.data;
    if (!m || typeof m.type !== 'string') {
        log.warn('ignoring message without a type', m);
        return;
    }
    if (m.type === 'start') {
        try {
            engine = new SieveEngine(m.cfg);
        } catch (err) {
            engine = null;
            fail('engine construction (bad config?)', err);
            return;
        }
        running = true;
        self.postMessage({type: 'started'});
        pump();
    } else if (m.type === 'stop') {
        running = false;
        self.postMessage({type: 'stopped', k: engine ? engine.pointCount : 0});
    } else {
        log.warn(`unknown message type "${m.type}"`);
    }
};

self.onerror = (err) => {
    fail('uncaught worker error', err);
};
self.onunhandledrejection = (ev) => {
    fail('unhandled rejection', ev && ev.reason);
};