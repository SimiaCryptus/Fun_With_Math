# No-Three-in-Line Sieve — Novelty & Utility Analysis

Scope: `theory.md` (§1–§14) and `theory_2.md` (§15–§21), read against the standing literature and against each other.
Companion docs (`idea.md`, `plan.md`, `lean/`) are referenced only where they change a verdict.

Tags used below: **[known]** established elsewhere; **[repackaged]** standard technique, non-standard application;
**[new]** no prior art known to this reviewer; **[check]** plausibly known — do a literature search before claiming
priority; **[issue]** a defect, gap or over-claim; **[action]** concrete recommended work.

The analysis has three parts as requested (§1 known vs new, §2 interesting/useful, §4 open questions and follow-up),
plus a technical audit (§3) that surfaced material worth folding back into the theory documents.

---

## 1. Known vs new

### 1.1 Inherited, cited, and correctly attributed — **[known]**

These are load-bearing but not claimed as contributions, and the documents are honest about it:

| item                                              | prior art                                 | doc          |
| ------------------------------------------------- | ----------------------------------------- | ------------ |
| No-three-in-line problem, `c(n) ≤ 2`              | Dudeney 1917; folklore                    | L2.3         |
| `c ≈ 1` via `(i, i² mod p)`                       | Erdős/Roth 1951                           | §14          |
| `(3/2 − ε)n` construction                         | Hall–Jackson–Sudbery–Wild 1975            | §14          |
| `≈1.81n` heuristic maximum                        | Guy–Kelly 1968 (corrected)                | §14          |
| Small-`n` records                                 | Flammenkamp                               | §14, P28     |
| Primitive-direction collinearity test             | folklore (Bézout)                         | L2.1, L2.2   |
| `6/π²` primitive density, `Σ1/g² = π²/6`          | standard                                  | L1.1, L1.2   |
| Monotone integer priority queue, `O(1)` amortised | Dial 1969                                 | T7.2         |
| LFMIS is P-complete                               | Cook 1985                                 | T7.6         |
| Greedy Sidon / greedy 3-AP precedents             | Mian–Chowla; Erdős–Turán, Odlyzko–Stanley | §9.6, C2     |
| Random-order greedy in hypergraphs                | AKPSS; Duke–Lefmann–Rödl; Bennett–Bohman  | §9.6         |
| Hyperuniformity, structure factor                 | Torquato–Stillinger                       | C14, P25     |
| 2D SFT, language, patch complexity, entropy       | symbolic dynamics, standard               | §18.1, L18.5 |
| Ulam spiral                                       | standard                                  | §16.5        |

Two more that are _not_ cited and should be:

- **[check]** **Random sequential adsorption (RSA).** The finite-`W` object is, structurally, a deterministic-order RSA
  process with a geometric (collinearity) exclusion rule: irreversible sequential insertion to a jammed (saturated)
  state, positive limiting density, surface-law fluctuations. The RSA literature has the jamming-density formalism, the
  mean-field-vs-correlations discussion of §17, and hyperuniformity results for saturated packings (C14). This is the
  closest structural analogue in the physics literature and is currently absent from §14 and §21.
- **[check]** **Bounded-window ("local") relaxations of extremal set problems** — locally Sidon sets, `k`-AP-free within
  a sliding window, bounded-gap Szemerédi variants. §2A's horizon is an instance of a recognised move, which slightly
  reduces the novelty of the _idea_ while leaving the exactness theorem (T2A.7) untouched.
- **[check]** **Minimum size of a saturated / maximal no-three-in-line set.** T9.1 (`Ω(n^{2/3})`) and Q9.8 read like a
  question that has been asked. Search for "saturated"/"maximal" no-three-in-line configurations before presenting T9.1
  or Q9.8 as open. If the answer is known and is `Θ(n^{2/3})`, Q9.8 resolves and C2 gets a large boost; if it is
  `n^{1−o(1)}`, C3 follows for _every_ ring-monotone order and the project's headline question collapses to
  combinatorics, exactly as §9.8 says.

### 1.2 Standard technique, non-standard packaging — **[repackaged]**

Real value, but the underlying mathematics is not new:

- **T4.1 / C4.2 (convexity of `t ↦ ||p+td||_∞`, split at `t*`, monotone schedule keys).** The convexity is one line; the
  _use_ — split each determined line into two monotone rays, key by the gauge, feed a Dial bucket queue — is the
  sweep-line / event-queue pattern (Bentley–Ottmann) crossed with a segmented sieve of Eratosthenes. The packaging is
  clean and the correctness trap it exposes (T5.3: discarding by step sign rather than after splitting is _unsound_, not
  merely lossy) is a genuinely good piece of engineering mathematics.
