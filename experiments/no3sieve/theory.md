# No-Three-in-Line Sieve — Theory

Status: **THEORY / NORMATIVE FOR SEMANTICS, NON-NORMATIVE FOR CODE**
Companion docs: `idea.md` (motivation, literature), `plan.md` (engineering spec), `lean/` (machine-checked
formalisation).

Every **L**/**T**/**P** below is either proved in Lean 4 + Mathlib under `lean/`, or stated there with an explicit
`sorry`; `lean/README.md` carries the status table and `lean/NoThreeInLine/Axioms.lean` is the audit. Where this
document and `lean/` disagree about whether something is proved, `lean/` wins. Conjectures live in
`lean/NoThreeInLine/Conjectures.lean` as unproved `Prop`s and may not be used as hypotheses anywhere.

This document is the mathematical layer of the project. It contains (a) an exact algorithm specification at the level of
sets, orders and operators, (b) the structure theory that makes the specification implementable at all, (c) a cost model
derived from that structure, and (d) explicitly labelled **conjectures** and **falsifiable predictions** about how the
construction and the algorithm scale.

It deliberately contains **no implementation details**: no data structures, no APIs, no file formats, no language or
platform concerns. Where a structure is unavoidable to state a cost bound, it appears as a _scheduling discipline_ (an
abstract order of operations), never as a layout. All of that lives in `plan.md`.

Everything asserted here is marked as one of:

| tag               | meaning                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| **L**/**T**/**P** | Lemma / Theorem / Proposition — proved here, or a one-line proof is given |
| **H**             | Heuristic — a non-rigorous computation with stated assumptions            |
| **C**             | Conjecture — a falsifiable claim we intend to test, not to assume         |
| **Q**             | Open problem — not resolved, not needed for v1                            |
| **M**             | Measurement — a specific number the engine must report                    |
| **F**             | Formalised — see `lean/README.md` for which proofs are actually checked   |

The single most important editorial rule of this document: **the density exponent is unknown**, and no section may
assume it. Sections 9–10 give the competing predictions and the experiment that separates them.
The second editorial rule, added in this revision: **every statement is parameterised by a horizon `W`** — the largest
span at which a collinear triple is forbidden (§2A). `W = ∞` is the classical object of §2–§9; a finite `W` is _not_
an approximation of it (T2A.8: the two sets agree exactly inside `B(⌊W/2⌋)`) but a resource dial, and it is the
parameter in which the density exponent is most cheaply measurable (C2A.11). Any statement below that does not name a
horizon is a `W = ∞` statement; where finite `W` changes it, that is called out explicitly (L2.4, §7.5, §8.4).

---

## 1. Objects and notation

- `Λ = Z^2`, elements written `p = (p.x, p.y)`; `0 = (0,0)`.
- **Gauge.** `||v||_∞ = max(|v.x|, |v.y|)` (Chebyshev). This is the only metric used for scheduling; §11 justifies the
  choice and prices it.
  - `S(R) = { p ∈ Λ : ||p||_∞ = R }` — the **ring** (L∞ sphere). `|S(0)| = 1`,
    `|S(R)| = 8R` for `R ≥ 1`.
  - `B(R) = { p : ||p||_∞ ≤ R } = [-R,R]^2` — the **ball** (= an axis-aligned
    `(2R+1) × (2R+1)` window). `|B(R)| = (2R+1)^2`.
  - `diam_∞ B(R) = 2R`. Used repeatedly and sharply (L4.3).
- **Direction classes.** `v ∈ Λ \ {0}` is _primitive_ iff `gcd(|v.x|,|v.y|) = 1`.
  `D = { primitive v } / ±` is the set of **direction classes**; `primdir(v)` is the class of `v / gcd(|v.x|,|v.y|)`.
  `||d||_∞` is well defined on `D`.
- `ℓ(p,q)` is the affine line through distinct `p,q ∈ Λ`; a **lattice line** is
  `ℓ(p,q) ∩ Λ`.
- A finite `P ⊂ Λ` is **valid** (cap-free in the collinear sense) iff no three distinct points of `P` are collinear.
- `k(R) = |P ∩ B(R)|` for the constructed set `P`; `n = 2R+1` is the side length used by the classical literature;
  `c(n) = max_{s×s window} |P ∩ window| / n`.
- Growth ansatz: `k(R) ≈ A·R^α`, equivalently `k = a·R` with `a = A` when `α = 1`. Normalisation bridge:
  `c(2R+1) ≥ k(R)/(2R+1) → a/2` when `α = 1`.
- **Span.** For finite `T ⊂ Λ`, `span(T) := diam_∞ T = max_{u,v ∈ T} ||u-v||_∞`. For a pair, `span{p,q} = ||q-p||_∞`.
- **Horizon.** `W ∈ {2,3,…} ∪ {∞}` is the **constraint radius**: only triples with `span ≤ W` are forbidden (§2A). A
  triple or pair is **`W`-admissible** iff its span is `≤ W`.
- `k_W(R) = |P_W ∩ B(R)|`; `δ(W) = lim_R k_W(R)/(2R+1)²` (finite `W` only, T2A.10);
  `c*(W) = (W+1)·δ(W)` — the finite-horizon analogue of the literature's `c(n)`.

Counting constants used throughout (standard, from `Σ 1/g² = π²/6`):

- **L1.1.** `Φ(M) := #{ d ∈ D : ||d||_∞ ≤ M } = (12/π²)M² + O(M log M) ≈ 1.216 M².`
- **L1.2.** `Ψ(M) := Σ_{d ∈ D, ||d||_∞ ≤ M} 1/||d||_∞ = (24/π²)M + O(log²M) ≈ 2.432 M.`

_Proof sketch._ `#{v : ||v||_∞ ≤ M}` = `(2M+1)²`; the primitive fraction is
`6/π²`; quotient by `±` halves it, giving L1.1. The number of classes with
`||d||_∞ = m` is `Φ'(m) ≈ 2.432 m`, so `Ψ(M) = Σ_m Φ'(m)/m ≈ 2.432 M`. ∎

---

## 2. Exact characterisation of validity

**L2.1 (lattice line).** For distinct `p,q ∈ Λ` with `d = primdir(q-p)`,
`ℓ(p,q) ∩ Λ = { p + t·d : t ∈ Z }`.

_Proof._ `⊇` is clear. For `⊆`: `d` primitive gives integers `u,v` with
`u·d.x + v·d.y = 1`. If `r - p = λd` for real `λ`, then
`λ = u(r-p).x + v(r-p).y ∈ Z`. ∎

Consequence: **collinearity is an integrality statement, not a metric one.**
A lattice point is on the line iff its parameter `t` is an integer. There is no rounding, no thickening, no "nearly
collinear". This is the reason the engine can be exact and the reason no floating point may participate in a decision.

**L2.2 (direction test).** `P` is valid iff for every `p ∈ P` the map
`q ↦ primdir(q - p)` is injective on `P \ {p}`. Equivalently, a candidate `c ∉ P`
is **blocked** by `P` iff there exist distinct `p,q ∈ P` with
`primdir(p - c) = primdir(q - c)` in `D`.

_Proof._ Three distinct points are collinear iff two of the three primitive directions from one of them agree _as
classes_ (the `±` quotient is what handles
"on opposite sides"). ∎

L2.2 is the **oracle**: an `O(|P|)` exact test per candidate, with no window, no calendar, no metric. Everything in §7
is an accelerated implementation of it, and every acceleration must be proved equal to it, never merely similar.

**L2.3 (two per line).** In a valid `P`, every line contains at most 2 points. Hence, counting rows: `k(R) ≤ 2(2R+1)`,
i.e. `a ≤ 4`, i.e. `c(n) ≤ 2`. The same counting via columns or via either diagonal family gives the same bound; no
asymptotically better upper bound is known for the classical problem.

**L2.4 (per-ring cap).** Every `c ∈ S(R)` lies on at least one of the four lines
`x = ±R`, `y = ±R`. Each of those lines carries at most 2 points of `P` _ever_. Therefore `k(R) - k(R-1) ≤ 8`.

L2.4 is structurally important out of proportion to its weakness as a bound: it says the per-ring commit set `A_R` has
`|A_R| ≤ 8`, which is what makes the inherently serial stage of §7.5 cheap, and it says each ring's yield is drawn from
a budget shared with all _future_ rings (the row `y = R` may take its 2 points at ring `R` or at any later ring). That
shared budget is the mechanism behind the capacity discussion in §9.5.
**Caveat (horizon).** L2.3 and L2.4 are `W = ∞` statements. At a finite horizon a row carries at most 2 points _per
`W`-window_, not 2 points ever, so `k(R) ≤ 2(2R+1)` becomes `k_W(R) = Θ(R²)` (T2A.10) and `|A_R| ≤ 8` becomes
`|A_R| = Θ(δ(W)·R)`. Every later section that leans on `|A_R| ≤ 8` (§7.5, T7.7, §9.3) is therefore a `W = ∞`
statement; §7.6 and §8.8 re-derive the finite-`W` versions.

---

## 2A. The horizon `W`: local validity, and why it is the real parameter

The classical problem is a statement about an `n × n` grid. A collinear triple whose extreme points are `10⁶` apart is
irrelevant to every claim about `n = 10³`: no `10³`-window can contain it. Enforcing such a triple is not conservative,
it is _wasteful_ — it deletes candidates that no window of the size we care about could ever have objected to. We
therefore give the constraint a finite reach.

### 2A.1 Definition and exactness

