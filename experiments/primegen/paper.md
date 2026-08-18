# The Orthogonal Stream Prime Generator

**An unbounded prime generator built from disjoint composite streams, one per prime, each advanced in O (1) time and O (

1. state.**

---

## Abstract

We describe a prime generator that never allocates an array proportional to its output range and never performs a
divisibility test. Instead, each known prime `p` owns an infinite, strictly increasing _stream_ of composites — exactly
those integers whose smallest prime factor is `p`. Because ownership is by smallest prime factor, the streams are
pairwise disjoint: they _partition_ the composites. Generating primes then reduces to merging streams and reading off
the integers that no stream claims.

The construction has two forms. The **exact** form (Algorithm A) touches every composite exactly once — the
information-theoretic optimum for any method that must certify each composite — but the number of simultaneously live
streams grows superlinearly in `√N`. The **wheeled** form (Algorithm B) fixes a small wheel modulus `W`, relaxes each
stream's multiplier set to the `W`-coprime integers, and thereby achieves genuinely O (1) advancement with O (1) state
per prime, `π(√N)` total records, unbounded operation with no global limit, and O (1) random-access restart — hence
exact segment parallelism. The price is a bounded, measurable amount of duplicate work: each composite is claimed by
`ω_{>p_w}(m)` streams rather than one, empirically a factor of ≈2–2.5.

Algorithm B is the recommended construction. Algorithm A is retained because it is the mathematically pure object and
because its one-touch property is a machine-checkable certificate of the underlying partition. Every _structural_ claim
in this paper — the partition, the phase separation, causality, the wheel successor specification, Algorithm A's stream
tree, and Algorithm B's coverage, soundness, emit rule, queue invariant and duplicate accounting — is formalised and
machine-checked in Lean 4 / Mathlib (`lean/`, `sorry`-free). Every _cost_
claim is measurement, and is flagged as such. §9 gives the full claim → theorem table. A companion note (`fractal.md`)
reads the same object from the outside: the wheel lattices `S_k` mod the primorials obey an exact recursion whose
deleted set is an affine copy of the previous stage, so the construction is a genuine Moran/IFS one — and that deletion
set _is_ `Θ_p = p·A_p`. §2.5 states the recursion and, more usefully, states where its self-similarity breaks.
**Document map.** This is the primary specification. `algorithm.md` is the full normative construction, with proofs and
an executable reference implementation; `generator.md` is the architectural narrative; `observation.md` works the
per-prime multiplier sets `A_p` in detail; `idea.md` is the spectral/entropy reading; `fractal.md` is the lattice
reading; `theory.md` is the statement-by-statement inventory, with status, dependency graph and prior art. All six
describe one object and use one vocabulary.

---

## 1. Motivation: what a generator should not need

A sieve of Eratosthenes needs a bit array over the range it is sieving. A trial-division generator needs no array but
pays `π(√n)` divisions per candidate. Both are answering a _decision_ question ("is `n` composite?") when the structure
of the problem offers a _construction_ question ("what is the next composite each prime is responsible for?").

The construction question has a clean answer, and answering it yields a generator that is:

- **array-free** in the range sense: state is proportional to `π(√n)`, not to `n`;
- **division-free**: the inner loop is one table lookup, one multiplication, one comparison;
- **unbounded**: no limit `N` is supplied or needed;
- **incremental**: each prime is emitted the moment it is decided, in order;
- **orthogonal**: work is partitioned across primes with no shared mutable state, so it parallelises.

---

## 2. Ownership: the structural core

### 2.1 The partition

Write `spf(m)` for the smallest prime factor of `m > 1`. Every composite has exactly one smallest prime factor, so the
sets

```
Θ_p = { m composite : spf(m) = p }
```

are pairwise disjoint and their union is the set of all composites. Call this **orthogonality**: `p` is _responsible_
for `Θ_p` and for nothing else.

### 2.2 What a stream actually is

Let `P_{<p} = ∏_{q<p} q` be the primorial below `p`, and call `m` **`p`-rough** if no prime `< p` divides it,
equivalently `gcd(m, P_{<p}) = 1`. Then

> **Claim O1 (ownership).** For every prime `p`,
> `Θ_p = p · A_p` where `A_p = { a ≥ p : gcd(a, P_{<p}) = 1 }`,
> and `a ↦ pa` is a bijection `A_p → Θ_p`.
>
> _Status: **machine-checked** — `Primegen.theta_eq_image` (`lean/Primegen/Ownership.lean`);
> disjointness and the partition are `theta_disjoint` and `exists_unique_owner`._

So a stream is _a prime times a wheel_. `A_p` is not a list of primes: membership in `A_p` depends only on
`a mod P_{<p}`, so `A_p ∪ {1}` is periodic with `φ(P_{<p}) = ∏_{q<p}(q−1)` residues per period, and it is infinite.

Two immediate structural facts organise everything below.

> **Claim O2 (phase separation).** If `a ∈ A_p` and `a < p²` then `a` is prime.
>
> _Status: **machine-checked** — `Primegen.prime_of_rough_of_lt_sq`; the companion fact
> `min Θ_p = p²` is `sq_mem_theta` / `sq_le_of_mem_theta`._

Hence the multipliers of `p` split into a **prime phase** — the primes in `[p, p²)`, where advancing the stream is a
single index increment into the already-materialised prime array — and a **rough phase** at and above `p²`, where
composite multipliers such as `p²`, `p·p'`, `p'²` appear. In particular `min Θ_p = p²` always, not merely typically, and
the rough phase only matters for primes with `p³ ≤ N`, i.e. `p ≤ N^{1/3}`.

> **Claim O3 (multiplier count).** The number of elements of `Θ_p` below `X` is `Φ(X/p, p) − 1`, where `Φ(x,y)` counts
> `y`-rough integers `≤ x`; asymptotically `≈ ω(u)·X/(p log p)` with Buchstab `ω`. Summing over `p ≤ √X` must recover
> `X − π(X) − 1`.
>
> _Status: not formalised — a cost estimate, not a structural claim._

### 2.3 The primitive, and why it is the whole problem

Define `NextRough(p, y) = min{ a p-rough : a > y }`. Then the only primitive the generator needs is

```
NextOwnedComposite(p, x) = p · NextRough(p, max(p−1, ⌊x/p⌋)) .
```

There is no other formula to find: _the generator is a merge of wheel successor functions._ Everything interesting is
the cost of that successor.

> **Claim C1 (causality).** Suppose all primes `< n` are known, the scan is at `n`, and `n = pa ∈ Θ_p`. Then
> `a ≤ n/2`, and the next multiplier `a' = NextRough(p, a)` satisfies `a' < n`; `a'` is determined by the
> multiplicative structure of integers `< n` only.
>
> _Status: **machine-checked** — `Primegen.causality` (existence of a `p`-rough `a' ∈ (a, p·a)`, via Mathlib's
> Bertrand) and `Primegen.mult_le_half`._

Claim C1 is what makes the whole design realisable as an _online stream_: no step ever requires knowledge of an integer
`≥ n`. The generator is self-hosting — its own output supplies every multiplier it will ever need, always strictly in
advance.

### 2.4 The unavoidable trade

Deciding `a ∈ A_p` is deciding `gcd(a, P_{<p}) = 1`, a function of `a mod P_{<p}` alone. Tabulating it costs
`Θ(P_{<p}) = e^{(1+o(1))p}` space; not tabulating it costs `Θ(π(p))` trial divisions. So:

> **Conjecture X1 (obstruction).** There is no algorithm computing `NextRough(p, y)` in O (1) time and
> `poly(log p, log y)` space given only the primes `< p`.
>
> Evidence: no known roughness oracle beats trial division, and by Jacobsthal-type lower bounds the gap to the next
> rough number can be `≫ p log p log log log p / (log log p)²`, so "scan and test" is superlinear in `p` in the worst
> case.

Conjecture X1 says a fixed-size table serves only finitely many primes. Past that boundary one must either **derive**
rough multipliers from other streams (exact — Algorithm A, §3) or **relax** the multiplier set to a fixed tabulated
wheel (inexact but bounded — Algorithm B, §4). These are the only two options, and they are the two algorithms.

### 2.5 The lattice reading: primes as holes

The same partition, viewed modulo the primorials, is a self-generating lattice. Let `P_k = p_1⋯p_k` and

```
S_k = { r mod P_k : gcd(r, P_k) = 1 }        (|S_k| = φ(P_k),  κ_k = φ(P_k)/P_k ~ e^{−γ}/log p_k)
```

`S_k` is exactly the wheel of §4.2 at `W = P_k`. Its **holes** — elements `> 1` lifted to ℤ — begin with `p_{k+1}`:
the lattice names its own successor, which is Claim C1 seen from the outside.

> **Claim F1 (lattice recursion).** For every `k ≥ 0`, with `p = p_{k+1}` and all sets taken mod `P_{k+1} = p·P_k`,
>
> ```
> S_{k+1} = ( ⋃_{j=0}^{p−1} (S_k + j·P_k) ) \ p·S_k
> ```
>
> — tile the previous lattice `p` times, then delete one _dilated copy of it_. Counting:
> `pφ(P_k) − φ(P_k) = φ(P_{k+1})`.
>
> _Status: routine (CRT + counting); not yet formalised. Its algorithmic content **is** machine-checked: the deleted
> set is `Θ_p = p·A_p` read mod `P_{k+1}` — `Primegen.theta_eq_image`._
> Two consequences matter here.

1. **The stream decomposition and the fractal decomposition are the same theorem.** "Prime times a wheel" (§2.2) and
   "affine copy of the previous stage" (F1) are two readings of one identity.
2. **The construction is a Moran/IFS construction** with `p_{k+1} − 1` children per parent and contraction ratio
   `1/p_{k+1}` — but with a _non-constant, unbounded_ ratio sequence: zooming proceeds by primorials, i.e. doubly
   exponentially.

> **Claim F2 (dimension is the wrong invariant).** Rescaling stage `k` to `[0,1]` gives `φ(P_k)` intervals of length
> `1/P_k`. Lebesgue measure is `κ_k → 0`, so the limit set is null; but box dimension is
> `lim_k log φ(P_k)/log P_k = 1 + lim_k log κ_k / log P_k = 1`, since `log κ_k ~ −log log p_k` while `log P_k ~ p_k`.
>
> _Status: routine given Mertens + PNT; not formalised._
> So the object is measure-zero and dimension-one: "fractal" here means _hierarchical self-generation with affine
> deletion sets_, not _non-integer dimension_. The informative invariants are the deletion ratios `1/p_k`, the density
> `κ_k`, and the Buchstab oscillation `ω(u)` of Claim O3 — not a dimension estimate.
> The slogan "the holes are the next primes" is true in exactly one window, and that window is Claim O2 again:
> **Claim F3 (= O2, restated).** With `p = p_{k+1}`, every hole `h` of `S_k` with `p ≤ h < p²` is prime; holes `≥ p²`
> are only _candidates_ (`p²`, `p·p_{k+2}`, `p_{k+2}²`, …). Hence stage `k` certifies primes precisely on
> `[p_{k+1}, p_{k+1}²)`, and stage `k` closes the window `[p_k², p_{k+1}²)`.
>
> _Status: **machine-checked** — `Primegen.prime_of_rough_of_lt_sq`._
> The first failure is small and explicit: `121 = 11² ∈ S_4` and `121 < P_4 = 210`, so the mod-210 lattice already has a
> composite hole inside its first period. For `k ≤ 3` it does not (`P_k ≤ p_{k+1}²` iff `p_{k+1} ≤ 7`). Note also that
> the ratio changes at every stage: there is _no_ fixed `x ↦ λx` fixing the limit object, so claims of log-periodicity
> in
> prime statistics do not follow from F1 and must be measured, not asserted.
> Finally, Conjecture X1 has a one-line lattice statement: **stage `k` cannot be tabulated in `poly(k)` space**, because
> its period is `P_k = e^{(1+o(1))p_k}`. The lattice is cheap to _generate_ and expensive to _store_ — which is why the
> generator streams it instead of tabulating it. See `fractal.md` for the worked stages and the full discussion.

---

## 3. Algorithm A — the exact one-touch generator

Algorithm A is included because it realises the partition of §2.1 with zero redundancy, which makes it both the
theoretical reference point and a self-test for the whole framework.

### 3.1 Recursing on the multiplier

Instead of splitting off the _smallest_ prime factor, split off the largest. For `b ≥ 2` define

```
Σ_b = { b·q : q prime, q ≥ P(b) }        (P(b) = largest prime factor of b)
```

> **Claim A1 (stream tree).** `{Σ_b}_{b≥2}` partitions the composites; each `Σ_b` is increasing; its successor
> operation is "advance one index in the prime array".
>
> _Status: **machine-checked** — `AlgA.exists_unique_split` (`lean/Primegen/AlgorithmA.lean`): every composite is
> `b·q` with `b ≥ 2`, `q` prime, `P(b) ≤ q`, for exactly one pair. Disjointness is `AlgA.sigma_disjoint`. This
> uniqueness is the mathematical content of the `pops == composites` certificate of §3.4._

This is the same partition as §2.1 read from the other end: `Θ_p = p·{primes ≥ p} ⊎ ⨄_{p'≥p} p·Θ_{p'}`. The composite
bases `b` are precisely the delegates that supply the rough, composite multipliers that Conjecture X1 forbids us from
tabulating. The recursion replaces the roughness oracle entirely — no divisibility, no gcd, no marking.

### 3.2 Lazy creation

Creating one child base per emitted composite costs `Θ(N)` memory. Instead each stream carries two cursors: an **emit
cursor** producing `b·p_c`, and a **spawn cursor** creating the child base `b·p_s` at the moment the value `b·p_s²` is
reached. Since `p_s² > p_s`, spawn triggers always lie beyond the corresponding emission; and a spawn trigger _is_ the
first element of the new child stream, so the trigger event consumes a composite and no work is wasted.

### 3.3 Sketch

```
A(N):
  primes := [] ; Q := empty min-queue keyed by value ; n := 2
  while n <= N:
      if Q empty or min_key(Q) > n:
          emit n ; i := len(primes) ; primes.append(n)
          if n*n   <= N:  push EMIT (n*n,   n, i)
          if n*n*n <= N:  push SPAWN(n*n*n, n, i)
      else:
          (v, kind, b, k) := pop_min(Q)            # v = n, exactly one such record
          if kind = EMIT:
              push EMIT(b*primes[k+1], b, k+1)                if in range
          else:
              q := primes[k] ; child := b*q                   # new base, P(child) = q
              push EMIT (child*primes[k+1], child, k+1)       if in range
              push SPAWN(child*q*q,        child, k)          if in range
              push SPAWN(b*primes[k+1]^2,  b,     k+1)        if in range
      n := n + 1
```

No marking array, no divisibility test, no square root, no `while p*p <= n` loop. Every step is one multiplication and
one comparison.

### 3.4 Properties (claims)

> **Claim A2 (correctness).** `A(N)` emits precisely the primes `≤ N` in increasing order, and pops exactly one queue
> record per composite in `[4, N]`. _TODO: induction on `n` using Claim A1 for uniqueness of `(b,q)`._

> **Claim A3 (causality).** Every `primes[j]` accessed while processing `n` satisfies `primes[j] < n`. _Sketch: in the
> emit branch `p_k ≤ n/2` so `p_{k+1} < n` by Bertrand; in the spawn branch `p_k ≤ √(n/2)`. TODO._

The identity `pops == composites` is a machine-checkable certificate of exact orthogonality: it fails immediately if any
composite is claimed twice or missed. It is the reason to keep Algorithm A around.

### 3.5 Cost, and why it is not the production choice

- **Touches:** exactly `N − π(N) − 1` pops. Optimal.
- **Time:** `O(N log S(N))` with a binary heap; `O(N)` amortised with the bucket queue of §5.
- **Live streams:** `S(N) = π(√N) + #{ b ≥ 2 : b·P(b) ≤ N }`.

> **Conjecture A4.** `S(N) = N^{θ+o(1)}` with `θ ≈ 0.75`. A Dickman saddle-point estimate maximises near `β ≈ 0.6`;
> measure before trusting the exponent.

Sublinear, but decisively worse than `π(√N)` — that is the price of exactness under Conjecture X1. Worse, Algorithm A is
**not segment-parallel**: the set of live bases at an arbitrary `X` cannot be reconstructed in `o(X)` work, so a segment
cannot be started in isolation.

A wheeled variant (emit `p_1..p_w` directly, step over `W`-coprime candidates, build bases only from primes `> p_w`)
suppresses the smooth bases that dominate `S(N)` and reduces it by roughly an order of magnitude at `w = 6`.

> **Open.** Is the exponent of the wheeled variant driven below `1/2`? If so, Algorithm A becomes competitive on memory
> as well as touches.

---

## 4. Algorithm B — the wheeled streaming generator

This is the recommended construction.

### 4.1 Design

Fix `w` and `W = p_1⋯p_w` (e.g. `w=6`, `W=30030`, `κ_W = φ(W)/W = 0.1918`; or `w=7`, `W=510510`, `κ_W = 0.1795`).

1. **Candidates** `n` run over `W`-coprime integers only. The streams of `p_1..p_w` are _structurally absent_: their
   composites are never candidates. The wheel is not an optimisation bolted on; it is the first `w` streams materialised
   as a table.
2. **For `p > p_w`**, replace the exact multiplier set `A_p` by the tabulated relaxation
   `Ã_p = { a ≥ p : gcd(a, W) = 1 } ⊇ A_p`. Stream of `p` is `p·Ã_p`, head `p²`.
3. **Advancement** is `a += step[a % W]; v = p*a` — one gather, one multiply. Genuinely O (1) time, O (1) state per
   prime (`p` and `a`, two words).

The relaxation is the whole trick: instead of asking each prime for its _own_ wheel (primorial space), every prime
borrows the _same_ wheel. Streams then over-claim slightly — `p·a` may have a prime factor between `p_w` and `p` — so
they are no longer disjoint, and the consuming loop must drain _all_ records equal to `n`, not just one. That is the
entire cost, and §4.4 bounds it.

### 4.2 Wheel tables

```
spokes  = sorted { r ∈ [0,W) : gcd(r,W) = 1 }               # spokes[0] = 1
step[r] = (least spoke > r, wrapping to r' + W) − r          for r ∈ [0,W)
gte[r]  = (least spoke ≥ r, wrapping likewise) − r           for r ∈ [0,W)

next_coprime(x)    = x + step[x mod W]      # strictly greater
next_coprime_ge(x) = x + gte[x mod W]       # greater or equal — used for segment restart
```

Both tables are built in one backward pass over `[0,W)`. The first `W`-coprime integer `> 1` is `p_{w+1}`.

### 4.3 The generator

```
B():                                     # unbounded; no N anywhere
  emit p_1 ... p_w
  primes := []          # primes > p_w, in order
  Q      := empty       # records (value, p, a) keyed by value = p*a
  act    := 0           # index of next stream to activate
  n      := p_{w+1}
  loop forever:
      # deferred activation: a stream enters exactly when its head p² is reached
      while act < len(primes) and primes[act]^2 <= n:
          p := primes[act] ; act := act + 1
          push (p*p, p, p)

      if Q empty or min_key(Q) > n:
          emit n ; primes.append(n)
      else:
          while Q nonempty and min_key(Q) = n:      # ≥1 owner: duplicates expected
              (v, p, a) := pop_min(Q)
              a := next_coprime(a)
              push (p*a, p, a)

      n := next_coprime(n)
```

Deferred activation is what bounds the state: a prime contributes nothing below `p²`, so inserting its stream only at
`n = p²` keeps the queue at `π(√n)` records forever, with no global limit and no pre-pass.

### 4.4 Claims

> **Claim B1 (coverage).** If `m` is a `W`-coprime composite then `p = spf(m) > p_w`, `a = m/p` is `W`-coprime and
> `a ≥ p`; hence `m` is a value of the stream of `p`. _Status: **machine-checked** — `AlgB.coverage`
> (`lean/Primegen/AlgorithmB.lean`)._

> **Claim B2 (no early claims).** Every key in `Q` is `≥ n`, and every key is a `W`-coprime composite `≥ p²` for its
> owner. _Status: **machine-checked** as an invariant: the `ahead` field of `AlgB.Inv` is preserved by
> `AlgB.inv_step` (which also proves activation fires exactly at `n = p²`), and the head bound is
> `AlgB.sq_le_of_claims`._

> **Claim B3 (correctness).** `B()` emits exactly the primes, in increasing order, forever. _Sketch: by B2 the minimum
> key never precedes `n`; by B1 a composite candidate is claimed; all keys are composite so a prime candidate is not._
>
> _Status: the per-candidate decision is **machine-checked** — `AlgB.emit_iff`: under the queue invariant, `n` is
> prime iff no record's key equals `n`; with `AlgB.inv_init` (empty queue is valid at the start) and
> `AlgB.inv_step` (one turn of the loop preserves the invariant). The outer induction "the emitted prefix is exactly
> the primes below `n`" is not yet formalised; see `lean/README.md`._

> **Claim B4 (state).** Advancement performs no prime lookups at all; activation reads `primes[act]` with
> `primes[act] ≤ √n`. Algorithm B is a genuine online stream with O (1) state per prime.
>
> _Status: **structural in the formalisation** — `AlgB.Rec` carries exactly `(p, a)`, two words, and `AlgB.advance`
> is a function of the record alone (it takes no prime list); only `AlgB.activate` sees `primes`. The bound
> `primes[act] ≤ √n` is the activation condition `p*p ≤ n` in `AlgB.Inv.complete`._
> **Claim B5 (duplicate accounting).** For a `W`-coprime composite `m`, the set of streams that claim `m` is exactly
> `{ p prime : p ∣ m, p² ≤ m }`; the primes `≤ p_w` are excluded automatically. _Status: **machine-checked** —
> `AlgB.claims_iff` and `AlgB.mem_claimants`. This is the identity the `ln ln` estimate of §4.5 sums._

### 4.5 The honest cost: duplicate accounting

A `W`-coprime composite `m` is popped once for each prime factor `p | m` with `p_w < p ≤ √m` — that is `ω_{>p_w}(m)`
times. Total queue operations to `N`:

```
ops(N) = Σ_{p_w < p ≤ √N} #{ a W-coprime : p ≤ a ≤ N/p }
       ≈ κ_W · N · Σ_{p_w < p ≤ √N} 1/p
       = κ_W · N · ( ln ln √N − ln ln p_w + o(1) ) .
```

At `w = 6` (`p_w = 13`) and `N = 10¹²`: `κ_W = 0.1918`, `ln ln √N ≈ 3.32`, `ln ln 13 ≈ 0.94`, so `ops ≈ 0.46·N`, against
the one-touch ideal `κ_W·N − π(N) ≈ 0.19·N`. **≈2.4× more touches than Algorithm A, in exchange for
`π(√N) = 78 498` records instead of ~10⁹.** Raising `w` shrinks both `κ_W` and the `ln ln` span at the cost of a
`Θ(W)`-byte table; `w ∈ {6,7,8}` is the practical range.

The formula is worth reading twice, because it is where the design pays for Conjecture X1 and the payment is only a
`ln ln` factor. Exactness costs `N^{0.75}` memory; near-exactness costs `ln ln √N − ln ln p_w` touches. The second is
obviously the better bargain.

In the lattice language of §2.5 the accounting has a sharper description. Algorithm A
follows the recursion F1 to every stage: prime `p` deletes `p·S_{k(p)}`, the copies stay disjoint (they are indexed by
smallest prime factor), and each composite is touched once — at the cost of `N^{0.75}` live copies. **Algorithm B
truncates the refinement at depth `w` and then applies the depth-`w` template at every subsequent scale:** each
`p > p_w` deletes `p·S_w ⊇ p·S_{k(p)}`, an over-large copy, so the deleted sets overlap and `m` is claimed `ω_{>p_w}(m)` times — which is
exactly the claimant set of Claim B5. The factor `ln ln √N − ln ln p_w` _is_ the accumulated error of that truncation,
and the fact that it grows only like `ln ln` is the quantitative statement that the lattice refines very slowly. That is
Mertens, again, and it is the whole reason the trade is worth taking.

### 4.6 Cost summary

- **Time:** `O(ops(N) · log π(√N))` with a binary heap; `O(ops(N)) = O(κ_W N log log N)` with the bucket queue of §5.
- **Memory:** `π(√N)` records (16 bytes each suffices past `2⁶³`) + `2W` bytes of tables + one segment. At `N = 10¹⁸`:
  `π(10⁹) ≈ 5.08 × 10⁷` records.
- **Random-access restart.** For a segment beginning at `X`, the state of stream `p` is recomputed in O (1):

  ```
  a₀ = max( p, next_coprime_ge(⌈X/p⌉) ),   v = p·a₀ .
  ```

  Segments are therefore fully independent: Algorithm B parallelises exactly like a segmented sieve while keeping
  `π(√N)` state — a property Algorithm A lacks entirely.

---

## 5. Engineering layer

### 5.1 Bucket priority queue

The `log` factor is removable. Choose a segment length `Δ` (L1/L2-sized, e.g. `2¹⁸` candidates) and maintain, per future
segment index `s`, a list `bucket[s]` of stream records whose next value lies in segment `s`. To process segment `s`:

1. Drain `bucket[s]`: for each record, mark offset `v − X` in a `Δ`-bit segment array, advance the record while it stays
   inside the segment, then append it to `bucket[s']` for its new segment.
2. Walk the segment's `W`-coprime offsets; unmarked ⇒ prime.

All operations are O (1) amortised and sequential in memory. Cost: `+Δ/8` bytes for the mark array and one pointer per
bucket. This reintroduces a _segment-sized_ array — which is the point at which the "array-free" property becomes
"array-free in the range sense". If a strictly array-free generator is required, keep the binary heap and accept the
`log`.

### 5.2 Numeric hygiene

- Guard every product before computing it: test `p > limit / a`, never `p*a > limit`.
- Algorithm A's spawn keys are `b·p_s²`; test `b > limit / (p*p)` first.
- With `N ≤ 2⁶³` all keys fit in `uint64`; beyond that use 128-bit or the division form.

### 5.3 Vectorisation

The _advance_ step (`a += step[a % W]; v = p*a`) is a gather plus a multiply and vectorises across streams. The _merge_
does not vectorise as a heap, but does as bucket drains, which are independent scatter-writes into the segment bitmap.
That is the SIMD-friendly formulation; the heap form is not, and claims to the contrary should be benchmarked rather
than asserted.

---

## 6. Comparison

| method                       | touches / time                                                  | working memory  | array over range             | segment-parallel |
| ---------------------------- | --------------------------------------------------------------- | --------------- | ---------------------------- | ---------------- |
| trial-division extension     | `Θ(N π(√N))`                                                    | `O(π(√N))`      | no                           | yes              |
| Eratosthenes, segmented      | `O(N log log N)`                                                | `O(√N + Δ)`     | yes (segment)                | yes              |
| wheel sieve                  | `O(N / log log N)`                                              | `O(√N)`         | yes                          | partly           |
| priority-queue sieve (naive) | `O(N log N log log N)`                                          | `O(π(√N))`      | no                           | no               |
| **Algorithm A**              | `N − π(N)` touches (**optimal**), `×log S` or `O(1)` bucketed   | `S(N) ≈ N^0.75` | no                           | no               |
| **Algorithm B**              | `κ_W N (ln ln √N − ln ln p_w)`, `×log π(√N)` or `O(1)` bucketed | `O(π(√N) + W)`  | no (heap) / segment (bucket) | **yes**          |

Reading: Algorithm A is the only entry that touches each composite exactly once _and_ uses no range-proportional array.
Algorithm B keeps `π(√N)` memory and O (1) per-prime state at a small constant factor of redundant touches, and is the
only variant supporting independent segment restart. Neither is asymptotically better than a good segmented sieve; the
claim is structural — orthogonal, incremental, array-free, unbounded — not a new complexity class. Caveat on this table:
nothing in it is machine-checked, and nothing in it is intended to be. The rows are asymptotics about running times; the
formalisation of §9 covers the objects those asymptotics count (the partition, the streams, the invariant, the claimant
sets), which is where the contribution actually is. Treat the table as measurement, and measure before quoting it.

---

## 7. Open problems

1. **Conjecture X1.** No O (1)-time, polylog-space `NextRough`. This is the pivot of the whole design: it is what forces
   the A/B fork. A proof would settle the architecture; a disproof would give an exact O (1) generator with `π(√N)`
   memory and make both algorithms obsolete.
2. **Conjecture A4.** Sharp asymptotics for `S(N) = #{ b ≥ 2 : b·P(b) ≤ N }`, the memory of Algorithm A. Measure and fit
   before trusting `θ ≈ 0.75`.
3. **Wheeled A.** Same question with bases restricted to `p_{w+1}`-rough. Is the exponent below `1/2`?
4. **Hybrid.** Run Algorithm A's exact streams for `p ≤ N^{1/3}` — the only regime where composite rough multipliers
   occur — and Algorithm B's prime-phase index increment for `N^{1/3} < p ≤ √N`, where Claim O2 guarantees nothing else
   is needed. This should give one-touch behaviour with much smaller `S(N)`. The accounting is not yet done.
5. **Optimal `w`** as a function of `N` and cache size, trading `κ_W` and the `ln ln` span against the `Θ(W)` table.
6. **Formal band parallelism.** Formalise the segment decomposition of §4.6 and its synchronisation requirements.
7. **The outer induction.** Formalise "the list emitted by `B()` is exactly the primes below `n`". The per-candidate
   decision (`AlgB.emit_iff`) and invariant preservation (`AlgB.inv_step`, `AlgB.inv_init`) are done; wiring them into a
   loop invariant needs the self-hosting argument (every `p ≤ √n'` has already been emitted — Claim C1 plus Bertrand,
   both already available as `Primegen.causality`). This is the obvious next piece of work.
8. **The `φ(P_k) → π` transfer.** Sharp form of the transfer in the certified window `[p_{k+1}, p_{k+1}²)` of Claim F3 —
   i.e. Buchstab `ω` made effective. This is the same quantity as Claim O3 and the only place in the construction where
   genuinely non-trivial fluctuation lives.
9. **Log-periodicity, or not.** The Moran ratios `1/p_k` of Claim F1 are non-constant and unbounded, so no exact scaling
   symmetry survives. Does any _approximate_ log-periodicity show up in prime statistics at primorial scales, or is the
   apparent signal an artefact of binning? Easy to fool oneself here; measure.
10. **Moran vs. `S(N)`.** Does the affine-copy picture of §2.5 predict the empirical `S(N) ≈ N^{0.75}` of Conjecture
    A4 — i.e. is `#{b : b·P(b) ≤ N}` a Moran-counting quantity in disguise?

---

## 8. Summary

Ownership by smallest prime factor turns composite generation into a partition, and a partition into a merge of
independent streams. Each stream is a prime times a wheel. The wheel cannot be tabulated per prime — that is primorial —
so either the streams derive their multipliers from each other (exact, `N^{0.75}` streams, no parallelism) or they all
share one small wheel (bounded duplication, `π(√N)` streams, O (1) state, O (1) restart, exact parallelism).

The second is the generator: a min-queue of `π(√n)` records, advanced by a table lookup and a multiply, emitting primes
forever, with no array over the range, no division, and no limit. Seen from the outside it is one object: the wheel
lattices `S_k` refine by `S_{k+1} = (p tilings of S_k) \ p·S_k`, the deleted set is the stream `Θ_p = p·A_p`, holes are
primes exactly on `[p_{k+1}, p_{k+1}²)`, and Algorithm B is that recursion truncated at depth `w` — with the truncation
error paid, in full and only, as a `ln ln` duplicate factor. And the structural half of all of that is checked by a
kernel, not by a reader: see §9.
---

## 9. Formal companion (Lean 4 / Mathlib)

`lean/` contains a `sorry`-free Lean 4 + Mathlib formalisation of the structural claims — the part of this paper that is
mathematics rather than measurement. Build with `lake exe cache get && lake build` (toolchain
`leanprover/lean4:v4.15.0`, Mathlib pinned at the matching tag). Every entry in the table below is checked by the
kernel; `lean/README.md` carries the same table plus modelling notes.

### 9.1 Claim → theorem

| paper claim                       | Lean name                                                                   | file              |
| --------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| O1 ownership `Θ_p = p·A_p`        | `theta_eq_image`                                                            | `Ownership.lean`  |
| orthogonality (§2.1 partition)    | `theta_disjoint`, `exists_unique_owner`                                     | `Ownership.lean`  |
| O2 / F3 phase separation          | `prime_of_rough_of_lt_sq`                                                   | `Ownership.lean`  |
| `min Θ_p = p²`                    | `sq_mem_theta`, `sq_le_of_mem_theta`                                        | `Ownership.lean`  |
| C1 causality (no lookahead)       | `causality`, `mult_le_half`                                                 | `Ownership.lean`  |
| §4.2 wheel successor spec         | `Wheel.lt_nextCoprime`, `Wheel.coprime_nextCoprime`, `Wheel.nextCoprime_le` | `Wheel.lean`      |
| A1 stream tree / one-touch        | `AlgA.exists_unique_split`, `AlgA.sigma_disjoint`                           | `AlgorithmA.lean` |
| B1 coverage                       | `AlgB.coverage`                                                             | `AlgorithmB.lean` |
| B3 soundness (keys are composite) | `AlgB.not_prime_of_claims`                                                  | `AlgorithmB.lean` |
| B2 no early claims, `≥ p²` heads  | `AlgB.Inv.ahead` (preserved by `AlgB.inv_step`), `AlgB.sq_le_of_claims`     | `AlgorithmB.lean` |
| B3 decision rule (kernel)         | `AlgB.emit_iff`, `AlgB.prime_iff_forall_not_claims`                         | `AlgorithmB.lean` |
| deferred activation is complete   | `AlgB.inv_step` (`complete` field), `AlgB.inv_init`                         | `AlgorithmB.lean` |
| B4 state is `(p, a)`              | `AlgB.Rec`, `AlgB.advance` (structural: no prime list in scope)             | `AlgorithmB.lean` |
| B5 duplicate accounting §4.5      | `AlgB.claims_iff`, `AlgB.mem_claimants`                                     | `AlgorithmB.lean` |

Two of these are the paper's structural content and the rest is scaffolding:

- `AlgA.exists_unique_split` is the `pops == composites` certificate of §3.4 in mathematical form — _exactly one_
  pair `(b, q)` per composite, which is Claim A1 and, mod `P_{k+1}`, Claim F1's disjointness.
- `AlgB.claims_iff` says the claimant set of a `W`-coprime composite `m` is precisely `{p prime : p ∣ m, p² ≤ m}`. Every
  duplicate the wheeled relaxation pays for is accounted there; §4.5's `κ_W·N·(ln ln √N − ln ln p_w)` is the sum of
  these cardinalities, and `Impl.dupStats` `#eval`s it at small scale.

`Impl.lean` runs the same `activate` / `advance` that the proofs are about, with `W = 30`, so the executable model and
the verified step are literally the same definitions.

### 9.2 What is deliberately _not_ proved

- **Conjecture X1** (no O (1)-time, polylog-space `NextRough`) and **Conjecture A4** (`S(N) = N^{θ+o(1)}`) — open, and
  out of scope for a formalisation.
- All cost statements: `ops(N)`, `O(N log log N)`, `S(N)`, the comparison table of §6. These are asymptotics about
  running times, not statements about the objects defined here.
- The **outer induction** for Algorithm B ("the emitted list equals the primes below `n`"): the per-candidate decision
  and the invariant preservation are proved, wiring them into a loop invariant is Open Problem 7.
- Algorithm A's queue mechanics (§3.3), the bucket priority queue (§5.1) and segment restart (§4.6). Restart is a
  one-line consequence of `Wheel.nextCoprime_le` plus `AlgB.Inv.minimal`, but the segmented driver is unformalised.
- The lattice recursion F1 and dimension F2 of §2.5 (routine, but not yet written out); their algorithmic content is
  covered by `theta_eq_image` and `prime_of_rough_of_lt_sq`.

### 9.3 Modelling notes

- `Rough p m` is stated in the bounded form `∀ q < p, prime q → ¬ q ∣ m`, which is decidable and equivalent
  (`rough_iff`) to "every prime factor is `≥ p`".
- `Wheel.nextCoprime` is the _specification_ of §4.2's `step` table (least `W`-coprime integer `> x`), proved total via
  `exists_coprime_gt` — the wheel never stalls because the class `1 mod W` is always coprime to `W`. The table-driven
  implementation of §4.2 is a refinement of this spec.
- Names track Mathlib at the pinned toolchain; the bridging lemmas (`minFac_mul_self_le`, `Wheel.coprime_mul_add_one`)
  were proved from first principles precisely to keep the API surface small.

The formalisation is therefore a check on the _structure_ — the partition, the relaxation, the invariant — which is
exactly what §6 says the contribution is, and exactly what §2.5 says the fractal reading is a picture of.