- **T4.4 (three-way ring/line classification, with `ContainedInSide`).** Forced by flat faces; elementary; but the
  observation in P8.5 that the degenerate branch is _hot_ (fires up to 4× per ring, deposits `Θ(R)` marks) rather than a
  rare edge case is a useful inversion of the usual instinct.
- **T7.3/T7.4 (marks are ACI, placement is not).** Standard join-semilattice reasoning, but stating it as the exact
  boundary of parallelisability — and then pinning the impossibility side to LFMIS P-completeness — is the right level
  of rigour for an engineering spec.
- **T8.6 (`T·M = Θ̃(k⁴)`, with the oracle and the calendar as the two endpoints of one curve).** Band-regeneration
  time–memory trade-offs are a standard idiom; identifying two independently-designed engines as the endpoints of the
  _same_ dial is a genuinely clarifying observation and the most useful single fact in §8 for capacity planning.
- **§18.1 (the field as an SFT; the greedy far field as an orbit in it).** Standard framing; the _questions_ it makes
  askable (T18.4 periodicity ⇒ no universality; L18.5 `h(X_W) = Θ(log W/W) > 0` vs `h(X_∞) = 0`) are the payoff.
- **T15.2 (erosion / uniform local floor).** T9.4's union bound localised; the technique is routine, the statement is
  the one that makes "field" a legitimate word.

### 1.3 Genuinely new, ranked by how much they would survive outside this project — **[new]**

1. **T2A.7 — the horizon is exact, not approximate.** `P_W ∩ B(⌊W/2⌋) = P_{W'} ∩ B(⌊W/2⌋)` for `W ≤ W'`. This is the
   keystone. It converts a truncation heuristic into a _lossless_ resource dial, gives the cheapest possible full-stack
   regression test (P19), and — see §2.1 below — reduces the entire horizon-transfer programme to a single measurable
   statement. The proof is three lines; the leverage is enormous. Nothing in the literature I know of does this for a
   greedy geometric construction.
2. **T9.2 — the exponent is controlled by one scalar functional.** `α` is decided by the growth of
   `Σ(P) = Σ_{pairs} 1/||primdir(q−p)||_∞`: adversarial `Θ(k^{3/2})` gives `α = 2/3`, typical `Θ(k log²k)` gives
   `α = 1` up to logs. Reducing an open exponent question to the growth rate of a single, trivially-measurable,
   trivially- _definable_ scalar is exactly the kind of reformulation that makes a problem attackable (Q13.1). This is
   the most citable pure-mathematics content in `theory.md`.
3. **T9.3 + T17.1 — the mean-field is inconsistent at `W = ∞`, and the reason is that `W = 2R` is not a steady state.**
   T9.3 alone is a good negative result (it kills all the obvious back-of-envelope arguments in both directions).
   T17.1's diagnosis — the classical object is the _diagonal_ `W = 2R, R → ∞` of a two-parameter family and therefore
   never enters a stationary regime — is the sharpest conceptual statement in either document, and it is transferable:
   it is a general warning about mean-field arguments applied to processes whose own effective range grows with time.
4. **§16 — the history census and the seam calculus.** `H(c) = |{p ≺ c : ||p−c||_∞ ≤ W}|`, `θ = H/W²`, the exact
   far-field table (L16.2), and the conclusion (T16.3) that _all_ anisotropy of a finite-`W` greedy field is supported
   on the corners of the traversal gauge's unit ball plus the intra-ring branch cut. Then H16.4:
   `δ ∝ 1/θ`, giving spokes of width `Θ(W)`, profile `2/(1+j/W)`, peak contrast `≲2`. This is a _mechanism_ for a visual
   artefact, with a quantitative profile and — crucially — **C15, a decisive falsification design**: change the gauge,
   and the spokes must move to the new unit ball's corners (`L¹` ⇒ axes; `L²` ⇒ no spokes at all). One run per row of
   the C15 table settles mechanism (A) vs (B). Well-designed falsifiable science; the closest prior art is the folklore
   "Ulam spiral features are artefacts of the indexing", which this makes precise and, in one respect, _different_ (see
   §3.4).
5. **C21/§18.4 — harvest at `W = s−1`, and the inversion it entails.** The observation that a _larger_ horizon makes the
   field _sparser at the harvest scale_, so `W` should be tuned to the target rather than maximised, is
   counter-intuitive and correct-looking, and it cleanly separates the two uses of the dial (certification wants large
   `W`; harvesting wants `W = s−1`).