**D2A.1 (`W`-validity).** `P` is **`W`-valid** iff it contains no `W`-admissible collinear triple, i.e. no collinear
`{p,q,r}` with all three pairwise `L∞` distances `≤ W`. `W = ∞` recovers §2. Every set is `1`-valid vacuously (a
collinear triple of distinct lattice points has span `≥ 2`).
**L2A.2 (window form — why `W` is the right dial).** `P` is `W`-valid **iff** `P ∩ Q` is valid (in the sense of §2) for
every axis-aligned `(W+1) × (W+1)` window `Q`, and hence for every window of side `s ≤ W+1`.
_Proof._ A triple of span `≤ W` has an axis-aligned bounding box with both sides `≤ W` and so lies inside some
`(W+1)`-window; conversely a triple inside such a window has span `≤ W`. ∎
**C2A.3 (transfer — the practical point; extends C8).** For every `s ≤ W+1`, `max_{s×s window} |P_W ∩ window| / s` is a
_certified_ lower bound for the classical `c(s)`. A run to radius `R` offers `≈ (2R+1-s)²` such windows instead of the
single one anchored at the origin. **Choose `W = n-1` for the `n` you care about and harvest `Θ(R²)` samples.**
**L2A.4 (local oracle — the `W`-refinement of L2.2).** `c ∉ P` is **`W`-blocked** by `P` iff there exist distinct
`p,q ∈ P` with `primdir(p-c) = primdir(q-c)` and `max(||p-c||_∞, ||q-c||_∞, ||p-q||_∞) ≤ W`. In particular only points
of `P ∩ (c + B(W))` can participate, so the oracle costs `Θ(|P ∩ (c + B(W))|)` rather than `Θ(|P|)`.

> The third clause is not implied by the first two: `p` and `q` on _opposite_ sides of `c`, each at distance `≤ W`, can
> be `2W` apart. Dropping it over-blocks. This is the finite-`W` analogue of the `±` subtlety in L2.2.
> **L2A.5 (influence region is a rectangle).** For a `W`-admissible committed pair `p,q` the cells it blocks are exactly
> `ℓ(p,q) ∩ B(p,W) ∩ B(q,W)`. The intersection of two `L∞` balls is an axis-aligned **rectangle**, non-empty iff
> `span{p,q} ≤ W`. In the line parameter (`p = base + t_p·d`, `q = base + t_q·d`, `d = primdir(q-p)`), with
> `m := ⌊W/||d||_∞⌋`, the blocked set is the integer interval

```
t ∈ [ max(t_p,t_q) - m ,  min(t_p,t_q) + m ]
```

— computed by one integer division, no square roots. (Under `L2` the lens is curved; the parameter set is still an
interval, but its endpoints need an integer square root. Another entry for §11.)
**L2A.6 (truncated chord bound).** An admissible pair deposits at most
`2⌊W/||d||_∞⌋ - span/||d||_∞ + 1 ≤ 2W/||d||_∞ + 1` marks, _independently of `R`_; a pair with `span > W` deposits
**none**. There are thus two independent truncations of a line — the window (L4.3) and the horizon (here) — and the
effective bound is `min(2R, 2W)/||d||_∞ + 1`.
**T2A.7 (finite `W` is exact, not approximate).** For `W ≤ W'` (including `W' = ∞`), and the same `≺` and seed,

```
P_W ∩ B(⌊W/2⌋) = P_{W'} ∩ B(⌊W/2⌋).
```

_Proof._ Induction along `≺`. Let `c ∈ B(⌊W/2⌋)`. By ring-monotonicity (T5.1) every blocker pair of `c` lies in
`B(⌊W/2⌋)`, and `diam_∞ B(⌊W/2⌋) = 2⌊W/2⌋ ≤ W`, so every blocking triple is `W`-admissible and is seen by _both_
folds; the induction hypothesis makes the two prefixes equal. `W`-blockers are `W'`-blockers since `W ≤ W'`. ∎
**C2A.8 (the horizon costs nothing and buys everything).** Taking `W = 2R` computes `P_∞ ∩ B(R)` **exactly**. So `W` is
not an accuracy knob but a _resource_ knob: a pair of span `> 2R` provably cannot influence any cell of `B(R)`, and the
unbounded engine of §7 spends memory and time on exactly those pairs. The classical object is the diagonal limit
`W = 2R, R → ∞`; the cheap regime is `W` fixed, `R → ∞` (§2A.2). T2A.7 also gives the single best regression test in
the project (P19): two engines at different horizons must agree cell-for-cell on `B(⌊W/2⌋)`.

### 2A.2 The finite-horizon object: the exponent moves from `R` to `W`

**T2A.9 (positive density; `α_W = 2`).** For finite `W`, `k_W(R) = Θ_W(R²)`, with

```
c₀·W^{-4/3}·(2R+1)²  ≤  k_W(R)  ≤  (2R+1)·( 2(2R+1)/(W+1) + 2 ),        c₀ ≈ 0.29 (T9.4)
```

_Proof (upper)._ Any `W+1` consecutive cells of a row lie in a `(W+1)`-window; three points of a row are collinear with
span `≤ W`, so each such block holds `≤ 2` points (L2A.2 + L2.3). Partition each of the `2R+1` rows into
`⌈(2R+1)/(W+1)⌉` blocks. _(Lower.)_ T9.4. ∎
For finite `W` the density-exponent question of §9 is therefore **empty** (`α_W = 2`) and is replaced by the behaviour
of the constant:

```
δ(W)  ∈ [ c₀W^{-4/3},  2/(W+1) ],        c*(W) := (W+1)·δ(W) ∈ [ c₀W^{-1/3},  2 ].
```

`c*(W)` is dimensionally the same quantity as the literature's `c(n)`: mean points per unit side in a window of side
`W+1`. Note that the rigorous floor `c*(W) ≥ c₀W^{-1/3}` is _the same theorem_ as `α ≥ 2/3` (T9.1) written in the other
coordinate — the first consistency check on the transfer below.
**C2A.10 (horizon–radius exponent transfer). CENTRAL CONJECTURE.** Assume the `W`-local greedy is statistically
homogeneous away from the seed (C2A.12) and that the origin window is typical. Then by T2A.7,
`c*(W) ≍ k_∞(⌊W/2⌋)/(W+1)`, hence

```
c*(W) ≍ W^{α-1},        α = 1 + lim_{W→∞} log c*(W) / log W.
```

So **C2** (`α < 1`) ⟺ `c*(W) → 0` as a power of `W`; **C3** (`α = 1`) ⟺ `c*(W) → const ∈ (0,2)`; **C4** ⟺
`c*(W) → 2`. The conjecture carries its own falsifier: measure both sides in one run — the origin-anchored
`k_W(⌊W/2⌋)/(W+1)` and the far-field mean `c*(W)`. Systematic disagreement refutes homogeneity, implicates the seed or
the four diagonal seams (H2A.11), and is itself the interesting outcome.
**Why this is a better experiment than pushing `R`.** The global run estimates `α` from a single nested family of
windows: one sample per radius, heavily correlated across radii, with no way to put an honest error bar on the slope.
At fixed `W` a run to radius `R` produces `Θ(R²/W²)` essentially independent windows _of exactly the size the
literature quotes_; the sampling error on `c*(W)` decays like `W/R`. Two decades in `W` — the resolution C5 demands —
cost `Θ(c*²·R·ln W)` marks per ring (§8.8), i.e. they are affordable, whereas two decades in `R` are not.

### 2A.3 Far field: the process becomes translation-invariant

**H2A.11 (far-field limit).** Fix `W`. At radius `R ≫ W` the ring is locally a straight face, and the traversal
restricted to a `W`-neighbourhood of a non-corner cell is "sweep along the face, then step outward" — a **raster scan**
of a half-plane (transposed in the left/right sectors). Since by L2A.4 no decision consults anything beyond distance
`W`, the spiral is invisible in the far field except through (i) the four sector orientations and (ii) the four
diagonal seams, which contain `O(R)` of the `Θ(R²)` cells.
**C2A.12 (bounded state ⇒ ergodicity ⇒ `δ(W)` exists).** In the far field, the state needed to decide the current cell
is exactly the placements inside the moving `(2W+1) × (W+1)` box of `≺`-earlier cells within distance `W` — a **finite**
state, of at most `2^{(2W+1)(W+1)}` configurations (far fewer after `W`-validity). The cell-to-cell update is therefore
a stationary Markov chain on `W`-valid box configurations; assuming irreducibility on its recurrent class, spatial
averages converge and `δ(W)` exists. Three consequences:

- `δ(W)` is in principle _exactly_ computable by transfer matrix for small `W` (Q13.7) — a route to the exponent that
  involves no simulation at all;
- `idea.md`'s aperiodicity claim becomes the concrete question of whether the recurrent class is a single periodic
  orbit; at finite `W` this is decidable in principle and testable in practice (C7, P11);
- two intra-ring rules inducing the same far-field sweep must give the same `δ(W)` — a sharp, cheap instance of C6.
  **P2A.13 (monotonicity in `W` is not automatic).** Raising `W` adds constraints, so one expects `c*(W)` to decrease;
  but the fold is order-dependent (T7.4), and a point suppressed early can liberate two later. `c*(W)` non-increasing is
  therefore a **conjecture** (C11), and a measured violation is a discovery, not a bug. The _certification_ direction, by
  contrast, is rigorous and monotone: `P_W` is `W'`-valid for every `W' ≤ W`, which is what C2A.3 rests on.

---

## 3. The greedy operator, the order, and saturation

### 3.1 The order

Fix a **total order** `≺` on `Λ` that is _ring-monotone_:

```
||p||_∞ < ||q||_∞   ⟹   p ≺ q
```

and refines each ring by a fixed intra-ring rule (clockwise from `(0,R)`, or by
`(x²+y², angle)`), with `(x,y)`-lexicographic tie-breaking. Ring-monotonicity is the only property §5–§7 use; the
intra-ring rule is a free parameter and §9.7 treats it as an experimental knob, not a constant.

### 3.2 The greedy set

Given a seed `P_seed` (default `{0}`), define `P` by the sequential fold over `≺`:

```
P_{≺c} := { p ∈ P : p ≺ c }
c ∈ P   ⟺   c ∈ P_seed   or   c is NOT W-blocked by P_{≺c}    (L2A.4; L2.2 when W = ∞)
```

**P3.1 (existence, uniqueness, determinism).** The fold is well defined: the membership of `c` depends only on strictly
`≺`-earlier cells, and `≺` is a well-order on `Λ` (ring-monotone, each ring finite). Hence `P` is a _function_ of
`(≺, P_seed, W)` alone — not of any scheduling, parallelisation or representation choice. Every claim of "determinism"
downstream is a claim that some machinery computes this function.

**P3.2 (non-termination).** `P` is infinite. For finite `Q ⊂ Λ` with `|Q| = m`, the blocked set inside `B(R)` has size
at most `Σ_{pairs}(2R/||d||_∞ + 1) ≤
m²(R + 1/2)` by L4.3, which is `< (2R+1)²` for `R` large enough. So free cells always exist further out and the greedy
never stalls.

### 3.3 Saturation

**D3.3.** `Q ⊂ B(R)` is **saturated in `B(R)`** iff every cell of `B(R)` is either in `Q` or lies on `ℓ(p,q)` for some
distinct `p,q ∈ Q`.

**T3.4 (greedy sets are saturated).** `P ∩ B(R)` is saturated in `B(R)` for every
`R`.

_Proof._ Every cell of `B(R)` is visited by the traversal on or before ring `R`
(`B(R) = ⊔_{r ≤ R} S(r)`). A visited, non-placed cell `c` was blocked by some pair in `P_{≺c}`, and ring-monotonicity of
`≺` puts that pair inside `B(R)`. ∎

T3.4 is the bridge to the only unconditional lower bound we have on the density (§9.2), and it is the correct formal
reading of `idea.md`'s informal phrase
"relatively maximal". It is _not_ the same as maximality of the infinite set, and it is weaker than optimality by a
possibly polynomial factor (§9.6).

---

## 4. Structure of the L∞ gauge along a lattice line

This section is the entire reason the sieve can be scheduled instead of rasterised. Everything follows from one
observation: along a line, the gauge is a maximum of four affine functions.

Fix `p ∈ Λ`, `d ∈ D`, and set

```
g(t) := ||p + t·d||_∞ = max( ±(p.x + t·d.x), ±(p.y + t·d.y) ),   t ∈ Z.
```

**T4.1 (convexity and shape).** `g` is convex and piecewise linear in `t`, with at most 3 breakpoints. Its slopes lie in
`{ ±d.x, ±d.y }`; beyond the outermost breakpoint on either side the slope is exactly `±||d||_∞`. Consequently `g` is
non-increasing up to a minimiser `t*` and non-decreasing after it, and
`|t|·||d||_∞ - ||p||_∞ ≤ g(t) ≤ |t|·||d||_∞ + ||p||_∞`.

_Proof._ `g = max(|A(t)|, |B(t)|)` with `A,B` affine; each `|·|` is a V, and the max of two V's is convex with ≤3
breakpoints. The outer pieces are the ones of steepest slope, i.e. `max(|d.x|,|d.y|) = ||d||_∞`. ∎

**C4.2 (ray splitting — the scheduling primitive).** Splitting a lattice line at
`t*` produces **two rays** along each of which `t ↦ g(t)` is non-decreasing. On a ray, the ring index of successive
marks never decreases; beyond the last breakpoint it increases by _exactly_ `||d||_∞` per step, and between `t*` and
that breakpoint by `|d.x|` or `|d.y|` (whichever coordinate currently attains the max), which is `≤ ||d||_∞`.

> The plan's phrase "exactly `||d||_∞` outside the convexity vertex" is a
> simplification; the exact statement is the one above. It matters, because a
> scheduler that assumes a constant stride between marks will mis-schedule the
> `O(1)` marks lying between `t*` and the outer breakpoint.

**L4.3 (chord bound, sharp).** If a lattice line with direction `d` meets `B(R)`, then `|ℓ ∩ B(R)| ≤ 2R/||d||_∞ + 1`.

_Proof._ Any two lattice points of the line inside `B(R)` differ by `(t₂-t₁)d`, and
`||(t₂-t₁)d||_∞ = |t₂-t₁|·||d||_∞ ≤ diam_∞ B(R) = 2R`. ∎

Sharpness: for `d = (1,0)` and the line `y = c`, `|c| ≤ R`, the count is exactly
`2R + 1`. (`plan.md` §3.3 states `4R/||d||_∞ + 1`, which is valid but loose by a factor 2; the tight constant is worth
having because §8 uses it quantitatively.)

**T4.4 (ring/line intersection classification).** For `R ≥ 1`, exactly one of:

1. `ℓ ∩ S(R) = ∅`;
2. `|ℓ ∩ S(R)| = 1` (tangency: `R = min g`);
3. `|ℓ ∩ S(R)| = 2` (generic transversal);
4. `ℓ ∩ S(R)` is an entire closed face of the square, `2R+1` cells — and this occurs **iff** `d` is axis-parallel and
   `ℓ` is one of the four face lines
   `x = ±R`, `y = ±R`.

_Proof._ `{t : g(t) = R}` for convex `g` is empty, a point, two points, or an interval. An interval requires the
_active_ affine piece to have slope `0`, i.e.
`d.x = 0` or `d.y = 0`; then `g = max(|p.x + t d.x|, |p.y + t d.y|)` is constant exactly on the sub-interval where the
moving coordinate is dominated, and the constant value is the fixed coordinate, which must equal `R`. ∎

T4.4 is the precise content of the `NoHit | Hit | ContainedInSide` three-way result: it is _forced_ by L∞'s flat faces,
it involves exactly 4 direction classes and 4 lines per ring, and (see §8.5) it is **not** a rare edge case — it fires
up to 4 times per ring and can contribute `Θ(R)` marks in that ring.

**C4.5.** A strictly convex gauge (e.g. `L2`) deletes case 4 entirely: a chord of a strictly convex sphere meets it in
≤2 points. §11 prices this trade.

---

## 5. Locality: why outward-only marking is exact

**T5.1 (frontier / ring-locality).** For `c ∈ S(R)`, whether `c` is blocked by
`P_{≺c}` depends only on `P ∩ B(R)`.

_Proof._ A blocking pair `p,q ≺ c` satisfies `||p||_∞, ||q||_∞ ≤ R` by ring-monotonicity of `≺`. ∎
**T5.4 (transverse locality — the horizon version).** At horizon `W`, whether `c ∈ S(R)` is blocked depends only on
`P ∩ B(R) ∩ (c + B(W))`: an `O(W²)`-cell window, not an `O(R²)`-cell one.
_Proof._ T5.1 plus L2A.4. ∎
T5.1 bounds the dependency _radially_ (nothing outside `B(R)`); T5.4 bounds it _tangentially_ (nothing further than `W`
along the frontier). The pair of them is what makes the finite-`W` engine bounded in both directions: T5.1 alone gives
a `Θ(R)`-long frontier of unbounded lookback, T5.4 turns it into a sliding window (§7.6, C2A.12).

**C5.2 (no lookahead).** Therefore the sieve needs no information about rings
`> R` while deciding ring `R`, and marks deposited on cells with ring index `< R`
at the time of deposition are unobservable: by construction the traversal never returns to them.

**T5.3 (soundness of outward-only is conditional on splitting).** Dropping marks with `g(t) < R_current` is exact
**iff** each line has first been split at `t*`
(C4.2). On an unsplit line the map `t ↦ g(t)` is convex but _not monotone_: a ray may travel inward before turning
outward, so an "inward" mark may be followed by _future_ marks. Discarding by the sign of a step, rather than after
splitting, silently deletes future marks and produces **invalid** sets.

_Proof._ Immediate from T4.1 plus a witness: `p = (0,5)`, `d = (1,-1)`: `g` falls from 5 to 0 and rises again, so early
steps are inward while later steps are the ones that matter. ∎

This is the sharpest correctness trap in the design: the split is a _correctness requirement_, not an optimisation.

---

## 6. Intra-ring closure is mandatory (with a minimal witness)

Let `A ⊂ S(R)` be the set of points committed during ring `R` (or during an arc segment of it). The lines that become
newly determined are

```
NEW(A) = { ℓ(p,c) : p ∈ P_before, c ∈ A }   ∪   { ℓ(c₁,c₂) : c₁ ≠ c₂ ∈ A }
                 cross family                       segment-internal family
```

**T6.1 (necessity of the segment-internal family).** An algorithm that closes only the cross family produces an invalid
set. A minimal witness exists at `R = 1`.

_Proof (witness)._ Seed `{(0,0)}`, clockwise ring order starting at `(0,R)`. Ring 1 is visited in the order
`(0,1), (1,1), (1,0), (1,-1), (0,-1), (-1,-1), (-1,0), (-1,1)`. The fold places `(0,1)`, `(1,1)`, `(1,0)`. Now consider
the fourth cell `(1,-1)`
and enumerate all pairs of `P_{≺(1,-1)} = {(0,0),(0,1),(1,1),(1,0)}`:

| pair              | line    | contains `(1,-1)`? |
| ----------------- | ------- | ------------------ |
| `(0,0),(0,1)`     | `x = 0` | no                 |
| `(0,0),(1,1)`     | `y = x` | no                 |
| `(0,0),(1,0)`     | `y = 0` | no                 |
| `(0,1),(1,1)`     | `y = 1` | no                 |
| `(0,1),(1,0)`     | `x+y=1` | no                 |
| **`(1,1),(1,0)`** | `x = 1` | **yes**            |

The unique blocker is `{(1,1),(1,0)}` — **both placed during ring 1**. A cross-family-only algorithm places `(1,-1)`,
producing the collinear triple
`(1,1),(1,0),(1,-1)`. ∎

Three corollaries, all normative for §7:

- **C6.2 (fixpoint, not filter).** Commitment inside a ring/segment is a _strictly ordered fold_: a cell free when the
  segment is proposed may be blocked by the time the walk reaches it. There is no "propose then filter" formulation.
- **C6.3 (the witness is also the degenerate case).** `x = 1` is a _face line_ of
  `S(1)`; the blocker is exactly T4.4 case 4. The earliest failure of the naive pair enumeration and the earliest firing
  of `ContainedInSide` are the same event. Any test suite that exercises one exercises the other.
- **C6.4 (corner sharing).** The 4 cells with `|x| = |y| = R` lie on two faces. Any per-face treatment of case 4 must
  count them once — they are exactly 4 per ring, so this is an exhaustively testable condition, not a sampled one.

---

## 7. Algorithm specification

The specification is given as a **refinement chain** `A0 → A1 → A2 → A3`. Each level computes the _same function_
`P(≺, P_seed)` (P3.1); each refinement is justified by a theorem above. Nothing below prescribes representation.

### 7.1 A0 — the oracle (reference semantics)

```
P := P_seed
for c in Λ in ≺-order:
    if c ∉ P and no two points of P share a direction class as seen from c:   # L2.2
        P := P ∪ {c}
```

Cost: `Θ(1)` state per point, `Θ(|P|)` per candidate. This _is_ the definition; A1–A3 exist only to be proven equal to
it.

### 7.2 A1 — line sieving (window sieve)

Maintain a Boolean _blocked_ predicate over `B(rMax)`. Replace the per-candidate oracle by: when a point `c` is
committed, for every `p ∈ P` (**including points committed earlier in the same ring**, C6.2) deposit marks on all
lattice points of
`ℓ(p,c)` within the window (L2.1, L4.3).

Correctness: L2.2 (a cell is blocked iff some determined line covers it) plus T6.1 (the family of determined lines must
include segment-internal pairs) plus C6.2 (marks from a commit are visible before the next candidate in the same ring is
tested).

### 7.3 A2 — the calendar (scheduled sieving) — **the core object**

A1 deposits every mark of a line at the moment the line is created, which requires a dense window and touches cells the
traversal has already passed. A2 replaces the dense window by a _schedule_.

**Definition (mark).** A mark is a triple `(p, d, t)` denoting the lattice point
`p + t·d`. Its **identity** is exact integer algebra (L2.1); its **schedule key**
is `g(t) = ||p + t·d||_∞` (T4.1). Identity and scheduling are orthogonal; the only metric in the engine is in the key.

**Definition (ray).** For each determined line, split at `t*` (C4.2) into two rays, each carrying a non-decreasing
sequence of schedule keys.

**Scheduling discipline.**

1. Rings are processed in increasing `R`. Immediately before ring `R` is walked, every ray whose next mark has key `R`
   releases that mark, then advances to its next mark with key `> R` and is re-scheduled under that key.
2. During the walk of ring `R`, the fold of §3.2 is executed in `≺`-order; each commit immediately creates its `|P|` new
   lines (cross + segment-internal), splits them, releases any of their marks with key exactly `R`, and schedules the
   rest.
3. Marks with key `< R_current` are never generated.

**T7.1 (A2 = A0).** The scheduling discipline computes `P(≺, P_seed)`.

_Proof._ By induction on `≺`. Step 1 plus C4.2 ensures every mark of every line determined _before_ ring `R` and lying
on `S(R)` has been released before the walk (monotone keys ⇒ no mark is scheduled into the past). Step 2 plus T6.1/C6.2
ensures the same for lines determined _within_ ring `R` before the current candidate. Step 3 is sound by T5.1/T5.3 (with
the split in place). So at the moment
`c` is tested, the blocked predicate on `c` equals the oracle of L2.2 applied to
`P_{≺c}`. ∎

**T7.2 (monotone keys ⇒ O (1) amortised scheduling).** Keys released by the discipline are non-decreasing in the global
time of the run, and each ray's key sequence is non-decreasing. A monotone integer-keyed priority queue over a bounded
key range therefore admits `O(1)` amortised insert/extract (Dial-style bucketing); the unbounded case needs only a
hierarchical (multi-resolution) bucketing of far-future keys, still `O(1)` amortised. Hence **total scheduling cost is
`Θ(#marks + rMax)`**, with no logarithmic factor.

This is worth stating because it makes the cost model of §8 depend on exactly one quantity: the **mark volume**.

### 7.4 A3 — banded / parallel execution (semantics-preserving)

Split the mark algebra from the placement algebra:

- **T7.3 (mark algebra is ACI).** "Blocked" is a join in a Boolean lattice: mark deposition is associative, commutative
  and idempotent. Hence the blocked predicate after applying a _set_ of marks is independent of the order, the
  interleaving, or the multiplicity of application. Mark production for a band of rings may therefore be parallelised or
  offloaded arbitrarily, with bit-identical results, provided the _set_ of produced marks is determined by the ring
  index and not by arrival time.
- **T7.4 (placement algebra is not ACI).** The fold of §3.2 is order-dependent (T6.1 gives a witness where reordering
  changes the output set). It is a sequential fold and must remain one.
- **T7.5 (banding is sound).** Marks for rings `[R, R+B)` may be produced in advance, then the rings committed in order,
  **provided** each commit's segment-internal and cross closure is applied to the remaining rings of the band before the
  next candidate is tested. Proof: T5.1 (nothing outside `B(R)` matters)
  plus T7.1's induction, re-run with the band's marks pre-staged.

**T7.6 (no NC algorithm is expected).** The fold is a lexicographically-first maximal-independent-set computation on the
hypergraph of collinear triples, restricted by `≺`. LFMIS is P-complete (Cook, 1985), so the serial commit is a
complexity-theoretic obstruction rather than an engineering artifact. Parallelism is available only in the ACI part
(T7.3) and in the `O(|P|)` independent ray computations per commit.

### 7.5 The inherently sequential core

Per ring, the strictly ordered part is: walk `S(R)` in `≺`-order, and for each of the `|A_R| ≤ 8` commits (L2.4) apply
that point's closure before the next test. Ring `R` cannot begin before ring `R-1` is finished (T5.1 is a _dependency_,
not just a locality result). Therefore:

- **T7.7 (depth).** The critical path has length `Ω(rMax)` rings, each with
  `≤ 8` ordered commit steps and `O(|P|)` parallel work per commit. With work
  `W = Θ̃(k²)` (§8) and depth `D = Θ̃(rMax)`, the available parallelism is
  `W/D = Θ̃(k²/rMax) = Θ̃(rMax)` when `α = 1`.

This is the honest ceiling behind `plan.md` §4.5/§4.6: you need `Θ(R)` lanes to saturate the machine at radius `R`, and
no amount of lanes shortens the `Θ(R)`
barrier chain.

### 7.6 A2^W — the calendar at a finite horizon (three simplifications and one loss)

Instantiating A2 with a finite `W` changes it structurally, not just quantitatively.

1. **Pair admission.** A commit `c` creates lines only with `p ∈ P ∩ (c + B(W))` (L2A.4). The per-commit fan-out drops
   from `|P| = Θ(k)` to `Θ(δW²)` and stops growing with `R`.
2. **Ray truncation and retirement.** Each admissible pair's marks form the finite interval of L2A.5. Rays are born
   with a death parameter and are _retired_; nothing lives forever.
3. **Bounded schedule horizon.** Every mark of a pair created at ring `r` lies in `B(p,W)` and hence in rings
   `≤ r + W`.
   **T7.9 (the calendar collapses into a rolling band).** At finite `W` no priority queue is required at all: marks may be
   deposited _eagerly_ into a rolling buffer of the next `W+1` rings (an annulus of width `W+1`, `Θ(RW)` cells), which is
   then consumed ring by ring and recycled. Correctness is T7.1 with the observation (3) above that no mark is ever
   scheduled beyond the band; soundness of eager deposition is T7.3 (ACI).
   _Consequences._ The hierarchical bucketing of T7.2 is unnecessary (`W+1` Dial buckets suffice, or none at all if the
   band is materialised); the `Θ(k²)` live-ray population — §8.4's admitted weakness of A2 — becomes `Θ(RW)` _bits_; and
   the engine is unbounded in `R` at fixed cost per ring. When `W = 2R` the band degenerates back to the whole window and
   the `Θ(R²)`-bit sieve of A1 is recovered, as it must be (C2A.8).
   **The loss: L2.4 no longer applies.** A face line may take 2 points _per `W`-window_, so `|A_R| = Θ(δ(W)·R)` commits
   per ring, not `≤ 8`. §7.5's "the serial core is `O(1)` commits deep per ring" is a `W = ∞` statement. The finite-`W`
   serial core is `Θ(δR)` ordered commits per ring, each of `Θ(δW²)` work — total `Θ(c*(W)²·R)` per ring, still `Θ(R²)`
   over the run, but now with an `Ω(δR)`-long ordered chain inside each ring.
   **P7.10 (finite horizon ⇒ bounded-state automaton ⇒ optimistic parallelism).** By T5.4 the fold's state is the
   placements in a moving `O(W²)` window (C2A.12). Hence a chunk of the frontier may be executed _speculatively_ from a
   guessed state; its output is provably correct from the first cell at which the guessed and true window contents
   coincide, and can be verified exactly by replaying the seam. Two cells more than `W` apart cannot block each other, so
   the ring decomposes into `Θ(8R/W)` chunks interacting only through `W`-wide seams.
   This is **optimistic** parallelism, not an NC result: LFMIS remains P-complete under bounded degree, so T7.6 survives
   the horizon, and the re-synchronisation length is an empirical quantity (P20), not a theorem. What the horizon _does_
   buy unconditionally is that a speculative chunk needs `O(W²)` state to start and `O(W)` cells to verify — under
   `W = ∞` the state to guess is all of `P`, and speculation is meaningless.

