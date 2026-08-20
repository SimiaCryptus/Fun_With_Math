# A finite-horizon greedy sieve for no-three-in-line configurations

**Exact semantics, a machine-checked core, and a falsification programme**

*Draft. All section, lemma and theorem tags of the form L*n*, T*n*, C*n* refer to the companion theory documents
(`theory.md`, `theory_2.md`); identifiers in `typewriter` refer to the Lean 4 / Mathlib development under `lean/`.
Every claim below is labelled **[proved]** (machine-checked, no `sorryAx` in its axiom trace), **[stated]** (formalised
with an explicit `sorry`), **[heuristic]**, or **[conjecture]**. Where this paper and the theory documents disagree,
the Lean development wins; two such disagreements are reported in §10.3 and are, we believe, corrections to the
theory rather than to the code.*

---

## Abstract

The no-three-in-line problem asks for the largest subset of an `n × n` grid containing no three collinear points; the
trivial ceiling is `2n`, the best known construction is `(3/2 - ε)n`, and the truth is unknown. We study the greedy
subset of `Z²` obtained by sweeping the lattice in `L∞`-ring order and admitting each cell unless it completes a
collinear triple with two already-admitted points. Our organising device is a **horizon** `W`: only triples of `L∞`
diameter at most `W` are forbidden. This is not an approximation but a _resource dial_ — the horizon-`W` and horizon-`∞`
runs agree cell for cell inside a ball of radius `⌊W/2⌋` — and it changes the object qualitatively. At `W = ∞` the
greedy set has planar density zero and every statistic is origin-anchored and singly-sampled; at finite `W` it is an
extensive planar field with a density bracket that holds uniformly in _every_ window anywhere in the plane, a bounded
dependency range, a positive-entropy language of local patterns, and `Θ(R²/W²)` essentially independent samples per run.

We contribute: (i) an exact operational specification of the sieve as a sequential fold, together with the structure
theory (convexity of the gauge along a lattice line; ring and transverse locality; saturation) that makes it
schedulable in `Θ̃(R²)` time with a `Θ(RW)`-bit working set; (ii) a reduction of the density exponent to the growth
rate of a single scalar functional `Σ(P) = Σ_{pairs} 1/‖primdir(q-p)‖∞`; (iii) the observation that the classical object
is the _diagonal_ `W = 2R, R → ∞` of a two-parameter family, which explains why mean-field arguments are
self-inconsistent there and self-consistent at fixed `W`, where they vote for a linear (rather than sublinear) density;
(iv) a **history census** which proves that all anisotropy of the finite-`W` field is supported on the corners of the
traversal gauge's unit ball and on the intra-ring branch cut, with a `Θ(W)`-wide, constant-contrast density excess along
those rays, together with a conservation law forcing that excess to be a surface term; and (v) a formal framing of the
"library" question — does the field's pattern language exhaust the subshift of finite type that contains it? — with two
rigorous obstructions that provably miss the extremal patterns.

A machine-checked core of roughly sixty statements accompanies the paper. We are explicit about what is _not_ proved:
the exactness theorem for the horizon, the asymptotics of the two counting constants, and both density floors remain
formalised-with-`sorry`, and the paper's headline conjectures are stated in Lean as unproved `Prop`s that may not be
used as hypotheses anywhere.

---

## 1. Introduction

### 1.1 The problem and the construction

Let `Λ = Z²`. A finite `P ⊂ Λ` is **valid** if no three distinct points of `P` are collinear. The no-three-in-line
problem asks for `opt(n) := max{|P| : P ⊆ [n]², P valid}`. Counting rows gives `opt(n) ≤ 2n` and no better upper bound
is known; the best construction achieves `(3/2 - ε)n`, and whether `opt(n)/n → 2`, or even whether the limit exists,
is open.

We study the deterministic object obtained by making the constraint greedy and the enumeration geometric. Fix a total
order `≺` on `Λ` that is **ring-monotone** — `‖p‖∞ < ‖q‖∞ ⟹ p ≺ q` — and refines each `L∞` sphere by a fixed
intra-ring rule (clockwise from `(0,R)`, say). Define `P` by the fold

    c ∈ P  ⟺  c ∈ seed  or  c is not blocked by {p ∈ P : p ≺ c}

where "blocked" means that two already-admitted points are collinear with `c`. The output is a function of the triple
`(≺, seed, W)` and of nothing else — not of any scheduling, parallelisation or representation choice
(`mem_Gset_iff`, **[proved]**).

### 1.2 The horizon

The classical constraint is global: a collinear triple whose extreme points are `10⁶` apart forbids a placement even
though no `10³`-window could contain it. We localise. A triple is **`W`-admissible** if all three pairwise `L∞`
distances are at most `W`; `P` is **`W`-valid** if it contains no `W`-admissible collinear triple. Equivalently
(`wvalid_iff_windows`, **[proved]**), `P` is `W`-valid iff `P ∩ Q` is valid for every axis-aligned `(W+1) × (W+1)`
window `Q`. So `W`-validity is _exactly_ the classical condition at scale `W+1`, with no slack — a consequence of the
gauge, the traversal metric and the objective's metric all being the same metric (§2.3).

Two facts make the horizon worth taking seriously rather than treating it as a truncation heuristic.

