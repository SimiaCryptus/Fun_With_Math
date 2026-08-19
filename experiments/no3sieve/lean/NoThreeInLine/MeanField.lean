import NoThreeInLine.Field

/-!
# §17 — Mean field, restored at finite `W`

T9.3 kills Poisson mean field at `W = ∞`; T17.1 says the reason is that `W = 2R` is not a steady
state, not that the correlations are exotic.  At finite `W` the self-consistency is a
one-dimensional root-find, and the *shape* of its solution — not its constant — is the robust
part (§17.3).

Proved here: `spoke_ratio`, the leading-order content of H16.4 and the only quantitative claim of
§16.3 that does not depend on `κ`: **the density at a site is inversely proportional to its
history fraction `θ`.**  Everything with a logarithm in it is a `sorry`.
-/

namespace No3

open Filter Topology

/-- The mean blocking multiplicity of the finite-`W` field (§16.3):
`μ = κ·(δ·H)²·ln W / W²` with `H = θW²`, i.e. `μ = κ·(θδW)²·ln W`. -/
noncomputable def mu (κ θ δ : ℝ) (W : ℕ) : ℝ := κ * (θ * δ * W) ^ 2 * Real.log W

/-- The self-consistency `δ = e^{-μ}`.  Unlike `theory.md` §8.3 this has **no free exponent**:
at finite `W` the unknown is a number, not a power law (T17.1). -/
def MFFixedPoint (κ θ : ℝ) (W : ℕ) (δ : ℝ) : Prop := δ = Real.exp (-(mu κ θ δ W))

/-- The doc's `β`-form of the same equation, with `δ = β/W`:  `κθ²β² = 1 - ln β / ln W`. -/
def MFBeta (κ θ : ℝ) (W : ℕ) (β : ℝ) : Prop :=
  κ * θ ^ 2 * β ^ 2 = 1 - Real.log β / Real.log W

/-- **T17.1 / H17.2.**  A finite-`W` fixed point exists.  `sorry`: IVT on
`β ↦ κθ²β² - 1 + ln β / ln W`, which is continuous and changes sign on `(0,1]` for `W ≥ 3`. -/
theorem mf_solution_exists (κ θ : ℝ) (hκ : 0 < κ) (hθ : 0 < θ) (W : ℕ) (hW : 3 ≤ W) :
    ∃ β, 0 < β ∧ β ≤ 1 ∧ MFBeta κ θ W β := by
  sorry

/-- **H16.4 / H17.2, the robust part.**  At the leading order of the fixed point (dropping the
`ln β / ln W` correction, which is `Θ(1/ln W)`), the product `θ·β` is a constant of the field.
Hence `δ(c)/δ_bulk = θ_bulk/θ(c)` — the spoke profile — with **no dependence on `κ`**, which
§17.3 says is the only part of the calculation to be trusted. -/
theorem spoke_ratio {κ θ₁ θ₂ β₁ β₂ : ℝ} (hκ : 0 < κ) (h1 : 0 < θ₁) (h2 : 0 < θ₂)
    (hb1 : 0 < β₁) (hb2 : 0 < β₂)
    (e1 : κ * θ₁ ^ 2 * β₁ ^ 2 = 1) (e2 : κ * θ₂ ^ 2 * β₂ ^ 2 = 1) :
    β₁ * θ₁ = β₂ * θ₂ := by
  have hcancel : κ * (θ₁ ^ 2 * β₁ ^ 2) = κ * (θ₂ ^ 2 * β₂ ^ 2) := by linear_combination e1 - e2
  have key : θ₁ ^ 2 * β₁ ^ 2 = θ₂ ^ 2 * β₂ ^ 2 := mul_left_cancel₀ (ne_of_gt hκ) hcancel
  have hfac : (θ₁ * β₁ - θ₂ * β₂) * (θ₁ * β₁ + θ₂ * β₂) = 0 := by linear_combination key
  rcases mul_eq_zero.mp hfac with h | h
  · linarith
  · have p1 := mul_pos h1 hb1
    have p2 := mul_pos h2 hb2
    linarith

/-- The peak contrast of §16.3: `θ` halves at a gauge corner (T16.3), so the density doubles. -/
theorem spoke_peak_two {κ β₁ β₂ θ : ℝ} (hκ : 0 < κ) (hθ : 0 < θ)
    (hb1 : 0 < β₁) (hb2 : 0 < β₂)
    (e1 : κ * θ ^ 2 * β₁ ^ 2 = 1) (e2 : κ * (2 * θ) ^ 2 * β₂ ^ 2 = 1) :
    β₁ = 2 * β₂ := by
  have h := spoke_ratio hκ hθ (by linarith : (0:ℝ) < 2 * θ) hb1 hb2 e1 e2
  have : θ * (β₁ - 2 * β₂) = 0 := by linarith [h]
  rcases mul_eq_zero.mp this with h' | h'
  · linarith
  · linarith

/-- **H17.2 ⇒ `α = 1`.**  If `δ_W = β/W` with `β` independent of `W`, then `c*(W) = (W+1)δ_W → β`
and the horizon transfer C2A.10 gives `α = 1`.  `sorry`: a one-line limit. -/
theorem cstar_tendsto (β : ℝ) :
    Tendsto (fun W : ℕ => ((W : ℝ) + 1) * (β / W)) atTop (𝓝 β) := by
  sorry

/-! ### §17.2 — the `1/log W` trap -/

/-- Model (i) of P17.3: the pure power law of C2/C9. -/
noncomputable def modelPower (A α : ℝ) (W : ℕ) : ℝ := A * (W : ℝ) ^ (α - 1)

/-- Model (ii) of P17.3: constant with a logarithmic correction (H17.2, = C5 transported). -/
noncomputable def modelLog (c₀ c₁ : ℝ) (W : ℕ) : ℝ := c₀ + c₁ / Real.log W

/-- **P17.3.**  The two models are *not* the same function: (i) with `α < 1` tends to `0`, (ii)
tends to `c₀ > 0`.  They are separated by extrapolation and by curvature — **not** by the quality
of a straight-line fit over two decades, which is the methodological point of §17.2.  `sorry`:
the limit computation. -/
theorem models_differ (A α c₀ c₁ : ℝ) (hA : 0 < A) (hα : α < 1) (hc₀ : 0 < c₀) :
    ¬ ∀ W : ℕ, 2 ≤ W → modelPower A α W = modelLog c₀ c₁ W := by
  sorry

end No3