---

## 8. Cost theory

Write `k = k(rMax)`, `R = rMax`. All costs reduce to the **mark volume**.

### 8.1 Mark volume: rigorous bounds

**T8.1 (worst-case upper bound).** Let `P` be valid with `|P| = k` inside `B(R)`. Then

```
Σ_{pairs} |ℓ(p,q) ∩ B(R)|  ≤  2R·Σ(P) + k²/2,        Σ(P) := Σ_{pairs} 1/||primdir(q-p)||_∞
Σ(P) ≤ 1.103·k^{3/2}·(1+o(1)).
```

_Proof._ First inequality is L4.3 summed. For `Σ`: fix an apex `p`; by L2.2 the
`k-1` direction classes from `p` are **distinct**, so `Σ_{q≠p} 1/||d||_∞` is at most the sum over the `k-1` smallest
classes, `= Ψ(M_k)` with `Φ(M_k) = k-1`, i.e.
`≈ 2.432·0.907·√k = 2.205√k` (L1.1, L1.2). Sum over apexes and halve. ∎

So mark volume is `O(R·k^{3/2}) = O(R^{5/2})` when `k = Θ(R)`: **rigorously sub-cubic**, versus `Θ(k²R) = Θ(R³)` for an
algorithm that rasterises each line across the whole window row-by-row.

### 8.2 Mark volume: typical value (**H**)

Assume the pairwise geometry of `P ∩ B(R)` is "quasi-generic": `||q-p||_∞` has the scale of a uniform pair in a square
of side `2R` (mean `≈ 0.93R`, `E[1/||q-p||_∞]
≈ 1.67/R`), and `gcd` is asymptotically independent of magnitude with
`E[gcd] ≈ (6/π²) ln R ≈ 0.61 ln R`. Then

```
E[ 1/||d||_∞ ] = E[gcd]·E[1/||q-p||_∞] ≈ 1.0 · (ln R)/R,
Σ(P) ≈ (k²/2)·(ln R)/R,
mark volume  M_full(R) ≈ 2R·Σ(P) ≈ k² ln R                                   (H8.2)
marks released at ring R ≈ k²·(ln R)/R  ≈ a²·R·ln R  (when k = aR)            (H8.3)
```

**Interpretation (the key structural fact).** The _average number of marks per line_ is `Θ(log R)`, not `Θ(R)`: a
"steep" direction (`||d||_∞ = Θ(R)`, the typical case) contributes `O(1)` marks over the entire run, because consecutive
lattice points of the line differ by `||d||_∞` in ring index (C4.2). This — not any constant-factor cleverness — is
where the sieve's speed comes from, and it is a theorem about L∞ (L4.3) rather than a hope about inputs.

### 8.3 Per-cell blocking multiplicity (**H**)

Dividing H8.3 by `|S(R)| = 8R`:

```
μ(R) := mean # of blocking marks per ring cell ≈ (ρ/8)·a²·ln R,      ρ = Θ(1) ≈ 1
```

So the ring is covered `Θ(log R)` times over _on average_. This single number drives all of §9: survival of any cell is
a rare, structured event, not a typical one. `ρ` is a **M**easurement (§10, P2), and §9.4 shows the qualitative
prediction flips depending on its value — which is precisely why it must be measured.

### 8.4 Cost table

With `α = 1` (`k = Θ(R)`), and using T7.2 (`Θ(1)` per mark) and H8.2:

| level               | time                       | live memory    | working set / ring            | unbounded?    |
| ------------------- | -------------------------- | -------------- | ----------------------------- | ------------- | ------ | --- |
| A0 oracle           | `Θ(                        | B(R)           | ·k) = Θ(R³)`                  | `Θ(k) = Θ(R)` | `Θ(R)` | yes |
| A1 window sieve     | `Θ(R² + k² log R) = Θ̃(R²)` | `Θ(R²)` bits   | `Θ(R²)` bits                  | **no**        |
| A1′ per-ring rescan | `Θ(k²R) = Θ(R³)`           | `Θ(R)`         | `Θ(R)`                        | yes           |
| A2 calendar         | `Θ(R² + k² log R) = Θ̃(R²)` | `Θ(k²)` events | `Θ(R)` bits + streamed events | **yes**       |
| A2^W band (§7.6)    | `Θ(c*²·R²·ln W)`           | `Θ(RW)` bits   | `Θ(R)` bits                   | **yes**       |

Reading this table honestly:

- **A2 beats A0/A1′ asymptotically** by `Θ(R/log R)`.
- **A2 does not beat A1 asymptotically in time.** A window sieve that rasterises only the _lattice points_ of each line
  (not whole rows) already achieves the
  `Θ̃(R²)` mark volume. A2's advantages over A1 are: (i) **unboundedness** — no
  `Θ(rMax²)` commitment, so `rMax` need not be known and an aborted run costs only what it used; (ii) **working set** —
  the hot state is one ring (`Θ(R)` bits, cache-resident to far larger `R`) instead of the whole window (`Θ(R²)` bits,
  cache-hostile beyond `R ≈ 10⁴`); (iii) **outward-only pruning** (§8.6), a constant factor.
- **A2's memory is its weakness, not its strength.** `Θ(k²)` live rays versus
  `Θ(R²)` _bits_ is a large constant factor against A2 at equal radius. Any claim that the calendar is "the efficient
  one" must be qualified as time-and-locality, never memory.
- **The horizon repairs exactly that weakness.** A2^W stores `Θ(RW)` bits and no ray records (T7.9), beating A1's
  `Θ(R²)` bits by the factor `R/W` while remaining unbounded. Its per-cell work is `Θ(c*²·ln W)` — _constant in `R`_ —
  versus `Θ(a²·ln R)` for the global engine. At finite `W` the engine has a genuine steady state; at `W = ∞` it does
  not. This is the one place in the cost model where a design choice removes an asymptotic cost rather than a constant.

### 8.5 Two constants worth naming

- **P8.4 (outward-only saving ≈ ½).** A pair whose later endpoint is committed at radius `r` has `≈ 2r/||d||_∞` marks
  inward of `r` and `≈ 2R/||d||_∞` in total; weighting pair creation by `d(k²/2) ∝ r dr` gives an inward fraction
  `∫ r·r dr / ∫ r·R dr = 1/2`. So outward-only marking removes about **half** the mark volume of a full-line sieve — a
  constant factor, not an asymptotic gain. (**M**: measure it; see P7.)
- **P8.5 (the degenerate branch is common, not rare).** By T4.4 the face-contained case can fire for at most 4 lines per
  ring — but when it fires it deposits
  `2R+1` marks. Moreover the four lines `x = ±R, y = ±R` acquire their 2 points _during ring `R` itself_ (all their
  cells with `|other| ≤ R` are first visited at ring `R`), so the case is triggered by intra-ring commits, i.e. exactly
  the configuration of T6.1. Consequence: `Θ(R)` marks per ring, `Θ(R²)` over the run, come from 4 direction classes.
  Separately, every _already full_ row/column contributes exactly 2 marks per ring (T4.4 case 3), so the `≈ 4R` full
  axis lines alone deposit `≈ 8R` marks per ring — the size of the whole ring. §9.5 turns this into a structural
  statement about which cells can survive at all.

### 8.6 A time–memory law

Consider the family of algorithms that, instead of storing all rays, _regenerate_
them by rescanning all pairs at the start of every band of `B` rings, keeping only the rays that hit the band.

**T8.6 (trade-off).** Rays alive in a band of width `B` at radius `R` number
`Θ(k²B/R)`; regeneration costs `Θ(k²)` per band and `Θ(k²R/B)` overall. With
`k = aR`, memory `M = Θ(a²RB)` and time `T = Θ(a²R³/B)`, hence

```
T · M = Θ̃(a⁴R⁴) = Θ̃(k⁴).
```

The endpoints of this curve are exactly the engines we already have:
`M = Θ(k)` gives `T = Θ̃(k³)` (**A0, the oracle**); `M = Θ(k²)` gives
`T = Θ̃(k²)` (**A2, the calendar**). _The reference engine and the calendar are the two ends of one continuum_, and the
band width `B` is the dial. Any memory ceiling therefore has a _predictable_ time cost rather than a cliff — the most
useful single fact in this section for capacity planning.

### 8.7 The cost profile depends on the unknown α (**C**)

This is easy to miss and changes the optimal design:

- If `α = 1`: marks `Θ̃(R²)` and traversal `Θ(R²)` are **balanced**; the calendar is essential and `Θ̃(R²)` is within
  `Θ(log R)` of the trivial `Ω(R²)` floor for any algorithm that decides every cell.
- If `α = 2/3`: marks are `Θ̃(k²) = Θ̃(R^{4/3})`, **far below** the `Θ(R²)`
  traversal. The bottleneck becomes _visiting dead cells_, and the right optimisation is a "next live cell" oracle —
  e.g. skipping cells whose row, column or diagonal is already full (§8.5 shows those four families alone near-cover the
  ring), reducing per-ring work toward the number of plausibly-free cells.

**Q8.7.** Is there an `o(R²)` algorithm for this fold, i.e. one that never enumerates most cells of `B(R)`? Any
algorithm that materialises all determined lines is `Ω(k²)`; beating `Θ(R²)` when `α < 1` requires a live-cell
enumerator, and beating `Ω(k²)` at all would require exploiting algebraic structure in the direction multiset that we
currently have no reason to believe exists.

### 8.8 Cost at a finite horizon (**H**, steady state)

Fix `W`, write `δ = δ(W)`, `c* = (W+1)δ`. Points within `W` of a given point: `n_W ≈ 4δW²`. Commits per ring:
`dk_W/dR ≈ 8δR`. Marks per admissible pair: `Θ(ln W)` by the H8.2 computation with `R` replaced by `W` (the truncation
of L2A.6 is what makes `W`, not `R`, the scale). Therefore

