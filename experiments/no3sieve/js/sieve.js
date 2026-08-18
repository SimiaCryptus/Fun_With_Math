// sieve.js — the §3.5 placement loop with the calendar backend.
//
// Invariants asserted here (debug/paranoid): I1 (no 3 collinear), I3 (nondecreasing
// L∞ ring index), I4 (a candidate is skipped iff genuinely blocked), I5 (segment
// closure: the {(c1,c2)} family of §3.7 is closed *in order* before advancing).
//
// HORIZON (theory.md §2A). `horizonW = W` bounds the constraint: only collinear
// triples of L∞ span <= W are forbidden. W = 0 means W = ∞ (the classical object),
// and *that* is why the origin 2x2 cluster empties four 2-wide strips out to
// infinity — collinearity has no distance cutoff, so a line holding two points is
// dead at every distance (L2.1/L2.3). Bounding it is a config choice, not a bug
// fix: at finite W the strips refill beyond W, the set has positive density, and
// P_W still equals P_∞ *exactly* inside B(floor(W/2)) (T2A.7).

import {
  primdir,
  linfIndex,
  ringLength,
  perimeterToCell,
  cellToPerimeter,
  key2,
} from './lattice.js';
import { ringOrder } from './order.js';
import { Calendar, EventPool, T_INF } from './calendar.js';
import { createLogger } from './util/log.js';

const log = createLogger('sieve');
const MAX_RMAX = 1 << 14; // 16384: |B| ≈ 1.1e9 cells, already absurd
const isI32 = (v) => typeof v === 'number' && (v | 0) === v;

export const DEFAULT_CONFIG = {
  rMax: 256,
  // Constraint radius (theory.md §2A). 0 = ∞ = classical no-three-in-line.
  // Any finite W >= 2 forbids only triples with L∞ span <= W, i.e. enforces
  // validity in every (W+1)x(W+1) window (L2A.2) and nothing beyond it.
  horizonW: 0,
  // ringMetric selects the SHELL metric only: 'chebyshev' = L∞ = max(|x|,|y|),
  // so ring R is the square boundary [-R,R]^2. Normative (§2.2). A Euclidean
  // shell is out of scope for v1: the calendar needs an integral ring key with
  // a clean perimeter bijection, and `outward_only` needs g(t) = ||p+td||_∞ to
  // be a piecewise-linear convex max of four affine pieces (see convexitySplit).
  ringMetric: 'chebyshev',
  // intraRingOrder selects the metric used to order cells WITHIN a shell:
  // 'nearest_first' sorts by Euclidean radius; 'clockwise' by perimeter index.
  intraRingOrder: 'clockwise', // clockwise | nearest_first
  markMode: 'outward_only', // outward_only | full_line (debug)
  seedPoints: [[0, 0]],
  band: 64,
  paranoid: false,
  version: 'no3sieve-web/0.1.0',
};

export function normalizeConfig(cfg = {}) {
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg))
    throw new TypeError('config must be a plain object');
  const c = { ...DEFAULT_CONFIG, ...cfg };
  const unknown = Object.keys(cfg).filter((k) => !(k in DEFAULT_CONFIG));
  if (unknown.length)
    log.warn(`config: unrecognised key(s) carried through unchecked: ${unknown.join(', ')}`);
  if (c.ringMetric !== 'chebyshev')
    throw new Error('ring_metric: only chebyshev (L∞) in v1 (§11.4)');
  if (c.intraRingOrder !== 'clockwise' && c.intraRingOrder !== 'nearest_first')
    throw new Error('intra_ring_order must be clockwise | nearest_first');
  // An unimplemented switch must fail loudly, never silently fall back to the
  // default: a silently ignored `markMode` is indistinguishable from a marking
  // bug when you are staring at an unexpectedly sparse picture.
  if (c.markMode !== 'outward_only')
    throw new Error('mark_mode: only outward_only is implemented here (§3.1)');
  c.seedPoints = normalizeSeeds(c.seedPoints);
  if (typeof c.rMax !== 'number' || !Number.isFinite(c.rMax))
    throw new TypeError(`r_max must be a finite number (got ${JSON.stringify(c.rMax)})`);
  if (c.rMax > MAX_RMAX) throw new RangeError(`r_max ${c.rMax} exceeds the safety cap ${MAX_RMAX}`);
  c.rMax = Math.max(0, c.rMax | 0);
  if (c.horizonW === null || c.horizonW === undefined || c.horizonW === Infinity) c.horizonW = 0;
  if (!Number.isInteger(c.horizonW) || c.horizonW < 0 || c.horizonW > 1 << 20)
    throw new RangeError(
      `horizon_w must be an integer in [0, ${1 << 20}] (0 = ∞) (got ${c.horizonW})`
    );
  if (c.horizonW === 1)
    log.warn(
      'horizon_w=1 forbids nothing: every collinear triple has span >= 2, so the plane fills'
    );
  if (!Number.isInteger(c.band) || c.band < 1 || c.band > 1 << 20)
    throw new RangeError(`band must be an integer in [1, ${1 << 20}] (got ${c.band})`);
  c.paranoid = !!c.paranoid;
  if (c.paranoid && c.rMax > 128)
    log.warn(`paranoid + r_max=${c.rMax}: the O(k) oracle per cell makes this quadratically slow`);
  if (typeof c.version !== 'string' || !c.version)
    throw new TypeError('config.version must be a non-empty string (it seeds config_hash)');
  return c;
}

