# Theory Inventory for the Orthogonal Sieve / Generational Ring Prime Generator

## 0. Purpose and Reading Guide

**Document map.** `paper.md` is the primary specification; `algorithm.md` is the full construction with proofs and a
reference implementation; `generator.md` is the architectural narrative; `observation.md` works the per-prime multiplier
sets; `idea.md` is the spectral/entropy reading; `fractal.md` is the lattice reading. This document is the index: every
statement those documents introduce, assume, or depend upon, with a status and a dependency list.

This document enumerates _every_ mathematical statement that the architecture in
`paper.md`, `algorithm.md`, `generator.md`, `observation.md`, `idea.md`, and `fractal.md` either **introduces**,
**assumes**, or **depends upon**. Each item is stated as precisely as possible, given a stable identifier (`T1`,
`T2`, …), a status tag, a dependency list, and a note on whether a proof is known, trivial, classical, missing, or open.

No proofs are given here beyond one-line sketches. The goal is a complete map of the logical surface area, so that later
work can attack the genuinely open pieces without re-deriving the trivial ones.

### Status legend

| Tag   | Meaning                                                                       |
| ----- | ----------------------------------------------------------------------------- |
| `[T]` | Trivial. One-line proof, included inline.                                     |
| `[C]` | Classical. Standard result in number theory; citation given, no proof needed. |
| `[K]` | Known in the algorithms literature (prior art). Must be cited; not novel.     |
| `[N]` | New framing / definitional. Not a theorem so much as a chosen structure.      |
| `[P]` | Provable but not yet proved here. Expected to be routine.                     |
| `[?]` | Open, conjectural, or unproven assumption that the architecture _rests on_.   |

---

## Part I — Foundational Arithmetic

These are the load-bearing classical facts. Nothing here is novel; they are listed because the correctness argument
silently uses all of them.

### T1. Unique factorization `[C]`

Every integer \(n > 1\) has a unique multiset of prime factors.

_Needed for:_ the notion of "the smallest prime factor" (`spf`) to be well defined, which is the entire basis of the
ownership convention (T10). _Proof:_ Fundamental Theorem of Arithmetic (Euclid IX.14 / Gauss).

### T2. Square-root divisor bound `[T]`

If \(m\) is composite and \(2 \le m \le N^2\), then \(m\) has a prime factor \(p \le N\).

_Proof:_ write \(m = ab\), \(1 < a \le b\); then \(a^2 \le m \le N^2\) so \(a \le N\), and \(\mathrm{spf} (m) \le a\).
This is Lemma 1 of `generator.md`, and its proof there is correct and complete. _Consequence:_ the primes \(\le N\) form
a complete divisor basis for \([2, N^2]\). This is what licenses the "generational ring" band structure (T13).

### T3. Infinitude of primes `[C]`

There are infinitely many primes (Euclid). _Needed for:_ the generator is an infinite stream; also guarantees the heap
is never starved and that the "next survivor" step of T13 always terminates.

### T4. Chinese Remainder Theorem `[C]`

For distinct primes \(p_1,\dots,p_k\) with \(L_k = \prod p_i\), \(\mathbb{Z}/L_k\mathbb{Z} \cong \prod_i
\mathbb{Z}/p_i\mathbb{Z}\). _Needed for:_ periodicity of the sieve (T14), independence of exclusion coordinates,
multiplicativity of density (T48), additivity of entropy (T49), and the dual/spectral factorization (T52).

### T5. Primorial growth `[C]`

\(P_k = \prod_{i \le k} p_i = e^{\theta (p_k)} = e^{ (1+o (1))p_k}\) by Chebyshev/PNT.

_Consequence (critical):_ any construction whose storage or period is \(P_k\) is infeasible past \(p_k \approx
40\text{–}60\). This is the single hardest constraint on the whole architecture (see T29, T31).

### T6. Totient of a primorial `[T]`

\(\varphi (P_k) = \prod_{i\le k} (p_i - 1)\), and \(\varphi (P_k)/P_k = \prod_{i \le k} (1 - 1/p_i)\).