6. **C2A.3/C8/P17 — `Θ(R²)` certified samples instead of one.** Not deep, but it is what makes the whole exercise
   _reportable_: every window is a certificate, monotone-in-`s`, requiring no theory to be true.
7. **P11.1 — Euclidean order as a commit filter with `√2` lookahead on the L∞ calendar.** Small, but it removes an
   entire would-be subsystem, and it makes P24's `L²` row nearly free to run.
8. **T18.6/T18.7/P18.8 — obstructions to universality that provably miss the targets.** "Patterns with large sparse
   regions can never occur, and `s*(W) < 3W`" bounds the ambition; "the maximum-population patterns are self-saturating
   and hence immune to both obstructions" rescues exactly the case of interest. The pair is a textbook example of
   delimiting a wild conjecture until it becomes testable.

### 1.4 Where the documents over-claim novelty — **[issue]**

- **§12 "Working set `Θ(R)` bits instead of `Θ(R²)`" and "unbounded operation"** are honestly qualified in §8.4 (A2 does
  _not_ beat A1 asymptotically in time, and loses badly in memory) — but the §12 summary table restates the advantages
  without the qualification. §12 should carry the §8.4 caveat inline; a reader who reads only the summary will
  over-value the calendar.
- **"Bit-identical output under any parallel schedule" (T7.3+T7.5)** is a theorem about the mark algebra, not about an
  implementation; the implementation-level claim requires that the _set_ of produced marks be a function of the ring
  index alone. That proviso is stated in T7.3 and dropped in §12.

---

## 2. Interesting and useful

### 2.1 The single best idea: T2A.7 reduces the central conjecture to a measurement

C2A.10 ("`c*(W) ≍ W^{α−1}`") is the load-bearing conjecture of the whole horizon programme, and it _looks_
unfalsifiable — a relation between two limits in different coordinates. It is not, and the reason is T2A.7:

- the origin-anchored quantity `k_W(⌊W/2⌋)/(W+1)` is, **by T2A.7, literally equal** to `k_∞(⌊W/2⌋)/(W+1)`, i.e. to a
  point on the classical `c(n)` curve — no conjecture, no approximation;
- therefore the _only_ gap between `c*(W)` (far field) and the classical `c(n)` is **homogeneity of `P_W` itself**;
- and homogeneity is directly measurable in a single run (P16).

So the chain "cheap `W`-coordinate experiment ⇒ classical exponent" has exactly one conjectural link, and that link is
an internal property of an object the engine already computes. That is an unusually clean epistemic design and it is the
strongest reason to take the horizon seriously. **[action]** State this explicitly at the top of §2A.2; at present it is
distributed across T2A.7, C2A.10 and P16 and a reader has to assemble it.

(§3.3 below argues that P16 as _stated_ will fail, for a reason §16 itself predicts, and that the criterion needs
restating — which strengthens rather than weakens the design.)

### 2.2 Results worth extracting and using elsewhere

- **The `Θ(log R)` marks-per-line theorem** (L4.3 + H8.2). "Most directions are steep, so most determined lines deposit
  `O(1)` marks over the entire run" is the performance thesis of the engine, it is a theorem about the gauge rather than
  a hope about inputs, and it generalises to any sieve over lattice lines scheduled by an L∞ ring index.
- **T5.3 as a correctness pattern.** "Outward-only pruning is sound _iff_ you split first" — a family of bugs (prune by
  step sign) that produce silently _invalid_ output rather than a crash. Worth writing up as a standalone cautionary
  note for anyone building a geometric sieve.
- **T7.9 (at finite `W` the calendar collapses to a rolling band).** No priority queue, no ray records, `Θ(RW)` bits,
  unbounded in `R`. This is the only place in the cost model where a modelling choice removes an _asymptotic_ cost
  rather than a constant, and it is the design decision that makes the measurement programme affordable.
- **T16.3's general lesson.** For any greedy-with-an-order on a lattice, the field's inhomogeneity is supported exactly
  where the order's past cone fails to be a translate of a fixed set — i.e. at the corners of the traversal gauge and at
  the order's branch cut. This is reusable well beyond no-three-in-line (any RSA-like or greedy colouring/packing
  process on a scanned lattice), and §3.2 below turns it into a conservation law.