/** Seeds, in the traversal's own total order: ring-major, then lex (§2.1). */
function normalizeSeeds(seeds) {
  if (!Array.isArray(seeds)) throw new Error('seed_points must be an array of [x, y]');
  if (seeds.length > 1e6)
    throw new RangeError(`seed_points: ${seeds.length} entries is not plausible`);
  const seen = new Set(),
    out = [];
  let dupes = 0;
  for (const p of seeds) {
    if (!Array.isArray(p) || p.length !== 2) throw new Error('seed_points: entries must be [x, y]');
    const x = p[0],
      y = p[1];
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      Math.abs(x) > 0x3fffffff ||
      Math.abs(y) > 0x3fffffff
    )
      throw new Error(`seed_points: (${x},${y}) is not an int32 lattice point`);
    if (Math.abs(x) >= 1 << 21 || Math.abs(y) >= 1 << 21)
      throw new Error(`seed_points: (${x},${y}) exceeds the |v| < 2^21 key range`);
    const kk = key2(x, y);
    if (seen.has(kk)) {
      dupes++;
      continue;
    }
    seen.add(kk);
    out.push([x, y]);
  }
  if (dupes) log.warn(`seed_points: dropped ${dupes} duplicate seed(s)`);
  out.sort((a, b) => linfIndex(a[0], a[1]) - linfIndex(b[0], b[1]) || a[0] - b[0] || a[1] - b[1]);
  return out;
}

/**
 * g(t) = ||p + t·d||_∞ = max(|px+t·dx|, |py+t·dy|) — a max of FOUR affine functions
 * of t, hence convex and piecewise linear with an integer minimizer. (Note the max:
 * with min(|·|,|·|) this would be neither convex nor a norm, and the whole bucket
 * queue argument would collapse.)
 */
function gOf(px, py, dx, dy, t) {
  const x = px + t * dx,
    y = py + t * dy;
  const ax = x < 0 ? -x : x,
    ay = y < 0 ? -y : y;
  return ax > ay ? ax : ay;
}

/**
 * The convexity split point t* (§3.3): the integer minimizer of g. Found by binary
 * search on the monotone predicate g(t+1) >= g(t) (monotone because g is convex).
 * The two rays t >= t* and t <= t*-1 are each monotone non-decreasing in ||·||_∞,
 * which is the precondition for both the bucket queue and `outward_only` (§3.1).
 */
export function convexitySplit(px, py, dx, dy, rMax) {
  if (!isI32(px) || !isI32(py) || !isI32(dx) || !isI32(dy))
    throw new TypeError(`convexitySplit: non-int32 ray (p=${px},${py} d=${dx},${dy})`);
  if (!Number.isInteger(rMax) || rMax < 0)
    throw new RangeError(`convexitySplit: rMax must be a non-negative integer (got ${rMax})`);
  const dn = linfIndex(dx, dy);
  if (dn === 0) throw new RangeError('convexitySplit: zero direction defines no ray');
  const span = Math.ceil((2 * rMax + linfIndex(px, py) + 2) / dn) + 2;
  if (!Number.isFinite(span) || span > 1e9)
    throw new RangeError(`convexitySplit: search span ${span} is out of control (d=${dx},${dy})`);
  let lo = -span,
    hi = span;
  if (gOf(px, py, dx, dy, lo + 1) >= gOf(px, py, dx, dy, lo)) return lo;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (gOf(px, py, dx, dy, mid + 1) >= gOf(px, py, dx, dy, mid)) hi = mid;
    else lo = mid + 1;
  }
  // The returned t* must actually be the minimizer: cheap, catches a broken predicate.
  if (gOf(px, py, dx, dy, lo + 1) < gOf(px, py, dx, dy, lo))
    throw new Error(
      `convexitySplit: t*=${lo} is not a minimizer for p=(${px},${py}) d=(${dx},${dy})`
    );
  return lo;
}

