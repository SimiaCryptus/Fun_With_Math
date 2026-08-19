# No-Three-in-Line Sieve — Theory II: the finite-horizon field

Status: **THEORY / SPECULATIVE.** Companion to `theory.md` (which is normative for semantics); `idea.md` (motivation),
`plan.md` (engineering), `lean/` (machine-checked core).

`theory.md` introduced the horizon `W` (§2A) as a *resource* dial and proved that it is exact inside `B(⌊W/2⌋)`
(T2A.7). This document takes the next step and treats the finite-`W` object **as a field in its own right** rather than
as a truncation of the classical one. Three claims motivate it, recorded here verbatim as they were first stated:

> * limiting the N window leads to a uniform density field (simplistically; it does not fade out at volume)
> * the density field produces some odd features such as high density spokes at x=±y reminiscent of the Ulam spiral
> * central to this approach is the conjecture that the infinite window-constrained field will exhibit every
>   configuration of the square of related length
>   * related: this coverage is dense at a relatively randomly-indicated radius

Sections §15–§18 turn these into statements that can be proved, refuted, or measured. Tags are as in `theory.md`
(**L/T/P** proved, **H** heuristic, **C** conjecture, **Q** open, **M** measurement). Numbering continues
`theory.md`: sections from §15, conjectures from **C13**, measurements from **P21**, open problems by section.

**Editorial rules inherited.** The density exponent is unknown and no section may assume it. Every statement is
parameterised by `W`; unqualified statements are finite-`W` statements *here* (the reverse of `theory.md`'s convention,
and the single most important difference in reading the two documents).

**What changes relative to `theory.md`.** Two of this document's results move priors that `theory.md` fixed:

* §17 shows the mean-field argument, which is *self-inconsistent* at `W = ∞` (T9.3), becomes **consistent** at finite
  `W` and votes for `α = 1` (**C3**) against `theory.md`'s primary conjecture **C2** (`α < 1`). It also predicts a
  `1/log W` approach that will masquerade as `α < 1` in any short run — a methodological warning for **P15**.
* §16 shows that the "uniform field" of claim 1 is uniform only in the bulk: an `O(W)`-wide, order-induced boundary
  layer along the four rays `x = ±y` carries a **constant-factor** density excess. It is `Θ(W/R)` of the mass, so C10
  (far-field universality of `δ(W)`) survives, but it is the visually dominant feature and — see §18.5 — possibly the
  most productive place in the whole field to look for record configurations.

---

## 15. The finite-horizon object is an extensive field, not a fading one

### 15.1 What "does not fade out at volume" means

The classical (`W = ∞`) set is *sparse to the point of invisibility*: by L2.3, `k(R) ≤ 2(2R+1)`, so

**L15.1 (fading at `W = ∞`).** The occupancy of ring `S(R)` satisfies

    (k(R) - k(R-1)) / |S(R)|  ≤  8 / (8R)  =  1/R   →  0,

and the occupancy of `B(R)` is `≤ 2(2R+1)/(2R+1)² = O(1/R) → 0`. *Proof.* L2.4 and L2.3. ∎

So at `W = ∞` there is no field: the object has planar density zero, every window of side `s` at radius `R ≫ s` is empty
with probability `1 - O(s/R)`, and *every* local statistic is a statistic of the seed's neighbourhood. This is why
`theory.md` §9 has to talk about exponents rather than densities, and why every measurement there is origin-anchored and
correlated across radii.

At finite `W` this collapses. T2A.9 already gives `k_W(R) = Θ_W(R²)`, i.e. positive density *on average over
`B(R)`*. What claim 1 asserts is stronger and is what makes the field picture legitimate: the density is bounded below
**locally and uniformly**, everywhere, at every radius.

### 15.2 The uniform local floor

**T15.2 (erosion / uniform local floor).** Fix finite `W`. Let `Q` be any axis-aligned window of side `s ≥ 2W+2`,
anywhere in the plane, at any radius. Then

    |P_W ∩ Q|  ≥  c₀ · W^{-4/3} · (s - 2W)² · (1 - o(1)),        c₀ ≈ 0.29,

with the same `c₀` as T9.4. In particular the density of `P_W` is bounded below by a positive constant in *every*
sufficiently large window, not merely in the origin-anchored family.

*Proof.* Let `Q⁻ ⊂ Q` be the erosion of `Q` by `W` (side `s - 2W`). Every cell `c ∈ Q⁻ \ P_W` is `W`-blocked, so by
L2A.4/L2A.5 it lies on `ℓ(p,q)` for a determined pair with `||p-c||_∞, ||q-c||_∞ ≤ W`; hence `p, q ∈ Q`. Run the T9.4
union bound *inside `Q`*: with `m := |P_W ∩ Q|`, each apex has at most 2 admissible partners per direction class (a
third would be an admissible collinear triple), so `Σ_{q admissible} 1/||d||_∞ ≤ 2Ψ(M)` with `Φ(M) = ⌈m/2⌉`, i.e.
`≤ 3.12√m`; multiplying by the truncated chord bound L2A.6 gives a coverage capacity of
`m(1 + 3.12·W·√m + m/2)`, which must be at least `(s-2W)²`. Solving reproduces T9.4's constant. ∎

Three remarks.

* **The erosion is necessary, and it fixes the scale.** Cells within `W` of `∂Q` may be blocked from outside; cells
  deeper than `W` cannot. The theorem therefore says nothing for `s ≤ 2W` — and §18.2 shows that this is not slack in
  the proof but the real obstruction: sparse patches of side `≲ W` genuinely can occur, and this is exactly what the
  universality conjecture needs.
* **It is uniform in `R`.** Nothing in the proof mentions the origin, the seed, the traversal order, or the radius. This
  is the precise content of "it does not fade out at volume".
* **It is the same theorem as T9.4 and T9.1**, localised. The three floors — global-in-`R`, global-in-`W`, local-in-
  `Q` — are one union bound in three coordinates (`theory.md` §9.9 makes the same point for the first two).