### T7. Mertens' third theorem `[C]`

\(\prod_{p \le y} (1 - 1/p) \sim e^{-\gamma}/\log y\). _Consequence:_ the wheel modulo \(P_k\) has \(\varphi (P_k)
\approx e^{-\gamma}P_k/\log p_k\) spokes — i.e. the wheel thins only _logarithmically_ while its period grows
_exponentially_. Diminishing returns are quantitative, not vague.

### T8. Rough numbers and the Buchstab function `[C]`

Call \(m\) **\(p\)-rough** if every prime factor of \(m\) is \(\ge p\). Let \(\Phi (x,y)\) count \(y\)-rough numbers
\(\le x\); then \(\Phi (x,y) \sim \omega (u)\,x/\log y\) with \(u = \log x/\log y\), \(\omega\) the Buchstab function.
_Needed for:_ counting how many multipliers each prime stream actually emits inside a band, hence the true work
distribution across streams (T44).

### T9. Jacobsthal's function `[C]`

\(g (n)\) = maximal gap between consecutive integers coprime to \(n\). For primorials, \(g (P_k) \ll \log^2 P_k \asymp
p_k^2\) (Iwaniec), and \(g (P_k) \gg p_k \log p_k \log\log\log p_k/ (\log\log p_k)^2\)
(Ford–Green–Konyagin–Maynard–Tao). _Needed for:_ the worst-case cost of "scan forward to the next rough number", which
is the naive implementation of the pointer primitive (T30). Jacobsthal bounds say this naive scan is _not_ O (1) in the
worst case.

---

## Part II — Ownership, Orthogonality, and the Stream Decomposition

This is the structural core of `generator.md`.

### T10. Ownership convention `[N]`

A composite \(m\) is **owned** by \(p = \mathrm{spf} (m)\). _Status:_ definitional. Well-posed by T1.

### T11. Ownership partitions the composites `[T]`

The sets \(\Theta_p = \{m \text{ composite} : \mathrm{spf} (m) = p\}\) are pairwise disjoint and \(\bigcup_p \Theta_p\)
is exactly the set of composites. _Proof:_ immediate from T1 — every composite has exactly one smallest prime factor.
_This is the "orthogonality" of the architecture._ Everything else in `generator.md`
is a consequence of this one-line fact plus a merge.

### T12. Structure of an owned stream `[T]`

\(\Theta_p = \{\,p\cdot m \;:\; m \ge p,\; m \text{ is } p\text{-rough}\,\}\).

_Proof:_ \(\mathrm{spf} (pm) = p\) iff no prime \(< p\) divides \(m\) (i.e. \(m\) is \(p\)-rough) and \(m > 1\); and a
\(p\)-rough \(m>1\) satisfies \(m \ge p\). _Corollary (T12a) `[T]`:_ \(\min \Theta_p = p^2\). This justifies the claim
in
`generator.md` §3 that "the first owned composite is typically \(p^2\)" — it is not
"typically", it is **always**.

### T13. Generational ring / band expansion `[N]`+`[T]`

