import NoThreeInLine.Greedy

/-!
# §8–§9 — Cost and density

This file is deliberately mostly **statements**.  Its job is to pin the doc's prose to formulas that
cannot drift: if `theory.md` changes a constant, this file stops type-checking against the intended
reading, and the discrepancy is visible.  The analytic content (L1.1, L1.2, and the union bound of
T9.1) is the honest `sorry` frontier of the project.
-/

namespace No3

open scoped Classical

/-! ### §1 counting constants -/

/-- `Φ(M) = #{ d ∈ D : ‖d‖∞ ≤ M }`. -/
noncomputable def Phi (M : ℕ) : ℕ :=
  (((ballF M).filter fun v => v ≠ 0 ∧ IsPrim v).card) / 2

/-- `Ψ(M) = Σ_{‖d‖∞ ≤ M} 1/‖d‖∞`. -/
noncomputable def Psi (M : ℕ) : ℝ :=
  ∑ v ∈ (ballF M).filter (fun v => v ≠ 0 ∧ IsPrim v), (1 : ℝ) / (2 * nrm v)

/-- **L1.1.**  `Φ(M) = (12/π²)M² + O(M log M)`. -/
theorem Phi_asymptotic :
    ∃ C : ℝ, ∀ M : ℕ, 2 ≤ M →
      |(Phi M : ℝ) - (12 / Real.pi ^ 2) * (M : ℝ) ^ 2| ≤ C * M * Real.log M := by
  sorry

/-- **L1.2.**  `Ψ(M) = (24/π²)M + O(log²M)`. -/
theorem Psi_asymptotic :
    ∃ C : ℝ, ∀ M : ℕ, 2 ≤ M →
      |Psi M - (24 / Real.pi ^ 2) * (M : ℝ)| ≤ C * (Real.log M) ^ 2 := by
  sorry

/-! ### §8.1 — the direction-sum functional and the mark volume -/

/-- `Σ(P) = Σ_{pairs} 1/‖primdir(q-p)‖∞`, the headline diagnostic of §9.2 (P9). -/
noncomputable def Sig (P : Finset Pt) : ℝ :=
  (∑ p ∈ P, ∑ q ∈ P.filter (fun q => q ≠ p), (1 : ℝ) / (nrm (primDir (q - p)))) / 2

/-- **T8.1 (worst-case mark volume).**  `Σ(P) ≤ 1.103·k^{3/2}(1+o(1))`; the proof is L2.2
(directions from a fixed apex are distinct) plus L1.1/L1.2, so it inherits their `sorry`. -/
theorem mark_volume_le (P : Finset Pt) (hP : Valid P) :
    Sig P ≤ 1.103 * (P.card : ℝ) ^ (3 / 2 : ℝ) * (1 + 1 / (P.card : ℝ)) := by
  sorry

/-! ### §9 — the density bracket -/

/-- `k(R) = |P ∩ B(R)|`. -/
noncomputable def kOf (P : Set Pt) (R : ℕ) : ℕ := (P ∩ ball R).ncard

/-- **§9.1 (rigorous upper bound), set form.**  Restated from `card_ball_le` for the infinite `P`. -/
theorem k_upper (P : Set Pt) (hfin : ∀ R, (P ∩ ball R).Finite)
    (hP : ∀ R, Valid ((hfin R).toFinset)) (R : ℕ) :
    kOf P R ≤ 2 * (2 * R + 1) := by
  sorry

/-- **T9.1 (saturation floor), the union bound `(†)`:
`(2R+1)² ≤ k + 2R·Σ(Q) + k²/2`, whence `k ≥ 1.35·R^{2/3}(1-o(1))` and `α ≥ 2/3` for **every**
ring-monotone order, intra-ring rule and seed. -/
theorem saturation_floor (Q : Finset Pt) (R : ℕ)
    (hvalid : Valid Q)
    (hsat : ∀ c, nrm c ≤ R → c ∈ Q ∨ ∃ p ∈ Q, ∃ q ∈ Q, p ≠ q ∧ Coll c p q) :
    ((2 * R + 1 : ℕ) : ℝ) ^ 2 ≤ (Q.card : ℝ) + 2 * R * Sig Q + (Q.card : ℝ) ^ 2 / 2 := by
  sorry

/-- **T9.2 (the reduction).**  The density exponent is controlled by the growth of `Σ`.  This is the
cleanest formulation of the open problem, and `Σ` is a single scalar per radius (P9). -/
theorem Sigma_lower (Q : Finset Pt) (R : ℕ) (hR : 0 < R)
    (h : ((2 * R + 1 : ℕ) : ℝ) ^ 2 ≤ (Q.card : ℝ) + 2 * R * Sig Q + (Q.card : ℝ) ^ 2 / 2) :
    Sig Q ≥ 2 * R - (Q.card : ℝ) / (2 * R) - (Q.card : ℝ) ^ 2 / (4 * R) := by
  sorry

/-! ### §2A.2 — the finite-horizon object -/

/-- **T2A.9 (upper half).**  Any `W+1` consecutive cells of a row lie in one `(W+1)`-window, so hold
at most 2 points; hence `k_W(R) ≤ (2R+1)(2(2R+1)/(W+1) + 2)` and `α_W = 2`.  Provable from
`wvalid_iff_windows` + `card_row_le_two` by blocking each row; the blocking bookkeeping is the
remaining `sorry`. -/
theorem k_W_upper (W : ℕ) (hW : 0 < W) (P : Finset Pt) (hP : WValid (W : ℕ∞) P) (R : ℕ) :
    (P.filter (fun p => nrm p ≤ R)).card ≤ (2 * R + 1) * (2 * (2 * R + 1) / (W + 1) + 2) := by
  sorry

/-- **T9.4 (`W`-saturation floor).**  `c*(W) ≥ 0.29·W^{-1/3}`, i.e. `α ≥ 2/3` in the horizon
coordinate.  §9.9's point is that this and `saturation_floor` are the *same union bound* in two
coordinates, which is why their exponents match — a live consistency check, not a duplication. -/
theorem W_saturation_floor (W : ℕ) (hW : 2 ≤ W) (δ : ℝ) (hδ : 0 < δ)
    (h : 1 ≤ δ * (1 + 3.12 * W * Real.sqrt (4 * δ * W ^ 2) + (4 * δ * W ^ 2) / 2)) :
    δ ≥ 0.29 * (W : ℝ) ^ (-(4 : ℝ) / 3) * (1 - 1 / W) := by
  sorry

end No3