**T15.3 (uniform local ceiling).** For every window `Q` of side `s`,

    |P_W ∩ Q|  ≤  s · ( 2s/(W+1) + 2 ),

and for `s ≤ W+1`, `|P_W ∩ Q| ≤ 2s` (L2A.2 + L2.3). *Proof.* As in T2A.9 (upper), applied per row of `Q`. ∎

Together: `δ(W) ∈ [c₀W^{-4/3}, 2/(W+1)]` **locally and everywhere**, which is `theory.md`'s bracket for `c*(W)`
promoted from an average to a uniform statement.

### 15.3 Existence and fluctuations of the field

**C13 (stationary field).** Fix `W`. For every finite pattern `C ⊂ [s]²` the frequency

    f_W(C)  :=  lim_{R→∞}  #{ v ∈ B(R) : (P_W - v) ∩ [s]² = C } / (2R+1)²

exists. Equivalently the far field has a well-defined patch-frequency (empirical) measure, and `δ(W) = Σ_{C ∋ 0} f_W(C)`
is its 1-point marginal. This strengthens C2A.12 (which asserts only the existence of `δ(W)`) and is what licenses every
"field" statement below. Its natural proof route is H2A.11 + C2A.12: in the far field the update is a deterministic,
finite-range, sequential-update rule (§18.1), so this is a statement about the orbit's Cesàro convergence, not about
randomness.

**Caveat.** C13 as stated averages over `B(R)`, which includes the seams of §16. The correct object is a family of
frequencies indexed by *site class* (bulk / spoke / branch cut); the seam classes have `Θ(W/R) → 0` weight, so the limit
is the bulk frequency. Any measurement of `f_W` must be restricted to the bulk or it is measuring a mixture that
converges only because the interesting part has vanishing weight.

**D15.4 (number variance, structure factor).** `σ²_W(s) := Var_v |P_W ∩ (v + [s]²)|` over bulk `v`; `S_W(q)` its Fourier
transform (the lattice structure factor of `P_W`).

**C14 (hyperuniformity).** `σ²_W(s) = o(s²)`, plausibly `Θ(s log s)` or `Θ(s)`, i.e. the field is **hyperuniform**:
its long-wavelength density fluctuations are suppressed relative to Poisson. Motivation: the constraint "at most 2
points per `(W+1)`-run of any row, column or diagonal" is a hard local-conservation constraint of exactly the kind that
produces surface-law variance in 1D; the field is a 2D interlocking of `Θ(W)` such 1D constraint families.

Why this is worth measuring even though nothing depends on it:

* a **Bragg peak** in `S_W(q)` is a periodic far field (**C12**) — and by T18.5 a periodic field kills universality
  outright. `S_W` is therefore the cheapest global periodicity test available, complementary to the patch-complexity
  test of P26 and far cheaper than P11's translation-overlap search;
* hyperuniformity would explain a slow, systematic reduction of the sampling error on `c*(W)` below the `W/R` of §2A.2,
  improving the error bars on the project's primary estimator (P15);
* a *super*-Poissonian variance (`σ² ≫ s²`) would indicate large-scale phase separation — patches of high and low
  density — which is precisely the failure mode that would invalidate treating far-field windows as independent samples.

### 15.4 Uniform in density, not in appearance

T15.2/T15.3 bound the density from both sides *uniformly*, so the field is homogeneous at the level of first-order
statistics. It is **not** isotropic, and it is not free of long-range order: §16 exhibits a deterministic,
`O(W)`-wide, unboundedly long anisotropy that the density floor and ceiling are far too coarse to see. "Uniform" in
claim 1 should therefore be read as *extensive and non-fading*, not as *featureless* — the word "simplistically" in the
original note is doing real work, and §16 is what it is protecting against.

---

## 16. The seam calculus: why there are spokes at `x = ±y`

### 16.1 The observation and the two candidate mechanisms

Rendered at finite `W`, the field shows four **bright rays** along `x = ±y`, of apparently constant relative brightness
and constant width, extending as far as the run goes. Two mechanisms could produce a diagonal feature:

* **(A) Lattice mechanism.** `d = (1,±1)` are, with the two axis classes, the four shortest direction classes, and by
  P8.5/P6 they carry a constant fraction of all marks. If the diagonals were special *as lattice lines*, we would expect
  them to be **dark** (heavily marked ⇒ heavily blocked), and we would expect the effect to be attached to the diagonals
  through *placed points*, not to the two diagonals through the *origin*.
* **(B) Order mechanism.** The rays `x = ±y` are the world-lines of the **corners of the L∞ ring**, i.e. the four points
  where the traversal `≺` turns. This is `theory.md`'s "four diagonal seams" (H2A.11), previously accounted for only as
  an `O(R)`-cell nuisance.

The observed sign (bright, not dark) already refutes (A). §16.2 derives (B) quantitatively, §16.4 gives a decisive
experimental separation, and §16.5 explains why (B) makes the Ulam-spiral comparison exact in moral and inexact in
mechanism.

### 16.2 The history census

**D16.1 (past cone, history count, history fraction).** For a cell `c`, let

    N⁻(c) := { p : p ≺ c, ||p - c||_∞ ≤ W },     H(c) := |N⁻(c)|,     θ(c) := H(c)/W².

By T5.4, `N⁻(c)` is *exactly* the set of cells whose contents can affect the decision at `c`. Everything the greedy
knows when it decides `c` is `P_W ∩ N⁻(c)`; two cells with congruent past cones and congruent contents are decided
identically. `θ` is therefore the natural scalar field controlling any positional inhomogeneity of the outcome.

**L16.2 (far-field history census, clockwise-from-`(0,R)` order).** Let `R ≫ W`. Write cells near the top face as
`(x, R)`. Then, exactly:

| site                                | position                    | `H`                  | `θ`               |
|-------------------------------------|-----------------------------|----------------------|-------------------|
| bulk of a face                      | `W < x < R-W`               | `2W² + 2W`           | `2`               |
| approach to a corner                | `c = (R-j, R)`, `0 ≤ j ≤ W` | `W² + (j+1)W`        | `1 + j/W`         |
| corner itself                       | `c = (R, R)`                | `W² + W`             | `1`               |
| other face of the same corner       | `c = (R, R-j)`, `0 ≤ j ≤ W` | `W² + jW + j`        | `1 + j/W`         |
| start of ring (branch cut, `x ≥ 0`) | `c = (j, R)`, `0 ≤ j < W`   | `2W² + W + j`        | `2 - (W-j)/W²`    |
| end of ring (branch cut, `x ≤ -1`)  | `c = (-j, R)`, `1 ≤ j ≤ W`  | `2W² + W + 2(W-j)+1` | `2 + (W-2j+1)/W²` |

*Proof.* For `p = c + (u,v)` near the top face, `||p||_∞ = R + max(v, ·)` with the second argument fixed by which face
`c` sits on; `p ≺ c` iff that ring index is `< R`, or `= R` and `p` precedes `c` in the clockwise sweep. Each row of the
table is the corresponding lattice count; the corner rows use that a corner cell's two incident faces are swept
*towards* it on one side and *away* on the other (C6.4: the corner belongs to two faces, counted once). ∎

Read the table as a single statement:

**T16.3 (anisotropy is supported on the gauge corners and the order's branch cut).** In the far field, `θ ≡ 2` and the
local decision rule is translation-invariant, except on

1. four `Θ(W)`-wide strips around the rays through the **corners of the gauge's unit ball** (here `x = ±y`), where
   `θ` falls linearly from `2` to `1`; and
2. one `Θ(W)`-wide strip around the ray on which the intra-ring rule **starts and ends** (here `x = 0, y > 0`), where
   `θ` deviates from `2` by `O(1/W)` and *changes sign* across the ray.

All other cells have identical past cones up to translation. *Proof.* L16.2 plus H2A.11: away from a turn and from the
branch cut, the restriction of `≺` to `c + B(W)` is the raster order of a half-plane, independent of `c`. ∎

The geometry is the whole content: **`B(c,W)` is truncated by the ring only where the ring turns.** At a corner the
visited region `B(R-1)` occupies a quadrant of `B(c,W)` instead of a half-plane; the greedy arrives at a corner cell
knowing **half as much** as it knows in the bulk.

### 16.3 From history to density: the spoke profile

**H16.4 (spoke profile).** Model the blocking count at `c` as `μ(c) = κ · (δ(c)·H(c))² · ln W / W²` — the number of past
*pairs* in the cone, times the chance a given admissible pair's line covers `c` (`Θ(ln W)` marks spread over
`Θ(W²)` cells, H8.8) — and the acceptance probability as `e^{-μ}` (§17 justifies why this is not self-inconsistent at
finite `W`, and §17.3 lists why the constant is not to be trusted). Writing `δ = β/W` and `H = θW²`, the fixed point
`δ = e^{-μ}` reads

    κ θ² β²  =  1 - ln β / ln W     ⟹     β  ≈  1/(θ√κ) · (1 + O(1/ln W)).

Hence the density at a site depends on position **only through `θ`**, and inversely:

    δ(c) / δ_bulk  =  θ_bulk / θ(c)  =  2 / θ(c).

Substituting L16.2's `θ(j) = 1 + j/W`:

    spoke profile:      δ(j) / δ_bulk  =  2 / (1 + j/W) · (1 - O(1/ln W)),      0 ≤ j ≤ W
    peak (on the ray):  2                                                       (approached like 1 - Θ(1/ln W))
    half-width:         W                                                       (in the face parameter j)
    mean over |j| ≤ W:  2 ln 2  ≈  1.386
    excess mass/ring:   8 · (2 ln 2 - 1) · δ_bulk · W  ≈  3.09 δ_bulk W   =  Θ(W/R) of the ring

**P16.5 (what the picture must look like).** Four bright rays exactly on `x = ±y`, of *constant* width `Θ(W)` and
*constant* peak contrast `≲ 2` — neither the width nor the contrast grows or fades with `R`; a `1/(1+j/W)`
transverse profile rather than a Gaussian or an exponential; and one **dipole** seam along the intra-ring start ray
(`x = 0, y > 0` for clockwise-from-`(0,R)`): faintly bright on the side swept first, faintly dark on the side swept
last, contrast `O(1/W)` — i.e. essentially invisible for `W ≳ 30` and clearly visible for `W ≈ 4`.

**Consistency checks.**

* The excess mass is `Θ(W/R)` of the ring, so `δ(W)` and `c*(W)` are unaffected in the limit: **C10 survives**, and the
  spokes are exactly the "`O(R)` seam cells" in which `theory.md` predicted any order-sensitivity would hide. C6 (order
  sensitivity of the exponent) and C10 (universality of the density) are thereby *both* right, in different coordinates:
  the order changes the picture everywhere it can, and changes the density nowhere.
* The ceiling binds: `δ ≤ 2/(W+1)` (T15.3) is a hard constraint, so the profile must be read as
  `δ(j)/δ_bulk = min(2/(1+j/W), 2/c*_bulk)`. If the bulk `c*` is near 1 the spoke *saturates the rigorous ceiling*
  over an `O(W)`-wide strip. See §18.5 — this is either the most useful fact in the document or the most seductive
  artefact in it.

### 16.4 The decisive test: spokes follow the gauge, not the lattice

**C15 (seam covariance).** Replace the traversal gauge (`theory.md` §1, §11) while keeping everything else fixed. The
spokes must follow the **corners of the new unit ball**, and only those:

| traversal gauge                  | corners of the unit ball | predicted spokes               |
|----------------------------------|--------------------------|--------------------------------|
| `L∞` (current)                   | `(±1,±1)`                | `x = ±y` — as observed         |
| `L¹` (diamond rings)             | `(±1,0), (0,±1)`         | the **axes** `x = 0`, `y = 0`  |
| `L²` (P11.1 commit-order filter) | none (strictly convex)   | **no spokes**; branch cut only |
| anisotropic box `max(            | x                        | /2,                            |y|)`  | `(±2,±1)`                | `y = ±x/2`                            |

Mechanism (A) predicts, in every row, a feature on the lattice diagonals; mechanism (B) predicts the table. One run per
row settles it. The `L²` row is the strongest form: strict convexity deletes T4.4 case 4 *and*, by T16.3, deletes the
spokes — the same geometric fact (flat faces ⇒ corners) is behind the degenerate marking branch, the hardest correctness
trap (C6.3), and the visible anisotropy. `theory.md` §11 priced flat faces in correctness and performance; §16 adds a
third entry to the bill, in *statistics*.

Two further discriminators, both cheap:

* **Seed independence.** The spokes are properties of `≺`, not of the seed; moving or enlarging the seed must not move
  them (whereas any lattice-arithmetic mechanism tied to the origin would shift).
* **Reversal.** Reversing the intra-ring direction (anticlockwise) must leave the four bright spokes *exactly*
  invariant and **mirror the branch-cut dipole**. This separates the two seam classes of T16.3 in one run.

### 16.5 The Ulam comparison, stated precisely

The resemblance is real and the mechanism is not the same; the *moral* is.

|              | Ulam spiral                                                                                                                      | `P_W` spokes                                                                              |
|--------------|----------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| feature      | diagonal lines of primes                                                                                                         | diagonal strips of elevated density                                                       |
| carrier      | the value `n` at cell `(x,y)`                                                                                                    | the decision at cell `(x,y)`                                                              |
| mechanism    | the spiral index is a **quadratic** in the ring number along any ray; prime-rich quadratics `4n²+bn+c` therefore align with rays | the past cone `N⁻(c)` is **truncated** where the ring turns; `θ` halves; acceptance rises |
| type         | deterministic arithmetic of the indexing                                                                                         | causal boundary layer of the ordering                                                     |
| width        | 1 cell                                                                                                                           | `Θ(W)` cells                                                                              |
| contrast     | `Θ(1)` and slowly fading (prime density `1/ln n`)                                                                                | `Θ(1)` and **constant** (§16.3)                                                           |
| destroyed by | re-indexing the plane (any non-spiral enumeration)                                                                               | changing the gauge (C15)                                                                  |
| survives     | changing which primes you plot                                                                                                   | changing the seed, the horizon, the intra-ring direction                                  |

**The shared moral, and it is the operative one for this project: a feature aligned with the traversal's own symmetry
axes is presumptively an artefact of the traversal, and the burden of proof is on the claim that it is a fact about the
object.** In both cases the underlying set (primes; `W`-valid configurations) has no preferred direction whatsoever; in
both cases the *picture* does, because the picture is drawn in the order's coordinates. Anything reported from the
spokes — including the record windows of §18.5 — must therefore carry an explicit statement of whether it is a claim
about `P_W` or a claim about `(P_W, ≺)`.

The disanalogy is equally important: the Ulam feature is in the *labels*, so it can be removed by relabelling and the
underlying set is unchanged. Ours is in the *set itself* — the extra points on the spokes are really there, and really
valid. The artefact is in the mechanism, not in the certificate.

---

## 17. Mean-field, restored at finite `W`

### 17.1 The fixed point

`theory.md` T9.3 proves that Poisson mean-field is *self-inconsistent* at `W = ∞`: no power law `k = AR^α` satisfies the
self-consistency, and the conclusion drawn there is that the process is governed by the lower tail of the blocking
distribution rather than by its mean. That proof does not survive the horizon, and it is worth being precise about why.

**T17.1 (why T9.3 does not apply at finite `W`).** T9.3's contradiction is obtained by requiring a *power law in `R`*
to be a fixed point of a relation in which the mean blocking multiplicity `μ ∝ a² ln R` **grows without bound along the
run**. At finite `W`, T5.4 caps the dependency range, `μ = Θ(c*² ln W)` is *constant in `R`* (H8.8), and the
self-consistency requirement is not "a power law in `R`" but "a number `δ`". A constant always has a fixed point; the
mean-field equation at finite `W` is a one-dimensional root-find, not an exponent equation, and there is nothing to
contradict. *Proof.* Substitute `R → W` in §8.3 and observe that the resulting relation has no free exponent. ∎

The classical object is the **diagonal** `W = 2R, R → ∞` (C2A.8) — a process whose own parameter changes as it runs and
which therefore never enters a steady state. That, not any exotic correlation structure, is the minimal explanation of
T9.3.

**H17.2 (finite-`W` mean-field ⇒ `α = 1`).** With `μ = κ c*² ln W` and acceptance `e^{-μ}`, §16.3's computation at
`θ = 2` gives

    δ(W)  ≈  1/(2√κ · W),          c*(W)  =  (W+1)δ(W)  →  c*_∞  :=  1/(2√κ)  ∈ (0, 2),

and by the horizon transfer C2A.10 (`c*(W) ≍ W^{α-1}`),

    α  =  1 + lim log c*(W)/log W  =  1.

So the mean-field, once made consistent, **votes for C3 and against C2**, at the top of the rigorous bracket
`δ ∈ [c₀W^{-4/3}, 2/(W+1)]` (T15.2, T15.3).

### 17.2 The `1/log W` trap — a methodological warning for P15

Keeping the sub-leading term of the fixed point,

    c*(W)  =  c*_∞ · ( 1 + Θ(1/ln W) ),

so the *measured* local slope of `log c*` against `log W` is

    d log c* / d log W  =  -Θ(1/ln²W),

