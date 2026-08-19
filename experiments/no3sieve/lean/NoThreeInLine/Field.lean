import NoThreeInLine.Density

/-!
# §15 — The finite-horizon object is an extensive field, not a fading one

`theory.md` measures an *origin-anchored* sequence `k(R)`.  `theory_2.md` §15 claims that at finite
`W` there is a genuine planar field: a density bracket that holds **in every window, anywhere**.
This file makes "anywhere" a bound variable.

What is proved here:

* `density_fades` — L15.1, the `W = ∞` object has planar density `O(1/R)`;
* `card_le_two_mul_of_valid`, `card_window_le_two_mul` — T15.3 at `s ≤ W+1`, uniform in `v`;
* `blocker_in_window` — the geometric core of the erosion argument of T15.2: **a cell deeper than
  `W` inside a window can only be blocked from inside that window**;
* `exists_near` — the crudest form of the floor, and one that needs no counting at all: a
  `W`-saturated field meets every `(2W+1)`-window.

What is not: the union bound itself (T15.2), which is `theory.md` T9.4 localised and inherits its
`sorry`.
-/

namespace No3

open scoped Classical

/-! ### Windows -/

/-- The half-open axis-aligned window `v + [0,s)²`. -/
def window (v : Pt) (s : ℕ) : Finset Pt :=
  (Finset.Ico v.1 (v.1 + (s : ℤ))) ×ˢ (Finset.Ico v.2 (v.2 + (s : ℤ)))

@[simp] lemma mem_window {v p : Pt} {s : ℕ} :
    p ∈ window v s ↔ v.1 ≤ p.1 ∧ p.1 < v.1 + s ∧ v.2 ≤ p.2 ∧ p.2 < v.2 + s := by
  simp only [window, Finset.mem_product, Finset.mem_Ico]
  tauto

lemma card_Ico_shift (a : ℤ) (s : ℕ) : (Finset.Ico a (a + (s : ℤ))).card = s := by
  rw [Int.card_Ico]
  omega

@[simp] lemma card_window (v : Pt) (s : ℕ) : (window v s).card = s * s := by
  rw [window, Finset.card_product, card_Ico_shift, card_Ico_shift]

/-- `[s]²`, the origin-anchored window that indexes the language of §18. -/
def sq (s : ℕ) : Finset Pt :=
  (Finset.Ico (0 : ℤ) (s : ℤ)) ×ˢ (Finset.Ico (0 : ℤ) (s : ℤ))

@[simp] lemma mem_sq {s : ℕ} {p : Pt} :
    p ∈ sq s ↔ 0 ≤ p.1 ∧ p.1 < s ∧ 0 ≤ p.2 ∧ p.2 < s := by
  simp only [sq, Finset.mem_product, Finset.mem_Ico]
  tauto

lemma sq_eq_window (s : ℕ) : sq s = window ((0 : ℤ), (0 : ℤ)) s := by
  ext p
  simp only [mem_sq, mem_window]
  omega

/-! ### L15.1 — at `W = ∞` there is no field -/

/-- **L15.1 (fading at `W = ∞`).**  The occupancy of `B(R)` is `≤ 2/(2R+1) → 0`: the classical
object has planar density zero, which is why `theory.md` can only speak of exponents. -/
theorem density_fades (P : Finset Pt) (hP : Valid P) (R : ℕ) :
    ((P.filter (fun p => nrm p ≤ R)).card : ℝ) / ((2 * (R : ℝ) + 1) ^ 2)
      ≤ 2 / (2 * (R : ℝ) + 1) := by
  have h : ((P.filter (fun p => nrm p ≤ R)).card : ℝ) ≤ 2 * (2 * (R : ℝ) + 1) := by
    exact_mod_cast card_ball_le hP R
  have hpos : (0 : ℝ) < 2 * (R : ℝ) + 1 := by positivity
  rw [div_le_div_iff (by positivity) hpos]
  nlinarith [mul_le_mul_of_nonneg_right h hpos.le]

/-! ### T15.3 — the uniform local ceiling -/

/-- Any valid set inside *any* window of side `s` has at most `2s` points: fibre over the `s` rows
and apply L2.3.  Nothing here mentions the origin, the seed or the radius. -/
theorem card_le_two_mul_of_valid {C : Finset Pt} {v : Pt} {s : ℕ}
    (hC : C ⊆ window v s) (hval : Valid C) : C.card ≤ 2 * s := by
  classical
  have hmem : ∀ x ∈ C, x.2 ∈ Finset.Ico v.2 (v.2 + (s : ℤ)) := by
    intro x hx
    have hx' := hC hx
    simp only [mem_window] at hx'
    simp only [Finset.mem_Ico]
    exact ⟨hx'.2.2.1, hx'.2.2.2⟩
  calc C.card
      = ∑ y ∈ Finset.Ico v.2 (v.2 + (s : ℤ)), (C.filter (fun p => p.2 = y)).card :=
        Finset.card_eq_sum_card_fiberwise hmem
    _ ≤ ∑ _y ∈ Finset.Ico v.2 (v.2 + (s : ℤ)), 2 :=
        Finset.sum_le_sum (fun y _ => card_row_le_two hval y)
    _ = 2 * s := by
        simp [Finset.sum_const, card_Ico_shift, smul_eq_mul, Nat.mul_comm]

