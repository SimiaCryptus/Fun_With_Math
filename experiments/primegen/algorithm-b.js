/* =====================================================================
   algorithm-b.js — Algorithm B: the wheeled streaming generator
   Specification: algorithm.md §4  (paper.md Claims B1–B5).

   Exact ownership (Theorem 2.1) says the composites owned by p are
   p·A_p with A_p = { a ≥ p : gcd(a, P_{<p}) = 1 }, the p-rough numbers
   from p up.  Deciding a ∈ A_p in O(1) with O(1) state is impossible
   (Remark 2.9 / Conjecture X1), so B *relaxes* the multiplier set to a
   single tabulated wheel:

       Ã_p = { a ≥ p : gcd(a, W) = 1 } ⊇ A_p,     W = p_1···p_w .

   Stream of p is p·Ã_p, head p², advancement `a += step[a % W]` —
   genuinely O(1) with one word of state per prime (Thm 4.4).  Candidates
   n run over W-coprime integers only, so the streams of p_1…p_w are
   structurally absent.

   Deferred activation (Lemma 4.2): the stream of p is pushed exactly
   when the scan reaches n = p², which is itself W-coprime; hence the
   queue holds π(√n) records and no global N is needed.

   Price of the relaxation (§4.5): a W-coprime composite m is popped
   ω_{>p_w}(m) ≲ 2 times, giving
       ops(N) ≈ κ_W·N·(ln ln √N − ln ln p_w).
   Gain: O(1) random-access restart (§4.6), hence segment parallelism.
   ===================================================================== */
import { MinHeap, buildWheel, assertExact, countLE, fmtInt as f } from './primegen-core.js';

export const meta = {
  id: 'B',
  title: 'Algorithm B — wheeled streaming generator',
  ref: 'algorithm.md §4',
  usesWheel: true,
  blurb:
    'Candidates run over the W-coprime integers; for p > p_w the exact rough multiplier set A_p ' +
    'is replaced by the tabulated relaxation Ã_p = {a ≥ p : gcd(a,W)=1}. O(1) state per prime, ' +
    'π(√n) records, O(1) segment restart — paid for with ω_{>p_w}(m) ≲ 2 touches per composite.',
  streamNote:
    'The generator never received a limit: streams activate at n = p² and the queue holds ' +
    'π(√n) records at all times (Thm 4.4).',
};

const newStats = () => ({ pops: 0, pushes: 0, candidates: 0, peakQueue: 0, ms: 0 });

/* ---------------------------------------------------------------------
   §4.3  B() — the unbounded generator, verbatim from the pseudocode.
   `limit` = Infinity for the pure stream; a finite limit merely lets the
   driver drop keys > N, which are never read.
   ------------------------------------------------------------------ */
function* trace(limit, w, st) {
  const wh = buildWheel(w);
  const step = wh.step,
    W = wh.W;
  const Q = new MinHeap();
  const push = (v, p, a) => {
    if (v > limit) return; // bounded driver only
    assertExact(v, 'composite p·a');
    Q.push([v, p, a]);
    st.pushes++;
    if (Q.size > st.peakQueue) st.peakQueue = Q.size;
  };

  for (const p of wh.primes) {
    if (p > limit) return;
    yield p; // p_1 … p_w, emitted directly
  }
  const primes = []; // primes > p_w, in order
  let act = 0,
    n = wh.first; // n = p_{w+1}

  while (n <= limit) {
    /* deferred activation: stream p enters exactly when n reaches p² */
    while (act < primes.length && primes[act] * primes[act] <= n) {
      const p = primes[act++];
      push(p * p, p, p);
    }
    st.candidates++;
    if (Q.size === 0 || Q.key() > n) {
      primes.push(n);
      yield n; // no owner ⇒ prime (Thm 4.3)
    } else {
      while (Q.size && Q.key() === n) {
        /* ≥1 owner: duplicates are the whole cost of the relaxation */
        const rec = Q.pop();
        st.pops++;
        const p = rec[1];
        const a = rec[2] + step[rec[2] % W]; // O(1) advancement
        push(p * a, p, a);
      }
    }
    n += step[n % W];
  }
}

export function* stream({ w = 6, limit = Infinity } = {}) {
  yield* trace(limit, w, newStats());
}

export function run(limit, { w = 6 } = {}) {
  assertExact(limit, 'N');
  const st = newStats();
  const primes = [];
  const t0 = performance.now();
  for (const p of trace(limit, w, st)) primes.push(p);
  st.ms = performance.now() - t0;
  return { primes, stats: st, wheel: buildWheel(w) };
}

/* §4.6  random-access restart: state of stream p at segment start X, O(1) */
export function streamStateAt(p, X, wh) {
  const a0 = Math.max(p, wh.nextGE(Math.ceil(X / p)));
  return { a: a0, v: p * a0 };
}

export function summary({ primes, stats: st, wheel: wh }, N) {
  const pw = wh.primes[wh.primes.length - 1];
  const model = wh.kappa * N * (Math.log(Math.log(Math.sqrt(N))) - Math.log(Math.log(pw)));
  const lines = [
    [
      `wheel            : W = ${f(wh.W)}   κ_W = ${wh.kappa.toFixed(4)}   ` +
        `p_w = ${pw}   p_{w+1} = ${wh.first}`,
    ],
    [`candidates seen  : ${f(st.candidates)}   (κ_W·N ≈ ${f(wh.kappa * N)})`],
    [
      `queue pops       : ${f(st.pops)}   = ${(st.pops / N).toFixed(3)}·N   ` +
        `(§4.5 model ≈ ${f(model)})`,
    ],
    [
      `live streams     : ${f(st.peakQueue)}   ≈ π(√N) − w = ` +
        `${f(Math.max(0, countLE(primes, Math.floor(Math.sqrt(N))) - wh.w))}` +
        `   — the entire persistent state`,
    ],
    [''],
    ['§4.6 random-access restart — stream state at an arbitrary X, in O(1):'],
  ];
  for (const [p, X] of [
    [17, 1],
    [17, 1000],
    [101, 50000],
    [1009, 4000000],
  ]) {
    const s = streamStateAt(p, X, wh);
    lines.push([
      `   p=${String(p).padStart(5)}  X=${f(X).padStart(11)}  →  ` +
        `a₀=${f(s.a).padStart(9)}  v=${f(s.v)}`,
    ]);
  }
  lines.push([
    'Segments are therefore independent: Algorithm B parallelises like a segmented sieve.',
    'dim',
  ]);
  return lines;
}