If all primes \(\le N\) are known, then the primes in \( (N, N^2]\) are exactly the integers in that range not covered
by \(\bigcup_{p \le N}\Theta_p\). _Proof:_ T2 + T11. _Status:_ correct, classical in substance, novel only in
presentation. There are two distinct recursions here — the **band** recursion indexed by squares (stage \(p\) closes \([
p^2, p'^2)\)) and the **lattice** recursion indexed by primorials (T14, `fractal.md`) — and
`generator.md` §2.3 now states them separately. They certify primality on the same window, \([p_{k+1}, p_{k+1}^2)\)
(T17/T19), but index it differently.

### T14. Exact periodicity of the partial sieve `[C]`

\(S_k (n) = \prod_{i \le k} M_{p_i} (n)\) is exactly periodic with period \(L_k = P_k\), and \(\#\{n \in [1,P_k] : S_k
(n) = 1\} = \varphi (P_k)\). _Proof:_ CRT (T4) + T6. This is the wheel.

### T15. Newly-killed residue classes `[T]`

The set of residues killed for the first time by \(p_k\), inside one period \(P_k\), is \[ C_k = \{\, p_k \cdot t \;:\;
t \in [1, P_{k-1}],\ \gcd (t, P_{k-1}) = 1 \,\}, \qquad |C_k| = \varphi (P_{k-1}). \] _Proof:_ \(n \equiv 0 \bmod p_k\)
means \(n = p_k t\); \(n\) survives all smaller primes iff \(t\) does; and \(t\) ranges over a full residue system mod
\(P_{k-1}\). **This is precisely the object that `observation.md` is trying to describe.**

### T16. Each newly-killed class contains exactly one prime, in total `[T]`

Within \(\bigcup_{j\ge 0} (C_k + jP_k)\), the only non-composite element is \(p_k\) itself (the representative \(t =
1\), \(j = 0\)). _Proof:_ every other element is \(p_k \cdot m\) with \(m > 1\). _Consequence:_ the multiplier \(1\) in
`observation.md` is legitimate as a _residue class_ generator but must be dropped when the object is used as a
_composite stream_.

---

## Part III — The Multiplier Set of a Prime (`observation.md`)

### T17. Prime phase of the multiplier set `[T]`

Every multiplier of \(N\) below \(N^2\) is prime:
\(A_N \cap [N, N^2) = \{\text{primes in } [N, N^2)\}\). _Proof:_ a composite \(N\)-rough number has \(\ge 2\) prime
factors, each \(\ge N\), hence is \(\ge N^2\). _Consequence:_ in the prime phase the stream advance is a single index
increment into the already-materialised prime array (T33), and composite multipliers are reachable below \(X\) only for
\(N \le X^{1/3}\).

### T18. The multiplier set `[T]`

\[ A_N \;=\; \{\, a \ge N \;:\; \gcd (a, P_{<N}) = 1 \,\}, \] an **infinite** set, periodic modulo \(P_{<N}\); one
period is the reduced residue system \[ \{\, t \in [1, P_{<N}] : \gcd (t, P_{<N}) = 1 \,\}, \qquad \varphi (P_{<N}) =
\!\!\prod_{p<N}\!\! (p-1)
\text{ elements.} \] i.e. the multipliers are the **totatives of the primorial** — equivalently the \(N\)-rough numbers
from \(N\) up — not a list of primes. _Proof:_ T12, T15.

### T19. Coincidence window `[T]`

One period of \(A_N\) consists of \(1\) together with primes only **iff** \(P_{<N} \le N^2\), which holds for \(N =
2,3,5,7\) (\(30 \le 49\)) and fails for every \(N \ge 11\) (\(210 > 121\)). _Proof:_ T17. For \(N = 11\) the period mod
\(210\) contains the composite totatives \(121, 143, 169, 187, 209\), so \(48 = 1 + 42\text{ primes} + 5\text{
composites}\). This is why the compact prime-list notation \(N * \{1, N, \ldots, M\}\) describes a full period exactly
for \(N \le 7\), and the prime _phase_ thereafter.

### T20. Smallest nontrivial totative `[T]`

The least totative of \(P_{<N}\) greater than 1 is exactly \(N\). _Proof:_ any \(1 < t < N\) coprime to all primes \(<
N\) would have \(\mathrm{spf} (t) \ge N > t\), impossible; and \(N\) itself is coprime to \(P_{<N}\). _Consequence:_ the
special-case clause "append \(N\) if \(N < P_{<N}\)" in `observation.md`
is not a special case at all — it is automatic, and it degenerates only for \(N \in \{2,3\}\) where \(P_{<N} \in
\{1,2\}\) and the wheel is trivial.

### T21. Causality: no forward dependence `[T]`

The multiplier set of \(N\) is the reduced residue system mod \(P_{<N}\), periodically extended (T18), and is therefore
determined entirely by the primes **strictly less than \(N\)** — all of which are known at the moment \(N\) is
discovered. Moreover multipliers are consumed in increasing order, and the one needed to emit a composite at scan
position \(n\) is \(n/N \le n/2\), while the _next_ multiplier is \(< n\) by Bertrand (T27, T2, T34).

Hence there is no forward dependence, no partially-computed state, and no mutable retroactive updates: multiplier lists
are **streams**, not stored objects. _This is the precondition for the architecture to be realisable online_
(T34, T40), and it is machine-checked as `Primegen.causality` (`paper.md` §9).

### T22. Full stream from one period `[T]`

\(\Theta_N\) (the infinite owned stream) is obtained from the finite list of T18 by periodic extension:
\[ \Theta_N = \{\, N\, (t + j\,P_{<N}) \;:\; t \in A_N \setminus \{1\},\ j \ge 0 \,\} \cup \{\, N\, (1 + jP_{<N}) : j
\ge 1 \,\}, \] and \(\Theta_N\) is a union of \(\varphi (P_{<N})\) arithmetic progressions of common difference
\(N\,P_{<N} = P_{\le N}\). _Note:_ `observation.md` presents only the first period and calls it "the orthogonal sieve
sequence". One period determines the whole stream by periodic extension (T18), and `observation.md` states both forms:
the period (a residue-class description, complete by T15) and the infinite stream.

### T23. Prime-only multipliers are valid in a band `[T]`

Fix a search limit \(X\). For \(p > X^{1/3}\), every multiplier \(m\) with \(pm \le X\) is either \(1\) or a prime
in \([p, X/p]\). _Proof:_ a composite \(p\)-rough \(m\) satisfies \(m \ge p^2 > X^{2/3} \ge X/p\). _Consequence:_ the
intuition behind `observation.md` is correct in the "large prime"
regime and is exactly the standard structure of the linear/wheel sieve inner loop. This gives a legitimate hybrid:
**prime-list multipliers for \(p > X^{1/3}\), wheel multipliers for \(p \le X^{1/3}\).**

### T24. Uniqueness of representation `[T]`

The map \( (p, m) \mapsto pm\), restricted to \(p\) prime and \(m\) \(p\)-rough with \(m \ge p\), is injective onto the
composites. _Proof:_ T11 + T12. _Needed for:_ no duplicate keys in the heap (T37).

### T25. Stream density `[C]` (from T7/T8)

The number of elements of \(\Theta_p\) below \(X\) is \(\Phi (X/p,\,p) - 1 \approx \omega (u)\,X/ (p\log p)\). Summing
over \(p \le \sqrt{X}\) recovers \(X - \pi (X) - 1\), as it must. _Needed for:_ the work-distribution and heap-traffic
analysis (T44).

---

## Part IV — The `NextOwnedComposite` Primitive

This is the _assumed_ primitive of `generator.md` §3 and the only genuinely open piece.

### T26. Definition `[N]`

\(\mathrm{NOC} (p, x) = \min\{\, m \in \Theta_p : m > x \,\}\).

### T27. Reduction to next-rough `[T]`

\[ \mathrm{NOC} (p, x) \;=\; p \cdot \mathrm{NextRough}\!\left (p,\ \lfloor x/p \rfloor\right), \] where
\(\mathrm{NextRough} (p, y)\) is the least \(p\)-rough integer \(> y\) (with the convention that the search starts at
\(\max (y, p-1)\) so the first result is \(p\)). _Proof:_ T12 plus the observation that \(p\lfloor x/p\rfloor \le x < p
(\lfloor x/p\rfloor + 1)\). **Therefore the entire architecture reduces to one question: how fast can you compute the
next \(p\)-rough number?**

### T28. Next-rough = next totative `[T]`

\(m\) is \(p\)-rough \(\iff \gcd (m, P_{<p}) = 1\). So \(\mathrm{NextRough} (p,\cdot)\) is the successor function on the
wheel of modulus \(P_{<p}\).

### T29. O (1) pointer rule _with_ a wheel table `[T]`

If the sorted totative list \(W[0..\varphi (P_{<p})-1]\) of \(P_{<p}\) is precomputed, and the per-prime state is the
index \(i\) plus the cycle count \(j\), then \[ c \;\leftarrow\; p\, (j P_{<p} + W[i]),\qquad (i,j) \leftarrow (i+1
\bmod \varphi,\; j + [i+1 = \varphi]), \] is exact, orthogonal, and **O (1) time with O (1) state per prime**.
_Therefore the primitive assumed by `generator.md` exists and is trivially O (1) in time._ The assumption is not false;
it is merely **incomplete**, because:

### T30. The cost is space, not time `[T]`+`[C]`

The shared table for prime \(p\) has \(\varphi (P_{<p}) = \prod_{q<p} (q-1)\) entries, which by T5/T7 is \(e^{ (1+o (1))
p}\). For \(p = 29\) the table already exceeds \(10^{9}\) entries. Hence T29 is unusable beyond a handful of primes.
_Conclusion:_ an exact per-prime wheel buys O (1) time but **not** O (1) state. The O (1)-time, O (1)-state form of the
primitive (`generator.md` §3.5, `paper.md` §4.1) is obtained only by sharing one fixed wheel across all primes (T32).
The remaining question is whether exactness and O (1) state can be had together:

### T31. The real open problem `[?]`

> Does there exist an algorithm computing \(\mathrm{NextRough} (p, y)\) in \(O (1)\)
> (or \(O (\mathrm{polylog})\)) time using \(O (\mathrm{poly} (\log p, \log y))\) space,
> given only the list of primes \(< p\)?

Evidence _against_: determining whether a given \(y\) is \(p\)-rough is trial division by \(\pi (p)\) primes with no
known shortcut; and by T9 the gap to the next rough number can be as large as \(\gg p\log p\,\log\log\log p/ (\log\log
p)^2\), so any "scan and test"
method is superlinear in \(p\) in the worst case. A genuine O (1) rule would imply a constant-time roughness oracle,
which would be a significant result in its own right. **This should be labelled a conjecture, not an assumption.**

### T32. Shared wheels relax orthogonality (Algorithm B) `[T]`

If one uses a fixed wheel modulus \(P_j\) (e.g. \(210\), 48 spokes) for _all_ primes \(p > p_j\), the emitted stream for
\(p\) is \(\{pm : m \ge p,\ \gcd (m,P_j)=1\}\), which **over-claims**: e.g. \(p = 13\), \(m = 121\) yields \(1573 =
11^2\cdot 13\), owned by 11. _Consequences:_ (a) composites can be emitted by more than one stream, so heap keys are no
longer unique (contradicting T37); (b) the consuming loop must drain _all_ heap entries equal to \(n\), not just one;
(c) total heap traffic rises from \(X - \pi (X)\) to \(\sum_{p\le\sqrt X}\Phi (X/p, p_j)\). _This is a required This is
exactly the Algorithm B relaxation; `generator.md` §4.2 and `paper.md` §4.3 state the drain-all-equal-keys loop
accordingly, and the resulting duplicate factor \(\kappa_W\, (\ln\ln\sqrt X - \ln\ln p_j)\) is computed in `paper.md`
§4.5. The claimant set of a given composite is machine-checked (`AlgB.claims_iff`).

### T33. Alternative primitive: multiplier-list pointer `[P]`

By T23, for \(p > X^{1/3}\) the multiplier stream is just the prime list itself, so \(\mathrm{NOC}\) is an O (1) array
advance into the already-materialised prime table. A three-regime scheme (small \(p\): explicit wheel; medium \(p\):
recursive rough-number generator; large \(p\): prime-list pointer) is exact and O (1) amortised. _Status:_ believed
straightforward; the medium regime is where the recursion must be designed carefully to avoid unbounded state.

---

## Part V — The Consuming Algorithm

### T34. Loop invariant `[P]`

After processing all integers \(< n\), the heap contains, for every prime \(p < n\) that has been inserted, exactly the
least element of \(\Theta_p\) that is \(\ge n\). _Proof:_ induction over \(n\); the sketch in `generator.md` §4.4 is
correct in outline.

### T35. Correctness `[P]`

The algorithm emits exactly the primes, in increasing order. _Proof:_ T34 + T11 + T12a. `generator.md` Theorem 1's
sketch is essentially complete; the only gap is the base case and the treatment of \(n\) between \(p\) and \(p^2\).

### T36. Trivially-satisfied precondition `[T]`

When \(p\) is emitted, its first stream element is \(p^2 > p\), so inserting \( (p, p^2)\) never violates the "key \(>
n\)" invariant. _Proof:_ T12a.

### T37. Key uniqueness (no duplicate heap keys) `[T]`

Under exact orthogonality, at most one heap entry equals any given value. _Proof:_ T24. _Contrast:_ the naive "multiples
of \(p\)" heap sieve (O'Neill's formulation) has up to \(\omega (n)\) entries colliding at \(n\); this architecture's
distinguishing feature is that it does not. **This is the strongest genuinely novel algorithmic claim in `generator.md`,
and it is easy to prove.**
_Caveat:_ destroyed by truncated wheels (T32).

### T38. Deferred activation bound `[T]`

A prime \(p\) contributes nothing below \(p^2\); therefore, if insertion is deferred until \(n\) reaches \(p^2\), the
heap holds only \(\pi (\sqrt{n})\) entries. _Consequence:_ heap memory is \(O (\sqrt{n}/\log n)\), never \(O (\pi
(n))\) — this is the bound stated in `generator.md` §4.5 and `paper.md` §4.6, and it is what makes the generator
unbounded with no global limit. (The full prime _list_ is still \(O (\pi (n))\) if retained, but only \(\pi (\sqrt n)\)
of it is needed for generation.)

### T39. Heap replaceable by bucket table `[K]`

Because keys are consumed in increasing order of \(n\) and the candidate cursor advances by 1, the priority queue can be
replaced by a bucketed "next event" table over a segment, giving \(O (1)\) amortised per event instead of \(O (\log \pi
(\sqrt n))\). _Prior art:_ Bengelloun's incremental sieve; Pritchard's incremental prime sieves; standard
segmented-sieve engineering.

### T40. Streaming/segmented compatibility `[P]`

The algorithm restricted to a band \([A, B)\) requires only the primes \(\le \sqrt{B}\) and one pointer per such prime;
bands may be processed independently once those primes exist. _Proof:_ T2. _Needed for:_ the parallel/SIMD/GPU claims of
`generator.md` §5.2, which are currently asserted without argument.

### T41. Branchlessness / vectorisation `[?]`

The merge _decision_ is a single comparison, but a heap sift is data-dependent and branch-heavy, so the branchless and
SIMD claims hold only in the T39 bucketed form (`generator.md` §5.2, `paper.md` §5.3): the advance step
`a += step[a % W]; v = p*a` is a gather plus a multiply and vectorises across streams, and bucket drains are independent
scatter-writes into a segment bitmap. _Status:_ an engineering claim to be benchmarked, not a theorem.

---

## Part VI — Complexity

### T42. Event count `[T]`

The total number of stream events up to \(X\) equals the number of composites, \(X - \pi (X) - 1\), under exact
orthogonality (T11). Each is produced exactly once.

### T43. Time `[P]`

With a heap: \(O (X \log \pi (\sqrt X)) = O (X \log\log X)\), using the deferred-activation heap size \(\pi (\sqrt X)\)
of T38 — the figure stated in `generator.md` §4.5 and `paper.md` §4.6. With T39 buckets: \(O (X)\). _Comparison:_
segmented Eratosthenes is \(O (X\log\log X)\); Pritchard's wheel sieve is \(O (X/\log\log X)\); the linear (Gries–Misra)
sieve is \(O (X)\). So the architecture is competitive but **not asymptotically new**.

### T44. Work distribution `[P]`

Stream \(p\) fires \(\approx \omega (u)X/ (p\log p)\) times below \(X\) (T25), so small primes dominate traffic —
exactly as in Eratosthenes. Wheeling out the first \(j\) primes removes a \(1 - \varphi (P_j)/P_j\) fraction of all
events, i.e. Mertens-limited (T7).

### T45. Memory `[T]`

\(O (\pi (\sqrt X))\) pointers + wheel tables. Wheel tables are the binding constraint (T30).

### T46. Lower-bound context `[C]`

Any method that _emits_ every prime below \(X\) does \(\Omega (\pi (X))\) work; any method that touches every composite
does \(\Omega (X)\). The architecture is in the second class. Sublinear prime _counting_ (Meissel–Lehmer, Lucy_Hedgehog,
LMO) is a different problem and is not addressed or improved by this construction.

### T47. Model-of-computation caveat `[T]`

All "O (1)" claims assume unit-cost arithmetic on words large enough to hold \(X\). For \(X\) beyond machine words,
every primitive gains a \(\log\) factor.

---

## Part VII — Auxiliary Analytic Theory (from `idea.md`)

These are _descriptive_, not required by the generator. They are listed for completeness and because they justify some
of the architecture's framing language.

### T48. Multiplicative density `[C]`

\(\rho_k = \prod_{i\le k} (1 - 1/p_i)\), with exact recursion \(\rho_k = \rho_{k-1} (1-1/p_k)\). Classical
(Legendre/Mertens); the "attenuation filter" reading is presentational.

### T49. Additive joint entropy `[T]`

Under CRT independence (T4), \(H_{\text{joint}} (k) = \sum_i H (p_i)\) with \(H (p) = -\frac1p\log\frac1p -
\frac{p-1}{p}\log\frac{p-1}{p}\). _Caution already correctly noted in `idea.md` §4:_ this is **not** the entropy of the
output bit \(S_k (n)\), which tends to 0. Do not conflate the three entropy currencies (joint, output, \(\log L_k\)).

### T50. Entropy density collapse `[T]`

\(h_k = H_{\text{joint}} (k)/L_k \to 0\) super-exponentially, since \(H_{\text{joint}}\) grows \(\sim \sum \log
p_i/p_i\) while \(L_k\) grows primorially.

### T51. Exact finite Fourier expansion `[C]`

Each mask \(M_p\) has a finite DFT; the sieve indicator is a product of masks.

### T52. CRT-dual (Good–Thomas) factorization `[C]`

\(\widehat{S_k} (m_1,\dots,m_k) = \prod_i \widehat{M_{p_i}} (m_i)\) under the dual CRT indexing. Position-space
product ⇒ frequency-space convolution; the tuple indexing makes it a clean tensor product. _Note:_ `idea.md` already
corrects its own earlier "interleaving"/"disjoint spectra"
claim here. The correct statement is **disjoint nonzero support; shared DC term**.

### T53. Profinite limit `[C]`

\(\widehat{\mathbb{Z}} = \varprojlim \mathbb{Z}/P_k\mathbb{Z}\) with Haar measure; dual \(\mathbb{Q}/\mathbb{Z}\). The
"infinite prime spectrum" lives here, not on \(\mathbb{R}\).

### T54. Sarnak-disjointness obstruction `[C]`

The profinite odometer is equicontinuous and zero-entropy; Sarnak's conjecture asserts Möbius is orthogonal to all
zero-entropy deterministic sequences. Hence this construction provably cannot capture the pseudorandom fine structure of
the primes and is not a route to Hilbert–Pólya / RH. Correctly flagged in `idea.md` §8.7; retained here as a hard
boundary on interpretive claims.

### T55. Wheel factorization equivalence `[K]`

The "compressed periodic representation" of `idea.md` §8.5 _is_ wheel factorization (Pritchard, 1982). Not novel. Same
object as T18/T29.

### T56. Wave/particle framing `[N]`

Interpretive only. Carries no proof obligation and should never be used as a premise.

---

## Part VIII — Prior Art That Must Be Cited

| Item                                                                                      | Relation                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| O'Neill, _The Genuine Sieve of Eratosthenes_ (JFP 2009)                                   | The priority-queue incremental sieve. `generator.md` §4 is this algorithm plus orthogonalization (T37). |
| Pritchard, _Explaining the Wheel Sieve_ (1982); _Fast Compact Prime Number Sieves_ (1983) | Wheels = T18/T29; \(O(X/\log\log X)\) bound.                                                            |
| Bengelloun (1986); Pritchard, incremental sieves                                          | T39 bucketing; unbounded streaming primes.                                                              |
| Gries & Misra, linear sieve (1978)                                                        | \(O(X)\) via smallest-prime-factor ownership — **this is T10/T11 already in the literature**.           |
| Mertens, Legendre                                                                         | T7, T48.                                                                                                |
| Buchstab; Tenenbaum                                                                       | T8, T25.                                                                                                |
| Iwaniec; Ford–Green–Konyagin–Maynard–Tao                                                  | T9.                                                                                                     |
| Good–Thomas prime-factor FFT                                                              | T52.                                                                                                    |
| Ramanujan–Fourier expansions (Wintner, Carmichael; Gadiyar–Padma)                         | T51–T53.                                                                                                |
| Sarnak, Möbius disjointness                                                               | T54.                                                                                                    |

**Honest summary of novelty:** the ownership-by-smallest-prime-factor decomposition (T10/T11) is the linear sieve, known
since 1978. The heap merge is O'Neill's. The multiplier wheel is Pritchard's. The genuinely fresh contributions
available here are (a) the explicit key-uniqueness property T37, (b) the memory bound T38 that the source paper makes
unbounded operation possible, and (c) the causality statement T21, which is what makes the specification streamable
rather than merely correct.

---

## Part IX — Open Problems, Ranked

1. **T31 (critical).** Constant-or-polylog-time next-rough-number with polylog space. Everything advertised as "O (1)
   per-prime advancement" stands or falls here. Current status: **unproven, and plausibly false**; the only known exact
   O (1)-time rule (T29)
   needs exponential space.
2. **T33.** Design and prove the three-regime hybrid pointer, with exact orthogonality preserved across regime
   boundaries.
3. **T32.** The over-claim rate under a shared wheel is computed in `paper.md` §4.5 (an \(\omega_{>p_w}\), i.e.
   \(\ln\ln\), factor) and its claimant set is machine-checked; what remains is the loop-level proof that
   drain-all-equal-keys is correct and still \(O (X)\) — `paper.md` Open Problem 7.
4. **T41.** Benchmark the branchless / SIMD / GPU claims in the bucketed form.
5. **T44.** Measure the empirical work distribution, and the live-stream count \(S (X)\) of the exact variant, against
   the Dickman saddle estimate (`paper.md` Conjecture A4).
6. **T40.** Formalize band-parallel decomposition and its synchronization requirements.

---

## Part X — Dependency Summary

    T1  ─┬─> T10 ─> T11 ─┬─> T24 ─> T37 (key uniqueness)
         │               ├─> T12 ─> T12a ─> T36, T38 (memory bound)
         │               └─> T42 ─> T43 (complexity)
    T2  ───> T13, T23, T40
    T4  ─┬─> T14 ─> T15 ─> T18 ─> T21 (causality fix)
         ├─> T48, T49, T52
    T5,T7─┬─> T30 ─> T31 (THE open problem)
         └─> T44
    T9  ───> T31 (evidence against)
     T18 ─┬─> T17, T19 (the P_{<N} <= N^2 coincidence window)
         ├─> T20, T22
         └─> T27 ─> T28 ─> T29 ─> T30

### One-paragraph verdict

The architecture is _correct_ and its structural claims are _cheap to prove_ — T11, T12, T15, T18, T20, T24, T37 are all
one-liners, and the load-bearing ones are machine-checked (`paper.md` §9). The multiplier set is a wheel (T18), its
prime phase explains the compact prime-list description (T17/T19), and it is causal (T21), so the specification is
streamable. The single genuine unknown is T31: an exact pointer rule is O (1) in time only at primorial space cost, so
the O (1)-time, O (1)-state primitive exists only in the shared-wheel form (T32), whose duplicate cost is bounded by a
\(\ln\ln\) factor. Everything else in the architecture is engineering and measurement.
