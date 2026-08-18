# Generational Rings of Primes: An Orthogonal Composite Stream Sieve

**Document map.** `paper.md` is the primary specification; `algorithm.md` is the full normative construction with proofs
and a reference implementation; `observation.md` works the per-prime multiplier sets; `idea.md` is the spectral/entropy
reading; `fractal.md` is the lattice reading; `theory.md` inventories every statement with its status. This document is
the architectural narrative: why the object is what it is, and what the consuming loop looks like.

## Abstract

This paper describes a structurally clean prime-generation architecture. Primes are the exception points of an expanding
periodic lattice. Each prime emits a periodic field of composites, orthogonalized against all smaller primes: prime
\(p\) owns exactly those composites whose smallest prime factor is \(p\). Prime generation then reduces to a single
sorted merge of pairwise disjoint composite streams — no marking array over the range, no trial division, no deep
conditional branching.

The per-prime advance primitive is not an unknown quantity. It is exactly a wheel successor:

\[ \text{NextOwnedComposite} (p, x) \;=\; p \cdot \text{NextRough}\!\big (p,\ \max (p-1, \lfloor x/p \rfloor)\big). \]

What is *not* available is an implementation that is simultaneously exact, O (1) in time and O (1) in state per prime:
the exact wheel of \(p\) has period \(P_{<p} = e^{ (1+o (1))p}\). The architecture therefore has two realisations — an
exact one that derives its rough multipliers from other streams (Algorithm A of `paper.md` §3), and a wheeled one that
shares a single small wheel across all primes and pays a bounded, measured amount of duplicate work (Algorithm B,
`paper.md` §4). We formalize the generational-ring model, derive the primitive, present the consuming merge, prove it
correct, and state its true costs.

---

## 1. Introduction

A classical observation about primes is that every composite number up to \(N^2\) has a prime factor at most \(N\).
Therefore, if all primes up to \(N\) are known, those primes form a complete divisor basis for the entire band up to
\(N^2\).

From that fact, one can already describe a layered prime engine: sieve to \(N\), then extend the search to \(N^2\) using
only the existing primes. The structure is correct, but naive application leads to trial division by \(\pi (N)\) primes
for roughly \(N^2\) candidates. That is not asymptotically attractive for bulk generation.

This paper is not about that naive extension. It is about a different representation: instead of testing candidates, we
assign every composite to exactly one prime stream and then merge those streams. If the streams are orthogonal — meaning
a composite is claimed only by its smallest prime factor — then the next prime is simply the next integer not claimed by
any stream.

---

## 2. Generational Rings of Primes

### 2.1 The Basic Structural Fact

**Lemma 1.** Let \(m\) be composite with \(2 \le m \le N^2\). Then \(m\) has a prime factor \(p \le N\).

**Proof.** Write \(m = ab\) with \(1 < a \le b\). Then

\[ a^2 \le ab = m \le N^2, \]

so \(a \le N\). The smallest prime factor of \(m\) is at most \(a\), hence at most \(N\). \(\square\)

This lemma means that the primes up to \(N\) are a complete divisor basis for all numbers up to \(N^2\).

### 2.2 Periodic Fields

Each prime \(p\) can be thought of as emitting a periodic field of nonprimes: the multiples of \(p\), with period \(p\).
Smaller primes define earlier periodic fields. The combined periodic structure of primes \(p_1, p_2, \dots, p_k\) has
period

\[ \mathrm{lcm} (p_1, p_2, \dots, p_k) \;=\; P_k \;=\; \prod_{i=1}^{k} p_i , \]

because the primes are distinct. The next prime is the smallest integer \(>1\) not eliminated by this combined periodic
structure. Once it appears, it emits its own periodic field, and the ring expands.

### 2.3 Generational Structure

Two distinct recursions are available here, and they should not be conflated: one indexes generations by **squares**,
the other by **primorials**. They agree on content and differ in bookkeeping.