- **The methodological triage.** The explicit `L/T/P/H/C/Q/M` tagging, the "conjectures may not be used as hypotheses"
  rule enforced in `lean/`, C4-as-bug-detector, and the hard invariants (P19, P32, saturation check) are a genuinely
  good template for computational-mathematics projects. The saturation check (T3.4) in particular catches _over_
  -blocking, which a collinearity verifier structurally cannot see — that observation is worth advertising.

### 2.3 Utility triage: what survives if the theory is wrong

| output                                         | depends on                         | value if the conjectures fail                               |
| ---------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| Harvested record windows (P17, P28)            | nothing — L2.2 checks them exactly | **full**: certificates are certificates                     |
| `c(s)` lower bounds from any window (C2A.3/C8) | rigorous                           | **full**                                                    |
| `Σ(P ∩ B(R))` growth curve (P9)                | rigorous bounds only               | **full**: decides C2/C3 via T9.2 regardless                 |
| `δ(W)`, `c*(W)` curves                         | C13 (existence)                    | high: even without a limit, the curves are data             |
| `α` from the horizon coordinate (P15/P30)      | **C2A.10**                         | **none** if homogeneity fails                               |
| Spoke mechanism (H16.4)                        | mean-field constants               | medium: C15/P24 tests the _mechanism_ without the constants |
| Universality / library (C18–C20)               | everything                         | low: astronomical waiting times (§18.3 concedes this)       |

The important reading: **the project's certain deliverables are independent of its interesting deliverables.** The run
produces certified lower bounds and a measured `Σ` curve whatever happens to the horizon transfer. That is unusually
robust for a speculative programme and should be stated as such in the abstracts of both documents.

### 2.4 The best experiments, ranked by information per unit cost

1. **P24 (gauge covariance, C15 table)** — decisive between the two candidate spoke mechanisms; cheap, because P11.1
   makes the `L²` row a commit-order filter on the existing calendar. Highest information density in either document.
2. **P19 (two horizons agree cell-for-cell on `B(⌊W/2⌋)`)** — a hard invariant that exercises the entire stack.
3. **P32 (history census vs L16.2)** — pure combinatorics of `≺`, must match to the unit; see §3.1, it does not
   currently match.
4. **P30 (fit both models to `c*(W)`)** — the methodological warning of §17.2 is the most likely way this project
   reaches a _wrong_ published conclusion, and P30 is the antidote.
5. **P28 (harvest vs tabulated optima, `s ≤ 12`, `W = s−1`)** — three outcomes, all informative, all cheap.
6. **P9 (`Σ` growth)** — the only measurement that attacks `α` without going through C2A.10.

---

## 3. Technical audit

### 3.1 L16.2 rows 4 and 6 look wrong by `+W` and `+2(W−j)` — **[issue]**

Hand-computed at `W = 1`, clockwise-from-`(0,R)`, `R` large (neighbourhood = the 8 adjacent cells; bulk
`H = 2W²+2W = 4`):

| site              | cell                 | earlier neighbours                        | `H` (hand) | L16.2 formula          |
| ----------------- | -------------------- | ----------------------------------------- | ---------- | ---------------------- |
| bulk              | `(x,R)`, `0 ≪ x ≪ R` | 3 below + 1 left                          | **4**      | `2W²+2W = 4` ✓         |
| corner            | `(R,R)`              | `(R−1,R−1)`, `(R−1,R)`                    | **2**      | `W²+W = 2` ✓           |
| approach, `j=1`   | `(R−1,R)`            | `(R−2,R−1)`,`(R−1,R−1)`,`(R−2,R)`         | **3**      | `W²+(j+1)W = 3` ✓      |
| other face, `j=1` | `(R,R−1)`            | `(R−1,R−2)`,`(R−1,R−1)`,`(R−1,R)`,`(R,R)` | **4**      | `W²+jW+j = 3` ✗        |
| ring start, `j=0` | `(0,R)`              | 3 below                                   | **3**      | `2W²+W+j = 3` ✓        |
| ring end, `j=1`   | `(−1,R)`             | 3 below + `(−2,R)` + `(0,R)`              | **5**      | `2W²+W+2(W−j)+1 = 4` ✗ |

Deriving row 4 in general: for `c = (R, R−j)` the earlier set is `{u<0, v<j}` (`W(W+j)` cells) ∪ `{u=0, 1≤v≤j}`
(`j` cells) ∪ `{u<0, v=j}` (`W` cells), giving `H = W² + jW + j + W`, i.e. the table is missing a `+W`. Row 6 is short
by `1` at `W=1` on the same kind of count. Neither changes `θ = 1 + j/W + O(1/W)` nor any conclusion of §16, but P32 is
declared a _hard invariant_ — **[action]** recompute both rows, or the invariant will fire on first run and be mistaken
for a traversal bug.

