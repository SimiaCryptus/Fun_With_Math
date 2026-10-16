import RibbonEngine.Garside.DiagramInvolution

/-!
# Garside simple elements `[1, Δₙ] ≅ Sₙ` and descent sets (`lean-plan.md` Phase 4.2)

Each positive simple element `A_w ∈ [1, Δₙ]` is canonically represented by its permutation
`w : Equiv.Perm (Fin n)`. We define executable left/right descent predicates and the
left-weightedness condition `RightDescent(w₁) ⊇ LeftDescent(w₂)`.
-/

namespace RibbonEngine

variable {n : ℕ}

/-- `i ∈ Fin (n - 1)` is a left descent of `w` iff `w(i) > w(i + 1)`. -/
def inLeftDescent (w : Equiv.Perm (Fin n)) (i : Fin (n - 1)) : Bool :=
  decide ((w ⟨i.val, by omega⟩).val > (w ⟨i.val + 1, by omega⟩).val)

/-- `i ∈ Fin (n - 1)` is a right descent of `w` iff `i` is a left descent of `w⁻¹`. -/
def inRightDescent (w : Equiv.Perm (Fin n)) (i : Fin (n - 1)) : Bool :=
  inLeftDescent w⁻¹ i

/-- A pair of simple elements `(w₁, w₂)` is left-weighted iff
    `RightDescent(w₁) ⊇ LeftDescent(w₂)`. -/
def IsLeftWeighted (w₁ w₂ : Equiv.Perm (Fin n)) : Prop :=
  ∀ i : Fin (n - 1), inLeftDescent w₂ i = true → inRightDescent w₁ i = true

instance (w₁ w₂ : Equiv.Perm (Fin n)) : Decidable (IsLeftWeighted w₁ w₂) :=
  Fintype.decidableForallFintype

/-- The identity permutation has no left descents. -/
theorem inLeftDescent_one (i : Fin (n - 1)) :
    inLeftDescent (1 : Equiv.Perm (Fin n)) i = false := by
   simp only [inLeftDescent, Equiv.Perm.coe_one, id_eq, gt_iff_lt, decide_eq_false_iff_not, not_lt]
  omega

/-- Every element `w` is left-weighted with respect to `1` on the right. -/
theorem isLeftWeighted_one_right (w : Equiv.Perm (Fin n)) :
    IsLeftWeighted w (1 : Equiv.Perm (Fin n)) := by
  intro i h
  rw [inLeftDescent_one] at h
   contradiction

end RibbonEngine