export class SieveEngine {
  constructor(cfg) {
    this.cfg = normalizeConfig(cfg);
    // W = ∞ is represented by the float Infinity so every `span > W` test is a
    // single comparison in both regimes (no branch in the hot loops).
    this.W = this.cfg.horizonW > 0 ? this.cfg.horizonW : Infinity;
    // Partner index: at finite W only points inside c + B(W) can block, so bin
    // the set on a W-grid and consult the 3x3 neighbourhood (L2A.4). Without
    // this the per-commit scan is O(k) and finite W is unusable past R ~ 100.
    this._G = this.W === Infinity ? 0 : Math.max(1, this.cfg.horizonW);
    this._bins = this._G ? new Map() : null;
    this.r = 0;
    this.px = new Int32Array(1024);
    this.py = new Int32Array(1024);
    this.k = 0;
    this.occupied = new Set(); // key2(x,y) of placed points
    this.ringStart = [0]; // ringStart[R] = index of first point of ring R
    this.pool = new EventPool();
    this.cal = new Calendar(this.cfg.band);
    this.mask = new Uint8Array(8);
    this.marks = 0;
    this.done = false;
    this._c = [0, 0];
    // I2 bookkeeping. Pure diagnostics, but they are exactly what distinguishes
    // "this ring is sparse because the sieve over-blocked" (a bug) from "this
    // ring is sparse because every row/column it touches already holds 2 points"
    // (the greedy's own arithmetic: each face of S_∞(R) *is* one row/column).
    this.rowPop = new Map();
    this.colPop = new Map();
    this.satRows = 0;
    this.satCols = 0;
    this._emptyStreak = 0; // consecutive rings that accepted nothing
    // seedPoints was being silently dropped; group it by ring so the origin
    // cluster (0,0),(0,1),(1,1),(1,0) is escapable (§11.2, R6).
    this._seedsByRing = new Map();
    for (const s of this.cfg.seedPoints) {
      const R = linfIndex(s[0], s[1]);
      if (R > this.cfg.rMax) {
        log.warn(`seed (${s[0]},${s[1]}) lies on ring ${R} > r_max=${this.cfg.rMax}; ignored`);
        continue;
      }
      let a = this._seedsByRing.get(R);
      if (!a) this._seedsByRing.set(R, (a = []));
      a.push(s);
    }
  }

  get pointCount() {
    return this.k;
  }

  _pushPoint(x, y) {
    if (!isI32(x) || !isI32(y)) throw new TypeError(`_pushPoint: non-int32 point (${x},${y})`);
    if (this.occupied.has(key2(x, y)))
      throw new Error(`_pushPoint: (${x},${y}) is already occupied`);
    if (this.k === this.px.length) {
      if (this.k * 2 > 1 << 27)
        throw new RangeError(`point buffer refusing to grow past ${this.k} points`);
      const npx = new Int32Array(this.k * 2),
        npy = new Int32Array(this.k * 2);
      npx.set(this.px);
      npy.set(this.py);
      this.px = npx;
      this.py = npy;
    }
    this.px[this.k] = x;
    this.py[this.k] = y;
    this.occupied.add(key2(x, y));
    const rp = (this.rowPop.get(y) || 0) + 1,
      cp = (this.colPop.get(x) || 0) + 1;
    this.rowPop.set(y, rp);
    this.colPop.set(x, cp);
    if (rp === 2) this.satRows++;
    if (cp === 2) this.satCols++;
    // "<= 2 per line" is an L2.3 statement about W = ∞ only. At a finite horizon
    // a row holds <= 2 points *per W-window*, so this must not be asserted.
    if (this.W === Infinity && (rp > 2 || cp > 2))
      throw new Error(`I2 violated at (${x},${y}): row=${rp} col=${cp}`);
    if (this._bins) {
      const G = this._G,
        bk = key2(Math.floor(x / G), Math.floor(y / G));
      let a = this._bins.get(bk);
      if (!a) this._bins.set(bk, (a = []));
      a.push(this.k);
    }
    return this.k++;
  }