### 3.2 A missing conservation law: mean `θ = 2` for **every** order — **[new, proposed lemma]**

    L-N1 (history sum rule). Let ≺ be any total order on Λ, and Ω a finite ≺-downward-closed set. Then
        Σ_{c ∈ Ω} H(c)  =  #{ {p,q} ⊆ Ω : 0 < ||p−q||_∞ ≤ W }  =  |Ω|·(2W² + 2W) − E(Ω),
    where E(Ω) counts neighbour pairs with exactly one endpoint in Ω. Hence
        mean θ over Ω  =  2 + 2/W − E(Ω)/(|Ω|·W²).
    Proof. Each neighbour pair inside Ω is counted exactly once, at its ≺-later endpoint; downward-closure ensures
    every contribution to H(c), c ∈ Ω, lies in Ω. ∎

Three consequences the documents do not draw, all of which matter:

- **The spoke deficit is a surface term and cannot be made extensive.** Over `B(R)`, `E = Θ(RW³)`; the spiral's four
  spokes carry a total `θ`-deficit of exactly that order (`Θ(RW)` cells × `Θ(W²)` each). So §16.3's "spokes carry
  `Θ(W/R)` of the mass" is not a coincidence of the profile — it is forced. This _upgrades_ the C10-survives argument
  from a heuristic estimate to a conservation identity, and it is a strictly better justification than the one currently
  given.
- **It validates L16.2 globally.** `bulk θ = 2` exactly equals the mean; the corner deficits are exactly balanced by the
  boundary term. (This is also how I found §3.1: the sum rule is the natural checksum for P32. **[action]**
  Promote P32 from a per-cell assertion to a per-region checksum — it is `O(1)` extra work and catches order bugs the
  per-cell table cannot.)
- **Jensen inverts the design objective.** If `δ ∝ 1/θ` (H16.4), then total yield `∝ E[1/θ] ≥ 1/E[θ] = 1/2`, with
  equality iff `θ` is constant. Since the _mean_ of `θ` is pinned at `2` for every order, **the way to increase a greedy
  field's density is to increase the variance of `θ`, i.e. to have as many seams as possible, not as few**. The spiral
  gets `Θ(W/R)` of its cells into the low-`θ` regime and is therefore, on this model, nearly the worst case. See §4.3
  for the concrete experiment this suggests.

### 3.3 §16's own mechanism predicts that P16 must fail as stated — **[issue, important]**

P16 asks whether the origin-anchored `k_W(⌊W/2⌋)/(W+1)` equals the far-field `c*(W)`, and declares a systematic gap to
be a refutation of C2A.10. But apply L16.2's own logic to the origin: for `c` at radius `r ≤ W/2`, the entire
`≺`-past is contained in `B(r) ⊆ B(c,W)`, so

    H(c) = |B(r)| ≈ 4r²,     θ(c) ≈ 4r²/W²,     E[θ over B(W/2)] = 1/2   (uniform-in-B(W/2) average),

against a far-field bulk of `θ = 2`. Under H16.4 (`δ ∝ 1/θ`) the origin window should therefore be **denser than the far
field by a factor of up to 4, capped by the ceiling `δ ≤ 2/(W+1)`** — i.e. a systematic gap of a factor between 2 and 4
is _predicted_, not anomalous.

Crucially the predicted gap is a **`W`-independent constant**, so it does not touch `α = 1 + lim log c*/log W`.
**[action]** Restate P16's criterion: the two estimators must agree **up to a `W`-independent constant**; it is _drift
of the ratio with `W`_ that refutes homogeneity, not the ratio itself. As written, P16 will fire on the first run and be
misread as refuting C2A.10.

This also yields a unifying reframe worth adding to §17:

> The classical (`W = ∞`) greedy set is _entirely boundary layer_. Every cell it decides has a truncated past cone,
> because the visited region is always a ball of radius comparable to the interaction range. The finite-`W` field is
> the only regime in which a bulk exists at all; the spokes are precisely where the finite-`W` field locally
> reproduces the classical regime. T17.1's "`W = 2R` is not a steady state" and §16's `θ`-deficit are the same
> statement in two coordinates.

And it converts Q13.6 into something much more tractable: **[action]** the transfer C2A.10 does not need to be proved in
full; it suffices to prove the one-sided comparison _origin window is at least as dense as the far field, uniformly in
`W`_. Combined with a measured `c*(W) → const`, that alone gives `α = 1`.

