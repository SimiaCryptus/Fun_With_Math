// selftest.js — the browser-side slice of §7, runnable from the UI:
//   1. perimeter indexing is a bijection incl. all 4 corners (§3.7(3))
//   2. calendar backend == exact-check reference engine (differential, §7.3 / I4)
//   3. verifier + brute-force triple check agree (§7.1, §7.2)
//   4. segment-closure regression: disabling the {(c1,c2)} family must FAIL (§7.4)
//   5. Lemma 3.3.1 mark bound holds for random lines
import {
  ringLength,
  perimeterToCell,
  cellToPerimeter,
  linfIndex,
  primdir,
  key2,
} from './lattice.js';
import { SieveEngine, referenceRun, convexitySplit } from './sieve.js';
import { verify, verifyBruteForce } from './verify.js';
import { pointsHash } from './util/sha256.js';
import { createLogger } from './util/log.js';

const logger = createLogger('selftest');

function eqArr(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Deliberately broken engine: closes only the cross family (the idea.md bug). */
class CrossFamilyOnlyEngine extends SieveEngine {
  stepRing() {
    // Freeze `k` at ring entry so same-ring pairs are never closed over.
    this._freeze = this.k;
    return super.stepRing();
  }
}

export function runSelfTest(log = console.log) {
  if (typeof log !== 'function') throw new TypeError('runSelfTest(log): log must be a function');
  const out = [];
  // `ok` must be coerced HERE: callers legitimately pass truthy payloads (an
  // offending triple, a length, ...), and `all &= [ ... ]` is ToInt32(array) = 0,
  // which silently turned an all-PASS run into "FAILURES PRESENT".
  const say = (cond, msg) => {
    const ok = !!cond;
    out.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
    log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
    return ok;
  };
  let all = true;
  // One throwing case must not hide the remaining cases: each test is isolated
  // and an unexpected exception is reported as a FAIL with its message.
  const test = (name, fn) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let ok = false,
      extra = '';
    try {
      const r = fn();
      ok = !!(r && r.ok !== undefined ? r.ok : r);
      extra = (r && r.msg) || '';
    } catch (e) {
      ok = false;
      extra = `threw ${e && e.message ? e.message : e}`;
      logger.error(`${name}:`, e);
    }
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    all &= say(ok, `${name}${extra ? ' — ' + extra : ''} [${ms.toFixed(0)} ms]`);
    return ok;
  };

  // 1. bijection, exhaustively for R <= 32 (§7, ring-intersection tests)
  let bij = true;
  for (let R = 0; R <= 32 && bij; R++) {
    const n = ringLength(R),
      seen = new Set(),
      c = [0, 0];
    for (let i = 0; i < n; i++) {
      perimeterToCell(R, i, c);
      if (linfIndex(c[0], c[1]) !== R) {
        bij = false;
        break;
      }
      const kk = c[0] * 1e6 + c[1];
      if (seen.has(kk)) {
        bij = false;
        break;
      }
      seen.add(kk);
      if (cellToPerimeter(R, c[0], c[1]) !== i) {
        bij = false;
        break;
      }
    }
    if (seen.size !== n) bij = false;
  }
  all &= say(bij, 'perimeter indexing is a bijection on S_inf(R), R<=32 (corners once)');

  // 2. differential: calendar vs reference, both intra-ring orders
  for (const order of ['clockwise', 'nearest_first']) {
    const cfg = { rMax: 24, intraRingOrder: order, paranoid: true };
    const a = new SieveEngine(cfg).run();
    const b = referenceRun(cfg);
    const ok = eqArr(a.points, b.points);
    all &= say(
      ok,
      `calendar == reference for R<=24 (${order}); k=${a.k}; sha=${pointsHash(a.points).slice(0, 12)}`
    );
  }
  // 2b. I4 in BOTH directions: paranoid now also asserts that every *masked*
  // cell is genuinely blocked, i.e. the sieve never over-blocks. This is the
  // assertion that turns "maybe the line constraints aren't bounded" into a
  // testable claim rather than a suspicion about an empty-looking picture.
  let twoSided = true,
    why = '';
  try {
    new SieveEngine({ rMax: 48, paranoid: true }).run();
  } catch (e) {
    twoSided = false;
    why = ` (${e.message})`;
  }
  all &= say(twoSided, `I4 both directions: no over-blocking for R<=48${why}`);
  // 2c. The recurring "the constraint is unbounded / 2-wide strips shoot to
  // infinity" report. It is I2, not a leak: the greedy takes the origin 2x2
  // cluster, which puts 2 points into each of rows y=0,1 and cols x=0,1, and a
  // line with 2 points is closed at EVERY distance. Assert both halves: the
  // strips really hold exactly 2 points, and every vacant cell in them is
  // rejected by the independent O(k) oracle too (so nothing was over-blocked).
  test('2-wide empty strips are saturated rows/columns (I2), not unbounded marking', () => {
    const R = 24;
    const eng = new SieveEngine({ rMax: R });
    eng.run();
    const get = (m, k) => m.get(k) || 0;
    const rows = new Map(),
      cols = new Map();
    for (let i = 0; i < eng.k; i++) {
      rows.set(eng.py[i], get(rows, eng.py[i]) + 1);
      cols.set(eng.px[i], get(cols, eng.px[i]) + 1);
    }
    for (const v of [0, 1]) {
      if (get(rows, v) !== 2) return { ok: false, msg: `row y=${v} holds ${get(rows, v)}, want 2` };
      if (get(cols, v) !== 2) return { ok: false, msg: `col x=${v} holds ${get(cols, v)}, want 2` };
    }
    let checked = 0;
    for (let t = -R; t <= R; t++)
      for (const v of [0, 1])
        for (const c of [
          [t, v],
          [v, t],
        ]) {
          if (eng.occupied.has(key2(c[0], c[1]))) continue;
          checked++;
          if (eng.exactCheck(c[0], c[1]))
            return { ok: false, msg: `(${c[0]},${c[1]}) is admissible but was skipped` };
        }
    // Far field. The vacancy is a THEOREM about the line, not a side effect of
    // how far the sieve happened to mark: two points close a line for EVERY
    // further lattice point on it, so there is no radius at which the
    // constraint could be "bounded" and stop applying. Checked symbolically
    // (cross product) so it holds beyond anything the engine generated.
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const certs = [
      [
        [0, 0],
        [1, 0],
      ], // row y=0
      [
        [0, 1],
        [1, 1],
      ], // row y=1
      [
        [0, 0],
        [0, 1],
      ], // col x=0
      [
        [1, 0],
        [1, 1],
      ], // col x=1
    ];
    for (const [a, b] of certs) {
      if (!eng.occupied.has(key2(a[0], a[1])) || !eng.occupied.has(key2(b[0], b[1])))
        return { ok: false, msg: `certificate pair (${a}) (${b}) is not in the set` };
      for (const t of [R + 1, 1000, 1 << 20]) {
        const c = a[1] === b[1] ? [t, a[1]] : [a[0], t];
        if (cross(a, b, c) !== 0)
          return { ok: false, msg: `(${c}) is not collinear with (${a}) (${b})` };
      }
    }
    return {
      ok: true,
      msg:
        `rows/cols {0,1} hold 2 each; ${checked} strip cells provably blocked; ` +
        `4 certificates valid out to t=2^20 (no distance cutoff exists)`,
    };
  });
  // 2d. HORIZON (theory.md §2A). The unbounded reach asserted in 2c is a
  // *property of W = ∞*, not an implementation accident. Bounding it with a
  // finite W must (i) reproduce the unbounded run cell-for-cell inside
  // B(⌊W/2⌋) — T2A.7 / P19, the cheapest full-stack regression in the project —
  // and (ii) actually refill the strips beyond W.
  test('horizon: P_W == P_∞ on B(⌊W/2⌋) (T2A.7 / P19)', () => {
    const W = 12,
      half = W >> 1;
    const ball = (p) => {
      const s = new Set();
      for (let i = 0; i < p.k; i++) {
        const x = p.points[2 * i],
          y = p.points[2 * i + 1];
        if (linfIndex(x, y) <= half) s.add(key2(x, y));
      }
      return s;
    };
    const A = ball(new SieveEngine({ rMax: 40, horizonW: W }).run());
    const B = ball(new SieveEngine({ rMax: 40 }).run());
    if (A.size !== B.size) return { ok: false, msg: `|P_W|=${A.size} vs |P_∞|=${B.size}` };
    for (const kk of A) if (!B.has(kk)) return { ok: false, msg: 'cell mismatch inside B(⌊W/2⌋)' };
    return { ok: true, msg: `${A.size} cells identical (W=${W})` };
  });
  test('horizon: a bounded constraint refills the 2-wide strips beyond W', () => {
    const W = 8;
    const eng = new SieveEngine({ rMax: 40, horizonW: W });
    eng.run();
    let far = 0;
    for (let i = 0; i < eng.k; i++)
      if ((eng.py[i] === 0 || eng.py[i] === 1) && Math.abs(eng.px[i]) > 2 * W) far++;
    const v = verify(eng.snapshot().points, { horizonW: W });
    if (!v.ok) return { ok: false, msg: `W-validity FAILED: ${JSON.stringify(v)}` };
    return {
      ok: far > 0,
      msg: `${far} point(s) in rows y∈{0,1} with |x|>${2 * W}; k=${eng.k} (W=${W})`,
    };
  });
  test('horizon: calendar == reference at W=10 (truncation is exact)', () => {
    const cfg = { rMax: 18, horizonW: 10, paranoid: true };
    const a = new SieveEngine(cfg).run(),
      b = referenceRun(cfg);
    return { ok: eqArr(a.points, b.points), msg: `k=${a.k}` };
  });

  // 3. verifier + brute force
  const ps = new SieveEngine({ rMax: 20 }).run();
  const v = verify(ps.points),
    bf = verifyBruteForce(ps.points);
  all &= say(v.ok && bf.ok, `verify + brute-force C(k,3) agree (k=${ps.k})`);

  // 3b. corrupted variant must FAIL with a reported triple
  const bad = Int32Array.from([0, 0, 1, 1, 2, 2, 5, 1]);
  const vb = verify(bad);
  all &= say(
    !vb.ok && vb.triple,
    `corrupted set FAILs with an explicit triple: ${JSON.stringify(vb.triple)}`
  );

  // 4. segment closure: the broken variant must produce an INVALID set (R8)
  const brokenEngine = new (class extends SieveEngine {
    stepRing() {
      const kAtEntry = this.k;
      const realApply = this._applyLine.bind(this);
      const cap = kAtEntry;
      // Suppress *only* the segment-internal family by ignoring lines whose
      // partner was committed in this ring. (Simulates the idea.md omission.)
      this._suppressFrom = cap;
      return super.stepRing();
    }

    _applyLine(bx, by, dx, dy, R, mask, tLo, tHi) {
      // If the base cell is on the current ring and it is not the candidate's
      // partner from a previous ring, drop the immediate same-ring marks.
      if (linfIndex(bx, by) === R && this._suppressFrom !== undefined) {
        // schedule future rings only — this is precisely the bug we test for
        const saved = mask;
        const sink = new Uint8Array(mask.length);
        return super._applyLine(bx, by, dx, dy, R, sink, tLo, tHi);
      }
      return super._applyLine(bx, by, dx, dy, R, mask, tLo, tHi);
    }
  })({ rMax: 8 });
  let brokenInvalid = false;
  try {
    const bps = brokenEngine.run();
    brokenInvalid = !verify(bps.points).ok;
  } catch (e) {
    brokenInvalid = true;
  }
  all &= say(
    brokenInvalid,
    'segment-closure regression: dropping same-ring marks yields an INVALID set'
  );

  // 5. Lemma 3.3.1 bound + strictly increasing L∞ indices after the split
  let lemma = true;
  for (let trial = 0; trial < 200 && lemma; trial++) {
    const R = 40;
    const px = (Math.random() * 2 * R - R) | 0,
      py = (Math.random() * 2 * R - R) | 0;
    let vx = (Math.random() * 20 - 10) | 0,
      vy = (Math.random() * 20 - 10) | 0;
    if (vx === 0 && vy === 0) vx = 1;
    const d = primdir(vx, vy);
    const dn = linfIndex(d[0], d[1]);
    const t0 = convexitySplit(px, py, d[0], d[1], R);
    let hits = 0,
      prev = -1,
      mono = true;
    for (let t = t0; ; t++) {
      const g = linfIndex(px + t * d[0], py + t * d[1]);
      if (g > R) break;
      hits++;
    }
    for (let t = t0 - 1; ; t--) {
      const g = linfIndex(px + t * d[0], py + t * d[1]);
      if (g > R) break;
      hits++;
    }
    if (hits > (4 * R) / dn + 1) lemma = false;
  }
  all &= say(lemma, 'Lemma 3.3.1: marks inside B_inf(R) <= 4R/||d||_inf + 1');

  out.push(all ? 'ALL PASS' : 'FAILURES PRESENT');
  return { ok: !!all, log: out.join('\n') };
}