```
marks per ring        ≈ 8δR · 4δW² · Θ(ln W)  =  Θ(c*²·R·ln W)
marks over B(R)       = Θ(c*²·R²·ln W)
live band             = Θ(RW) bits                                   (T7.9)
per-cell work         = Θ(c*²·ln W)          — independent of R      (H8.8)
```

Three observations, in decreasing order of surprise:

- **Time is not asymptotically improved.** Both the global and the finite-`W` engine are `Θ̃(R²)`: the finite-`W` set is
  denser (more commits) but each pair is cheaper (`ln W` instead of `ln R`, and only `Θ(δW²)` partners). The horizon
  buys `ln R / ln W` in the constant, `R/W` in memory, and a _bounded_ state — not an exponent.
- **The `Θ(R²)` traversal now dominates outright**, since marks are `Θ(c*²R²ln W)` with `c* ≤ 2`. Q8.7 (live-cell
  enumeration) is therefore the binding open problem at finite `W`, exactly as §8.7 predicted for `α < 1`.
- **The time–memory law of T8.6 acquires a third axis.** `W` bounds memory to `Θ(RW)` _without_ the `Θ(k²R/B)`
  regeneration penalty, because truncation discards long pairs permanently rather than recomputing them. `W` is
  therefore strictly better than band-regeneration as a memory dial — at the price of changing which object is
  computed outside `B(⌊W/2⌋)` (T2A.7), which is precisely the price the classical problem does not ask us to pay.

---

## 9. Density theory: what `k(R)` should do

This is the research question. It is _open_, and the project's value does not depend on which way it goes.

### 9.1 Upper bound (rigorous)

`k(R) ≤ 2(2R+1)` (L2.3) ⇒ `α ≤ 1`, `a ≤ 4`, `c(n) ≤ 2`. Per-ring, `≤ 8` (L2.4).

### 9.2 Lower bound (rigorous): the saturation floor

**T9.1.** Let `Q` be valid and saturated in `B(R)` with `|Q| = k` (so in particular `Q = P ∩ B(R)` by T3.4). Then

```
(2R+1)²  ≤  k + 2R·Σ(Q) + k²/2                                              (†)
```

and consequently, using `Σ(Q) ≤ 1.103 k^{3/2}` (T8.1) and assuming `k ≤ R`,

```
k ≥ 1.35·R^{2/3}·(1-o(1)),     i.e.  ≥ 0.85·n^{2/3}·(1-o(1))  in an n×n box.
```

Hence `α ≥ 2/3` for **every** ring-monotone order, every intra-ring rule and every seed.

_Proof._ Every cell of `B(R)` is in `Q` or covered by a determined line (D3.3); apply L4.3 to each line and union-bound.
Then substitute T8.1 and solve. ∎

**T9.2 (the reduction).** Rearranging (†),

```
Σ(P ∩ B(R))  ≥  2R - k/(2R) - k²/(4R).
```

Non-vacuous exactly when `a < 2√2 ≈ 2.83`. So _a saturated set must have a large direction-sum functional_ `Σ` — it must
contain many pairs with **small** primitive direction norm, i.e. much local collinear structure. Conversely, plugging
any estimate of `Σ` back into (†) bounds `k` from below:

| assumed behaviour of `Σ(P ∩ B(R))` | resulting floor on `k`                     |
| ---------------------------------- | ------------------------------------------ |
| adversarial max, `Θ(k^{3/2})`      | `k = Ω(R^{2/3})` (T9.1)                    |
| "typical" `Θ(k·log²k)` (**H**)     | `k = Ω(R/log²R)` — i.e. `α = 1` up to logs |

**This is the cleanest formulation of the open problem: the density exponent of the spiral-greedy set is controlled by
the growth rate of the direction-sum functional `Σ`.** `Σ` is a single scalar per radius, trivially measurable, and
interpolates the two competing predictions. It is the headline diagnostic (P9).

### 9.3 Mean-field prediction — and its inconsistency (**H**)

Assume blocking marks land on ring cells like independent Poisson events with mean
`μ(R) = β a² ln R`, `β = ρ/8` (§8.3). Then free cells per ring
`F(R) ≈ 8R·e^{-μ} = 8R^{1-βa²}`, and greedy places `min(8, F)` per ring (L2.4). Test the ansatz `k = A R^α`:

- `α < 1` ⇒ `μ → 0` ⇒ `F ≈ 8R` ⇒ `dk/dR = 8` ⇒ `k = Θ(R)`. Contradiction.
- `α = 1`, `βa² < 1` ⇒ `F → ∞` ⇒ cap-limited ⇒ `a = 8`, but then `βa² = 64β > 1`
  for any `β > 1/64`. Contradiction.
- `α = 1`, `βa² > 1` ⇒ `F → 0` ⇒ `dk/dR → 0` ⇒ sub-linear. Contradiction.

**T9.3 (mean-field is inconsistent).** No power law satisfies the Poisson self-consistency. Therefore the process is
_not_ governed by the mean blocking multiplicity; it is governed by the **lower tail** of the multiplicity
distribution — surviving cells are structurally atypical, and the Poisson factorisation is qualitatively wrong.

This is a genuinely informative negative result. It tells us which measurement matters (the _distribution_ of blocker
multiplicity per ring cell, and its overdispersion, not its mean), and it warns that any back-of-envelope argument that
"the ring is `2 ln R`-times covered so the set must be sparse" — or the reverse — is unsound.

### 9.4 The self-similar ansatz (**C**)

Replace the Poisson assumption with a measured survival exponent. Define `σ(R)` by

```
#{ free cells on S(R) } ≈ 8·R^{1-σ(R)}          (σ = 1 means Θ(1) free cells/ring)
```

If the process is asymptotically self-similar (`σ(R) → σ`), then
`dk/dR ≈ 8R^{1-σ}` and

```
k(R) ≈ (8/(2-σ))·R^{2-σ},        α = 2 - σ.                                (C9.4)
```

The rigorous bounds pin `σ ∈ [1, 4/3]`. Under the Poisson reading
`σ = βa² ln R/ln R = βa²`, which is exactly the inconsistency of T9.3; under a correlated reading `σ` is a genuine
emergent exponent. **C9.4 is the project's central quantitative conjecture: `α = 2 - σ` with a single, measurable `σ`.**

### 9.5 Structural reading: what a surviving cell must satisfy

A cell `c = (x,y) ∈ S(R)` is free only if _all_ of the following hold, and these are the four cheapest and most binding
conditions (§8.5):

1. row `y` is not full (`< 2` points),
2. column `x` is not full,
3. both diagonals through `c` are not full,
4. no coincidence among the remaining `Θ(R²)` direction classes.

Conditions 1–3 involve only the four classes with `||d||_∞ = 1` and are `O(1)`
probability events (if mean row occupancy is `a/2 < 2`, a constant fraction of rows is non-full); condition 4 carries
the log-divergent tail and hence the exponent. Two consequences:

- **P9.5 (capacity is not the binding constraint below `a = 4`).** Row/column slot accounting alone permits `a = 4`:
  slots are created at 4 rows + 4 columns per ring, each point consumes one row slot and one column slot, giving exactly
  the L2.3 bound. So capacity does not by itself force sub-linearity; only condition 4 can.
- **P9.6 (the frontier is where the interesting cells are).** Cells on the two _new_ faces (`y = ±R`) live in _empty_
  rows and therefore fail only via their (old, likely full) columns and via condition 4; cells on the _old_ faces
  (`x = ±R`, `|y| < R`) fail via their old rows. The asymmetry between the two face types is a measurable signature of
  the mechanism (P10).

### 9.6 Precedents: ordered greedy usually loses a polynomial factor (**C**)

The most important prior information we have is not about this problem but about the shape of greedy processes on
additive/geometric constraints:

| process                                                                | greedy in natural order                | optimum                    |
| ---------------------------------------------------------------------- | -------------------------------------- | -------------------------- |
| Sidon sets (Mian–Chowla, greedy `B₂`)                                  | counting function `≈ n^{1/3}`          | `Θ(n^{1/2})`               |
| 3-AP-free sets (Szekeres/greedy = ternary digits)                      | `n^{log2/log3} ≈ n^{0.631}`            | `n^{1-o(1)}`               |
| random-order greedy independent set in the collinear-triple hypergraph | `Θ̃(n)` (mean-field/AKPSS-type scaling) | `Θ(n)`, `[1.5n, 2n]` known |

Two lessons. First, **greedy in a rigid, structured order can be polynomially sparser than the optimum**, and the loss
is caused precisely by the order's self-similar arithmetic structure. Second, **greedy in a _random_ order is often
within a log of optimal** — so the spiral order, not greediness, is the risk. The spiral is highly structured, and
§8.5/§9.5 show its frontier interacts with the four `||d||_∞ = 1` families in a very regular way.

### 9.7 Conjectures

- **C1 (bracket).** `2/3 ≤ α ≤ 1`, and `α` exists (the limit
  `log k(R)/log R` converges). Rigorous ends; convergence conjectural.
- **C2 (primary, deliberately falsifiable).** `α < 1` strictly: the spiral-greedy set has density zero in the plane, by
  analogy with C9.6's first two rows. If so, the construction is _not_ a lower-bound construction for the classical
  problem, and the interesting object becomes the saturation exponent itself.
- **C3 (alternative).** `α = 1` with `a` bounded away from both 0 and 4, most plausibly `a ∈ [1, 3]`
  (`c(n) ∈ [0.5, 1.5]`). Any measured `c(n) > 1.5`
  asymptotically would be a genuine improvement over Hall–Jackson–Sudbery–Wild and must be treated with maximum
  suspicion (re-verify, re-derive, re-measure) before being believed.