### 3.4 The Ulam analogy is stronger than §16.5 admits, in one direction and weaker in another — **[minor]**

§16.5's table is good. Two refinements:

- The disanalogy §16.5 draws ("Ulam is in the labels, ours is in the set") is the right one and is the reason the
  harvest certificates survive the artefact. Worth stating as a slogan: _the mechanism is an artefact; the points are
  not._
- But the Ulam mechanism is a _quadratic in the ring index along a ray_ — and the spiral's ring index is likewise
  quadratic in the enumeration order. If anything is ever observed on the spokes with _arithmetic_ rather than _causal_
  structure (e.g. spoke features at radii with a multiplicative pattern), mechanism (A) is back and C15's gauge test
  will not detect it, because gauge changes preserve the quadratic index structure. **[action]** Add a third
  discriminator to §16.4: the seed-translation test (translate the whole traversal by a fixed vector; a causal feature
  translates with it, an arithmetic feature does not).

### 3.5 The C2-vs-C3 evidence in §9.6 is weighted toward the wrong analogues — **[issue, substantive]**

§9.6 argues for C2 (`α < 1`) from Mian–Chowla (`n^{1/3}` vs `n^{1/2}`) and the greedy 3-AP set (`n^{0.631}` vs
`n^{1−o(1)}`). Both are cases where the **optimum is polynomially above the greedy scale**, and in both the constraint
is _global additive_ — a single pair constrains a set of candidates spread over the whole range.

No-three-in-line is structurally different: the upper bound `2n` is a **local counting bound** (2 per line), the best
construction is `1.5n`, and so optimum and trivial ceiling differ by a factor `4/3`, not a power. Processes with hard
local exclusion and saturation — RSA/jamming being the canonical family — characteristically land within a _constant
factor_ of the optimum, not a polynomial one. And §17's restored mean-field, which is the only self-consistent
calculation in either document, votes `α = 1`.

**[action]** §9.6's table should gain a fourth row (RSA/jamming: local exclusion, greedy within a constant of optimum)
and §9.7's C2 should be demoted from "primary" to "one of two", or the documents' own §17 should be cited against §9.6
explicitly. As currently written, `theory.md` §9.6 and `theory_2.md` §17 give opposite priors without adjudicating, and
`theory_2.md`'s preamble notes the tension but does not resolve the weighting.

Counter-consideration worth recording: the greedy 3-AP precedent is _also_ the strongest evidence against the
universality conjectures C18–C20, since the Stanley/ternary sequence is the paradigm of a greedy output with zero
entropy and complete self-similar structure. §9.6 and §18 therefore pull in _opposite_ directions and cannot both be
used freely: the same precedent that supports C2 undermines C18–C20, and the same RSA analogy that supports C3 supports
C18–C20.

### 3.6 Smaller items

- **T18.6 is slack.** An empty window of side `2W+2` is in `L_s(X_W)` but excluded by T15.2, so `s*(W) < 2W+2`, not
  `< 3W`. Tighten; it narrows the target window for C18 usefully (`W+1 ≤ s* < 2W+2`).
- **C21 is not an algorithm and §18.4 half-forgets it.** §18.3 correctly concedes `R₁ ≈ s·f^{-1/2}` is astronomical for
  typical patterns; §18.4's harvest still needs `R₁(s) ≈ s·e^{s·I_s(2)/2}`, exponential in `s`. Direct exhaustive/SAT
  search for `n × n` no-three-in-line is also exponential but with far better constants and no
  `Θ(R²)` field to generate first. **[action]** State plainly that C21's value is as a _test of universality_ (and of
  the field's tail behaviour via `I_s`), not as a competitive search method; the record-hunting framing in §18.5 should
  be marked speculative.
- **The mean-field constants (`ρ`, `κ`) are unpinned and the documents know it** (§17.3). Fine — but `κ` enters the
  headline `c*_∞ = 1/(2√κ)`, so _no numerical prediction of `c*` should be quoted_. Only the scaling `δ ≍ 1/W` and the
  shape `2/(1+j/W)` are claimed robust, and §17.3 says so; §21's summary table quoting "`δ ≍ 1/W`" is correctly
  restrained. Keep it that way.
- **C14 (hyperuniformity) has no consequence attached.** §15.3 lists three uses; only the Bragg-peak periodicity test
  (P25) actually feeds a conjecture. The error-bar improvement is real but second-order. Low priority.
