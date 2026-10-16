import RibbonEngine.Basic.ArtinBraid

/-!
# Garside diagram involution `Δₙ σᵢ Δₙ⁻¹ = σ_{n-i}` (`theory.md` §4, **T12**)
-/

namespace RibbonEngine

variable {n : ℕ}

/-- Apply the Garside mirror involution `i ↦ n - 2 - i` to every generator in a braid word. -/
def garsideConjWord (w : BraidWord n) : BraidWord n :=
  w.map ArtinGen.garsideConj

@[simp] theorem garsideConjWord_nil : garsideConjWord ([] : BraidWord n) = [] := rfl

@[simp] theorem garsideConjWord_cons (g : ArtinGen n) (w : BraidWord n) :
    garsideConjWord (g :: w) = g.garsideConj :: garsideConjWord w := rfl

@[simp] theorem garsideConjWord_append (w₁ w₂ : BraidWord n) :
    garsideConjWord (w₁ ++ w₂) = garsideConjWord w₁ ++ garsideConjWord w₂ :=
  List.map_append

theorem garsideConjWord_involutive (w : BraidWord n) :
    garsideConjWord (garsideConjWord w) = w := by
  induction w with
  | nil => rfl
  | cons g w ih =>
    simp [ArtinGen.garsideConj_garsideConj, ih]

/-- Single-crossing commutation: mirroring the generator conjugates its action by `Fin.rev`. -/
theorem ArtinGen.act_garsideConj (g : ArtinGen n) (s : Fin n) :
    g.garsideConj.act (Fin.rev s) = Fin.rev (g.act s) := by
  rcases g with ⟨⟨i, hi⟩, sign⟩
  rcases s with ⟨k, hk⟩
  simp only [ArtinGen.act, ArtinGen.toPerm, ArtinGen.garsideConj,
    ArtinGen.leftStrand, ArtinGen.rightStrand, Equiv.swap_apply_def]
  apply Fin.ext
  split_ifs <;> (simp only [Fin.ext_iff, Fin.rev] at *) <;> omega

/-- **T12**: tracing `garsideConjWord w` commutes with `Fin.rev`. -/
theorem garsideConj_commutes_trace (w : BraidWord n) (s : Fin n) :
    traceStrand (garsideConjWord w) (Fin.rev s) = Fin.rev (traceStrand w s) := by
  induction w generalizing s with
  | nil => rfl
  | cons g w ih =>
    simp only [garsideConjWord_cons, traceStrand, List.foldl_cons, ArtinGen.act_garsideConj]
    exact ih (g.act s)

end RibbonEngine