**Band recursion (square-root bands).** By Lemma 1, the primes \(\le N\) certify every integer up to \(N^2\). Seeded
with \(2\) and \(3\), stage \(p\) closes the window \([p^2, p'^2)\) where \(p'\) is the next prime:

- \(\{2\}\): window \([4, 9)\) → \(5, 7\)
- \(\{3\}\): window \([9, 25)\) → \(11, 13, 17, 19, 23\)
- \(\{5\}\): window \([25, 49)\) → \(29, 31, 37, 41, 43, 47\)
- and so on.

**Lattice recursion (primorial stages).** Alternatively, work modulo the primorials. Let \(S_k = \{ r \bmod P_k : \gcd
(r, P_k) = 1\}\); then

\[ S_{k+1} \;=\; \Big (\bigcup_{j=0}^{p-1} (S_k + jP_k)\Big) \setminus p\cdot S_k , \qquad p = p_{k+1}, \]

i.e. tile the previous lattice \(p\) times and delete one **dilated copy of it**. The deleted set is precisely the
stream of \(p\) (§2.4), the smallest hole \(>1\) of stage \(k\) is \(p_{k+1}\), and \(|S_{k+1}| = \varphi (P_{k+1})\).
See `fractal.md` for the worked stages.

Both recursions certify primality on the same window: the holes of stage \(k\) are prime exactly on \([p_{k+1}, p_
{k+1}^2)\), and are merely candidates above it. This is not a structural coincidence; it is §3.3 below, read twice.

Either way, each new prime is a break in the current periodic structure and simultaneously becomes a new generator that
extends it.

### 2.4 Orthogonal Streams

We adopt the following ownership convention:

> A composite number \(m\) is **owned** by the prime \(p\) if \(p\) is the smallest prime factor of \(m\).

Every composite has exactly one owner. Therefore, if we build one stream per prime, and the stream of \(p\) contains
exactly the composites owned by \(p\), then the streams are disjoint and together cover all composite numbers. A prime
never re-emits a composite already claimed by a smaller prime.

Explicitly (see `observation.md`, `algorithm.md` Theorem 2.1):

\[ \Theta_p \;=\; p \cdot A_p, \qquad A_p = \{\, a \ge p : \gcd (a, P_{<p}) = 1 \,\} , \]

the \(p\)- **rough** numbers from \(p\) up. A stream is *a prime times a wheel*.

---

## 3. The Pointer Primitive, Derived

### 3.1 Definition

For a prime \(p\) and an integer \(x\), let

\[ \text{NextOwnedComposite} (p, x) \;=\; \min\{\, m \in \Theta_p : m > x \,\} \]

be the next composite in the orthogonal stream of \(p\) strictly after \(x\).

### 3.2 It is exactly a wheel successor

Let \(\text{NextRough} (p, y)\) be the least \(p\)-rough integer \(> y\). Then

\[ \text{NextOwnedComposite} (p, x) \;=\; p \cdot \text{NextRough}\!\big (p,\ \max (p-1,\ \lfloor x/p \rfloor)\big). \]

_Proof._ The owned composites are \(pa\) with \(a \in A_p\), and \(pa > x \iff a > \lfloor x/p \rfloor\); intersecting
with \(a \ge p\) gives the \(\max\); \(a \mapsto pa\) is monotone. \(\square\)

**Corollary.** \(\min \Theta_p = p^2\) — always, not "typically", since the least multiplier is \(p\) itself.

So there is no additional formula to find: the generator is a merge of wheel successor functions, and every cost
question is a question about that successor.

### 3.3 Phase separation

If \(a \in A_p\) and \(a < p^2\), then \(a\) is prime (a composite \(p\)-rough number has at least two prime factors
\(\ge p\)). Hence the multipliers of \(p\) split into

- a **prime phase** \([p, p^2)\), where advancing the stream is a single index increment into the already-known prime
  array — genuinely O (1), no arithmetic; and
- a **rough phase** \([p^2, \infty)\), where composite multipliers such as \(p^2\), \(p p'\), \(p'^2\) appear.

Since a composite multiplier forces the emitted value \(\ge p^3\), the rough phase is only ever reached below a bound
\(N\) by primes with \(p \le N^{1/3}\).

### 3.4 Causality

Suppose all primes \(< n\) are known, the scan is at \(n\), and \(n = pa \in \Theta_p\). Then \(a = n/p \le n/2\), and
the next multiplier \(a' = \text{NextRough} (p,a)\) is at most the next prime after \(a\), hence \(a' < 2a \le n\) by
Bertrand. So no step ever requires knowledge of an integer \(\ge n\): the generator is self-hosting, and its own output
supplies every multiplier it will ever need, strictly in advance.

### 3.5 The cost of the primitive, and the resulting fork

Deciding \(a \in A_p\) is deciding \(\gcd (a, P_{<p}) = 1\), a function of \(a \bmod P_{<p}\) alone.

- **Tabulate it.** With the sorted totative list of \(P_{<p}\) precomputed, the advance is an index increment plus a
  cycle counter: exact, orthogonal, O (1) time. But the table has \(\varphi (P_{<p}) = e^{ (1+o (1))p}\) entries — past
  \(p \approx 29\) it exceeds \(10^9\). So this is O (1) time but *not* O (1) state.
- **Don't tabulate it.** Then testing roughness is trial division by the \(\pi (p)-1\) primes below \(p\), which is
  \(\Theta (\pi (p))\), not O (1); and by Jacobsthal-type bounds the gap to the next rough number can be \(\gg p \log p
  \log\log\log p / (\log\log p)^2\), so "scan and test" is superlinear in \(p\) in the worst case.

We therefore state as a conjecture (`paper.md` Conjecture X1, `theory.md` T31) that no algorithm computes
\(\text{NextRough} (p,y)\) in O (1) time and \(\mathrm{poly} (\log p, \log y)\) space given only the primes \(< p\).
Past a fixed table boundary, one of two things must happen:

- **Algorithm A** *derives* the rough multipliers from other streams. Exact: every composite is touched exactly once —
  the information-theoretic optimum — but the number of simultaneously live streams grows like \(N^{\theta}\), \(\theta
  \approx 0.75\), and segments cannot be started in isolation.
- **Algorithm B** *relaxes* the multiplier set to a single fixed wheel \(W = p_1\cdots p_w\) shared by every prime \(p >
  p_w\): \(\tilde A_p = \{a \ge p : \gcd (a,W) = 1\} \supseteq A_p\). The advance becomes
  `a += step[a % W]; v = p*a` — one gather, one multiply: genuinely O (1) time with O (1) state (two words per prime),
  \(\pi (\sqrt N)\) records, unbounded operation, and O (1) random-access restart. The price is that streams now
  over-claim slightly, so each surviving composite is claimed \(\omega_{>p_w} (m)\) times (empirically ≈ 2–2.5)
  rather than once.

Algorithm B is the recommended realisation. Algorithm A is retained as the mathematically pure reference, because its
one-touch property is a machine-checkable certificate of the underlying partition. Full statements, proofs and a
reference implementation are in `algorithm.md`; the specification is `paper.md` §3–§4.

---

## 4. The Consuming Algorithm

### 4.1 Data Structures

The algorithm maintains:

- \(P\): the primes discovered so far, in order;
- \(H\): a min-priority queue of records \( (c_p, p, \cdot)\) keyed by \(c_p\), the next composite claimed by \(p\);
- \(n\): the current candidate integer;
- an activation cursor, because a prime is inserted into \(H\) only when the scan reaches \(p^2\).

**Deferred activation** is what bounds the state. A prime contributes nothing below \(p^2\) (§3.2), so inserting its
stream at \(n = p^2\) — never earlier — keeps the queue at \(\pi (\sqrt n)\) records forever, with no global limit and
no pre-pass.

### 4.2 Algorithm Description

```
H   := empty min-heap
P   := empty list
act := 0            # activation cursor into P
n   := 2

while generating primes:
    while act < len(P) and P[act]^2 <= n:            # deferred activation
        p := P[act] ; act := act + 1
        insert (p*p, p) into H                       # min of the stream of p

    if H is empty or n < min_key(H):
        emit n as prime ; append n to P
    else:
        // by the invariant, n == min_key(H)
        drain(H, n)
    n := next_candidate(n)
```

The two realisations differ in exactly two lines:

- **Exact streams (Algorithm A).** `next_candidate(n) = n + 1`, and `drain` pops a **single** record with key \(n\) —
  key uniqueness is guaranteed by orthogonality (§2.4), so no composite is ever claimed twice.
- **Shared wheel (Algorithm B).** `next_candidate(n)` steps over \(W\)-coprime integers only (so the streams of
  \(p_1..p_w\) are structurally absent), and `drain` must be a `while min_key(H) == n` loop, because the relaxed
  multiplier sets over-claim and several streams may present the same key.

In both cases the composite branch advances each popped record with the primitive of §3.2 and reinserts it.

### 4.3 Worked Beginning

With exact streams and deferred activation:

- \(n=2\): heap empty ⇒ prime.
- \(n=3\): heap empty ⇒ prime.
- \(n=4\): activate \(2\) with head \(4\); \(\min H = 4 = n\) ⇒ composite; advance \(2\) to \(6\).
- \(n=5\): \(\min H = 6 > 5\) ⇒ prime.
- \(n=6\): consume; advance \(2\) to \(8\).
- \(n=7\): \(\min H = 8 > 7\) ⇒ prime.
- \(n=8\): consume; advance \(2\) to \(10\).
- \(n=9\): activate \(3\) with head \(9\); consume; advance \(3\) to \(15\) (next \(3\)-rough multiplier after \(3\) is
  \(5\)).
- \(n=10\): consume; advance \(2\) to \(12\).

Note that \(5\) was inserted only at \(n = 25\), and that \(3\) skips \(12\) entirely: \(12\) is owned by \(2\). There
is no divisibility testing, no array marking, and no branching over candidate factors.

### 4.4 Correctness

**Theorem 1.** The consuming algorithm emits all primes in increasing order; under exact streams every composite is
removed exactly once, by its smallest prime factor.

**Proof sketch.** We maintain the invariant:

> After processing all integers less than \(n\), the heap contains, for every prime \(p\) with \(p^2 \le n\),
> exactly the least element of \(\Theta_p\) that is \(\ge n\); and no key is \(< n\).

Activation is timely: the head of \(p\)'s stream is \(p^2\), and \(p\) is emitted at \(n = p < p^2\), so the activation
test fires exactly at \(n = p^2\), never later.

- If \(n\) is prime, no prime \(< n\) owns \(n\), so no key equals \(n\); since keys are never \(< n\), we have \(n <
  \min H\) and \(n\) is emitted.
- If \(n\) is composite, let \(p^\ast = \operatorname{spf} (n)\). Then \(p^\ast \le \sqrt n\), so \(p^\ast\) is active;
  all composites \(< n\) have been processed, so its next owned composite is exactly \(n\), giving \(\min H = n\).

Uniqueness of the owner gives "exactly once" for exact streams. Under the shared-wheel relaxation the same argument
gives correctness, with "exactly once" replaced by "at least once, and \(\omega_{>p_w} (n)\) times in total" — which is
why the composite branch drains all equal keys. \(\square\)

Machine-checked forms of the load-bearing steps (ownership, phase separation, causality, coverage, the queue invariant,
the claimant set) are catalogued in `paper.md` §9.

### 4.5 Complexity

Let \(N\) be the current search limit.

- **Events.** Exact streams: exactly \(N - \pi (N) - 1\) pops, one per composite — optimal. Shared wheel:
  \[ \mathrm{ops} (N) \;\approx\; \kappa_W\, N\,\big (\ln\ln\sqrt N - \ln\ln p_w\big), \qquad \kappa_W = \varphi (W)
  /W, \] e.g. \(\approx 0.46\,N\) at \(w=6\), \(N=10^{12}\), against the one-touch ideal \(\approx 0.19\,N\) — a factor
  \(\approx 2.4\).
- **Heap size.** \(\pi (\sqrt n)\) by deferred activation (§4.1) — never \(\pi (n)\), since only primes \(\le \sqrt N\)
  ever own a composite \(\le N\).
- **Time.** \(O (\text{events} \cdot \log \pi (\sqrt N)) = O (N \log\log N)\) with a binary heap; \(O (\text{events})\)
  amortised with a bucket priority queue (`paper.md` §5.1), which reintroduces a *segment*-sized array but no array
  proportional to \(N\).
- **Memory.** \(O (\pi (\sqrt N))\) records, plus \(O (W)\) bytes of wheel table for the shared-wheel realisation. For
  exact streams the live-stream count is larger, \(S (N) \approx N^{0.75}\); that is the price of exactness.

This is a substantial structural improvement in memory and control flow. It is not a new complexity class: a good
segmented sieve is also \(O (N \log\log N)\).

---

## 5. Why This Is Interesting

### 5.1 Comparison with Classical Sieves

- **Eratosthenes:** requires a marking array proportional to the search range; orthogonalization is implicit, not
  per-prime.
- **Atkin:** uses quadratic forms and heavy branching; conceptually opaque.
- **Wheel sieves:** precompute residue tables; orthogonalization is global rather than per-prime.
- **Priority-queue multiple tracking** (O'Neill's "genuine sieve"): tracks multiples per prime, but the streams are not
  pre-orthogonalized, so up to \(\omega (n)\) entries collide at \(n\) and many generated multiples are discarded.

The architecture here differs in that each prime is a pure generator of its orthogonal composite stream. Under exact
streams, **at most one heap entry equals any given value** — the distinguishing property, and the one the shared wheel
trades away for O (1) state, in a bounded and computable amount.

### 5.2 Control Flow and Vectorisation

The merge *decision* is a single comparison: if the candidate is below the next claimed composite it is prime, otherwise
it is that composite. There are no chains of conditional logic, no residue tests, and no
"try every prime up to \(\sqrt n\)" loop.

A heap sift, however, is data-dependent and branch-heavy, so the branchless/SIMD story applies to the *bucketed*
form: the advance step `a += step[a % W]; v = p*a` is a gather plus a multiply and vectorises across streams, and bucket
drains are independent scatter-writes into a segment bitmap. This is an engineering claim to be benchmarked, not a
theorem.

### 5.3 Generational Ring Clarity

The algorithm does not merely generate primes; it exhibits the generational ring structure. Each new prime appears as an
unclaimed gap in the expanding periodic lattice and immediately begins emitting a new orthogonal field:

- primes are the exception points of an expanding periodic lattice;
- each exception becomes a generator of the next periodic structure;
- the deleted set at each stage is an affine copy of the previous stage (`fractal.md`).

### 5.4 Limitations

The exact realisation costs \(N^{0.75}\) live streams and does not support independent segment restart. The wheeled
realisation costs a \(\ln\ln\) factor of duplicate touches and a \(\Theta (W)\) table. Neither beats a highly optimized
segmented sieve on raw single-core throughput. The value is architectural: orthogonal, incremental, array-free in the
range sense, unbounded, and — for the wheeled form — exactly segment-parallel.

---

## 6. Conclusion

We have described a prime-generation architecture based on generational rings and orthogonal composite streams. The
per-prime pointer rule is not a missing piece: it is exactly \(p \cdot \text{NextRough} (p,\cdot)\), a wheel successor.
What the mathematics dictates is the trade: exactness costs streams, O (1) state costs a bounded number of duplicate
touches, and there is no third option unless Conjecture X1 fails.

The recommended generator is therefore the wheeled one: a min-queue of \(\pi (\sqrt n)\) records, advanced by one table
lookup and one multiply, emitting primes forever, with no array over the range, no division, and no limit. See
`paper.md` for the specification and `algorithm.md` for the construction, proofs and reference implementation.