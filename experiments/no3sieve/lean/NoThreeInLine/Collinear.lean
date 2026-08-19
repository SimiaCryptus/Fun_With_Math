import NoThreeInLine.Basic

/-!
# §2 — Exact characterisation of validity

The doc's central editorial point is formalised here by construction: `Coll` is an *equation over `ℤ`*,
so no rounding, thickening or floating point can enter a decision (L2.1's consequence).
-/

namespace No3

/-- The determinant `u.x·v.y - u.y·v.x`. -/
def cross (u v : Pt) : ℤ := u.1 * v.2 - u.2 * v.1

/-- Collinearity of three lattice points: an integrality statement, not a metric one. -/
def Coll (p q r : Pt) : Prop := cross (q - p) (r - p) = 0

instance instDecidableColl (p q r : Pt) : Decidable (Coll p q r) := by
  unfold Coll; infer_instance

/-! ### `Coll` is a symmetric function of the three points

All six permutations of the determinant agree up to sign, so `= 0` is permutation invariant.
These are used in `Greedy.lean` to pick out the `≺`-last point of a collinear triple. -/

lemma coll_rot {p q r : Pt} (h : Coll p q r) : Coll r p q := by
  unfold Coll cross at *
  simp only [Prod.fst_sub, Prod.snd_sub] at *
  linear_combination h

lemma coll_swap {p q r : Pt} (h : Coll p q r) : Coll p r q := by
  unfold Coll cross at *
  simp only [Prod.fst_sub, Prod.snd_sub] at *
  linear_combination -h

lemma coll_rot' {p q r : Pt} (h : Coll p q r) : Coll q r p :=
  coll_rot (coll_rot h)
/-- Collinearity is translation invariant.  Used in §18 to transport a pattern between the window
where it occurs and the origin-anchored copy `[s]²` that the language is indexed by. -/
lemma coll_translate (v p q r : Pt) : Coll (v + p) (v + q) (v + r) ↔ Coll p q r := by
   unfold Coll
   rw [show (v + q) - (v + p) = q - p by abel, show (v + r) - (v + p) = r - p by abel]


/-- **L2.2 (direction test), in the form the engine implements.**  Three points are collinear iff the
two direction *vectors* from one of them are parallel.  The `±` quotient of the doc is invisible here
precisely because `cross` is already `±`-invariant. -/
lemma coll_iff_par (p q r : Pt) : Coll p q r ↔ cross (q - p) (r - p) = 0 := Iff.rfl

/-! ### Primitive vectors and direction classes -/

def IsPrim (v : Pt) : Prop := Int.gcd v.1 v.2 = 1

instance instDecidableIsPrim (v : Pt) : Decidable (IsPrim v) := by
  unfold IsPrim; infer_instance

/-- `primdir v = v / gcd(v)`. -/
def primDir (v : Pt) : Pt :=
  ((v.1 / (Int.gcd v.1 v.2 : ℤ)), (v.2 / (Int.gcd v.1 v.2 : ℤ)))

/-- **L2.1 (lattice line).**  If `d` is primitive, every lattice point of the affine line through
`p` and `p + d` is `p + t·d` for an *integer* `t`.  Bézout is the whole proof, and it is the only
place primitivity is genuinely needed. -/
theorem lattice_line {p d r : Pt} (hd : IsPrim d) (h : Coll p (p + d) r) :
    ∃ t : ℤ, r = p + t • d := by
  obtain ⟨u, v, huv⟩ : ∃ u v : ℤ, d.1 * u + d.2 * v = 1 := by
    refine ⟨Int.gcdA d.1 d.2, Int.gcdB d.1 d.2, ?_⟩
    have := Int.gcd_eq_gcd_ab d.1 d.2
    rw [hd] at this
    simpa using this.symm
  -- the collinearity hypothesis, in coordinates
  have hc : d.1 * (r.2 - p.2) - d.2 * (r.1 - p.1) = 0 := by
    unfold Coll cross at h
    simp only [Prod.fst_add, Prod.snd_add, Prod.fst_sub, Prod.snd_sub] at h
    linear_combination h
  refine ⟨u * (r.1 - p.1) + v * (r.2 - p.2), ?_⟩
  obtain ⟨rx, ry⟩ := r
  obtain ⟨px, py⟩ := p
  obtain ⟨dx, dy⟩ := d
  -- turn `(px, py) + t • (dx, dy)` into a literal pair *before* splitting the equation,
  -- otherwise `Prod.mk.injEq` has nothing to match against and `constructor` fails.
  simp only [Prod.mk_add_mk, Prod.smul_mk, smul_eq_mul, Prod.mk.injEq]
  refine ⟨?_, ?_⟩
  · linear_combination (-v) * hc - (rx - px) * huv
  · linear_combination u * hc - (ry - py) * huv

/-- The `primdir`-equality form of L2.2.  `sorry`: two *primitive* parallel vectors agree up to sign
(`d.x ∣ e.x` and `d.y ∣ e.y` by coprimality, then symmetry gives associates).  Nothing in this
project depends on it — the engine tests `cross = 0` — so it is kept honest rather than assumed. -/
theorem par_iff_primDir {u v : Pt} (hu : u ≠ 0) (hv : v ≠ 0) :
    cross u v = 0 ↔ (primDir u = primDir v ∨ primDir u = -primDir v) := by
  sorry

/-! ### Validity and the counting bounds L2.3 / L2.4 -/

/-- A finite `P` is **valid** iff no three distinct points are collinear. -/
def Valid (P : Finset Pt) : Prop :=
  ∀ p ∈ P, ∀ q ∈ P, ∀ r ∈ P, p ≠ q → p ≠ r → q ≠ r → ¬ Coll p q r

/-- Any subset of a valid set is valid — the rigorous half of C8 / C2A.3. -/
lemma Valid.mono {P Q : Finset Pt} (h : Valid P) (hQ : Q ⊆ P) : Valid Q :=
  fun p hp q hq r hr => h p (hQ hp) q (hQ hq) r (hQ hr)

section Lines
variable {P : Finset Pt}

private lemma card_le_two_of_no_three (S : Finset Pt)
    (h : ∀ a ∈ S, ∀ b ∈ S, ∀ c ∈ S, a ≠ b → a ≠ c → b ≠ c → False) : S.card ≤ 2 := by
  by_contra hlt
  push_neg at hlt
  obtain ⟨a, b, c, ha, hb, hc, hab, hac, hbc⟩ := Finset.two_lt_card_iff.mp hlt
  exact h a ha b hb c hc hab hac hbc

/-- **L2.3, rows.** -/
theorem card_row_le_two (hP : Valid P) (y₀ : ℤ) :
    (P.filter (fun p => p.2 = y₀)).card ≤ 2 := by
  refine card_le_two_of_no_three _ ?_
  intro a ha b hb c hc hab hac hbc
  simp only [Finset.mem_filter] at ha hb hc
  refine hP a ha.1 b hb.1 c hc.1 hab hac hbc ?_
  unfold Coll cross
  simp only [Prod.fst_sub, Prod.snd_sub, ha.2, hb.2, hc.2]
  ring

/-- **L2.3, columns.** -/
theorem card_col_le_two (hP : Valid P) (x₀ : ℤ) :
    (P.filter (fun p => p.1 = x₀)).card ≤ 2 := by
  refine card_le_two_of_no_three _ ?_
  intro a ha b hb c hc hab hac hbc
  simp only [Finset.mem_filter] at ha hb hc
  refine hP a ha.1 b hb.1 c hc.1 hab hac hbc ?_
  unfold Coll cross
  simp only [Prod.fst_sub, Prod.snd_sub, ha.2, hb.2, hc.2]
  ring

/-- **L2.3, both diagonal families** (`y - x = k` and `y + x = k`). -/
theorem card_diag_le_two (hP : Valid P) (ε k : ℤ) (_hε : ε = 1 ∨ ε = -1) :
    (P.filter (fun p => p.2 = ε * p.1 + k)).card ≤ 2 := by
  refine card_le_two_of_no_three _ ?_
  intro a ha b hb c hc hab hac hbc
  simp only [Finset.mem_filter] at ha hb hc
  refine hP a ha.1 b hb.1 c hc.1 hab hac hbc ?_
  unfold Coll cross
  simp only [Prod.fst_sub, Prod.snd_sub, ha.2, hb.2, hc.2]
  ring

/-- **L2.3.**  `k(R) ≤ 2(2R+1)`, by fibring `B(R)` over its `2R+1` rows. -/
theorem card_ball_le (hP : Valid P) (R : ℕ) :
    (P.filter (fun p => nrm p ≤ R)).card ≤ 2 * (2 * R + 1) := by
  classical
  set Q := P.filter (fun p => nrm p ≤ R) with hQ
  have hmem : ∀ x ∈ Q, x.2 ∈ Finset.Icc (-(R : ℤ)) (R : ℤ) := by
    intro x hx
    simp only [hQ, Finset.mem_filter] at hx
    have := nrm_le_iff.mp hx.2
    simp only [Finset.mem_Icc]
    exact ⟨this.2.2.1, this.2.2.2⟩
  have hsplit :
      Q.card = ∑ y ∈ Finset.Icc (-(R : ℤ)) (R : ℤ), (Q.filter (fun p => p.2 = y)).card :=
    Finset.card_eq_sum_card_fiberwise hmem
  have hfib : ∀ y ∈ Finset.Icc (-(R : ℤ)) (R : ℤ), (Q.filter (fun p => p.2 = y)).card ≤ 2 := by
    intro y _
    refine le_trans (Finset.card_le_card ?_) (card_row_le_two hP y)
    intro z hz
    simp only [hQ, Finset.mem_filter] at hz ⊢
    exact ⟨hz.1.1, hz.2⟩
  calc Q.card = ∑ y ∈ Finset.Icc (-(R : ℤ)) (R : ℤ), (Q.filter (fun p => p.2 = y)).card := hsplit
    _ ≤ ∑ _y ∈ Finset.Icc (-(R : ℤ)) (R : ℤ), 2 := Finset.sum_le_sum hfib
    _ = (2 * R + 1) * 2 := by rw [Finset.sum_const, card_Icc_symm]; ring
    _ = 2 * (2 * R + 1) := by ring

/-- **L2.4 (per-ring cap).**  Every cell of `S(R)` lies on one of the four face lines, each of which
carries at most two points of a valid `P` *ever*; hence `|A_R| ≤ 8`.

This is a `W = ∞` statement: see `Horizon.lean` and §7.6 for why it fails at finite horizon. -/
theorem card_ring_le_eight (hP : Valid P) (R : ℕ) :
    (P.filter (fun p => nrm p = R)).card ≤ 8 := by
  classical
  have hsub :
      P.filter (fun p => nrm p = R) ⊆
        ((P.filter (fun p => p.1 = (R : ℤ))) ∪ (P.filter (fun p => p.1 = -(R : ℤ)))) ∪
        ((P.filter (fun p => p.2 = (R : ℤ))) ∪ (P.filter (fun p => p.2 = -(R : ℤ)))) := by
    intro z hz
    simp only [Finset.mem_filter] at hz
    have hz2 : max z.1.natAbs z.2.natAbs = R := hz.2
    simp only [Finset.mem_union, Finset.mem_filter]
    rcases (max_choice z.1.natAbs z.2.natAbs) with h | h <;> rw [h] at hz2
    · exact Or.inl (by rcases Int.natAbs_eq z.1 with he | he <;> [left; right] <;>
        exact ⟨hz.1, by omega⟩)
    · exact Or.inr (by rcases Int.natAbs_eq z.2 with he | he <;> [left; right] <;>
        exact ⟨hz.1, by omega⟩)
  refine le_trans (Finset.card_le_card hsub) ?_
  refine le_trans (Finset.card_union_le _ _) ?_
  have h1 := Finset.card_union_le (P.filter (fun p => p.1 = (R : ℤ)))
    (P.filter (fun p => p.1 = -(R : ℤ)))
  have h2 := Finset.card_union_le (P.filter (fun p => p.2 = (R : ℤ)))
    (P.filter (fun p => p.2 = -(R : ℤ)))
  have c1 := card_col_le_two hP (R : ℤ)
  have c2 := card_col_le_two hP (-(R : ℤ))
  have c3 := card_row_le_two hP (R : ℤ)
  have c4 := card_row_le_two hP (-(R : ℤ))
  omega

end Lines

end No3