- **The spiral is not justified at finite `W`.** T7.9's rolling band works for any order with a bounded lookback,
  including a plain raster or boustrophedon sweep — which has `θ ≡ 2` everywhere, no corners, no branch cut, and no
  seams. Since the spiral's _only_ essential virtue is T2A.7/C2A.8 (exactness at the origin for the classical object),
  **[action]** the default order for finite-`W` field measurements should be a raster, with the spiral used only for
  classical-object runs and for the C15 seam experiments. This makes P31 (bulk vs all-sites `c*`) nearly vacuous and
  removes a `Θ(W/R)` contaminant from every field statistic for free.

---

## 4. Open questions and follow-up research

Ranked by (information gained) / (cost). Items marked ★ are not in either document.

### 4.1 ★ The 1D toy model — cheapest decisive experiment in the whole programme

Take the horizon idea down a dimension: the **greedy `W`-locally-3-AP-free subset of `Z`**, scanned left to right (and
its Sidon analogue). Properties:

- The update depends only on the last `W` bits, so it is a _deterministic finite automaton_: the far field is **provably
  eventually periodic**, always, for every `W`. Density, period, and the whole language are computable exactly by
  orbit-finding, in milliseconds, for `W` into the hundreds.
- It therefore settles, in the analogous 1D setting: (i) whether C12 (periodicity) is the generic outcome; (ii) whether
  C18–C20 (universality) can hold at all when the state is finite (they cannot — T18.4); (iii) whether the restored
  mean-field of §17 gets the _scaling_ right (1D mean-field predicts
  `δ ≈ √(log W / (2W))`; the exact orbit gives the truth);
- and it exhibits, in miniature, the exact contrast L15.1 ↔ T15.2: the `W = ∞` greedy 3-AP-free set has density 0 and is
  the ternary-digit set; the `W`-local one has positive density.
- Known optima for comparison: the densest `W`-locally-3-AP-free set has density `r_3(W)/W = e^{−Θ(√log W)}`
  (Behrend), which is _polynomially above_ the mean-field greedy. If the 1D greedy loses polynomially where the optimum
  is polynomially above the greedy scale, that supports §3.5's reading — the loss is a property of the gap structure of
  the underlying extremal problem, not of greediness.

Also run the 1D version with a **truncated past cone** (decide site `n` using only the last `θW` placements) to test
H16.4's `δ ∝ 1/θ` law _exactly_, since 1D admits exact computation. This is the only route to making Q20.3 rigorous that
does not require new 2D theory.

**Estimated cost: hours. Estimated impact: adjudicates C12 vs C18–C20 and calibrates §17.**

### 4.2 Transfer matrix at small `W` (Q13.7, Q20.4) — the second cheapest

Compute `δ(W)` and the far-field orbit exactly for `W ≤ 4–5` on the `(2W+1)×(W+1)` state. Two payoffs the documents
already name (is the recurrent class a single periodic orbit? does H16.4's profile hold with the corner as a boundary
condition?) and one they do not: **it produces exact `δ(W)` values against which the mean-field's `κ` can be fitted**,
which is the only way to give H17.2's `c*_∞` a number.

### 4.3 ★ Traversal-order design as an optimisation problem

§3.2 shows mean `θ = 2` is a conservation law and `δ ∝ 1/θ` is convex, so _yield is maximised by maximising the variance
of `θ`_. A concrete candidate: visit the sublattice `2Z²` first (raster within it), then the rest. Then

    θ = 1/2 on 1/4 of cells,   θ = 5/2 on 3/4 of cells,   mean 2 ✓ (checks the sum rule),
    E[1/θ] = 0.8   vs   0.5 for a uniform-θ order  →  +60% density, before the δ ≤ 2/(W+1) ceiling bites.

The ceiling almost certainly bites (the first-pass sublattice is itself a `W/2`-scaled instance of the same problem,
capping it at about `2×` bulk rather than `4×`), so the realistic prediction is a constant-factor gain, not 60%. But a
constant-factor gain in `c*` is _exactly_ what the project is trying to measure, and this is a one-flag experiment on
the existing engine. It also directly probes C6 vs C10: C10 asserts `δ(W)` is order-independent, and a hierarchical
order is the most likely counterexample. **If a multiscale order beats the spiral's `c*`, that is the most interesting
single result the engine could produce**, because it makes the traversal a design parameter of a _construction_, not
merely of a measurement.

Related: Q20.7's "gauge with `2m` corners" is the weak version of this idea; the sum rule says a gauge cannot increase
the _total_ seam deficit beyond the surface term, so `2m`-gons buy `O(m)` more spokes each `O(1/m)` as strong.
Multiscale orders are not so constrained because their `θ`-variance is extensive, not surface.