which is small, negative, and decays only logarithmically. Over the two decades in `W` that `theory.md` §2A.2 advertises
as affordable (`W = 4 … 400`, say), this produces an apparent exponent `α - 1 ≈ -0.02 … -0.05` with an excellent-looking
straight-line fit — i.e. it will read as a **confirmation of C2** (`α < 1`) when the truth is C3.

**P17.3 (fit the right model).** Any estimate of `α` from `c*(W)` must fit *both*

    (i)  c*(W) = A · W^{α-1}                  (pure power law, C2/C9)
    (ii) c*(W) = c₀ + c₁ / ln W               (constant with log correction, H17.2)

and report the model comparison, not the slope. The two are separated by curvature in the `log c*` vs `log W` plot and
by extrapolation to `W → ∞`; they are *not* separated by a good linear fit over two decades. Note that (ii) is simply
`theory.md`'s **C5** (`k = aR/(log R)^θ`) transported to the horizon coordinate, where its effect is a vanishing slope
rather than a vanishing amplitude — which is why the horizon coordinate makes the distinction *harder*, not easier, and
why P16 (origin window vs far field) and P26 (patch complexity) are needed as independent witnesses.

### 17.3 What is not to be trusted

* **The constant.** T9.3's real lesson — that the blocking multiplicity is strongly **overdispersed** relative to
  Poisson (P3) — is untouched by T17.1. Overdispersion at fixed mean *raises* the survival probability
  (`E[e^{-μ}] ≥ e^{-E[μ]}`, Jensen), so `c*_∞` from H17.2 is a **lower** bound on the mean-field's own prediction, and
  `κ` is not computable from H8.8's counting alone.
* **The exponent is the robust part.** The conclusion `δ ≍ 1/W` follows from the *shape* of the fixed point
  (`μ ∝ δ²W² ln W` balanced against `ln(1/δ)`) and is insensitive to `κ`; only the prefactor moves. Any correlated
  correction that is polynomial in `δ` and logarithmic in `W` leaves `α = 1` intact. To get `α < 1` from this framework
  one needs `μ` to acquire a factor growing *polynomially* in `W` beyond `δ²W²` — i.e. genuine long-range order in the
  field, which is exactly what C14 (hyperuniformity) and P26 (patch complexity) probe.
* **The spoke ratio.** §16.3's factor `2` inherits all of the above and additionally assumes that a spoke cell's past
  cone is populated at the *spoke's* density (true at `j = 0`, false at `j = W`). Trust the two endpoints (peak contrast
  bounded by 2, half-width `Θ(W)`), not the interpolation.

---

## 18. The library conjecture: does `P_W` contain every configuration?

This is the third claim, and it is the one the approach is "central" to: if the infinite `W`-constrained field contains,
somewhere, **every** valid configuration of a square of side `≈ W`, then scanning the field is a complete search of the
classical problem at that side length, and every record it reports is exact rather than a lower bound.

### 18.1 Framing: a subshift and a single orbit in it

**D18.1.** `X_W ⊂ {0,1}^{Z²}` is the set of `W`-valid configurations. It is a **two-dimensional subshift of finite
type**: the forbidden patterns are precisely the `W`-admissible collinear triples, all of which fit in a
`(W+1)×(W+1)` window (L2A.2), and there are finitely many of them. `L_s(X_W)` denotes its language at side `s` — the set
of valid `[s]²` patterns, which for `s ≤ W+1` is exactly the set of no-three-in-line configurations in `[s]²`.

**D18.2.** `L_s(P_W)` is the set of patterns actually occurring in the far field of `P_W`. Trivially
`L_s(P_W) ⊆ L_s(X_W)`. The claim is that for `s` of order `W` this inclusion is an equality.

**P18.3 (the far field is a deterministic sequential CA, not a Markov chain).** H2A.11's raster description says row
`n+1` of the far field is a deterministic function of rows `n-W+1 … n` together with a left-to-right sequential update
within the row. The far field is therefore the orbit of a *deterministic, finite-range, sequential-update cellular
automaton* from the initial condition supplied by the spiral's earlier rings. C2A.12's "Markov chain on a finite state
space" is the correct picture for a *single row of finite length*; for the bi-infinite far field the state is infinite
and eventual periodicity is **not** forced. Both C12 (periodicity) and universality remain open, and they are mutually
exclusive:

**T18.4 (periodicity kills universality).** If the far field is periodic with fundamental domain of area `A`, then
`|L_s(P_W)| ≤ A` for every `s`, whereas `|L_s(X_W)| ≥ 2^{Θ(s²/W²)}` (any subset of the sublattice `WZ² ∩ [s]²` is
`W`-valid, since three of its points are collinear only at span `≥ 2W`). Hence universality fails for
`s ≳ W√(log A)`. ∎

**L18.5 (entropy of the library).** `h(X_W) := lim s^{-2} log|L_s(X_W)|` satisfies

    2 ln W / W²   ≤   h(X_W)   ≤   2 ln(W+1) / (W+1),

conjecturally `Θ(log W / W)`. *Proof.* Upper: partition each row into `s/(W+1)` blocks of length `W+1`, each holding ≤2
points (T15.3), so at most `((W+1)²/2)` choices per block. Lower: the sublattice construction above, refined to one free
point per `W×W` block. ∎ Note `h(X_∞) = 0` (a valid configuration has `≤ 2s` points in `[s]²`, so
`log|L_s| = O(s log s)`): **positive entropy is another qualitative gain of the horizon, and it is what makes the
library large enough to be worth searching.**

### 18.2 What cannot occur: two rigorous obstructions

**T18.6 (erosion obstruction).** No pattern `C ∈ L_s(P_W)` with `s ≥ 2W+2` can have fewer than
`c₀W^{-4/3}(s-2W)²` points. *Proof.* T15.2. ∎ Consequently, defining

    s*(W) := sup { s : L_s(P_W) = L_s(X_W) },

