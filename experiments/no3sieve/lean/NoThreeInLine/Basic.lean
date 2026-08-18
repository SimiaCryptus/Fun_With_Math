import Mathlib

/-!
# §1 — Objects and notation

`Λ = ℤ²` with the Chebyshev gauge.  Everything downstream uses exactly three facts about `nrm`:
it is subadditive, absolutely homogeneous over `ℤ`, and its unit ball is a square.  The third is
what produces T4.4 case 4 (flat faces) and is priced in §11 of `theory.md`.
-/

namespace No3

/-- `Λ = ℤ²`. -/
abbrev Pt := ℤ × ℤ

/-- The L∞ gauge `‖p‖∞ = max(|p.x|, |p.y|)`, valued in `ℕ` so that it *is* the ring index. -/
def nrm (p : Pt) : ℕ := max p.1.natAbs p.2.natAbs

@[simp] lemma nrm_mk (x y : ℤ) : nrm (x, y) = max x.natAbs y.natAbs := rfl

/-- The ball is a square: this single lemma is why `omega` can discharge most gauge goals. -/
lemma nrm_le_iff {p : Pt} {R : ℕ} :
    nrm p ≤ R ↔ (-(R : ℤ) ≤ p.1 ∧ p.1 ≤ (R : ℤ) ∧ -(R : ℤ) ≤ p.2 ∧ p.2 ≤ (R : ℤ)) := by
  simp only [nrm, Nat.max_le]
  omega

@[simp] lemma nrm_zero : nrm 0 = 0 := rfl

lemma nrm_eq_zero {p : Pt} : nrm p = 0 ↔ p = 0 := by
  obtain ⟨x, y⟩ := p
  -- `(0 : Pt)` is an `OfNat` literal; expose it as the pair `(0, 0)` so that
  -- `Prod.mk.injEq` can split it into two `ℤ` equations that `omega` can read.
  have hzero : (0 : Pt) = (0, 0) := rfl
  rw [hzero, nrm_mk, Prod.mk.injEq]
  omega

@[simp] lemma nrm_neg (p : Pt) : nrm (-p) = nrm p := by
  simp [nrm]

lemma nrm_add_le (p q : Pt) : nrm (p + q) ≤ nrm p + nrm q := by
  simp only [nrm, Prod.fst_add, Prod.snd_add]
  refine max_le ?_ ?_
  · exact (Int.natAbs_add_le _ _).trans
      (Nat.add_le_add (le_max_left _ _) (le_max_left _ _))
  · exact (Int.natAbs_add_le _ _).trans
      (Nat.add_le_add (le_max_right _ _) (le_max_right _ _))

lemma nrm_sub_le (p q : Pt) : nrm (p - q) ≤ nrm p + nrm q := by
  have := nrm_add_le p (-q)
  simpa [sub_eq_add_neg] using this

lemma nrm_sub_comm (p q : Pt) : nrm (p - q) = nrm (q - p) := by
  rw [← nrm_neg (p - q)]
  congr 1
  ring

/-- Absolute homogeneity over `ℤ`.  This is the lemma that turns "steep directions are cheap"
(H8.2) into arithmetic: consecutive lattice points of a line differ by `‖d‖∞` in ring index. -/
lemma nrm_smul (t : ℤ) (d : Pt) : nrm (t • d) = t.natAbs * nrm d := by
  simp only [nrm, Prod.smul_fst, Prod.smul_snd, smul_eq_mul, Int.natAbs_mul]
  rcases le_total d.1.natAbs d.2.natAbs with h | h
  · rw [max_eq_right h, max_eq_right (Nat.mul_le_mul_left _ h)]
  · rw [max_eq_left h, max_eq_left (Nat.mul_le_mul_left _ h)]

/-! ### Balls and rings -/

/-- `B(R) = [-R,R]²`. -/
def ball (R : ℕ) : Set Pt := {p | nrm p ≤ R}

/-- `S(R)`, the L∞ sphere. -/
def ring (R : ℕ) : Set Pt := {p | nrm p = R}

lemma ring_subset_ball (R : ℕ) : ring R ⊆ ball R := fun _ h => le_of_eq h

/-- `B(R)` as a `Finset`, for the counting arguments of §9. -/
def ballF (R : ℕ) : Finset Pt :=
  (Finset.Icc (-(R : ℤ)) (R : ℤ)) ×ˢ (Finset.Icc (-(R : ℤ)) (R : ℤ))

@[simp] lemma mem_ballF {R : ℕ} {p : Pt} : p ∈ ballF R ↔ nrm p ≤ R := by
  simp [ballF, nrm_le_iff, and_assoc]

lemma card_Icc_symm (R : ℕ) : (Finset.Icc (-(R : ℤ)) (R : ℤ)).card = 2 * R + 1 := by
  rw [Int.card_Icc]
  omega

/-- `|B(R)| = (2R+1)²`. -/
lemma card_ballF (R : ℕ) : (ballF R).card = (2 * R + 1) * (2 * R + 1) := by
  rw [ballF, Finset.card_product, card_Icc_symm]

/-- `diam_∞ B(R) = 2R`, the sharp constant of L4.3. -/
lemma diam_ball {R : ℕ} {p q : Pt} (hp : nrm p ≤ R) (hq : nrm q ≤ R) :
    nrm (p - q) ≤ 2 * R := by
  have := nrm_sub_le p q
  omega

end No3