  /** Indices that could possibly be within W of (cx,cy); null ⇒ "all of them". */
  _nearby(cx, cy) {
    if (!this._bins) return null;
    const G = this._G,
      out = [];
    const bx = Math.floor(cx / G),
      by = Math.floor(cy / G);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const a = this._bins.get(key2(bx + i, by + j));
        if (a) for (let t = 0; t < a.length; t++) out.push(a[t]);
      }
    return out;
  }

  /**
   * Authoritative admissibility oracle (§3.6 / L2A.4). Used by --paranoid and
   * tests. Two points sharing a direction class as seen from `c` only block it
   * when ALL THREE pairwise spans are <= W: the `±` quotient means they may sit
   * on opposite sides, up to 2W apart, and dropping that clause over-blocks.
   */
  exactCheck(cx, cy) {
    const W = this.W;
    const cand = this._nearby(cx, cy);
    const n = cand ? cand.length : this.k;
    const seen = new Map(); // dir key -> indices already seen within W of c
    for (let ii = 0; ii < n; ii++) {
      const i = cand ? cand[ii] : ii;
      const vx = cx - this.px[i],
        vy = cy - this.py[i];
      if (vx === 0 && vy === 0) return false; // occupied: not a candidate
      if (linfIndex(vx, vy) > W) continue;
      const d = primdir(vx, vy);
      const kk = key2(d[0], d[1]);
      const list = seen.get(kk);
      if (!list) {
        seen.set(kk, [i]);
        continue;
      }
      for (let q = 0; q < list.length; q++) {
        const j = list[q];
        if (linfIndex(this.px[i] - this.px[j], this.py[i] - this.py[j]) <= W) return false;
      }
      list.push(i);
    }
    return true;
  }

  /** Return the pair (i,j) of placed points W-collinear with (cx,cy), or null. */
  blockers(cx, cy) {
    const W = this.W;
    const cand = this._nearby(cx, cy);
    const n = cand ? cand.length : this.k;
    const seen = new Map();
    for (let ii = 0; ii < n; ii++) {
      const i = cand ? cand[ii] : ii;
      const vx = cx - this.px[i],
        vy = cy - this.py[i];
      if (vx === 0 && vy === 0) continue;
      if (linfIndex(vx, vy) > W) continue;
      const d = primdir(vx, vy);
      const kk = key2(d[0], d[1]);
      const list = seen.get(kk);
      if (!list) {
        seen.set(kk, [i]);
        continue;
      }
      for (let q = 0; q < list.length; q++) {
        const j = list[q];
        if (linfIndex(this.px[i] - this.px[j], this.py[i] - this.py[j]) <= W) return [j, i];
      }
      list.push(i);
    }
    return null;
  }

  /**
   * Apply the line through `base` with primitive direction `d` (§3.4 + §3.7):
   *   - lattice points with ||·||_∞ === R are marked *immediately* into the
   *     current ring mask (this is `mark_ahead_in_this_ring`, mandatory);
   *   - the first lattice point with ||·||_∞ > R on each ray becomes a calendar
   *     event; points with ||·||_∞ < R are dropped (`outward_only`, sound only
   *     because the ray was split at t*, §3.1).
   * The flat-face case (a line containing an entire face of S_∞(R)) falls out of
   * the walk: g stays === R across the whole face, so the face is blanked.
   * `[tLo, tHi]` is the horizon interval of L2A.5 (the whole line when W = ∞):
   * outside it the pair blocks nothing, so neither marks nor events are emitted.
   */
  _applyLine(bx, by, dx, dy, R, mask, tLo = -T_INF, tHi = T_INF) {
    const rMax = this.cfg.rMax;
    if (dx === 0 && dy === 0)
      throw new RangeError(`_applyLine: zero direction at base (${bx},${by})`);
    if (!Number.isInteger(tLo) || !Number.isInteger(tHi) || tLo > tHi)
      throw new RangeError(`_applyLine: bad horizon interval [${tLo},${tHi}]`);
    const len = ringLength(R);
    if (!mask || mask.length < len)
      throw new RangeError(
        `_applyLine: mask too short for ring ${R} (${mask ? mask.length : 'null'} < ${len})`
      );
    const tstar = convexitySplit(bx, by, dx, dy, rMax);
    const dn = linfIndex(dx, dy);
    const cap = Math.floor((4 * rMax) / dn) + 8; // Lemma 3.3.1 as a runtime assert
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? 1 : -1;
      const tEnd = s === 1 ? tHi : tLo;
      // Start at the split point, or at the near edge of the horizon interval if
      // the split lies outside it (g is still monotone from there outwards).
      let t = s === 1 ? Math.max(tstar, tLo) : Math.min(tstar - 1, tHi);
      if (s === 1 ? t > tEnd : t < tEnd) continue; // interval is behind this ray
      let steps = 0;
      for (;;) {
        if (++steps > cap + 4 * rMax + 8)
          throw new Error(
            `ray walk exceeded Lemma 3.3.1 bound (base=(${bx},${by}) d=(${dx},${dy}) R=${R} steps=${steps})`
          );
        const x = bx + t * dx,
          y = by + t * dy;
        if (!isI32(x) || !isI32(y))
          throw new RangeError(`_applyLine: ray left int32 range at t=${t} → (${x},${y})`);
        const g = linfIndex(x, y);
        if (g > R) {
          if (g <= rMax) {
            const ev = this.pool.alloc(bx, by, dx, dy, t, s, tEnd);
            this.cal.push(g, ev);
          }
          break;
        }
        if (g === R) {
          const pi = cellToPerimeter(R, x, y);
          if (pi < 0 || pi >= len)
            throw new RangeError(`_applyLine: perimeter index ${pi} outside [0,${len})`);
          mask[pi] = 1;
          this.marks++;
        }
        t += s;
        if (s === 1 ? t > tEnd : t < tEnd) break; // horizon reached: ray retires
      }
    }
  }

  /** Drain calendar bucket R into the ring mask, advancing each ray in place. */
  _drain(R, mask) {
    const cal = this.cal,
      pool = this.pool,
      rMax = this.cfg.rMax;
    const len = ringLength(R);
    cal.beginRing(R);
    let ev;
    let drained = 0;
    while ((ev = cal.takeNext()) >= 0) {
      const bx = pool.px(ev),
        by = pool.py(ev),
        dx = pool.dx(ev),
        dy = pool.dy(ev);
      let t = pool.t(ev);
      const s = pool.s(ev);
      const x = bx + t * dx,
        y = by + t * dy;
      // I3: the calendar promised this event lands exactly on ring R.
      const g0 = linfIndex(x, y);
      if (g0 !== R)
        throw new Error(
          `I3 violated: event ${ev} for ring ${R} landed at (${x},${y}) with ||·||=${g0}`
        );
      const pi = cellToPerimeter(R, x, y);
      if (pi < 0 || pi >= len)
        throw new RangeError(`_drain: perimeter index ${pi} outside [0,${len})`);
      mask[pi] = 1;
      this.marks++;
      drained++;
      const tE = pool.tEnd(ev);
      t += s;
      if (s === 1 ? t > tE : t < tE) {
        pool.release(ev); // horizon reached (L2A.5): nothing further is blocked
        continue;
      }
      const g = linfIndex(bx + t * dx, by + t * dy);
      if (g <= R && g <= rMax)
        throw new Error(
          `I3 violated: ray (${bx},${by})+t(${dx},${dy}) is not monotone (next ring ${g} <= ${R})`
        );
      if (g <= rMax) {
        pool.setT(ev, t);
        cal.push(g, ev);
      } else pool.release(ev);
    }
    if (log.enabled('trace'))
      log.trace(`ring ${R}: drained ${drained} event(s), live=${pool.live}`);
  }

  /**
   * Commit `c` on ring `R`: close over BOTH families of §3.7 in one loop —
   * `points` still excludes c, and it already contains this ring's earlier
   * commits, so the segment-internal family {(c1,c2)} is included. Load-bearing.
   */
  _commit(cx, cy, R, mask, added) {
    if (!isI32(cx) || !isI32(cy)) throw new TypeError(`_commit: non-int32 point (${cx},${cy})`);
    if (linfIndex(cx, cy) !== R) throw new Error(`_commit: (${cx},${cy}) is not on ring ${R}`);
    const W = this.W;
    const cand = this._nearby(cx, cy);
    const n = cand ? cand.length : this.k;
    for (let jj = 0; jj < n; jj++) {
      const j = cand ? cand[jj] : jj;
      if (this.px[j] === cx && this.py[j] === cy)
        throw new Error(`_commit: (${cx},${cy}) already present at index ${j}`);
      const vx = cx - this.px[j],
        vy = cy - this.py[j];
      if (linfIndex(vx, vy) > W) continue; // inadmissible pair (L2A.4): no line
      const d = primdir(vx, vy);
      let tLo = -T_INF,
        tHi = T_INF;
      if (W !== Infinity) {
        // L2A.5, in the line parameter based at c (t=0 is c, t=tq is the partner):
        // blocked cells are t ∈ [max(0,tq) - m, min(0,tq) + m], m = ⌊W/||d||_∞⌋.
        const m = Math.floor(W / linfIndex(d[0], d[1]));
        const tq = d[0] !== 0 ? (this.px[j] - cx) / d[0] : (this.py[j] - cy) / d[1];
        if (!Number.isInteger(tq)) throw new Error(`_commit: non-integral line parameter ${tq}`);
        tLo = Math.max(0, tq) - m;
        tHi = Math.min(0, tq) + m;
      }
      this._applyLine(cx, cy, d[0], d[1], R, mask, tLo, tHi);
    }
    this._pushPoint(cx, cy);
    added.push(cx, cy);
    mask[cellToPerimeter(R, cx, cy)] = 1; // no-op unless P was empty (or c is a seed)
  }

  /** Process exactly one ring. Returns a RingReport, or null when finished. */
  stepRing() {
    // Wrap the body so any failure is reported *with the ring that produced it*
    // and the engine is latched off instead of limping on with corrupt state.
    try {
      return this._stepRing();
    } catch (e) {
      this.done = true;
      log.error(`ring ${this.r} aborted: ${e && e.message}`, e && e.stack ? e.stack : '');
      throw e;
    }
  }

  _stepRing() {
    if (this.done) return null;
    const R = this.r;
    if (R > this.cfg.rMax) {
      this.done = true;
      return null;
    }

    const len = ringLength(R);
    if (this.mask.length < len) this.mask = new Uint8Array(len);
    const mask = this.mask;
    mask.fill(0, 0, len);

    this._drain(R, mask);

    const order = ringOrder(R, this.cfg.intraRingOrder);
    const added = [];
    const c = this._c;
    let blocked = 0;
    // Seeds of this ring go in first, in ring-major/lex order, and close their
    // own lines before the greedy walk starts (§3.7 applies to them too).
    const seeds = this._seedsByRing.get(R);
    if (seeds) {
      for (let si = 0; si < seeds.length; si++) {
        const sx = seeds[si][0],
          sy = seeds[si][1];
        if (this.occupied.has(key2(sx, sy))) continue;
        if (!this.exactCheck(sx, sy))
          throw new Error(`seed_points: (${sx},${sy}) is collinear with two earlier points`);
        this._commit(sx, sy, R, mask, added);
      }
    }

    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi];
      perimeterToCell(R, i, c);
      const cx = c[0],
        cy = c[1];
      if (mask[i]) {
        // blocked by an earlier line
        blocked++;
        // I4, the direction nobody was checking: a *masked* cell must be
        // genuinely blocked. If this ever fires, the calendar over-blocks and
        // the emptiness is a bug; if it never fires, the emptiness is the
        // greedy's own row/column budget (see `satRows`/`satCols` below).
        if (this.cfg.paranoid && !this.occupied.has(key2(cx, cy)) && this.exactCheck(cx, cy))
          throw new Error(`I4 violated: sieve REJECTED a free cell (${cx},${cy}) on ring ${R}`);
        continue;
      }

      if (this.cfg.paranoid && !this.exactCheck(cx, cy))
        throw new Error(`I4 violated: sieve accepted a blocked cell (${cx},${cy})`);

      this._commit(cx, cy, R, mask, added);
    }

    this.r = R + 1;
    this.ringStart[this.r] = this.k;
    if (this.r > this.cfg.rMax) this.done = true;
    // A long run of empty rings is *expected* once rows/columns saturate, but it
    // is also exactly what an over-blocking sieve looks like. Say it out loud once.
    if (added.length === 0) {
      if (++this._emptyStreak === 32)
        log.info(
          `32 consecutive empty rings ending at R=${R}: rows ${this.satRows}, cols ${this.satCols} saturated` +
            ` (run with paranoid=true to rule out over-blocking)`
        );
    } else this._emptyStreak = 0;
    if (log.enabled('debug'))
      log.debug(
        `R=${R} cells=${len} accepted=${added.length / 2} blocked=${blocked} live=${this.pool.live}`
      );
    return {
      r: R,
      added: Int32Array.from(added),
      k: this.k,
      marks: this.marks,
      liveEvents: this.pool.live,
      peakEvents: this.pool.peak,
      eventBytes: this.pool.bytes(),
      cells: len,
      blocked,
      accepted: added.length / 2,
      satRows: this.satRows,
      satCols: this.satCols,
    };
  }

  run(onRing) {
    let rep;
    if (onRing !== undefined && typeof onRing !== 'function')
      throw new TypeError('run(onRing): callback must be a function');
    while ((rep = this.stepRing())) {
      if (!onRing) continue;
      try {
        onRing(rep);
      } catch (e) {
        log.error(`run: onRing callback threw at R=${rep.r}: ${e && e.message}`);
        throw e;
      }
    }
    return this.snapshot();
  }

  snapshot() {
    const pts = new Int32Array(this.k * 2);
    for (let i = 0; i < this.k; i++) {
      pts[2 * i] = this.px[i];
      pts[2 * i + 1] = this.py[i];
    }
    return { points: pts, k: this.k, rGen: this.r - 1, config: this.cfg };
  }
}

