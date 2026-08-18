// log.js — tiny leveled logger + assertion helpers shared by every module.
//
// Rationale (R-series): in a geometry kernel a *silent* failure is
// indistinguishable from a correct-but-surprising picture. Everything that can
// go wrong says so — once, with enough context to reproduce it — and everything
// that must not go wrong throws with a labelled message.
//
// Level selection (no build step): localStorage['no3sieve:log'] or `#log=debug`.

export const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
const NAMES = Object.keys(LEVELS);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function readLevel() {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem('no3sieve:log');
      if (v && has(LEVELS, v)) return LEVELS[v];
    }
  } catch (_) {
    /* localStorage throws in sandboxed/partitioned contexts */
  }
  try {
    if (typeof location !== 'undefined' && typeof location.hash === 'string') {
      const m = /(?:^|[#&])log=([a-z]+)/.exec(location.hash);
      if (m && has(LEVELS, m[1])) return LEVELS[m[1]];
    }
  } catch (_) {
    /* WorkerLocation may be restricted */
  }
  return LEVELS.warn;
}

let level = readLevel();
const RING = [];
const RING_CAP = 512;
const onceKeys = new Set();
const SINK = { 1: 'error', 2: 'warn', 3: 'info', 4: 'log', 5: 'debug' };

export function setLevel(name) {
  if (!has(LEVELS, name))
    throw new RangeError(`log: unknown level "${name}" (expected ${NAMES.join('|')})`);
  level = LEVELS[name];
  return level;
}

export function getLevel() {
  return level;
}

/** Recent records, oldest first — attachable to a bug report. */
export function history() {
  return RING.slice();
}

export function clearHistory() {
  RING.length = 0;
  onceKeys.clear();
}

function fmt(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

function emit(lvl, ns, args) {
  RING.push({ t: Date.now(), lvl: NAMES[lvl], ns, msg: args.map(fmt).join(' ') });
  if (RING.length > RING_CAP) RING.splice(0, RING.length - RING_CAP);
  if (lvl > level || typeof console === 'undefined') return;
  const fn = console[SINK[lvl]] || console.log;
  try {
    fn.call(console, `[${ns}]`, ...args);
  } catch (_) {
    /* never let logging throw */
  }
}

export function createLogger(ns) {
  if (typeof ns !== 'string' || !ns) ns = 'app';
  return {
    ns,
    error: (...a) => emit(1, ns, a),
    warn: (...a) => emit(2, ns, a),
    info: (...a) => emit(3, ns, a),
    debug: (...a) => emit(4, ns, a),
    trace: (...a) => emit(5, ns, a),
    /** Log a repeating condition exactly once per key (avoids log floods in loops). */
    once(key, lvlName, ...a) {
      const k = `${ns}|${key}`;
      if (onceKeys.has(k)) return;
      onceKeys.add(k);
      emit(has(LEVELS, lvlName) ? LEVELS[lvlName] : LEVELS.warn, ns, a);
    },
    child: (sub) => createLogger(`${ns}:${sub}`),
    enabled: (name) => (has(LEVELS, name) ? LEVELS[name] : 0) <= level,
  };
}

export const log = createLogger('no3sieve');

/** Non-fatal check: logs, never throws, returns the condition. */
export function check(cond, msg, ctx) {
  if (!cond) log.warn('check failed:', msg, ctx === undefined ? '' : fmt(ctx));
  return !!cond;
}

/** Fatal check for broken preconditions/invariants. */
export function invariant(cond, msg, ctx) {
  if (cond) return;
  const err = new Error(`invariant: ${msg}${ctx === undefined ? '' : ' ' + fmt(ctx)}`);
  log.error(err.message);
  throw err;
}

export const I32_MIN = -2147483648,
  I32_MAX = 2147483647;
export const isInt32 = (v) => typeof v === 'number' && (v | 0) === v;
export const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function requireInt32(v, name) {
  if (!isInt32(v)) throw new TypeError(`${name} must be an int32 integer (got ${fmt(v)})`);
  return v;
}

export function requireFinite(v, name) {
  if (!isFiniteNum(v)) throw new TypeError(`${name} must be a finite number (got ${fmt(v)})`);
  return v;
}

export function requireNonNegInt(v, name) {
  if (!Number.isInteger(v) || v < 0)
    throw new RangeError(`${name} must be a non-negative integer (got ${fmt(v)})`);
  return v;
}

export function requireEvenLenPairs(a, name) {
  if (!a || typeof a.length !== 'number')
    throw new TypeError(`${name} must be an array-like of coordinates`);
  if (a.length % 2 !== 0)
    throw new RangeError(`${name} has odd length ${a.length} (expected [x,y] pairs)`);
  return a;
}
