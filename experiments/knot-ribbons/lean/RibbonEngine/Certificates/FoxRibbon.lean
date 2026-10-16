import RibbonEngine.Certificates.MarkovTrace

/-!
# Fox Slice-Ribbon Certificates & Symmetric Unions (`np-complete.md` Act II.4, **T17**)

Bridges Sense A ribbons (framed `I`-bundles) and Sense B ribbons (Fox 1962 slice-ribbon knots):
any palindromic braid word `w ++ w.inv` reduces to the trivial braid `[]` in `O(|w|)`
Reidemeister-II steps (`MarkovEquiv`), certifying that symmetric unions bound ribbon disks.
-/

namespace RibbonEngine

variable {n : ℕ}

/-- Formal inverse of a braid word `(g₁ g₂ ⋯ g_L)⁻¹ = g_L⁻¹ ⋯ g₂⁻¹ g₁⁻¹`. -/
def BraidWord.inv (w : BraidWord n) : BraidWord n :=
  (w.map ArtinGen.inv).reverse

@[simp] theorem BraidWord.inv_nil : BraidWord.inv ([] : BraidWord n) = [] := rfl

@[simp] theorem BraidWord.inv_cons (g : ArtinGen n) (w : BraidWord n) :
    BraidWord.inv (g :: w) = BraidWord.inv w ++ [g.inv] := by
  simp [BraidWord.inv]

/-- Any prefix-enclosed palindrome `u ++ w ++ w.inv ++ v` reduces via Reidemeister-II
    cancellations to `u ++ v`. -/
theorem markovEquiv_cancel_palindrome (u w v : BraidWord n) :
    MarkovEquiv n (u ++ w ++ BraidWord.inv w ++ v) n (u ++ v) := by
  induction w generalizing u v with
  | nil =>
    simp only [List.append_nil, BraidWord.inv_nil]
    exact MarkovEquiv.refl (u ++ v)
  | cons g w ih =>
    have h_eq :
        u ++ (g :: w) ++ BraidWord.inv (g :: w) ++ v =
          (u ++ [g]) ++ w ++ BraidWord.inv w ++ ([g.inv] ++ v) := by
      simp [BraidWord.inv_cons, List.append_assoc]
    rw [h_eq]
    have step1 := ih (u ++ [g]) ([g.inv] ++ v)
    have h_eq2 : (u ++ [g]) ++ ([g.inv] ++ v) = u ++ [g, g.inv] ++ v := by
      simp [List.append_assoc]
    rw [h_eq2] at step1
    exact MarkovEquiv.trans step1 (MarkovEquiv.cancelInv u v g)

/-- **T17** (Lamm's Symmetric Union Ribbon Theorem, `np-complete.md` Act II.4):
    after smoothing the symmetry-axis band crossings, the symmetric union palindrome
    `w ++ w.inv` reduces by an explicit `O(|w|)` certificate to the trivial unlink braid `[]`. -/
theorem symmetric_union_is_fox_ribbon (w : BraidWord n) :
    MarkovEquiv n (w ++ BraidWord.inv w) n [] := by
  simpa using markovEquiv_cancel_palindrome ([] : BraidWord n) w []

/-- Furthermore, tracing any symmetric union palindrome `w ++ w.inv` yields the identity
    permutation on `Fin n` (the `n`-component unlink shadow). -/
theorem traceStrand_symmetric_union (w : BraidWord n) (s : Fin n) :
    traceStrand (w ++ BraidWord.inv w) s = s := by
  induction w generalizing s with
  | nil => rfl
  | cons g w ih =>
    have h_eq : (g :: w) ++ BraidWord.inv (g :: w) = [g] ++ (w ++ BraidWord.inv w) ++ [g.inv] := by
      simp [BraidWord.inv_cons, List.append_assoc]
    rw [h_eq, traceStrand_append, traceStrand_append]
     have h_first : traceStrand [g] s = g.act s := rfl
     rw [h_first, ih (g.act s)]
     exact g.act_act s

end RibbonEngine