we have **`s*(W) < 3W` unconditionally** (take `C` empty, or any sub-floor-density pattern, which is in `L_s(X_W)`
for every `s`). The "square of related length" of the original claim is therefore genuinely `Θ(W)` and cannot be more
than `3W`; the natural conjecture is `s* ≥ W+1`, which is exactly the scale at which `L_s(X_W)` coincides with the
classical no-three-in-line configurations (L2A.2).

**T18.7 (saturation / greedy-reachability obstruction).** Every occurring pattern is the restriction of a
`W`-saturated configuration: if `c` is empty in `P_W` then some determined admissible pair covers `c` (T3.4 + L2A.5),
with both endpoints within `B(c,W)`. Hence

    L_s(P_W)  ⊆  { C ∈ L_s(X_W) : C extends to a W-saturated configuration on its W-collar }.

A pattern containing an **unavoidable hole** — an empty cell that no valid placement of points in its `W`-collar can
block — can never occur, no matter how long the run. ∎

**P18.8 (the obstruction does not bite where we need it).** A *maximum-population* configuration in `[s]²` is maximal:
no further point can be added without creating a collinear triple, i.e. every empty cell of it is already blocked by a
pair **inside the window**. Such patterns are self-saturating and therefore immune to T18.7, and for
`s ≤ W+1` they are immune to T18.6 as well. **The patterns the project actually wants are exactly the patterns the two
rigorous obstructions cannot exclude.** (The converse warning: sparse or "designed" configurations — e.g. a
`2s`-point set with a deliberate empty quadrant — may be permanently absent, so universality must be stated for
saturable patterns and no experiment should look for a hole-bearing target.)

### 18.3 The conjectures

* **C18 (occurrence / U1).** For every `s ≤ W+1` and every `C ∈ L_s(X_W)` that extends to a `W`-saturated configuration,
  `C ∈ L_s(P_W)`: the pattern occurs somewhere in the far field.
* **C19 (frequency and equidistribution / U2).** Moreover `f_W(C) > 0` (C13), and the occurrences of `C` have positive
  density in the bulk with no arithmetic structure: they are not confined to the seams, to any sublattice, or to any
  sparse set of radii. This is the formal reading of "*this coverage is dense at a relatively randomly indicated radius*
  ": the waiting radius for a given pattern is set by its frequency alone, and behaves like a first-success time rather
  than like a search.
* **C20 (language maximality / U3).** `L_s(P_W)` equals the saturable part of `L_s(X_W)` for all `s ≤ s*(W)` with
  `s*(W) = Θ(W)`, and the far-field pattern entropy `h(P_W)` equals `h(X_W)` up to constants. Equivalently: the greedy
  orbit is dense in (the saturated part of) the subshift.

**The waiting-time calculus (H).** A run to radius `R` offers `Θ(R²)` windows but only `Θ(R²/s²)` essentially
independent ones (`theory.md` §2A.2). Under C19,

    P(C not seen by radius R)  ≈  exp( - f_W(C) · R² / s² ),      R₁(C)  ≈  s · f_W(C)^{-1/2}.

For a *typical* pattern at scale `s ≈ W`, `f_W ≈ e^{-h s²} ≈ W^{-Θ(W)}` (L18.5), so `R₁` is astronomical:
**universality is a qualitative property of the field, not an algorithm.** What is usable is the *biased* tail: the
greedy is eager and saturated, so it over-represents dense patterns relative to the uniform measure on `L_s(X_W)`, and
the only quantity that matters operationally is the large-deviation rate of the window-population distribution.

### 18.4 The operational core: the harvest conjecture