/-- **T15.3 (uniform local ceiling), the `s ≤ W+1` half.**  Every window of side `s ≤ W+1`
anywhere in the plane holds at most `2s` points of a `W`-valid set.  A runtime violation is
*under*-blocking, i.e. a broken oracle (§19 invariants). -/
theorem card_window_le_two_mul {W : ℕ} {P : Finset Pt} (hP : WValid (W : ℕ∞) P)
    {s : ℕ} (hs : s ≤ W + 1) (v : Pt) : (P ∩ window v s).card ≤ 2 * s := by
  classical
  refine card_le_two_mul_of_valid (fun x hx => (Finset.mem_inter.mp hx).2) ?_
  refine ((wvalid_iff_windows W P).mp hP v).mono ?_
  intro x hx
  simp only [Finset.mem_inter, mem_window] at hx
  simp only [Finset.mem_filter]
  exact ⟨hx.1, hx.2.1, by omega, hx.2.2.2.1, by omega⟩

/-- **T15.3, general `s`.**  Blocking each row of `Q` into `(W+1)`-runs.  `sorry`: the block
bookkeeping only, no new mathematics (cf. `k_W_upper`). -/
theorem card_window_le {W : ℕ} (hW : 0 < W) {P : Finset Pt} (hP : WValid (W : ℕ∞) P)
    (s : ℕ) (v : Pt) : (P ∩ window v s).card ≤ s * (2 * s / (W + 1) + 2) := by
  sorry

/-! ### T15.2 — the erosion and the uniform local floor -/

/-- `Q⁻`, the erosion of `window v s` by `W`. -/
def erode (v : Pt) (s W : ℕ) : Finset Pt := window (v.1 + (W : ℤ), v.2 + (W : ℤ)) (s - 2 * W)

lemma erode_subset {v : Pt} {s W : ℕ} (h : 2 * W ≤ s) : erode v s W ⊆ window v s := by
  intro p hp
  simp only [erode, mem_window] at hp
  simp only [mem_window]
  omega

/-- **The erosion lemma (core of T15.2).**  A cell of `Q⁻` can only be `W`-blocked by a pair that
lies inside `Q` itself.  This — and only this — is what makes the density floor *local*: the
theorem says nothing for `s ≤ 2W`, and §18.2 shows that this is the real obstruction, not slack. -/
theorem blocker_in_window {W s : ℕ} {v c p q : Pt} (hs : 2 * W ≤ s)
    (hc : c ∈ erode v s W) (h : Adm (W : ℕ∞) c p q) :
    p ∈ window v s ∧ q ∈ window v s := by
  obtain ⟨h1, h2, -⟩ := blocked_local h
  rw [nrm_le_iff] at h1 h2
  simp only [Prod.fst_sub, Prod.snd_sub] at h1 h2
  simp only [erode, mem_window] at hc
  simp only [mem_window]
  omega

/-- `P` is `W`-saturated: every absent cell is `W`-blocked.  T3.4 says the greedy output is such
a set; `theory_2.md` §18.2 says this is the *only* structural obstruction to universality. -/
def WSaturated (W : ℕ∞) (P : Set Pt) : Prop :=
  ∀ c : Pt, c ∉ P → ∃ p ∈ P, ∃ q ∈ P, p ≠ q ∧ Coll c p q ∧ Adm W c p q

/-- **The floor, in the form that needs no counting.**  A `W`-saturated field meets every
`(2W+1)`-window: an empty patch of side `> 2W` is impossible, because its centre would have no
blocker.  (T15.2 sharpens the constant; this is the qualitative statement, and it is the one
T18.6 actually uses.) -/
theorem exists_near {W : ℕ} {P : Set Pt} (hsat : WSaturated (W : ℕ∞) P) (c : Pt) :
    ∃ p ∈ P, nrm (p - c) ≤ W := by
  by_cases hc : c ∈ P
  · exact ⟨c, hc, by simp⟩
  · obtain ⟨p, hp, q, hq, -, -, hadm⟩ := hsat c hc
    exact ⟨p, hp, (blocked_local hadm).1⟩

/-- **T15.2 (erosion / uniform local floor).**  `sorry`: this is T9.4's union bound run inside `Q`
instead of inside `B(R)` — `blocker_in_window` is the geometric input, `Psi_asymptotic` the
analytic one, so it inherits both. -/
theorem local_floor {W : ℕ} (hW : 2 ≤ W) {P : Set Pt}
    (hval : WValidS (W : ℕ∞) P) (hsat : WSaturated (W : ℕ∞) P)
    {s : ℕ} (hs : 2 * W + 2 ≤ s) (v : Pt) :
    (0.29 : ℝ) * (W : ℝ) ^ (-(4 : ℝ) / 3) * ((s : ℝ) - 2 * W) ^ 2 * (1 - 1 / (W : ℝ))
      ≤ (((window v s).filter (fun p => p ∈ P)).card : ℝ) := by
  sorry

/-! ### §15.3 — the field's fluctuations (D15.4) -/

/-- `|P ∩ (v + [s]²)|`, the window occupancy — the field's basic observable (P21). -/
noncomputable def winCount (P : Set Pt) (s : ℕ) (v : Pt) : ℕ :=
  ((window v s).filter (fun p => p ∈ P)).card

noncomputable def winMean (P : Set Pt) (s R : ℕ) : ℝ :=
  (∑ v ∈ ballF R, (winCount P s v : ℝ)) / ((ballF R).card : ℝ)

/-- **D15.4 (number variance).**  `σ²_W(s)`, estimated over `B(R)`; `C14` asserts `o(s²)`. -/
noncomputable def winVar (P : Set Pt) (s R : ℕ) : ℝ :=
  (∑ v ∈ ballF R, ((winCount P s v : ℝ) - winMean P s R) ^ 2) / ((ballF R).card : ℝ)

end No3