### 4.4 Theory questions worth real effort

- **Q13.1 (`Σ(P) = O(k polylog k)`)** — still the highest-value pure result available: it upgrades C3 to a theorem via
  T9.2, with no engine involved. Attack via §9.5's structural decomposition (the four `||d||_∞ = 1` families carry
  `Θ(1)` of the coverage; the tail is the log-divergent part).
- **★ The one-sided transfer (§3.3).** Prove `k_∞(⌊W/2⌋)/(W+1) ≳ c*(W)` uniformly in `W`. Strictly weaker than Q13.6,
  and sufficient for the `α = 1` direction. The `θ`-argument of §3.3 is a proof sketch already.
- **Q9.8 / saturated-set minimum** — do the literature search first (§1.1); if it is open, it is publishable independent
  of everything else here, and it decides C2 vs C3 by pure combinatorics (§9.8 is right about this).
- **Q20.1 (`δ(W) = Θ(W^{-4/3})` or `Θ(W^{-1})`)** — the sharpest single statement of the project's question, now that
  §17 has made `Θ(W^{-1})` the mean-field's answer. Note it is _equivalent_ to `α ∈ {2/3, 1}` only through C2A.10;
  §3.3's one-sided transfer would make one direction unconditional.
- **C11 / Q13.8 (monotonicity of `c*(W)`)** — a counterexample at small `W` is a finite search and the transfer matrix
  of §4.2 finds it or rules it out for `W ≤ 5` for free. Cheap, and P2A.13 is right that a violation is a discovery: it
  would show order-dependence can _pay_, which is §4.3's thesis in another coordinate.
- **C14 / Q20.2 (hyperuniformity from constraint counting)** — the "≤2 per `(W+1)`-run" family is a 1D conservation law
  in `Θ(W)` interlocking directions; a surface-law variance proof from that alone looks plausible and would be a nice
  standalone result.
- **Q20.6 (which maximal patterns are collar-saturable)** — the only obstruction between P18.8 and C18 for the patterns
  that matter. Finite check for small `s`.

### 4.5 Documentation and process actions

1. Fix L16.2 rows 4 and 6; add the sum-rule checksum to P32 (§3.1, §3.2).
2. Restate P16's criterion as "constant ratio, not equal ratio", and add the origin-`θ` prediction (§3.3).
3. Add the RSA row to §9.6 and adjudicate the C2/C3 prior weighting explicitly (§3.5).
4. Tighten T18.6 to `s* < 2W+2`; mark C21's harvest framing as speculative (§3.6).
5. Add RSA and local/bounded-window extremal relaxations to §14; run the three **[check]** literature searches.
6. Make the raster order the default for finite-`W` field measurement; keep the spiral for classical runs and the C15
   experiments (§3.6).
7. Propagate §8.4's caveats into the §12 summary table (§1.4).
8. Hoist the T2A.7 ⇒ "one conjectural link" argument to the head of §2A.2 (§2.1).

---

## 5. Bottom line

**Novelty.** The mathematics is elementary throughout; the contributions are structural. Three of them are real and
would survive extraction from the project: (i) **T2A.7**, which turns a truncation into an exact resource dial and
thereby reduces an untestable exponent conjecture to a measurable homogeneity property; (ii) **T9.2**, which reduces the
density exponent to the growth of one trivially-measurable scalar; and (iii) **§16's history census**, which gives a
quantitative, gauge-covariant, decisively falsifiable mechanism for an ordering artefact, together with a conservation
law (§3.2, new here) that both bounds the artefact's mass and inverts the design objective. **T17.1** —
"the classical object is the diagonal of a two-parameter family and therefore has no steady state" — is the best
sentence in either document and is transferable well beyond this problem.

**Utility.** Unusually well-partitioned: the certain outputs (window certificates, `c(s)` lower bounds, the `Σ`
curve) do not depend on any conjecture, while the speculative outputs (the horizon transfer, the library) are each
attached to a named falsifier. The chief risks are (a) the `1/log W` masquerade of §17.2, which the documents themselves
flag as the most likely route to a wrong published conclusion, and (b) the P16 criterion, which §3.3 argues is
mis-stated and will fire spuriously. Both are cheap to fix.

**Best next moves, in order:** the 1D toy model (§4.1), the small-`W` transfer matrix (§4.2), P24's gauge covariance
test, and the multiscale-order experiment (§4.3) — the last being the only item on either list that could turn the
project from a measurement of a construction into a _better construction_.