Define, over all windows of side `s` in a run to radius `R`,

    maxpop_R(s) := max_Q |P_W ∩ Q|,        Λ_s(m) := (1/#Q) · #{ Q : |P_W ∩ Q| = m }   (the population histogram)
    I_s(γ) := -(1/s) · log Λ_s(⌈γs⌉)        (the empirical large-deviation rate function, γ ∈ [c*, 2])

* **C21 (harvest).** For `W = s-1` and each `s ≤ s_h(W)`, `maxpop_R(s)` attains the **true optimum** of the classical
  `s × s` no-three-in-line problem for all `R ≥ R₁(s)`, with

        R₁(s)  ≈  s · exp( s · I_s(2) / 2 )  —  exponential in `s`, with a small and *measurable* constant.

  This is the falsifiable, quantitative form of the original claim. It is implied by C18/C19 and is much weaker: it asks
  only for the *extremal* patterns, which by P18.8 are exactly the ones no obstruction excludes.
* **Why `W = s-1` and not `W ≫ s`.** At horizon `W`, an `s`-window contains `c*(W)·s²/(W+1)` points on average. To reach
  `2s` in an `s`-window one needs a deviation from the mean by a factor `2(W+1)/(c*(W)·s)`, which grows linearly in
  `W/s`. The cheapest place to find dense `s`-patches is the field whose own density is maximal at scale
  `s` — i.e. `W = s-1`, where the mean is already `c*·s` and the required deviation is only the factor `2/c*`. Every
  unit of extra horizon is spent making the field sparser at the scale being harvested. **This inverts the naive
  instinct that a larger horizon is a better approximation:** for harvesting, `W` should be *tuned to the target*, not
  maximised. (For *certification*, by contrast, larger `W` is strictly stronger — P2A.13 — so the two uses of the dial
  pull in opposite directions and must be run as separate experiments.)
* **The decisive cheap experiment.** For `s ≤ 12` the true optima are tabulated (Flammenkamp; `2s` is attained for all
  small `s`). Run `W = s-1` for each such `s`, and report `maxpop_R(s)` and the radius at which it was first attained.
  Three outcomes, all informative:
    - attains `2s` at modest `R` for all `s ≤ 12` ⇒ C21 is alive, and `I_s(2)` extrapolates the reach;
    - attains `2s` for small `s` but plateaus below at some `s₀` ⇒ **C21 is false at `s₀`**, and the field's language is
      a proper subset of the library: identify which optimal patterns are missing and test them against T18.7;
    - never attains `2s` ⇒ the field is strongly biased or periodic; cross-check with P26/C14.

### 18.5 Where to look: the spokes are the richest ore

§16.3 predicts a `Θ(W)`-wide strip along `x = ±y` with density up to `2×` bulk, mean `2 ln 2 ≈ 1.386 ×` bulk over the
strip, and hard-capped by `2/(W+1)`.

**C22 (spoke harvest).** The record windows of C21 are found on the diagonal spokes at a rate far above their area share
`Θ(W/R)` — quantitatively, since the population tail is exponential in `s`, a `1.386×` density enhancement moves the
effective rate function from `I(2/c*_bulk)` to `I(2/(1.386 c*_bulk))` and can shorten `R₁(s)` by a factor exponential in
`s`. Concretely, if the bulk `c*` is `≈ 1`, a spoke-centred window of side `W+1` has expected population `≈ 1.39 s`
against a bulk `≈ s` and a ceiling of `2s`.

Three warnings, in decreasing order of importance:

1. **A record needs no theory.** Validity is exactly checkable in `O(m²)` by L2.2 with no floating point. Any harvested
   window is a *certificate*: it is a genuine no-three-in-line configuration whether or not §16's mechanism is right,
   whether or not the spoke story is right, and whether or not `W` was chosen well. This is the one place in the project
   where a wrong theory cannot produce a wrong result — only a wrongly- *explained* one.
2. **`theory.md` C4 remains the bug detector.** A spoke window reporting `c(s) > 1.5` (better than HJSW) must be
   re-verified by an independent checker, re-derived, and re-measured before it is believed; a report of `c(s) → 2`
   asymptotically is a verifier bug until proven otherwise. Note the two are *not* in conflict with C4 as stated:
   C4 concerns the origin-anchored density `k(R)/(2R+1)`, whereas the harvest is a maximum over `Θ(R²)` windows and is
   bounded by the true `c(s)`, not by the greedy's own density.
3. **A spoke record is a claim about `(P_W, ≺)`, not about `P_W`.** §16.5's moral applies: report the site class of
   every record, and report the harvest curve separately for bulk and spoke. If the two curves coincide, C22 is false
   and §16.3's profile is wrong; if they diverge, the traversal's corners are a *design parameter* of the search and the
   natural next experiment is a gauge with more corners (a `2m`-gon ring order has `2m` spokes — see Q20.7).

---

## 19. Measurements

Continuing `theory.md` §10 (P1–P20). All are computable from the point set plus counters; none needs new theory.

| id  | measurement                                                                       | prediction / purpose                                                                                     |
|-----|-----------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| P21 | window-density map: `\|P_W ∩ Q_s\|` for all `s`-windows, `s ≈ W`, as an image     | bulk flat to within noise; 4 bright rays on `x = ±y` (P16.5); one faint dipole on the start ray          |
| P22 | transverse density profile of a spoke vs `j`, binned                              | `2/(1 + j/W)`, half-width `W`, peak `≲ 2` approaching 2 like `1 - Θ(1/ln W)` (H16.4)                     |
| P23 | spoke contrast and width vs `R`                                                   | both **constant** in `R` — a drift indicts C13/H2A.11, a fade indicts the mechanism                      |
| P24 | spokes under `L¹`, `L²`, anisotropic gauges (C15 table)                           | spokes track the unit-ball corners; `L²` ⇒ none. **The decisive mechanism test**                         |
| P25 | number variance `σ²_W(s)` and structure factor `S_W(q)`                           | `σ² = o(s²)` (C14); a Bragg peak ⇒ periodic far field ⇒ C12 true and C18–C20 false (T18.4)               |
| P26 | patch complexity `p_W(s) := \|L_s(P_W ∩ B(R))\|` by hashing all `s`-windows       | growth `∼ e^{h s²}` with `h ≍ log W/W` (L18.5) ⇒ universality plausible; saturation at `O(1)` ⇒ periodic |
| P27 | population histogram `Λ_s(m)` and rate function `I_s(γ)`, bulk vs spoke           | extrapolate `I_s(2)` ⇒ predicted harvest radius `R₁(s)` (C21); spoke curve shifted (C22)                 |
| P28 | `maxpop_R(s)` vs the tabulated optima, `s ≤ 12`, at `W = s-1`                     | attains `2s`; the radius at which it does is the headline number for C21 (§18.4)                         |
| P29 | site class of every record window (bulk / spoke / branch cut)                     | over-representation of spokes (C22); equality refutes C22 and H16.4 together                             |
| P30 | `c*(W)` fitted to both `A·W^{α-1}` and `c₀ + c₁/ln W`, with model comparison      | P17.3 — a good linear fit alone is **not** evidence for C2                                               |
| P31 | `c*(W)` measured separately in bulk and over all sites                            | difference `Θ(W/R) → 0` (C10); persistence indicts C13's site-class caveat                               |
| P32 | history census `H(c)` asserted against L16.2 for a sampled ring                   | **hard invariant** — a mismatch is a traversal-order bug, not a statistics result                        |
| P33 | targeted-pattern search: pick `C` from `L_s(X_W)`, record first occurrence radius | `R₁ ≈ s·f^{-1/2}` (C19); a saturable `C` never found by `R ≫ R₁` refutes C18                             |
| P34 | occurrence positions of a fixed patch: density, spacing distribution              | positive density, no arithmetic structure (C19); clustering ⇒ the field is not mixing                    |

Invariants (violations are bugs with known causes), extending `theory.md` §10:

* every window of side `s ≥ 2W+2` anywhere in the field has `≥ c₀W^{-4/3}(s-2W)²` points (T15.2) — a violation is
  over-blocking, i.e. a missing `span ≤ W` admissibility check;
* every window of side `s ≤ W+1` has `≤ 2s` points (T15.3) — a violation is under-blocking, i.e. a broken oracle;
* `H(c)` matches L16.2 exactly (P32) — the census is pure combinatorics of `≺` and must be reproduced to the unit.

---

## 20. Open problems

* **Q20.1** Prove T15.2's floor is achieved in order, i.e. is `δ(W) = Θ(W^{-4/3})` or `Θ(W^{-1})`? By C2A.10 this is
  exactly `α = 2/3` vs `α = 1`, and §17 makes it the sharpest statement of the project's central question.
* **Q20.2** Is `P_W` hyperuniform (C14)? Is there a constraint-counting proof of `σ² = O(s log s)` from the
  "≤2 per `(W+1)`-run" family alone?
* **Q20.3** Make H16.4 rigorous: is the density really a function of `θ(c)` alone in the far field, and is the exponent
  `δ ∝ 1/θ` (rather than `1/√θ` or `e^{-θ}`) provable in any solvable analogue?
* **Q20.4** Compute `δ(W)` and the seam profile exactly by transfer matrix for `W ≤ 5` (`theory.md` Q13.7) and compare
  with L16.2/H16.4. The corner is a *boundary condition* on the same transfer matrix, so the spoke contrast is
  computable, not only measurable.
* **Q20.5** Is `s*(W) ≥ W+1` (C18)? Even `s*(W) = Ω(W^ε)` would establish the field as a nontrivial library.
* **Q20.6** Characterise the saturable patterns of T18.7. Is every *maximal* valid pattern in `[s]²`, `s ≤ W+1`,
  saturable in its collar? (P18.8 says yes for maximum-population ones; maximal-but-not-maximum is open.)
* **Q20.7** Design the traversal to maximise harvest: a gauge with `2m` corners yields `2m` spokes (C15), each a strip
  of elevated density. Is total record yield increasing in `m`? Is there a gauge whose *entire* far field is a seam
  (e.g. a boustrophedon strip sweep of width `W`), and does it beat the spiral at C21?
* **Q20.8** Does the sequential-update CA of P18.3 have positive entropy from the spiral initial condition? This is C12
  vs C20 and is the cleanest formulation of `idea.md`'s aperiodicity claim.
* **Q20.9** Local repair on the spokes (`theory.md` Q13.5): the spoke is the densest region and therefore the one where
  a remove-1-add-2 move is most likely to be blocked. Is spoke density already locally optimal?

---

## 21. Summary

| claim                                                                            | status      | basis             |
|----------------------------------------------------------------------------------|-------------|-------------------|
| At `W = ∞` the object has planar density 0 and fades at volume                   | **L**       | L15.1             |
| At finite `W` every window anywhere has density `≥ c₀W^{-4/3}` — no fading       | **T**       | T15.2 (erosion)   |
| …and `≤ 2/(W+1)`; the bracket is uniform, not merely averaged                    | **T**       | T15.3             |
| Patch frequencies exist; the far field is a stationary field                     | **C13**     | C2A.12 + H2A.11   |
| The field is hyperuniform                                                        | **C14**     | constraint count  |
| Anisotropy is supported on the gauge's corners and the order's branch cut only   | **T**       | T16.3, L16.2      |
| Corner cells have exactly half the history of bulk cells (`θ: 2 → 1`)            | **T**       | L16.2             |
| Spokes on `x = ±y`: width `Θ(W)`, profile `2/(1+j/W)`, peak contrast `≲ 2`       | **H**       | H16.4             |
| Spokes carry `Θ(W/R)` of the mass ⇒ `δ(W)` unaffected (C10 survives)             | **T/H**     | §16.3             |
| Spokes follow the traversal gauge, not the lattice (`L²` ⇒ no spokes)            | **C15**     | T16.3 + C15 table |
| The Ulam analogy is a moral, not a mechanism (index arithmetic vs causal layer)  | **P**       | §16.5             |
| Mean-field is inconsistent at `W = ∞` **because** `W = 2R` is not a steady state | **T**       | T17.1             |
| Restored at finite `W`, mean-field gives `δ ≍ 1/W`, i.e. `α = 1` (votes C3)      | **H17.2**   | §17.1             |
| `c*(W) = c₀ + Θ(1/ln W)` will masquerade as `α < 1` over two decades             | **H**       | P17.3 — warning   |
| `X_W` is an SFT with entropy `Θ(log W/W) > 0`; `X_∞` has entropy 0               | **L**       | L18.5             |
| Periodic far field ⇒ universality false; the two are exclusive                   | **T**       | T18.4             |
| Patterns with large sparse regions can never occur; `s*(W) < 3W`                 | **T**       | T18.6             |
| Only *saturable* patterns can occur — but the optimal ones are saturable         | **T/P**     | T18.7, P18.8      |
| Every saturable valid pattern of side `≤ W+1` occurs, with positive frequency    | **C18/C19** | §18.3             |
| Typical patterns wait `W^{Θ(W)}`; only the biased tail is usable                 | **H**       | §18.3             |
| Harvest: `maxpop(s)` attains the true optimum at `W = s-1`, radius `e^{Θ(s)}`    | **C21**     | §18.4             |
| Records are over-represented on the spokes                                       | **C22**     | H16.4 + §18.5     |
| A harvested record is a certificate and needs none of the above to be true       | **T**       | L2.2 exactness    |

**One-sentence version.** Bounding the constraint to a horizon `W` converts a density-zero, fading, origin-anchored
curiosity into a genuine planar field with a uniform local density bracket, a bounded-state deterministic dynamics, a
positive-entropy library of local patterns, and exactly two order-induced defects — the four `Θ(W)`-wide spokes on the
corners of the traversal gauge, where the greedy knows half as much and therefore places twice as much, and a faint
dipole where the intra-ring rule starts; the spokes are Ulam-like artefacts of the ordering rather than facts about
no-three-in-line configurations, but the points in them are real, and if the field's pattern language is as rich as the
subshift that contains it, then scanning it — preferably along the spokes, at `W = s-1` — is a complete,
certificate-producing search of the classical problem at side `s`, whose reach is set by a large-deviation rate that the
very first run can measure.