- **C4 (ceiling implausibility).** `a → 4`, i.e. `c(n) → 2`, is _false_. It would resolve the long-standing question of
  whether `2n` is attainable for large `n`
  in the affirmative and by a trivial algorithm. Any run appearing to approach it indicates a verifier bug — this
  conjecture's operational value is as a **bug detector**.
- **C5 (log corrections).** If `α = 1`, the correction is logarithmic and _downward_: `k(R) = a R / (log R)^{θ}` with
  `θ ≥ 0`, motivated by §9.2's second row (`Ω(R/log²R)`) and by `μ ∝ ln R` (§8.3). Distinguishing `θ = 0` from
  `θ > 0` requires two decades of `R` and is the main reason to push radius.
- **C6 (order sensitivity).** `α` (or `a`) depends measurably on the intra-ring rule and on the seed, since the whole
  effect lives in the correlation structure of the frontier. If `nearestFirst` and `clockwise` give indistinguishable
  curves to within noise, that itself is evidence for a universal exponent (a stronger and more interesting result than
  either individual number).
- **C7 (no forced symmetry).** The greedy set is equivariant only under lattice symmetries that preserve `≺`.
  Clockwise-from-`(0,R)` order is not preserved by the diagonal reflection (which reverses it) nor by the 90° rotation
  (which cyclically shifts each ring), so the stabiliser is trivial and **no dihedral symmetry is forced**. Any observed
  symmetry is emergent and would be evidence of a structured attractor — interesting, and a reason to distrust
  "aperiodicity"
  claims until probed (`idea.md` asserts aperiodicity; here it is only a hypothesis).
- **C8 (sub-window transfer).** Any sub-window of `P` is valid, so
  `max_pop(s)/s` is a certified lower bound for the classical `s × s` problem for every `s`, and by gauge alignment
  (§11) `max_pop(2R+1) ≥ k(R)`. Hence the ring counter _is_ a point on the `c(n)` curve, with no resampling. (Rigorous;
  listed here because it is what makes the whole exercise comparable to the literature.)

### 9.8 A sparse-saturation question

**Q9.8.** How sparse can a _saturated_ valid set in `[n]²` be? T9.1 gives
`Ω(n^{2/3})`; we know no matching construction. If saturated sets of size
`O(n^{2/3+ε})` exist, then C2 becomes much more plausible and T9.1 is near-optimal; if the truth is `Ω(n^{1-o(1)})`,
then C3 follows for _every_ greedy order and the project's outcome is decided by pure combinatorics rather than by
measurement. Either resolution would be a publishable result independent of the engine.

### 9.9 The same theory in the horizon coordinate

**T9.4 (`W`-saturation floor).** `P_W` is **`W`-saturated**: every cell not in `P_W` lies in the influence rectangle
(L2A.5) of some admissible determined pair. Counting inside `B(R)` and letting `R → ∞`,

```
1 ≤ δ·( 1 + 3.12·W·√n_W + n_W/2 ),      n_W ≈ 4δW²   ⟹   δ ≥ 0.29·W^{-4/3}·(1-o(1)),
```

hence `c*(W) ≥ 0.29·W^{-1/3}`.
_Proof._ Saturation is T3.4 with L2A.4 substituted for L2.2. For the direction sum: from a fixed `p`, two admissible
partners on the _same_ side in the same direction class would form an admissible collinear triple, so each class has at
most 2 admissible partners; therefore `Σ_{q admissible} 1/||d(p,q)||_∞ ≤ 2Ψ(M)` with `Φ(M) = ⌈n_W/2⌉`, i.e.
`≤ 3.12√n_W` (L1.1, L1.2). Multiply by the truncated chord bound L2A.6 and by `δ` cells per unit area. ∎
**The two floors are one theorem.** T9.1 gives `k(R) ≥ 1.35R^{2/3}`, i.e. `α ≥ 2/3`; T9.4 gives
`c*(W) ≥ 0.29W^{-1/3}`, i.e. `α ≥ 2/3` through C2A.10. The exponents match exactly. This is not a coincidence — the two
derivations are the same union bound in the two coordinates — but it _is_ the strongest available evidence that the
transfer C2A.10 has the right form, and it makes the pair `(T9.1, T9.4)` a live consistency check rather than a
duplication.
**Additional conjectures in the horizon coordinate.**

- **C9 (horizon transfer).** `c*(W) ≍ W^{α-1}` with the same `α` as `k(R) ≍ A R^α` (= C2A.10). Falsifiable in one run
  by comparing the origin window with the far field (P16).
- **C10 (far-field universality).** `δ(W)` is independent of the intra-ring rule and of the seed, because H2A.11 says
  the far field only remembers the sweep direction. If true, C6's order-sensitivity — if it exists at all — lives
  entirely in the `O(R)` seam cells and vanishes in density. This makes C6 and C10 _complementary_: measuring both
  separates "the order matters" from "the order matters only near the seams".
- **C11 (monotone horizon).** `c*(W)` is non-increasing in `W`. Plausible but unproved (P2A.13); a violation would
  show that the greedy's order-dependence can _pay_, which would in turn make Q13.5 (local repair) far more promising.
- **C12 (finite-`W` periodicity).** For small `W` the far-field process falls into a periodic orbit (C2A.12), and the
  smallest `W` with an aperiodic recurrent class is a finite, findable number. This is the only version of
  `idea.md`'s aperiodicity claim that is currently decidable.

---

## 10. Falsifiable predictions (the measurement programme)

Each item is a number or curve the engine must emit, with the prediction it tests. Everything here is computable from
the point set plus mark counters; none of it requires new theory.

| id  | measurement                                                   | prediction / purpose                                                                                  |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P1  | `k(R)` and log–log slope `α` with error bars                  | `α ∈ [2/3, 1]` (T9.1, L2.3); locate C2 vs C3                                                          |
| P2  | marks released per ring, `/ (R ln R)`                         | `→ ρa²`, fixes `ρ ≈ 1` in H8.3; a mismatch invalidates §8.3                                           |
| P3  | distribution of blocker multiplicity per ring cell            | strongly **overdispersed** vs Poisson (T9.3); report variance/mean                                    |
| P4  | `σ(R)` from free-cells-per-ring                               | `α = 2 - σ` (C9.4) — the two independent estimates of `α` must agree                                  |
| P5  | row/column occupancy histogram vs `R`                         | all `≤ 2` (**hard invariant**); fraction full `→` ? tests P9.5                                        |
| P6  | fraction of marks from the 4 axis + 2 diagonal classes        | `Θ(1)` of all ring coverage (§8.5)                                                                    |
| P7  | full-line marks vs outward-only marks                         | ratio `≈ 2` (P8.4)                                                                                    |
| P8  | `#{face-contained events}` per ring                           | `≤ 4`, and `> 0` frequently — the degenerate branch is hot, not cold (P8.5)                           |
| P9  | **`Σ(P ∩ B(R))`**, the direction-sum functional               | `≥ 2R - k²/(4R)` (T9.2, rigorous — a bug check); growth `Θ(k^{3/2})` vs `Θ(k log²k)` decides C2 vs C3 |
| P10 | placements split by face type (new `y = ±R` vs old `x = ±R`)  | asymmetry predicted by P9.6                                                                           |
| P11 | autocorrelation / best translation overlap                    | tests the aperiodicity hypothesis and C7                                                              |
| P12 | `c(s) = max_pop(s)/s` vs `1.0` (Erdős), `1.5` (HJSW), `2`     | the literature comparison; monotone-in-`s` sanity check via C8                                        |
| P13 | speedup vs lanes on the marking stage                         | ceiling set by T7.7 (`Θ̃(R)` available parallelism, `Ω(R)` barrier chain)                              |
| P14 | mark volume vs `R^{5/2}` and vs `k² ln R`                     | must sit between (T8.1, H8.2); above `R^{5/2}` means a non-primitive direction or a broken split      |
| P15 | **`c*(W)`** = mean window density × `(W+1)`, over all windows | `≍ W^{α-1}` (C2A.10) — the primary, self-averaging estimator of `α`                                   |
| P16 | origin window `k_W(⌊W/2⌋)/(W+1)` vs far-field `c*(W)`         | equal ⇒ homogeneity (C2A.12); a systematic gap refutes C2A.10 and indicts the seed/seams              |
| P17 | `max_pop(s)/s` over all `Θ(R²)` windows, `s ≤ W+1`            | `≥` the origin-anchored P12 value; this, not P12, is the lower-bound claim we publish (C2A.3)         |
| P18 | commits per ring at finite `W`                                | `≈ 8δ(W)·R`, **not** `≤ 8` — L2.4 is a `W = ∞` statement; a plateau at 8 means `W` is not in effect   |
| P19 | `P_W ∩ B(⌊W/2⌋)` vs `P_{W'} ∩ B(⌊W/2⌋)`, `W ≤ W'`             | **hard invariant**, cell-for-cell (T2A.7) — the cheapest full-stack regression test in the project    |
| P20 | re-synchronisation length of speculative chunks               | feasibility of the optimistic parallelism of P7.10; expect `O(W)`, but this is empirical              |

Runtime invariants that must be asserted, not merely measured (each is a theorem above, so a violation is a bug with a
known cause):

- each ray's scheduled ring indices non-decreasing, strictly increasing except on a face-contained stretch (C4.2,
- marks per line inside `B(R)` `≤ min(2R, 2W)/||d||_∞ + 1` (L4.3, L2A.6) — violation ⇒ bad split, non-primitive `d`, or
  an untruncated ray;
  T4.4) — violation ⇒ unsound outward-only (T5.3);
- `P ∩ B(R)` saturated (T3.4) — the greedy-fidelity check; catches _over_-blocking, which the collinearity verifier
- `≤ 2` points per row/column/diagonal _per `W`-window_ (L2A.2 + L2.3); `≤ 2` globally and `≤ 8` per ring **only when
  `W = ∞`** (L2.3, L2.4);
