/* =====================================================================
   algorithm-a.js — Algorithm A: the exact one-touch orthogonal generator
   Specification: algorithm.md §3  (paper.md Claim A1).

   Structure (Theorem 3.1).  Split every composite at its *largest* prime
   factor: m = b·q with q = P(m), b = m/P(m) ≥ 2, P(b) ≤ q.  The streams

       Σ_b = { b·q : q prime, q ≥ P(b) },   b ≥ 2

   are increasing, pairwise disjoint, and cover the composites exactly
   once.  Advancing a stream is "one index increment into the prime
   array" — no wheel, no divisibility test, no marking array.

   Lazy creation (§3.2).  Each stream carries two cursors into `primes`:

       EMIT (v, b, c)   next output   v = b·primes[c]
       SPAWN(v, b, s)   next child    v = b·primes[s]², base b·primes[s]

   A spawn trigger b·p_s² is itself the first element of the child stream
   Σ_{b·p_s}, so the trigger event *consumes* a composite and no work is
   wasted; children are therefore never created eagerly.

   Causality (Theorem 3.5).  Every `primes[k+1]` read while processing n
   satisfies primes[k+1] < n, so the array access is always legal.

   Cost (§3.7).  Exactly N − π(N) − 1 pops — the optimal one-touch
   behaviour — but S(N) ≈ N^0.75 live streams, and a segment cannot be
   started in isolation.  That is the price of exact orthogonality
   (Remark 2.9).
   ===================================================================== */
import { MinHeap, assertExact, countLE, fmtInt as f } from './primegen-core.js';

export const EMIT = 0;
export const SPAWN = 1;

export const meta = {
  id: 'A',
  title: 'Algorithm A — exact one-touch orthogonal generator',
  ref: 'algorithm.md §3',
  usesWheel: false,
  blurb:
    'Streams Σ_b = { b·q : q prime, q ≥ P(b) } partition the composites (Thm 3.1), so every ' +
    'composite is popped exactly once — no wheel, no divisibility, no marking array. Paid for ' +
    'in memory: S(N) ≈ N^0.75 live streams, and no segment restart.',
  streamNote:
    'Two cursors per stream (emit / spawn). A spawn trigger b·p_s² is itself the first element ' +
    'of the child stream Σ_{b·p_s}, so the trigger consumes a composite and nothing is wasted (§3.2).',
};

const newStats = () => ({
  pops: 0,
  pushes: 0,
  streams: 0,
  peakQueue: 0,
  candidates: 0,
  ms: 0,
});

/* ---------------------------------------------------------------------
   the algorithm — §3.4 verbatim.  `limit` may be Infinity (§5.3), in
   which case every guard is vacuous and the generator runs forever.
   ------------------------------------------------------------------ */
function* trace(limit, st) {
  const primes = [];
  const Q = new MinHeap();
  const push = (rec) => {
    assertExact(rec[0], 'stream value b·q');
    Q.push(rec);
    st.pushes++;
    if (Q.size > st.peakQueue) st.peakQueue = Q.size;
  };

  for (let n = 2; n <= limit; n++) {
    st.candidates++;
    if (Q.size === 0 || Q.key() > n) {
      /* ---- n is prime (Invariant I1: no key is ever < n) ---------- */
      const i = primes.length;
      primes.push(n);
      yield n;
      if (n <= limit / n) {
        push([n * n, EMIT, n, i]); // multipliers q ≥ n
        st.streams++;
        if (n * n <= limit / n) push([n * n * n, SPAWN, n, i]); // child base n·n
      }
    } else {
      /* ---- n composite; by Thm 3.1 exactly ONE record has key n --- */
      const rec = Q.pop();
      st.pops++;
      const kind = rec[1],
        b = rec[2],
        k = rec[3];
      if (kind === EMIT) {
        const q = primes[k + 1]; // exists by Thm 3.5
        if (b <= limit / q) push([b * q, EMIT, b, k + 1]);
      } else {
        const q = primes[k];
        const child = b * q; // new base, P(child) = q
        const nq = primes[k + 1];
        if (child <= limit / nq) {
          push([child * nq, EMIT, child, k + 1]); // the q-element was just consumed
          st.streams++;
          if (child <= limit / (q * q)) push([child * q * q, SPAWN, child, k]);
        }
        if (b <= limit / (nq * nq)) push([b * nq * nq, SPAWN, b, k + 1]); // parent's next child
      }
    }
  }
}

/* unbounded (or limited) stream of primes */
export function* stream({ limit = Infinity } = {}) {
  yield* trace(limit, newStats());
}

/* bounded driver with statistics — same loop, plus counters */
export function run(limit) {
  assertExact(limit, 'N');
  const st = newStats();
  const primes = [];
  const t0 = performance.now();
  for (const p of trace(limit, st)) primes.push(p);
  st.ms = performance.now() - t0;
  return { primes, stats: st, wheel: null };
}

/* algorithm-specific report; [text, cssClass?] pairs */
export function summary({ primes, stats: st }, N) {
  const composites = Math.max(0, N - primes.length - 1); // 1 is neither
  const oneTouch = st.pops === composites;
  const theta = st.peakQueue > 1 ? Math.log(st.peakQueue) / Math.log(N) : 0;
  return [
    [`composites in [4,N] : ${f(composites)}`],
    [`queue pops          : ${f(st.pops)}   = ${(st.pops / N).toFixed(3)}·N`],
    [
      `one-touch (Thm 3.2) : pops == composites   ${oneTouch ? '✓' : '✗'}`,
      oneTouch ? 'pass' : 'fail',
    ],
    [`streams created     : ${f(st.streams)}   (one per base b with b·P(b) ≤ N)`],
    [
      `peak queue S(N)     : ${f(st.peakQueue)}   ≈ N^${theta.toFixed(3)}   ` +
        `(§3.7 heuristic: θ ≈ 0.75)`,
    ],
    [
      `π(√N) for contrast  : ${f(countLE(primes, Math.floor(Math.sqrt(N))))}   ` +
        `— the state B and C keep instead`,
    ],
    [''],
    ['Every step is one multiplication and one comparison; the composites', 'dim'],
    ['are consumed exactly once, which is optimal. The cost is the live-', 'dim'],
    ['stream count S(N) ≈ N^0.75 and the loss of segment independence: the', 'dim'],
    ['set of live bases at an arbitrary X cannot be rebuilt in o(X) work.', 'dim'],
  ];
}
