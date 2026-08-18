import NoThreeInLine.Density

/-!
# §9.7, §9.9 — Conjectures

**Nothing in this file is proved, and nothing in this file may be used as a hypothesis elsewhere in
the project.**  Its purpose is to make the conjectures type-check: a conjecture you cannot state
formally is a conjecture you cannot falsify, and §10 is a falsification programme.

The single most important editorial rule of `theory.md` — *the density exponent is unknown* — is
enforced here mechanically: `alphaExists` is a `Prop`, not an axiom.
-/

namespace No3

open Filter Topology

variable (P : Set Pt)

/-- The density exponent, if it exists. -/
def HasExponent (α : ℝ) : Prop :=
  Tendsto (fun R : ℕ => Real.log (kOf P R) / Real.log R) atTop (𝓝 α)

/-- **C1 (bracket).**  `2/3 ≤ α ≤ 1`, and `α` exists.  The ends are rigorous (T9.1, L2.3);
convergence is conjectural. -/
def C1 : Prop := ∃ α : ℝ, HasExponent P α ∧ 2 / 3 ≤ α ∧ α ≤ 1

/-- **C2 (primary, deliberately falsifiable).**  `α < 1` strictly: the spiral-greedy set has density
zero, by analogy with Mian–Chowla and the greedy 3-AP-free set. -/
def C2 : Prop := ∃ α : ℝ, HasExponent P α ∧ α < 1

/-- **C3 (alternative).**  `α = 1` with `a = lim k(R)/R ∈ (0,4)`, most plausibly `a ∈ [1,3]`. -/
def C3 : Prop :=
  ∃ a : ℝ, 0 < a ∧ a < 4 ∧ Tendsto (fun R : ℕ => (kOf P R : ℝ) / R) atTop (𝓝 a)

/-- **C4 (ceiling implausibility).**  `a → 4` (`c(n) → 2`) is *false*.  Operational value: **bug
detector** — a run approaching it indicates a broken verifier, not a discovery. -/
def C4 : Prop := ¬ Tendsto (fun R : ℕ => (kOf P R : ℝ) / R) atTop (𝓝 4)

/-- **C5 (log corrections).**  If `α = 1` the correction is logarithmic and *downward*. -/
def C5 : Prop :=
  ∃ (a : ℝ) (θ : ℝ), 0 < a ∧ 0 ≤ θ ∧
    Tendsto (fun R : ℕ => (kOf P R : ℝ) * (Real.log R) ^ θ / R) atTop (𝓝 a)

/-- **C6 (order sensitivity).**  `α` (or `a`) depends measurably on the intra-ring rule or the seed.
Its *negation* — indistinguishable curves — is the stronger and more interesting result. -/
def C6 (T T' : Traversal) (seed : Finset Pt) (W : ℕ∞) : Prop :=
  ∃ a a' : ℝ, a ≠ a' ∧
    Tendsto (fun R : ℕ => (kOf (Gset T seed W) R : ℝ) / R) atTop (𝓝 a) ∧
    Tendsto (fun R : ℕ => (kOf (Gset T' seed W) R : ℝ) / R) atTop (𝓝 a')

/-- **C7 (no forced symmetry).**  The stabiliser of `≺` under the lattice symmetries is trivial, so
no dihedral symmetry is forced; any observed symmetry is emergent, and a reason to distrust
`idea.md`'s aperiodicity claim until probed (P11). -/
def C7 (T : Traversal) (seed : Finset Pt) (W : ℕ∞) : Prop :=
  ¬ ∀ p : Pt, p ∈ Gset T seed W ↔ (p.2, p.1) ∈ Gset T seed W

/-- **C8 (sub-window transfer).**  *Rigorous*, and listed with the conjectures only because it is
what makes the exercise comparable to the literature: any sub-window of `P` is valid, so
`max_pop(s)/s` is a certified lower bound for the classical `s × s` problem. -/
theorem C8_subwindow (P : Finset Pt) (hP : Valid P) (v : Pt) (s : ℕ) :
    Valid (P.filter (fun p => v.1 ≤ p.1 ∧ p.1 < v.1 + s ∧ v.2 ≤ p.2 ∧ p.2 < v.2 + s)) :=
  hP.mono (Finset.filter_subset _ _)

/-! ### The horizon coordinate (§9.9) -/

/-- `c*(W) = (W+1)·δ(W)`, the finite-horizon analogue of the literature's `c(n)`. -/
def IsCStar (cstar : ℕ → ℝ) (Pw : ℕ → Set Pt) : Prop :=
  ∀ W, Tendsto (fun R : ℕ => ((W : ℝ) + 1) * (kOf (Pw W) R : ℝ) / ((2 * R + 1) ^ 2)) atTop
    (𝓝 (cstar W))

/-- **C9 / C2A.10 (horizon transfer) — CENTRAL CONJECTURE.**
`c*(W) ≍ W^{α-1}`, i.e. `α = 1 + lim log c*(W)/log W` with the *same* `α`.  This is what makes the
exponent measurable in `W`, at `Θ(R²/W²)` samples per run instead of one. -/
def C9 (cstar : ℕ → ℝ) (α : ℝ) : Prop :=
  Tendsto (fun W : ℕ => Real.log (cstar W) / Real.log W) atTop (𝓝 (α - 1))

/-- **C10 (far-field universality).**  `δ(W)` is independent of the intra-ring rule and the seed:
the far field remembers only the sweep direction (H2A.11).  Complementary to C6 — together they
separate "the order matters" from "the order matters only near the seams". -/
def C10 (δ : Traversal → Finset Pt → ℕ → ℝ) : Prop :=
  ∀ T T' seed seed' W, δ T seed W = δ T' seed' W

/-- **C11 (monotone horizon).**  `c*(W)` is non-increasing.  Plausible but unproved: the fold is
order-dependent (T7.4), so a suppressed point can liberate two later.  **A measured violation is a
discovery, not a bug** — and would make local repair (Q13.5) far more promising. -/
def C11 (cstar : ℕ → ℝ) : Prop := ∀ W W', W ≤ W' → cstar W' ≤ cstar W

/-- **C12 (finite-`W` periodicity).**  For small `W` the far-field process falls into a periodic
orbit; the smallest `W` with an aperiodic recurrent class is a finite, findable number.  This is the
only currently decidable version of `idea.md`'s aperiodicity claim (Q13.7). -/
def C12 (period : ℕ → Option ℕ) : Prop := ∃ W₀, (∀ W < W₀, (period W).isSome) ∧ period W₀ = none

end No3