- no mark is ever scheduled more than `W` rings ahead of its creating commit (T7.9) — violation ⇒ an admissible-pair
  filter that fails to check `span ≤ W`;
  cannot see.

---

## 11. Why L∞, stated as theorems and a price

**Advantages (each proved above).**

1. **Closed-form level sets.** T4.4: intersecting a line with a ring reduces to
   `x = ±R` or `y = ±R` — pure integer arithmetic, no square roots, no quadratics, and an exact three-way
   classification. Under `L2` the level set of the gauge along a line requires an integer square root per ring, and the
   _stride_ between consecutive ring hits is not a fixed multiple of `||d||`, so no closed-form schedule exists.
2. **Sharp chord bound.** L4.3 with the constant `2R = diam_∞ B(R)` is _sharp_
   (attained by face lines). This is what converts "most lines are steep" into the quantitative `Θ(log R)`
   marks-per-line of H8.2 — the entire performance thesis.
3. **Gauge alignment with the objective.** An axis-aligned `s × s` window _is_ an L∞ ball. So the traversal gauge, the
   analysis gauge and the literature's gauge coincide: `max_pop(2R+1) ≥ |P ∩ B(R)| = k(R)` (C8), and the engine's ring
   counter already reports a valid point of the `c(n)` curve with no resampling and no aliasing between "what we build"
   and "what we report". Under `L2` every reported number would live in a different metric than the one it was built in.
4. **The horizon is a rectangle.** L2A.5: the influence region `B(p,W) ∩ B(q,W)` of an admissible pair is an
   axis-aligned rectangle, and its intersection with the line is an integer interval computed by one division. The
   horizon gauge, the traversal gauge and the objective's gauge are again the _same_ gauge, so "enforce the constraint
   for windows of side `n`" translates to `W = n-1` with **no slack**. Under `L2` a horizon would be a curved lens,
   would need a square root per truncation, and — worse — would not be exactly the shape the literature asks about,
   forcing either a conservative `W√2` (wasteful) or an unsound `W/√2`.

**The price (also a theorem).** Flat faces ⇒ T4.4 case 4 exists, and P8.5 shows it is _frequent_ (up to 4 firings and
`Θ(R)` marks per ring) and _entangled with the hardest correctness requirement_ (T6.1/C6.3 share a witness). Strict
convexity would delete the case; it would also delete advantages 1–3. The exchange is clearly favourable, but it must be
paid in exhaustive small-radius testing of the 4 faces and 4 corners (C6.4) rather than in sampling.

**P11.1 (Euclidean as a re-ordering, not a second scheduler).** Since
`B_2(r) ⊆ B_∞(r) ⊆ B_2(r√2)`, an `L2`-ordered commit sequence can be driven by the _same_ L∞ calendar provided the
marking runs **ahead by a factor `√2` in radius**
before any `L2`-ordered cell is committed. Correctness follows from T5.1 applied in the L∞ gauge: all blockers of an
`L2`-earlier cell lie inside
`B_2(r) ⊆ B_∞(r)`, which is fully marked. Hence exactly one scheduler is ever needed, and `ringMetric = euclidean` is a
commit-order filter with a `√2`
lookahead — answering `plan.md` §11 Q4 in the affirmative and making a native `L2`
calendar unnecessary rather than merely out of scope.

---

## 12. Summary of conjectured scaling advantages

| claim                                                      | status                                               | basis                             |
| ---------------------------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| Marks per line are `Θ(log R)` on average, not `Θ(R)`       | **H** (tight rigorous ceiling `O(R^{1/2})` per line) | L4.3 + H8.2                       |
| Total work `Θ̃(R²)` vs `Θ(R³)` for the oracle               | **T/H**                                              | §8.4                              |
| `Θ(1)` amortised scheduling per mark, no log factor        | **T**                                                | T7.2 (monotone keys)              |
| Working set `Θ(R)` bits instead of `Θ(R²)` bits            | **T**                                                | §7.3, T5.1                        |
| Unbounded operation with no `rMax`-proportional allocation | **T**                                                | T5.1 + §7.3                       |
| Outward-only marking halves the mark volume, exactly       | **H**                                                | P8.4                              |
| `T · M = Θ̃(k⁴)` trade-off, with A0 and A2 as endpoints     | **T**                                                | T8.6                              |
| Parallel work `Θ̃(k²)`, depth `Ω(R)`, parallelism `Θ̃(R)`    | **T**                                                | T7.3, T7.7                        |
| The serial commit cannot be removed (not an artifact)      | **T**                                                | T7.6 (LFMIS P-complete)           |
| Bit-identical output under any parallel/GPU schedule       | **T**                                                | T7.3 (ACI marks) + T7.5 (banding) |
| Density exponent `α ∈ [2/3, 1]`                            | **T**                                                | T9.1, L2.3                        |
| `α` is decided by the growth of `Σ(P ∩ B(R))`              | **T**                                                | T9.2                              |
| `α < 1` (greedy loses a polynomial factor)                 | **C2**                                               | §9.6 precedents                   |
| `α = 2 - σ` with a single measurable `σ`                   | **C9.4**                                             | self-similar ansatz               |
| `c(n) → 2` is impossible                                   | **C4**                                               | used as a bug detector            |
| Finite horizon `W` is _exact_ inside `B(⌊W/2⌋)`            | **T**                                                | T2A.7                             |
| At finite `W` the calendar collapses to a `Θ(RW)`-bit band | **T**                                                | T7.9                              |
| Per-cell work independent of `R` at fixed `W`              | **H**                                                | §8.8                              |
| `α = 1 + lim log c*(W)/log W` — exponent measurable in `W` | **C9**                                               | C2A.10 + T9.4 exponent match      |
| Far field at fixed `W` is a bounded-state ergodic process  | **H/C**                                              | H2A.11, C2A.12                    |
| `Θ(R²/W²)` independent window samples instead of one       | **T**                                                | L2A.2, C2A.3                      |

The one-sentence version: **L∞ makes the schedule closed-form and sharp, which turns a cubic rasterisation into a
near-quadratic streamed sieve with a ring-sized working set and provable determinism under parallelism; the horizon `W`
then bounds the state, restores a genuine steady state, and converts the density measurement from one sample per radius
into `Θ(R²/W²)` samples per run — while the density exponent itself remains genuinely open, bracketed rigorously
between `2/3` and `1`, and now reduced to two measurable functionals, `Σ(P ∩ B(R))` in radius and `c*(W)` in horizon.**

---

## 13. Open problems

- **Q8.7** An `o(R²)` algorithm (live-cell enumeration), especially if `α < 1`.
- **Q9.8** Minimum size of a saturated valid set in `[n]²`; is `Ω(n^{2/3})` tight?
- **Q13.1** Prove `Σ(P ∩ B(R)) = O(k log^{O(1)} k)` for greedy sets — this would upgrade C3 from conjecture to theorem
  via T9.2.
- **Q13.2** Is `α` universal across ring-monotone orders (C6)? Is there an order with `α = 1` and `a > 3`, i.e. a greedy
  construction beating HJSW?
- **Q13.3** Sharpen L2.3: no `(2-ε)n` upper bound for the classical problem is known. Nothing in this project depends on
  it, but the `c(n)` curve is measured against it.
- **Q13.4** Does the mean-field inconsistency (T9.3) admit a rigorous replacement, e.g. a differential-equation analysis
  of the frontier measure conditioned on the four `||d||_∞ = 1` families (§9.5)?
- **Q13.5** Local repair: does removing 1 point and adding 2 raise `c(s)`, and does iterating it change the exponent or
- **Q13.6** Prove the horizon transfer C2A.10, i.e. that `lim log c*(W)/log W = α - 1`. Even one rigorous inequality
  between the two coordinates (beyond the matching `2/3` floors of T9.1/T9.4) would make the cheap experiment decisive.
- **Q13.7** Compute `δ(W)` exactly for small `W` by transfer matrix on the `(2W+1)×(W+1)` far-field state (C2A.12). Is
  the recurrent class a single periodic orbit, and if so up to which `W` (C12)? This is combinatorics, not measurement,
  and it attacks C2 vs C3 from a direction the engine cannot.
- **Q13.8** Is `c*(W)` monotone in `W` (C11)? Equivalently: can weakening a constraint ever _reduce_ a greedy's yield
  here? A counterexample at small `W` is a finite search.
- **Q13.9** Does the finite-`W` fold admit exact sub-linear-depth parallelisation via re-synchronisation (P7.10, P20),
  or does bounded-degree LFMIS P-completeness (T7.6) survive in a form that rules it out?
  only the constant? (Out of scope for v1, but the theory above is repair-agnostic: T3.4 is the only property repair
  breaks.)

---

## 14. References (for orientation; verify before citing)

- P. Erdős, in A. Roth's note (1951): `(i, i² mod p)` gives `p` points, `c ≈ 1`.
- R. R. Hall, T. H. Jackson, A. Sudbery, K. Wild (1975): `(3/2 - ε)n` construction.
- R. K. Guy, L. M. Kelly (1968): heuristic maximum `≈ 1.87n`; later corrected downward (≈`1.81n`) — heuristic, not a
  bound.
- A. Flammenkamp: computational records for small `n`; `2n` known only for small `n`.
- R. B. Dial (1969): bucketed monotone priority queues (`O(1)` amortised) — T7.2.
- S. A. Cook (1985): lexicographically-first MIS is P-complete — T7.6.
- M. Ajtai, J. Komlós, J. Pintz, J. Spencer, E. Szemerédi; R. Duke, H. Lefmann, V. Rödl; P. Bennett, T. Bohman:
  independence number / random greedy in hypergraphs — the `Θ̃(n)` random-order row of §9.6.
- Mian–Chowla sequence (greedy Sidon set) and the greedy 3-AP-free set (Erdős–Turán 1936; Odlyzko–Stanley): the two
  precedents for C2.