/**
 * reference.js-equivalent: the slow, obviously-correct greedy engine (§3.6 / M1).
 * Same traversal order, no calendar, no masks — pure O(R^2 · k) exact checks.
 * This is ground truth for the differential self-test (§7.3).
 */
export function referenceRun(cfg) {
  const c = normalizeConfig(cfg);
  if (c.rMax > 96) log.warn(`referenceRun: r_max=${c.rMax} is O(R^2·k) and will take a long time`);
  const W = c.horizonW > 0 ? c.horizonW : Infinity;
  const px = [],
    py = [];
  const cell = [0, 0];
  const occupied = new Set();
  const seedsByRing = new Map();
  for (const s of c.seedPoints) {
    const R = linfIndex(s[0], s[1]);
    if (R > c.rMax) continue;
    let a = seedsByRing.get(R);
    if (!a) seedsByRing.set(R, (a = []));
    a.push(s);
  }
  const admissible = (cx, cy) => {
    const seen = new Map();
    for (let i = 0; i < px.length; i++) {
      const vx = cx - px[i],
        vy = cy - py[i];
      if (vx === 0 && vy === 0) return false;
      if (linfIndex(vx, vy) > W) continue;
      const d = primdir(vx, vy);
      const kk = key2(d[0], d[1]);
      const list = seen.get(kk);
      if (!list) {
        seen.set(kk, [i]);
        continue;
      }
      for (const j of list) if (linfIndex(px[i] - px[j], py[i] - py[j]) <= W) return false;
      list.push(i);
    }
    return true;
  };
  for (let R = 0; R <= c.rMax; R++) {
    const seeds = seedsByRing.get(R);
    if (seeds)
      for (const s of seeds) {
        if (occupied.has(key2(s[0], s[1]))) continue;
        if (!admissible(s[0], s[1]))
          throw new Error(`seed_points: (${s[0]},${s[1]}) is collinear with two earlier points`);
        px.push(s[0]);
        py.push(s[1]);
        occupied.add(key2(s[0], s[1]));
      }
    const order = ringOrder(R, c.intraRingOrder);
    for (let oi = 0; oi < order.length; oi++) {
      perimeterToCell(R, order[oi], cell);
      const cx = cell[0],
        cy = cell[1];
      if (occupied.has(key2(cx, cy))) continue;
      if (admissible(cx, cy)) {
        px.push(cx);
        py.push(cy);
        occupied.add(key2(cx, cy));
      }
    }
  }
  const pts = new Int32Array(px.length * 2);
  for (let i = 0; i < px.length; i++) {
    pts[2 * i] = px[i];
    pts[2 * i + 1] = py[i];
  }
  return { points: pts, k: px.length, rGen: c.rMax, config: c };
}