- **It is lossless where it matters.** Inside `B(R)` the run at `W = 2R` and the run at `W = ∞` agree cell for cell
  (T2A.7 / `horizon_exact`; **[stated]** — this is the development's headline open obligation, see §13.2). Hence `W` is
  a resource dial, not an accuracy dial: a pair of span `> 2R` provably cannot influence any cell of `B(R)`, and the
  unbounded engine spends its memory on exactly those pairs.
- **It changes the object's phase.** At `W = ∞` the set has planar density `O(1/R)` (`density_fades`, **[proved]**), so
  there is no field to speak of and every measurement is a single origin-anchored sequence. At finite `W` the density
  is bounded below uniformly in _every_ sufficiently large window anywhere in the plane, and above by `2/(W+1)`; the
  dependency range of the fold is `W`, not `R`; and a run to radius `R` yields `Θ(R²/W²)` essentially independent
  samples of exactly the window size the literature quotes.

### 1.3 Contributions

1. **Exact specification and its refinements** (§4–§7). The oracle, the line sieve, the calendar, and the finite-`W`
   rolling band, each proved to compute the same function. Two correctness traps are isolated and given minimal
   machine-checked witnesses: outward-only mark pruning is unsound unless each line is first split at its convexity
   vertex (`not_monotone_witness`), and closure over "cross-family" pairs alone is unsound because a ring can block
   itself (`crossOnly_is_unsound`). The mark algebra is associative-commutative-idempotent and the placement algebra is
   not (`marks_ACI`, `placement_not_ACI`), which is exactly the boundary of parallelisability.
2. **A scalar reduction of the density exponent** (§8). The exponent `α` in `k(R) ≍ R^α` is controlled by the growth of
   `Σ(P ∩ B(R)) = Σ_{pairs} 1/‖primdir(q-p)‖∞`: adversarial growth `Θ(k^{3/2})` yields only `α ≥ 2/3`, while typical
   growth `Θ(k log² k)` yields `α = 1` up to logarithms. `Σ` is one number per radius.
3. **A diagnosis of mean-field failure** (§11). The Poisson self-consistency has _no_ power-law solution at `W = ∞`.
   We locate the reason: the classical object is the diagonal `W = 2R` of a two-parameter family, so its effective
   interaction range grows with the run and it never enters a steady state. At fixed `W` the same computation is a
   one-dimensional root-find with a solution, and it predicts `δ(W) ≍ 1/W`, i.e. `α = 1` — against the prior suggested
   by the greedy-Sidon and greedy-3-AP precedents.
4. **The seam calculus** (§10). The **history census** `H(c) := |{p : p ≺ c, ‖p-c‖∞ ≤ W}|` is pure combinatorics of the
   traversal. We compute it exactly, show that it is translation-invariant except in `Θ(W)`-wide strips around the rays
   through the corners of the traversal gauge's unit ball (where it _halves_) and around the intra-ring branch cut, and
   derive a density profile `2/(1 + j/W)` for the resulting "spokes". A conservation law (P10.4, new here) pins the mean
   census at `2W² + 2W` for _every_ order, forcing the spoke excess to be a surface term — and, by convexity, inverting
   the design objective: a greedy field's yield is increased by _increasing_ the variance of the census, not by
   removing seams.
5. **The library question, delimited** (§12). The `W`-valid configurations form a two-dimensional subshift of finite
   type `X_W` with entropy `Ω(1/W²)` — positive, whereas `h(X_∞) = 0`. The greedy field's language `L_s(P_W)` is
   contained in it (`langP_subset_langX`, **[proved]**). Two rigorous obstructions bound the ambition: a periodic far
   field has finite language and hence cannot be universal (`langP_finite_of_biperiodic`), and no pattern with an empty
   `(2W+1)`-window can occur (`no_empty_patch`), whence `s*(W) ≤ 2W`. Both obstructions provably miss the
   maximum-population patterns, which are self-saturating.
6. **A machine-checked core and an audit** (§13). Roughly sixty statements are formalised; `#print axioms` on each is
   the project's status report, and a theorem whose trace mentions `sorryAx` is not proved here whatever the prose says.

### 1.4 What survives if the theory is wrong

Deliberately, the certain deliverables are independent of the speculative ones. Any window of the field is a genuine
no-three-in-line configuration checkable in `O(m²)` integer operations (`window_pattern_valid`, **[proved]**), so a
harvested record is a _certificate_ whether or not any conjecture here holds. Every sub-window of a valid set is valid
(`C8_subwindow`, **[proved]**), so a run reports certified lower bounds for the classical `c(s)` at every `s ≤ W+1`,
from `Θ(R²)` positions rather than one. And the `Σ` curve of §8 decides between the two competing density scenarios
without passing through any horizon-transfer conjecture at all.

---

## 2. The lattice, the gauge, and exact collinearity

### 2.1 Gauge

Write `‖p‖∞ = max(|p.x|, |p.y|)`, valued in `N` so that it _is_ the ring index (`nrm`). Three facts are used
downstream and nothing else: subadditivity (`nrm_add_le`), absolute homogeneity over `Z` (`nrm_smul`), and that the
unit ball is a square (`nrm_le_iff`, which is what lets `omega` discharge most gauge goals). We write
`B(R) = {‖p‖∞ ≤ R}` (a `(2R+1) × (2R+1)` axis-aligned window, `card_ballF`), `S(R) = {‖p‖∞ = R}`, and
`diam∞ B(R) = 2R` (`diam_ball`) — a constant that is sharp and used quantitatively.

### 2.2 Collinearity is an integrality statement

Define `cross(u,v) = u.x·v.y - u.y·v.x` and `Coll(p,q,r) :⟺ cross(q-p, r-p) = 0`. This is an equation over `Z`; no
rounding, thickening, or floating point can enter a decision. `Coll` is decidable by `decide` and invariant under all
six permutations of its arguments and under translation (`coll_rot`, `coll_swap`, `coll_translate`, all
**[proved]**).

**L2.1 (lattice line) [proved] `lattice_line`.** If `d` is primitive and `Coll(p, p+d, r)`, then `r = p + t·d` for an
_integer_ `t`. Bézout is the whole proof, and it is the only place primitivity is genuinely needed.

**L2.3 (two per line) [proved].** In a valid `P` every row, column and diagonal carries at most two points
(`card_row_le_two`, `card_col_le_two`, `card_diag_le_two`), whence `k(R) ≤ 2(2R+1)` (`card_ball_le`) and, since every
cell of `S(R)` lies on one of the four face lines, `|P ∩ S(R)| ≤ 8` (`card_ring_le_eight`).

The last two are `W = ∞` statements and both fail at finite horizon: a row carries at most two points _per
`(W+1)`-window_, not two points ever. Every downstream argument that leans on `|A_R| ≤ 8` is therefore a `W = ∞`
argument, and §9 re-derives the finite-`W` replacements.

### 2.3 Why `L∞`

Four reasons, each a theorem rather than a preference. (i) Level sets are closed-form: intersecting a lattice line with
a ring reduces to `x = ±R` or `y = ±R`, pure integer arithmetic with an exact three-way classification (T4.4). (ii) The
chord bound `|ℓ ∩ B(R)| ≤ 2R/‖d‖∞ + 1` has the _sharp_ constant `2R = diam∞ B(R)` (`chord_bound`), which is what
converts "most directions are steep" into the `Θ(log R)` marks-per-line estimate that is the entire performance thesis.
(iii) An axis-aligned `s × s` window _is_ an `L∞` ball, so the traversal gauge, the analysis gauge and the literature's
gauge coincide and the ring counter already reports a point of the `c(n)` curve. (iv) The horizon's influence region
`B(p,W) ∩ B(q,W)` is an axis-aligned rectangle and its intersection with a line is an integer interval computed by one
division (`influence_interval`, **[proved]**), so "enforce the constraint for windows of side `n`" translates to
`W = n-1` with no slack.

The price is flat faces: a line can meet a ring in an entire face of `2R+1` cells. This degenerate branch is not rare —
it fires up to four times per ring and can deposit `Θ(R)` marks there — and it is entangled with the hardest correctness
requirement in the design (§6). We regard the exchange as clearly favourable but it must be paid in exhaustive
small-radius testing rather than in sampling.

---

## 3. The horizon, formally

**D3.1 (`Adm`).** `Adm W p q r` holds iff all three pairwise spans are `≤ W`. The third clause is _not_ implied by the
first two — two points at distance `≤ W` from `c` on opposite sides can be `2W` apart — so it is a field of the
structure and dropping it over-blocks. This is the finite-`W` analogue of the `±` subtlety in the direction test.

**D3.2 (`WValid` / `WValidS`).** `P` is `W`-valid iff it has no `W`-admissible collinear triple. `W : N∞`, so that
`W = ⊤` _is_ the classical object rather than a separate code path (`wvalid_top_iff`, **[proved]**). Lowering the
horizon only removes constraints, so a `W`-valid set is `W'`-valid for every `W' ≤ W` (`wvalid_mono`, **[proved]**);
this — not any monotonicity conjecture — is what the certification claim rests on.

**L2A.4 (local oracle) [proved] `blocked_local`.** Only points within `W` of `c` can `W`-block it, so the oracle costs
`Θ(|P ∩ (c + B(W))|)` rather than `Θ(|P|)`.

**L2A.6 (truncated chord) [proved] `card_marks_le`, `chord_bound_horizon`.** An admissible pair deposits at most
`2⌊W/‖d‖∞⌋ + 1` marks _independently of `R`_, and a pair of span `> W` deposits none. A line is truncated independently
by the window and by the horizon, with effective bound `min(2R, 2W)/‖d‖∞`.

**T2A.7 (exactness) [stated] `horizon_exact`.** For `‖c‖∞ ≤ R`, `c ∈ P_{2R} ⟺ c ∈ P_∞`. The proof is an induction along
`≺` requiring the strengthened hypothesis that the two runs have equal prefixes; `adm_of_small` (**[proved]**) supplies
the geometric half — inside `B(R)` every triple is `W`-admissible once `W ≥ 2R`. Closing this obligation is the single
highest-value formalisation task in the project, because it is what licenses running at a finite horizon and reporting a
_classical_ certificate. It also supplies the cheapest full-stack regression test available: two engines at different
horizons must agree cell for cell on the common ball.

---

## 4. The greedy sieve, saturation, and the runtime invariant

A `Traversal` is a bijective enumeration of `Λ` with ring-monotonicity as a _field_, not a lemma: every locality
statement below is false without it. `stage T seed W n` is the prefix after `n` decisions; `Gset` is its limit.

**P3.1 (characterisation) [proved] `mem_Gset_iff`.** `c ∈ Gset` iff `c ∈ seed` or `c` was not blocked by the prefix
that existed when it was tested. This is the only characterisation of the output used downstream.

**T5.1 (ring locality) [proved] `ring_locality`.** Everything committed when `c` is tested lies in a ring no later than
`c`'s: the fold never looks outward. (The seed is the only way to violate this, which is a hypothesis and a warning.)

**T5.4 (transverse locality) [proved] `transverse_locality`.** At finite horizon the blockers of `c` live in `c + B(W)`.
Together with T5.1 this bounds the dependency both radially and tangentially: the fold's state is a moving `O(W²)`
window, which is what makes the finite-`W` engine bounded in both directions and the far-field process a bounded-state
dynamical system.

**T3.4 (saturation) [proved] `saturated`, `Gset_WSaturated`.** Every rejected cell is blocked by an admissible collinear
pair of the output that was _already committed_ when the cell was tested. This is the bridge to the only unconditional
density lower bounds we have, and it is the correct formal reading of "relatively maximal". Note it is strictly weaker
than optimality.

**The runtime invariant [proved] `Gset_wvalid`.** If the seed is `W`-valid then so is the whole output: the `≺`-last
member of any admissible collinear triple would have been blocked by the other two. The seed hypothesis is necessary — a
triple inside the seed is never tested. The proof is a nine-way case split on which of `p, q, r` lie in the seed and how
their indices compare; it is the largest single proof in the development and the one that most directly certifies the
engine.

---

## 5. Line structure and scheduling

Fix `p, d` and set `g(t) = ‖p + t·d‖∞`.

**T4.1 (convexity) [proved] `g_convex`.** `2g(t) ≤ g(t-1) + g(t+1)`. In the formal development this is three lines —
midpoint convexity of a gauge along a line is just subadditivity plus homogeneity — rather than a case analysis over
the four affine pieces.

**C4.2 (ray splitting) [proved] `g_mono_of_step`, `g_mono_forward`.** Splitting a line at its minimiser produces two
rays along each of which the ring index is non-decreasing. This is the scheduling primitive: a mark's _identity_ is
exact integer algebra, its _schedule key_ is `g(t)`, and the two are orthogonal.

**T5.3 (the correctness trap) [proved] `not_monotone_witness`.** For `p = (0,5)`, `d = (1,-1)` the key falls and rises
again. Discarding marks by the _sign of a step_, rather than after splitting at the vertex, deletes future marks and
produces an **invalid** set. The split is a correctness requirement, not an optimisation, and this is the sharpest trap
in the design: it fails silently, producing wrong output rather than a crash.

**T4.4 case 4 (flat faces) [stated] `face_of_three_hits`.** If a line meets a ring in three or more points then its
direction is axis-parallel and the line is a face line. The formal proof needs "the level set of a convex integer
function is an interval" plus a slope argument; it is one of the two remaining geometric obligations.

**Scheduling.** Rings are processed in increasing `R`; each ray releases the marks with key exactly `R` immediately
before ring `R` is walked; marks with key below the current ring are never generated. Because keys are monotone, a
bucketed monotone priority queue gives `O(1)` amortised scheduling, so total scheduling cost is `Θ(#marks + R)` with no
logarithmic factor, and the cost model depends on exactly one quantity: the mark volume.

**At finite horizon the calendar collapses.** Every mark of a pair created at ring `r` lies within `W` of an endpoint
and hence in rings `≤ r + W`, so no priority queue is needed at all: marks are deposited eagerly into a rolling band of
`W+1` rings, `Θ(RW)` bits, consumed ring by ring and recycled. This is the only place in the cost model where a
modelling choice removes an _asymptotic_ cost (memory `Θ(R²) → Θ(RW)`) rather than a constant, and it is what makes the
measurement programme affordable.

---

## 6. Intra-ring closure is mandatory

Let `A ⊆ S(R)` be committed during ring `R`. The newly determined lines split into a **cross family** (one endpoint
earlier) and a **segment-internal family** (both endpoints in `A`).

**T6.1 [proved] `T6_1_table`, `crossOnly_is_unsound`.** An algorithm closing only the cross family produces an invalid
set, and a minimal witness exists at `R = 1`. Seeding `{(0,0)}` and sweeping ring 1 clockwise from `(0,1)`, the fold
places `(0,1), (1,1), (1,0)`; of the six pairs available when `(1,-1)` is tested, the unique blocker is `{(1,1),(1,0)}`
— both placed _during ring 1_. Cross-only closure places `(1,-1)` and creates the collinear triple `(1,1),(1,0),(1,-1)`.
Every line of the table is discharged by `decide`, so this file is also the smallest acceptance test for a new
collinearity implementation.

Three corollaries. **Commitment inside a ring is a fixpoint, not a filter**: a cell free when a segment is proposed may
be blocked by the time the walk reaches it, so there is no "propose then filter" formulation. **The witness is also the
degenerate case**: the unique blocker lives on the face line `x = 1`, so the earliest failure of naive pair enumeration
and the earliest firing of the flat-face branch are the same event (`witness_is_face_line`). **Corner sharing is
exhaustively testable**: exactly four cells of each ring lie on two faces (`corners_of_ring1`).

---

## 7. What can and cannot be parallelised

**T7.3 [proved] `marks_ACI`, `foldl_perm_eq`, `foldl_dup_eq`.** "Blocked" is a join in a Boolean lattice, so mark
deposition is associative, commutative and idempotent, and a fold of marks depends only on the _set_ of marks, not on
their arrival order or multiplicity. Mark production may therefore be parallelised or offloaded arbitrarily with
bit-identical results, provided the set of produced marks is determined by the ring index and not by arrival time.

**T7.4 [proved] `placement_not_ACI`.** The placement fold is order-dependent: `decide` exhibits two orders of the same
three candidates giving different outputs. It is a sequential fold and must remain one.

This is a complexity obstruction, not an engineering artifact: the fold is a lexicographically-first maximal
independent set computation on the hypergraph of collinear triples, and LFMIS is P-complete. The available parallelism
is `Θ̃(R)` at radius `R`, against an `Ω(R)` barrier chain — you need `Θ(R)` lanes to saturate the machine and no number
of lanes shortens the chain. At finite horizon, T5.4 does buy _optimistic_ parallelism: two cells more than `W` apart
cannot block each other, so a frontier decomposes into `Θ(8R/W)` chunks interacting through `W`-wide seams, and a chunk
can be executed speculatively from a guessed `O(W²)` state and verified by replaying `O(W)` cells. The
re-synchronisation length is an empirical quantity, not a theorem.

---

## 8. Density in the radius coordinate

Write `k(R) = |P ∩ B(R)|` and posit `k(R) ≍ A·R^α`.

**Ceiling [proved].** `k(R) ≤ 2(2R+1)`, so `α ≤ 1`.

**Floor [stated] `saturation_floor`.** Saturation (T3.4) plus the chord bound plus a union bound over determined lines
gives

    (2R+1)²  ≤  k + 2R·Σ(P ∩ B(R)) + k²/2,       Σ(P) := Σ_{pairs} 1/‖primdir(q-p)‖∞,

whence, using `Σ(P) ≤ 1.103·k^{3/2}(1+o(1))` (`mark_volume_le`, **[stated]**, which in turn rests on the two counting
asymptotics `Phi_asymptotic`, `Psi_asymptotic`, both **[stated]**), `k(R) = Ω(R^{2/3})` and `α ≥ 2/3` for _every_
ring-monotone order, intra-ring rule and seed.

**The reduction [stated] `Sigma_lower`.** Rearranging, a saturated set must have a large `Σ` — it must contain much
local collinear structure. Substituting back:

| assumed behaviour of `Σ(P ∩ B(R))` | resulting floor on `k`                     |
| ---------------------------------- | ------------------------------------------ |
| adversarial maximum, `Θ(k^{3/2})`  | `k = Ω(R^{2/3})`, i.e. `α ≥ 2/3`           |
| "typical", `Θ(k log² k)`           | `k = Ω(R/log² R)`, i.e. `α = 1` up to logs |

**This is the cleanest formulation of the open problem: the density exponent is controlled by the growth rate of a
single measurable scalar.** It is also the only route to `α` that does not pass through a horizon-transfer conjecture,
which makes it the highest-priority measurement.

**Mean-field is inconsistent at `W = ∞`.** Model the blocking count per ring cell as Poisson with mean
`μ(R) = βa² ln R` and test `k = A R^α`: `α < 1` forces `μ → 0`, hence `Θ(R)` free cells per ring, hence `k = Θ(R)` —
contradiction; `α = 1` with `βa² < 1` forces the cap-limited value `a = 8`, whence `βa² > 1` — contradiction;
`α = 1` with `βa² > 1` forces sublinear growth — contradiction. No power law is a fixed point. §11 diagnoses why.

**Precedents pull both ways.** Greedy Sidon sets (`n^{1/3}` against `n^{1/2}`) and the greedy 3-AP-free set
(`n^{0.631}` against `n^{1-o(1)}`) show that greedy in a rigid arithmetic order can be _polynomially_ sparser than the
optimum — the motivation for conjecturing `α < 1`. But both are cases where the optimum sits polynomially above the
greedy scale and the constraint is global and additive. No-three-in-line has a _local_ counting ceiling (`2n`) and a
best construction at `1.5n`: optimum and ceiling differ by a constant factor, not a power. Processes with hard local
exclusion and a jammed final state characteristically land within a constant factor of optimal. We therefore regard
`α = 1` and `α < 1` as genuinely open with the priors currently split, and we note that the _same_ precedent that
supports `α < 1` (the greedy 3-AP set is the paradigm of a greedy output with zero entropy and complete self-similar
structure) simultaneously undermines the universality conjectures of §12.

---

## 9. The finite-horizon field

### 9.1 No field at `W = ∞`

**L15.1 [proved] `density_fades`.** The occupancy of `B(R)` is at most `2/(2R+1) → 0`. The classical object has planar
density zero: every window of side `s` at radius `R ≫ s` is empty with probability `1 - O(s/R)`, and every local
statistic is a statistic of the seed's neighbourhood. This is why the classical theory can only speak of exponents and
why every measurement in it is origin-anchored and correlated across radii.

### 9.2 A uniform local ceiling

**T15.3 [proved] `card_le_two_mul_of_valid`, `card_window_le_two_mul`.** Any valid set inside _any_ window of side `s`
has at most `2s` points, by fibring over the `s` rows; hence every window of side `s ≤ W+1` anywhere in the plane holds
at most `2s` points of a `W`-valid set. Nothing in the statement mentions the origin, the seed or the radius. A runtime
violation is under-blocking, i.e. a broken oracle. The general-`s` version, `|P ∩ Q| ≤ s(2s/(W+1) + 2)`, is
**[stated]** (`card_window_le`) and needs only row-blocking bookkeeping.

### 9.3 A uniform local floor

**The erosion lemma [proved] `blocker_in_window`.** A cell deeper than `W` inside a window `Q` can only be `W`-blocked
by a pair lying inside `Q` itself. This — and only this — is what makes a density floor _local_. It says nothing for
`s ≤ 2W`, and §12 shows that this is the real obstruction rather than slack in the proof.

**T15.2 [stated] `local_floor`.** Running the union bound of §8 inside `Q` rather than inside `B(R)` gives
`|P_W ∩ Q| ≥ c₀W^{-4/3}(s-2W)²(1-o(1))` with `c₀ ≈ 0.29`, uniformly over all windows anywhere in the plane. It inherits
the `sorry` of the counting asymptotics. Note that the three floors — global in `R`, global in `W`, local in `Q` — are
one union bound in three coordinates; the fact that the first two produce _the same exponent_ `2/3` in their respective
coordinates is the strongest available evidence that the horizon transfer of §11 has the right form.

**The floor that needs no counting [proved] `exists_near`.** A `W`-saturated field meets every `(2W+1)`-window: an
empty patch of side `> 2W` is impossible, because its centre would have no blocker. This qualitative statement is the
one §12 actually uses.

Together: `δ(W) ∈ [c₀W^{-4/3}, 2/(W+1)]` **locally and everywhere**, a bracket promoted from an average to a uniform
statement. In the `c*` normalisation `c*(W) := (W+1)δ(W)`, this reads `c*(W) ∈ [c₀W^{-1/3}, 2]` — dimensionally the same
quantity as the literature's `c(n)`.

### 9.4 Fluctuations

We define the window occupancy `winCount P s v` and its variance over `B(R)` (`winVar`) and conjecture
**hyperuniformity**: `σ²_W(s) = o(s²)`, plausibly `Θ(s log s)`. The motivation is that "at most two points per
`(W+1)`-run of any row, column or diagonal" is a hard local conservation constraint of exactly the kind that produces
surface-law variance in one dimension, and the field is a two-dimensional interlocking of `Θ(W)` such families. The
operationally important consequence is not the variance itself but the structure factor: a Bragg peak is a periodic far
field, and by T18.4 (§12) a periodic far field kills universality outright. This is the cheapest global periodicity
test available.

---

## 10. The seam calculus

### 10.1 The history census

**D16.1.** For a cell `c` let `N⁻(c) := {p : p ≺ c, ‖p-c‖∞ ≤ W}`, `H(c) := |N⁻(c)|`, `θ(c) := H(c)/W²`.

By T5.4, `N⁻(c)` is _exactly_ the set of cells whose contents can affect the decision at `c`. Everything the greedy
knows when it decides `c` is the field restricted to `N⁻(c)`; two cells with congruent past cones and congruent contents
are decided identically. `θ` is therefore the natural scalar field controlling any positional inhomogeneity of the
outcome — and it is pure combinatorics of the traversal: no placement, no blocking, no randomness. In the formal
development we make it executable: `ringIdx` is the clockwise-from-`(0,R)` intra-ring index, `spiralPrec` is `≺`, and
`Hist W c` counts `N⁻(c)` by brute force over `c + B(W)`, so every entry of the census table is a kernel computation.

### 10.2 The census, and where anisotropy lives

**T16.3 (anisotropy is supported on the gauge's corners and the order's branch cut).** In the far field (`R ≫ W`) the
census is `2W² + 2W` and the local decision rule is translation-invariant, except on (i) four `Θ(W)`-wide strips around
the rays through the **corners of the traversal gauge's unit ball** — here `x = ±y` — where `θ` falls linearly from `2`
to `1`; and (ii) one `Θ(W)`-wide strip around the ray on which the intra-ring rule starts and ends, where `θ` deviates
by `O(1/W)` and _changes sign_ across the ray. All other cells have identical past cones up to translation.

The geometry is the whole content: **`B(c,W)` is truncated by the ring only where the ring turns.** At a corner the
already-visited region occupies a quadrant of `B(c,W)` instead of a half-plane, so the greedy arrives at a corner cell
knowing exactly half as much as it knows in the bulk. The halving is exact, not asymptotic:

**[proved] `hist_corner_half_bulk_W2`, `hist_corner_half_bulk_W3`.** `2·H(corner) = H(bulk)`, verified by kernel
computation at `W = 2` (`6, 12`) and `W = 3` (`12, 24`). The general statement (`hist_corner_half_bulk`) follows from
the two general census rows, both **[stated]**.

### 10.3 A discrepancy, found by the machine

Executing the census contradicts two rows of the table we had written down. With the census as computed (verified
cell-by-cell for `W = 2` and `W = 3`):

| site                          | position      | as first stated        | as computed            |
| ----------------------------- | ------------- | ---------------------- | ---------------------- |
| bulk of a face                | `W < x < R-W` | `2W² + 2W`             | `2W² + 2W` ✓           |
| approach to a corner          | `(R-j, R)`    | `W² + (j+1)W`          | `W² + (j+1)W` ✓        |
| corner                        | `(R, R)`      | `W² + W`               | `W² + W` ✓             |
| **other face of same corner** | `(R, R-j)`    | `W² + jW + j`          | **`W² + (j+1)W + j`**  |
| start of ring (`x ≥ 0`)       | `(j, R)`      | `2W² + W + j`          | `2W² + W + j` ✓        |
| **end of ring (`x ≤ -1`)**    | `(-j, R)`     | `2W² + W + 2(W-j) + 1` | **`2W² + 3W - j + 1`** |

The cheapest way to see that the corrected fourth row is the right one is internal consistency: the original entry
disagrees with the corner row at `j = 0`, and the corrected one agrees. Both corrections are `O(W)` and therefore change
`θ` only at order `1/W`, so the spoke profile of §10.5 and every conclusion drawn from it are unaffected. We record the
episode because it is the intended mode of use of the formal development: the census is declared a _hard invariant_ of
the engine, so a mismatch would have been reported as a traversal-order bug rather than as a theory correction.

### 10.4 A conservation law

**P10.4 (history sum rule).** Let `≺` be _any_ total order on `Λ` and `Ω` a finite `≺`-downward-closed set. Then

    Σ_{c ∈ Ω} H(c)  =  #{ {p,q} ⊆ Ω : 0 < ‖p-q‖∞ ≤ W }  =  |Ω|·(2W² + 2W) - E(Ω),

where `E(Ω)` counts neighbour pairs with exactly one endpoint in `Ω`. Hence the mean of `θ` over `Ω` is
`2 + 2/W - E(Ω)/(|Ω|W²)`.

_Proof._ Each neighbour pair inside `Ω` is counted exactly once, at its `≺`-later endpoint; downward-closure ensures
every contribution to `H(c)` for `c ∈ Ω` lies in `Ω`. The count `|B(W)| - 1 = 4W² + 4W`, halved, gives the bulk value.∎

Three consequences we did not anticipate. First, **the bulk census is forced**: `2W² + 2W` is not a property of the
spiral but the mean over any order, which is why it appears in the table. Second, **the spoke deficit is a surface term
and cannot be made extensive**: over `B(R)`, `E = Θ(RW³)`, and the spokes carry `Θ(RW)` cells at `Θ(W²)` deficit each —
exactly matching. So "the spokes carry `Θ(W/R)` of the mass, hence `δ(W)` is unaffected" is not an estimate but a
conservation identity. Third, and most interesting, **the design objective inverts**: if the density at a site scales as
`1/θ` (§10.5), then total yield scales as `E[1/θ] ≥ 1/E[θ]` by Jensen, with equality iff `θ` is constant. Since the mean
of `θ` is pinned for every order, _a greedy field's density is increased by increasing the variance of the census_, i.e.
by having as many seams as possible. The spiral, which confines its low-`θ` cells to four rays, is close to the worst
case; a multiscale order (visit a coarse sublattice first, then the rest) has extensive `θ`-variance and is the obvious
experiment. This is the one line of enquiry in the programme that could turn a _measurement_ of a construction into a
_better construction_.

### 10.5 From census to density: the spoke profile

Model the blocking count at `c` as `μ(c) = κ(δ(c)H(c))² ln W / W²` — past pairs in the cone times the chance a given
admissible pair's line covers `c` — and the acceptance probability as `e^{-μ}`. Writing `δ = β/W` and `H = θW²`, the
fixed point `δ = e^{-μ}` reads `κθ²β² = 1 - ln β / ln W`. Dropping the logarithmic correction, `θβ` is a constant of the
field, and therefore

**[proved] `spoke_ratio`.** If `κθ₁²β₁² = κθ₂²β₂² = 1` with all quantities positive, then `β₁θ₁ = β₂θ₂`. The density
ratio between two sites depends on their census values alone and is **independent of `κ`** — the only part of the
mean-field calculation we are prepared to trust.

**[proved] `spoke_peak_two`.** Halving `θ` doubles `β`. With the exact halving of §10.2, the peak spoke contrast is
exactly `2`.

Substituting the census profile `θ(j) = 1 + j/W` gives a transverse density profile `2/(1+j/W)`, half-width `W`, mean
`2 ln 2 ≈ 1.386` over the strip, and an excess mass per ring of `Θ(δW)` — that is, `Θ(W/R)` of the ring, as the
conservation law requires. The predicted picture is: four bright rays exactly on `x = ±y`, of _constant_ width `Θ(W)`
and _constant_ peak contrast `≲ 2` — neither growing nor fading with `R` — with a `1/(1+j/W)` rather than Gaussian
profile, plus one faint dipole along the intra-ring start ray, bright on the side swept first and dark on the side swept
last, of contrast `O(1/W)`.

### 10.6 The decisive test, and the Ulam comparison

The mechanism above is _causal_ (the past cone is truncated where the traversal turns), not _arithmetic_ (the diagonals
are short lattice directions). The two are separated by one experiment: change the traversal gauge and keep everything
else fixed.

| traversal gauge | corners of unit ball   | predicted spokes          |
| --------------- | ---------------------- | ------------------------- | --- | --- | --------- | ---------- |
| `L∞` (current)  | `(±1,±1)`              | `x = ±y` — as observed    |
| `L¹`            | `(±1,0),(0,±1)`        | the **axes**              |
| `L²`            | none (strictly convex) | **none**; branch cut only |
| `max(           | x                      | /2,                       | y   | )`  | `(±2,±1)` | `y = ±x/2` |

An arithmetic mechanism predicts a diagonal feature in every row; the causal mechanism predicts the table. The `L²` row
is the strongest form, and it is nearly free to run: since `B₂(r) ⊆ B∞(r) ⊆ B₂(r√2)`, an `L²`-ordered commit sequence
can be driven by the same `L∞` calendar provided marking runs ahead by a factor `√2` in radius, so `L²` is a
commit-order filter rather than a second scheduler. Two further discriminators: the spokes must not move when the seed
is moved or enlarged, and reversing the intra-ring direction must leave the four bright spokes exactly invariant while
mirroring the branch-cut dipole.

The resemblance to the Ulam spiral is real and the mechanism is not the same. There the feature is in the _labels_ —
the spiral index is quadratic along a ray, and prime-rich quadratics align with rays — so relabelling removes it and the
underlying set is untouched. Here the feature is in the _set_: the extra points on the spokes are really there and
really valid. The shared moral is the operative one: **a feature aligned with the traversal's own symmetry axes is
presumptively an artefact of the traversal, and the burden of proof is on the claim that it is a fact about the
object.** Anything reported from the spokes must therefore state whether it is a claim about the field or about the pair
(field, order). The mechanism is an artefact; the certificates are not.

---

## 11. Mean field, restored at finite horizon

**Why the classical inconsistency does not transfer.** The contradiction of §8 is obtained by requiring a _power law in
`R`_ to be a fixed point of a relation whose mean blocking multiplicity `μ ∝ ln R` grows without bound along the run.
At finite `W`, transverse locality caps the dependency range, `μ = Θ(c*² ln W)` is _constant in `R`_, and the
self-consistency requirement is not "a power law in `R`" but "a number `δ`". A constant always has a fixed point; the
finite-`W` mean field is a one-dimensional root-find with no free exponent, and there is nothing to contradict.

The diagnosis generalises, and we regard it as the most transferable sentence in this work: **the classical object is
the diagonal `W = 2R, R → ∞` of a two-parameter family — a process whose own interaction range grows as it runs, and
which therefore never enters a steady state.** Mean-field arguments should not be expected to apply to such processes,
and their failure says nothing about the correlations of the fixed-`W` field.

**Consequence.** With `μ = κc*² ln W`, the fixed point at `θ = 2` gives `δ(W) ≈ 1/(2√κ W)` and hence
`c*(W) → c*_∞ = 1/(2√κ) ∈ (0,2)`; through the horizon transfer `c*(W) ≍ W^{α-1}` this is `α = 1`. The formal
statements are `mf_solution_exists` (existence of the finite-`W` root, by IVT — **[stated]**) and `cstar_tendsto`
(the limit — **[stated]**).

**A methodological warning, and it is the most likely route to a wrong published conclusion.** Keeping the sub-leading
term, `c*(W) = c*_∞(1 + Θ(1/ln W))`, so the measured local slope of `log c*` against `log W` is `-Θ(1/ln²W)`: small,
negative, and decaying only logarithmically. Over the two decades in `W` that a run can afford this produces an
apparent `α - 1 ≈ -0.02 … -0.05` with an excellent-looking straight-line fit — i.e. it will read as _confirmation_ of
`α < 1` when the truth is `α = 1`. Any estimate of `α` from `c*(W)` must therefore fit **both** a pure power law and a
constant-plus-`1/ln W` model and report the model comparison, not the slope. The two are separated by curvature and by
extrapolation, and are _not_ separated by the quality of a linear fit. `models_differ` (**[stated]**) records the
distinction formally.

**What is not to be trusted.** The overdispersion of the blocking distribution relative to Poisson — the real lesson of
the classical inconsistency — is untouched by any of the above, and by Jensen it _raises_ survival probability, so
`c*_∞` from the fixed point is a lower bound on the mean field's own prediction and `κ` is not computable from counting
alone. The exponent is the robust part: `δ ≍ 1/W` follows from the _shape_ of the fixed point and is insensitive to
`κ`. To obtain `α < 1` from this framework one needs `μ` to acquire a factor growing _polynomially_ in `W`, i.e. genuine
long-range order — which is exactly what the hyperuniformity and patch-complexity measurements probe.

---

## 12. The library: does the field contain every configuration?

### 12.1 A subshift and one orbit in it

The `W`-valid configurations form a two-dimensional **subshift of finite type** `X_W`: the forbidden patterns are the
`W`-admissible collinear triples, all of which fit in a `(W+1)`-window. Write `LangX W s` for its language at side `s`
— for `s ≤ W+1` this is exactly the set of no-three-in-line configurations of `[s]²` — and `LangP P s` for the patterns
that actually occur in the field.

**The trivial inclusion [proved] `langP_subset_langX`.** Anything the field displays is `W`-valid. This is the formal
content of "a harvested record is a certificate": it needs none of the seam or mean-field theory.

**The library is large [proved] `sublattice_wvalid`, `entropy_lower`.** Any subset of `(W+1)Z²` is `W`-valid — for a
reason cruder than collinearity: no two of its points are even `W`-admissible — so `|L_s(X_W)| ≥ 2^{Θ(s²/W²)}` and
`h(X_W) = Ω(1/W²) > 0`. The construction dies at `W = ∞`, and indeed `h(X_∞) = 0` since a valid configuration has
`O(s)` points in `[s]²`. **Positive entropy is another qualitative gain of the horizon, and it is what makes the library
worth searching.** The matching upper bound `h = O(log W / W)` by row-blocking is **[stated]**
(`langX_card_upper`).

### 12.2 Two rigorous obstructions

**T18.4 (periodicity kills universality) [proved] `patternAt_reduce`, `langP_finite_of_biperiodic`.** If the far field
has period lattice containing `(a,0)` and `(0,b)`, then `|L_s(P)| ≤ ab` for _every_ `s`, while
`|L_s(X_W)| ≥ 2^{Θ(s²/W²)}`. Hence periodicity and universality are mutually exclusive, and a Bragg peak in the
structure factor is a one-shot refutation of the library conjecture. We note in passing that the far field is a
_deterministic sequential cellular automaton_ rather than a Markov chain on a finite state space: for a single row of
finite length the state is finite and eventual periodicity is forced, but for the bi-infinite far field it is not, so
both periodicity and universality remain open.

**T18.6 (erosion) [proved, qualitative] `no_empty_patch`; [stated, quantitative] `erosion_obstruction`.** A
`W`-saturated field meets every `(2W+1)`-window, so no pattern with an empty `(2W+1)`-window occurs. Since the empty
pattern lies in `L_s(X_W)` for every `s`, and a window of side `s ≥ 2W+1` contains a full `B(c,W)`, we get
unconditionally

    s*(W) := sup{ s : L_s(P_W) = L_s(X_W) }   ≤   2W,

sharpening the estimate `< 3W` we first recorded. The natural conjecture is `s*(W) ≥ W+1`, exactly the scale at which
the library coincides with the classical no-three-in-line configurations, so the target interval is `W+1 ≤ s* ≤ 2W`.

**T18.7 (saturation) [proved] `greedy_saturated_local`, `Gset_WSaturated`.** Every empty cell of the greedy field is
blocked by a pair _inside its own `W`-collar_. Hence only patterns extending to a `W`-saturated configuration can ever
occur: a pattern with an _unavoidable hole_ — an empty cell that no valid placement in its collar can block — is
permanently absent.

**Why the obstructions miss the targets.** A maximum-population configuration in `[s]²` is maximal: every empty cell is
already blocked by a pair inside the window. Such patterns are self-saturating, hence immune to T18.7, and for
`s ≤ W+1` immune to T18.6 as well. **The patterns the programme actually wants are exactly the patterns the two
rigorous obstructions cannot exclude.** The converse warning is that sparse or designed configurations may be
permanently absent, so universality must be stated for _saturable_ patterns and no experiment should look for a
hole-bearing target.

### 12.3 The harvest, and its honest status

Every `s`-window of a `W`-valid field with `s ≤ W+1` is a genuine no-three-in-line configuration
(`window_pattern_valid`, **[proved]**), so the maximum over all `Θ(R²)` windows is bounded by the _true_ optimum
(`maxpop_le_opt`, **[proved]**) and hence by `2s` (`opt_le_two_mul`, `maxpop_le_two_mul`, **[proved]**). This is the
exact sense in which a spoke record cannot contradict the ceiling conjecture: that conjecture concerns the
origin-anchored density `k(R)/(2R+1)`, while the harvest is a maximum over windows bounded by `opt(s)`. **A reported
harvest exceeding `opt(s)` is a verifier bug, full stop.**

The harvest conjecture asserts that at `W = s-1` the field's best `s`-window attains `opt(s)` for all sufficiently large
radius, with a waiting radius exponential in `s` whose constant is the large-deviation rate of the window-population
distribution — a quantity the very first run measures. Two remarks. First, the choice `W = s-1` inverts the naive
instinct that a larger horizon is a better approximation: at horizon `W` an `s`-window contains `c*(W)s²/(W+1)` points
on average, so the deviation needed to reach `2s` grows linearly in `W/s`, and every unit of extra horizon makes the
field sparser at the scale being harvested. For _certification_, by contrast, larger `W` is strictly stronger, so the
two uses of the dial pull in opposite directions and must be run as separate experiments. Second, and we state it
plainly: waiting times for _typical_ patterns are `W^{Θ(W)}`, so universality is a qualitative property of the field and
**not** a competitive search algorithm. The harvest's value is as a test of the field's tail behaviour and of
universality itself; the record-hunting framing is speculative and should be read as such.

---

## 13. The formal development

### 13.1 Structure and method

The development is Lean 4 with Mathlib, organised as: `Basic` (gauge), `Collinear` (validity, the counting bounds),
`Horizon` (`W`), `Gauge` (convexity, chord bounds), `Greedy` (the fold, locality, saturation, the runtime invariant),
`Witness` and `Marks` (executable models and the two `decide`-checked traps), `Density` (statements of the analytic
frontier), `Field`, `Seams`, `MeanField`, `Library` (the finite-horizon theory), and two `Conjectures` files.

Three methodological commitments are enforced mechanically rather than editorially.

- **Conjectures are `Prop`s, not axioms.** The density exponent is unknown, and `Conjectures.lean` /
  `Conjectures2.lean` state every conjecture formally without proving any of them. Nothing in those files may be used as
  a hypothesis elsewhere. A conjecture one cannot state formally is a conjecture one cannot falsify.
- **The audit is the status report.** `Axioms.lean` prints the axiom dependencies of every claim. A theorem whose trace
  mentions `sorryAx` is not proved here, whatever the prose says. The list only grows, and a line only moves from the
  open block to the proved block.
- **Small combinatorial claims are executed, not asserted.** The `T6.1` blocking table, the order-dependence witness,
  the non-monotone key witness, the corner count of a ring, and every row of the history census at `W = 2, 3` are
  discharged by kernel computation.

### 13.2 What is open

The open obligations, in rough order of value:

- `horizon_exact` — the exactness of the horizon. It licenses the entire finite-`W` programme and supplies the cheapest
  regression test. The missing ingredient is the strengthened induction hypothesis that the two runs share prefixes.
- `local_floor` (and its consequences `erosion_obstruction`, `W_saturation_floor`, `saturation_floor`) — the density
  floors, all of which reduce to one union bound plus the two counting asymptotics `Phi_asymptotic`, `Psi_asymptotic`.
- `card_window_le`, `k_W_upper` — row-blocking bookkeeping, no new mathematics.
- The six general census rows and `hist_bulk_translation_invariant` — finite counts of a lattice rectangle against a
  piecewise-linear index; they need a rewriting of the box enumeration into a double sum first, and the `W = 2, 3`
  instances above are the acceptance tests for whoever writes it.
- `face_of_three_hits` — the flat-face classification.
- `par_iff_primDir` — the primitive-direction form of the direction test. Nothing depends on it (the engine tests
  `cross = 0`), and it is kept honest rather than assumed.
- `mf_solution_exists`, `cstar_tendsto`, `models_differ`, `theta_bulk_tendsto`, `langX_card_upper` — analytic
  statements of §11–§12.

---

## 14. The measurement programme

The programme is designed so that each item is either a hard invariant (a violation is a bug with a known cause) or a
falsifier for a named conjecture.

**Hard invariants.** (i) The two horizons agree cell for cell inside the common ball. (ii) The history census matches
the corrected table exactly, and — better — satisfies the sum rule of §10.4 as a per-region checksum, which costs
nothing extra and catches order bugs the per-cell table cannot. (iii) Every window of side `s ≤ W+1` has at most `2s`
points (a violation is under-blocking); every window of side `s ≥ 2W+2` has at least the floor (a violation is
over-blocking, i.e. a missing span check). (iv) The output is saturated — this catches over-blocking, which a
collinearity verifier structurally _cannot_ see. (v) No mark is scheduled more than `W` rings ahead of its creating
commit. (vi) Marks per line inside `B(R)` at most `min(2R,2W)/‖d‖∞ + 1` — a violation means a bad split, a
non-primitive direction, or an untruncated ray.

**Falsifiers, ranked by information per unit cost.**

1. **Gauge covariance of the spokes.** One run per row of the §10.6 table. Decides causal versus arithmetic mechanism
   outright, and the `L²` row is nearly free.
2. **The `Σ` growth curve.** The only attack on `α` that avoids the horizon transfer entirely.
3. **Both-model fits to `c*(W)`.** The antidote to the `1/ln W` masquerade of §11.
4. **Harvest against tabulated optima for `s ≤ 12` at `W = s-1`.** Three outcomes, all informative: attains `2s` at
   modest radius (the harvest conjecture is alive and the rate function extrapolates its reach); attains it for small
   `s` and plateaus at some `s₀` (the conjecture is false at `s₀`, and one identifies which optimal patterns are missing
   and tests them against the saturation obstruction); never attains it (the field is strongly biased or periodic).
5. **Structure factor and patch complexity.** A Bragg peak or an `O(1)` complexity saturation refutes universality;
   entropy growth `e^{hs²}` with `h ≍ log W / W` supports it.
6. **Multiscale traversal orders** (§10.4). The only experiment that could produce a _better construction_ rather than a
   better measurement.

**One correction to our own earlier design, worth recording.** We had proposed comparing the origin-anchored
`k_W(⌊W/2⌋)/(W+1)` with the far-field `c*(W)` and treating any systematic gap as a refutation of homogeneity. The census
of §10 predicts that this comparison must fail: for a cell at radius `r ≤ W/2` the entire `≺`-past lies inside `B(r)`,
so `θ ≈ 4r²/W²`, averaging to `1/2` against a far-field bulk of `2`. Under the `1/θ` law the origin window should be
denser by a factor of up to four, capped by the ceiling. The gap is _predicted_, and it is `W`-independent, so it does
not touch `α = 1 + lim log c*/log W`. The criterion must be restated as **constant ratio, not equal ratio**: it is drift
of the ratio with `W` that would refute homogeneity.

The same observation yields a unifying reframe and a weaker, more tractable target. **The classical (`W = ∞`) greedy set
is entirely boundary layer** — every cell it decides has a truncated past cone, because the visited region is always a
ball of radius comparable to the interaction range. The finite-`W` field is the only regime in which a bulk exists at
all, and the spokes are precisely where the finite-`W` field locally reproduces the classical regime. Consequently the
horizon transfer does not need to be proved in full: it would suffice to prove the _one-sided_ comparison "the origin
window is at least as dense as the far field, uniformly in `W`", which combined with a measured `c*(W) → const` already
gives `α = 1`.

---

## 15. Open problems

1. **Prove `Σ(P ∩ B(R)) = O(k·polylog k)`** for greedy sets. This upgrades `α = 1` from conjecture to theorem via the
   reduction of §8, with no engine involved.
2. **The one-sided transfer** of §14: the origin window is at least as dense as the far field, uniformly in `W`.
   Strictly weaker than the full horizon transfer and sufficient for one direction.
3. **Minimum size of a _saturated_ valid set in `[n]²`.** The union bound gives `Ω(n^{2/3})` and we know no matching
   construction. If saturated sets of size `O(n^{2/3+ε})` exist, the sublinear scenario becomes far more plausible; if
   the truth is `n^{1-o(1)}`, then `α = 1` follows for _every_ ring-monotone order and the question is decided by pure
   combinatorics rather than by measurement. Either resolution is publishable independently of this programme, and it
   should be checked against the existing literature on maximal no-three-in-line configurations before being presented
   as open.
4. **Is `δ(W) = Θ(W^{-4/3})` or `Θ(W^{-1})`?** Through the transfer this is exactly `α = 2/3` versus `α = 1`, and it is
   the sharpest statement of the central question.
5. **Compute `δ(W)` exactly for small `W` by transfer matrix** on the `(2W+1) × (W+1)` far-field state. Is the recurrent
   class a single periodic orbit, and up to which `W`? This attacks the periodicity-versus-universality dichotomy from a
   direction the engine cannot, and it also produces exact values against which the mean-field constant can be fitted —
   the only route to giving the fixed point a number.
6. **A one-dimensional toy.** The greedy `W`-locally-3-AP-free subset of `Z`, scanned left to right, has an update
   depending only on the last `W` bits and is therefore a deterministic finite automaton: its far field is _provably_
   eventually periodic for every `W`, and density, period and full language are computable exactly in milliseconds for
   `W` into the hundreds. It settles, in the analogous setting, whether periodicity is the generic outcome, whether
   universality can hold at all when the state is finite (it cannot), and whether the restored mean field gets the
   _scaling_ right. It also exhibits in miniature the contrast between the density-zero classical object (the ternary
   digit set) and the positive-density local one. We regard this as the cheapest decisive experiment in the whole
   programme.
7. **Is `c*(W)` monotone in `W`?** Raising the horizon adds constraints, so one expects a decrease; but the fold is
   order-dependent, and a point suppressed early can liberate two later. A counterexample at small `W` is a finite search
   and the transfer matrix of (5) settles it for `W ≤ 5` for free. **A measured violation is a discovery, not a bug** —
   it would show that order-dependence can _pay_, which is the thesis of §10.4 in another coordinate.
8. **Is the field hyperuniform**, and is there a constraint-counting proof of surface-law variance from the
   "at most two per `(W+1)`-run" family alone?
9. **Characterise the saturable patterns.** Is every _maximal_ valid pattern of side `s ≤ W+1` saturable in its collar?
   We know the maximum-population ones are; maximal-but-not-maximum is open, and it is the only gap between the
   saturation obstruction and universality for the patterns that matter.
10. **Traversal design as optimisation.** By §10.4 the mean census is order-independent and the yield is convex in its
    reciprocal, so yield is maximised by maximising census variance. Which orders maximise it subject to the local
    ceiling? Is there a gauge whose _entire_ far field is seam?
11. **Is there an `o(R²)` algorithm** — one that never enumerates most cells? Any algorithm materialising all determined
    lines is `Ω(k²)`; beating the traversal cost when the field is sparse requires a live-cell enumerator. At finite
    horizon the traversal dominates outright, so this is the binding algorithmic question.

---

## 16. Summary

| claim                                                                                                    | status                                 | where |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----- |
| Collinearity is exact integer algebra; every line of a lattice line is `p + t·d`                         | proved                                 | §2.2  |
| Two points per row/column/diagonal; `k(R) ≤ 2(2R+1)`; `≤ 8` per ring — all `W = ∞` only                  | proved                                 | §2.2  |
| `W`-validity = validity in every `(W+1)`-window; monotone in `W` downward                                | proved                                 | §3    |
| Only points within `W` of `c` can block it; influence region is an integer interval                      | proved                                 | §3    |
| The horizon is exact inside `B(⌊W/2⌋)`                                                                   | **stated**                             | §3    |
| The output is a function of `(≺, seed, W)` alone; rejected cells are blocked by committed pairs          | proved                                 | §4    |
| The fold is `W`-valid if the seed is                                                                     | proved                                 | §4    |
| The gauge is convex along a lattice line; split rays have monotone keys                                  | proved                                 | §5    |
| Outward-only pruning without splitting is unsound (explicit witness)                                     | proved                                 | §5    |
| Intra-ring closure is mandatory (minimal witness at `R = 1`)                                             | proved                                 | §6    |
| Marks are ACI; placement is not; the serial core is a P-completeness obstruction                         | proved                                 | §7    |
| `α ∈ [2/3, 1]`; the exponent is decided by the growth of `Σ`                                             | ceiling proved, floor stated           | §8    |
| Mean field has no power-law fixed point at `W = ∞`                                                       | proved (arithmetic)                    | §8    |
| At `W = ∞` the object has planar density zero                                                            | proved                                 | §9.1  |
| At finite `W`: `≤ 2s` in every `s ≤ W+1` window anywhere                                                 | proved                                 | §9.2  |
| At finite `W`: a positive local floor in every window anywhere                                           | stated                                 | §9.3  |
| A `W`-saturated field meets every `(2W+1)`-window                                                        | proved                                 | §9.3  |
| Anisotropy is supported on gauge corners and the branch cut; corner census is exactly half bulk          | proved at `W = 2,3`; stated in general | §10.2 |
| Two census rows of the original table are wrong; corrected by machine                                    | proved                                 | §10.3 |
| Mean census is `2W² + 2W` for **every** order; spoke deficit is a surface term                           | proved (by hand)                       | §10.4 |
| Density ratio depends on census alone, independently of the mean-field constant; peak contrast exactly 2 | proved                                 | §10.5 |
| Restored at finite `W`, mean field gives `δ ≍ 1/W`, i.e. `α = 1`                                         | heuristic                              | §11   |
| `c*(W) = c₀ + Θ(1/ln W)` will masquerade as `α < 1` over two decades                                     | heuristic — warning                    | §11   |
| `X_W` is an SFT with entropy `Ω(1/W²) > 0`; `X_∞` has entropy zero                                       | lower half proved                      | §12.1 |
| Periodic far field ⇒ finite language ⇒ universality false                                                | proved                                 | §12.2 |
| No empty `(2W+1)`-patch occurs, hence `s*(W) ≤ 2W`                                                       | proved                                 | §12.2 |
| Only saturable patterns occur — but the maximum-population ones are saturable                            | proved / observed                      | §12.2 |
| Any harvested window is a certificate, bounded by `opt(s)`, never contradicting the ceiling              | proved                                 | §12.3 |

**One sentence.** Bounding the collinearity constraint to a horizon `W` converts a density-zero, fading,
origin-anchored curiosity into a genuine planar field with a uniform local density bracket, a bounded dependency range,
a positive-entropy library of local patterns, and exactly two order-induced defects — four `Θ(W)`-wide spokes on the
corners of the traversal gauge, where the greedy knows exactly half as much and therefore places about twice as much,
and a faint dipole where the intra-ring rule starts; the spokes are artefacts of the ordering rather than facts about
no-three-in-line configurations, but the points in them are real, and if the field's pattern language is as rich as the
subshift containing it, then scanning it is a certificate-producing search of the classical problem at side `Θ(W)`,
whose reach is set by a large-deviation rate that the very first run can measure — while the density exponent itself
remains genuinely open, bracketed rigorously between `2/3` and `1`, and reduced to two measurable functionals.
