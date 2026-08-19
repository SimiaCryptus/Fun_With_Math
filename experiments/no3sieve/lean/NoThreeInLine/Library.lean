import NoThreeInLine.Field
import NoThreeInLine.Greedy

/-!
# §18 — The library conjecture

`X_W` is a 2D SFT (D18.1); `P_W` is one orbit in it (D18.2).  The question is whether the orbit's
language exhausts the subshift's at scale `Θ(W)`.

Proved here:

* `langP_subset_langX` — the trivial inclusion, i.e. that harvesting only ever produces valid
  configurations;
* `sublattice_wvalid` / `entropy_lower` — `|L_s(X_W)| ≥ 2^{Θ(s²/W²)}`, the "library is large"
  half of L18.5, and the input to T18.4;
* `patternAt_shift_x/y`, `patternAt_reduce`, `langP_finite_of_biperiodic` — **T18.4**: a periodic
  far field has a finite language, so periodicity and universality are mutually exclusive;
* `greedy_saturated_local` — **T18.7**, the saturation obstruction, straight from T3.4;
* `window_pattern_valid`, `winCount_eq`, `maxpop_le_opt`, `opt_le_two_mul` — the harvest is a
  *certificate* (§18.5 warning 1) and is bounded by the true optimum, never by the greedy's own
  density (§18.5 warning 2, and the exact sense in which C4 is not contradicted).
-/

namespace No3

open scoped Classical

/-! ### D18.1 / D18.2 — the two languages -/

/-- The pattern of `P` seen through the window at `v`, transported to `[s]²`. -/
def patternAt (P : Set Pt) (v : Pt) (s : ℕ) : Set Pt := {p | p ∈ sq s ∧ v + p ∈ P}

/-- `L_s(X_W)`: the language of the subshift of finite type.  For `s ≤ W+1` this is *exactly* the
set of no-three-in-line configurations of `[s]²` (L2A.2). -/
def LangX (W : ℕ∞) (s : ℕ) : Set (Set Pt) := {C | C ⊆ ↑(sq s) ∧ WValidS W C}

/-- `L_s(P)`: the patterns that actually occur. -/
def LangP (P : Set Pt) (s : ℕ) : Set (Set Pt) := {C | ∃ v : Pt, C = patternAt P v s}

lemma patternAt_subset (P : Set Pt) (v : Pt) (s : ℕ) : patternAt P v s ⊆ ↑(sq s) :=
  fun _ h => h.1

/-- The empty pattern is in the library — it is *not* in the field (T18.6/`exists_near`), which
is the cheapest instance of `L_s(P_W) ⊊ L_s(X_W)` for large `s`. -/
theorem empty_mem_LangX (W : ℕ∞) (s : ℕ) : (∅ : Set Pt) ∈ LangX W s := by
  refine ⟨by simp, ?_⟩
  intro p hp
  exact absurd hp (Set.not_mem_empty p)

/-- **D18.2, the trivial inclusion.**  Anything the field displays is `W`-valid.  This is the
formal content of "a harvested record is a certificate": it needs neither §16 nor §17. -/
theorem langP_subset_langX {W : ℕ∞} {P : Set Pt} (hP : WValidS W P) (s : ℕ) :
    LangP P s ⊆ LangX W s := by
  rintro C ⟨v, rfl⟩
  refine ⟨patternAt_subset P v s, ?_⟩
  intro p hp q hq r hr h1 h2 h3 hadm
  have hne : ∀ x y : Pt, x ≠ y → v + x ≠ v + y := fun x y h hc => h (add_left_cancel hc)
  have := hP (v + p) hp.2 (v + q) hq.2 (v + r) hr.2
    (hne _ _ h1) (hne _ _ h2) (hne _ _ h3) ((adm_translate W v p q r).mpr hadm)
  intro hcoll
  exact this ((coll_translate v p q r).mpr hcoll)

/-! ### L18.5 — the library is large -/

/-- **The sublattice construction.**  Any subset of `(W+1)ℤ²` is `W`-valid, for a reason cruder
than collinearity: *no two of its points are even `W`-admissible*.  This is where the positive
entropy of `X_W` comes from, and `h(X_∞) = 0` because the construction dies at `W = ∞`. -/
theorem sublattice_wvalid (W : ℕ) (S : Finset Pt)
    (hS : ∀ p ∈ S, ((W : ℤ) + 1) ∣ p.1 ∧ ((W : ℤ) + 1) ∣ p.2) : WValid (W : ℕ∞) S := by
  have key : ∀ x y : ℤ, ((W : ℤ) + 1) ∣ x - y → -(W : ℤ) ≤ x - y → x - y ≤ (W : ℤ) → x = y := by
    rintro x y ⟨k, hk⟩ hlo hhi
    have hW0 : (0 : ℤ) ≤ (W : ℤ) := Int.natCast_nonneg W
    have hk0 : k = 0 := by
      by_contra hne
      rcases lt_or_gt_of_ne hne with h' | h'
      · have hk1 : k ≤ -1 := by omega
        nlinarith [mul_nonneg (by linarith : (0:ℤ) ≤ (W : ℤ) + 1)
          (by linarith : (0:ℤ) ≤ -1 - k)]
      · have hk1 : 1 ≤ k := by omega
        nlinarith [mul_nonneg (by linarith : (0:ℤ) ≤ (W : ℤ) + 1)
          (by linarith : (0:ℤ) ≤ k - 1)]
    rw [hk0, mul_zero] at hk
    omega
  intro p hp q hq r hr hpq hpr hqr hadm
  exfalso
  obtain ⟨h1, -, -⟩ := hadm
  rw [Nat.cast_le (α := ℕ∞), nrm_le_iff] at h1
  simp only [Prod.fst_sub, Prod.snd_sub] at h1
  obtain ⟨a1, a2⟩ := hS p hp
  obtain ⟨b1, b2⟩ := hS q hq
  exact hpq (Prod.ext_iff.mpr
    ⟨key _ _ (dvd_sub a1 b1) h1.1 h1.2.1, key _ _ (dvd_sub a2 b2) h1.2.2.1 h1.2.2.2⟩)

/-- The free points of the sublattice construction inside `[s]²`. -/
noncomputable def latticePts (W s : ℕ) : Finset Pt :=
  (sq s).filter (fun p => ((W : ℤ) + 1) ∣ p.1 ∧ ((W : ℤ) + 1) ∣ p.2)

/-- The library, as a `Finset` so that it can be counted. -/
noncomputable def LangXF (W : ℕ∞) (s : ℕ) : Finset (Finset Pt) :=
  (sq s).powerset.filter (fun C => WValid W C)

theorem powerset_sublattice_subset (W s : ℕ) :
    (latticePts W s).powerset ⊆ LangXF (W : ℕ∞) s := by
  intro C hC
  simp only [Finset.mem_powerset] at hC
  simp only [LangXF, Finset.mem_filter, Finset.mem_powerset]
  refine ⟨hC.trans (Finset.filter_subset _ _), sublattice_wvalid W C ?_⟩
  intro p hp
  have := hC hp
  simp only [latticePts, Finset.mem_filter] at this
  exact this.2

/-- **L18.5, lower bound.**  `|L_s(X_W)| ≥ 2^{#((W+1)ℤ² ∩ [s]²)} = 2^{Θ(s²/W²)}`, so
`h(X_W) = Ω(1/W²) > 0`.  Positive entropy is what makes the library worth searching. -/
theorem entropy_lower (W s : ℕ) : 2 ^ (latticePts W s).card ≤ (LangXF (W : ℕ∞) s).card := by
  have h := Finset.card_le_card (powerset_sublattice_subset W s)
  simpa [Finset.card_powerset] using h

/-- **L18.5, upper bound.**  `|L_s(X_W)| ≤ ((W+1)²/2)^{s²/(W+1)²}`, whence `h = O(log W / W)`.
`sorry`: the row-blocking count, i.e. `card_window_le` again. -/
theorem langX_card_upper (W s : ℕ) (hW : 0 < W) :
    (LangXF (W : ℕ∞) s).card ≤ (((W + 1) * (W + 1)) ^ 2) ^ (s * s / ((W + 1) * (W + 1))) := by
  sorry

/-! ### T18.4 — periodicity kills universality -/

lemma patternAt_add_period {P : Set Pt} {t : Pt} (h : ∀ p, p ∈ P ↔ p + t ∈ P) (v : Pt) (s : ℕ) :
    patternAt P (v + t) s = patternAt P v s := by
  ext p
  simp only [patternAt, Set.mem_setOf_eq]
  constructor
  · rintro ⟨h1, h2⟩
    refine ⟨h1, ?_⟩
    rw [h (v + p), show v + p + t = v + t + p by abel]
    exact h2
  · rintro ⟨h1, h2⟩
    refine ⟨h1, ?_⟩
    rw [show v + t + p = v + p + t by abel, ← h (v + p)]
    exact h2

lemma patternAt_shift_x {P : Set Pt} {a : ℤ} (h : ∀ p, p ∈ P ↔ p + (a, 0) ∈ P)
    (k x y : ℤ) (s : ℕ) : patternAt P (x + k * a, y) s = patternAt P (x, y) s := by
  induction k using Int.induction_on with
  | hz => simp
  | hp n ih =>
      have e : ((x + (n : ℤ) * a, y) : Pt) + (a, 0) = (x + ((n : ℤ) + 1) * a, y) := by
        rw [Prod.mk_add_mk]; congr 1 <;> ring
      rw [← e, patternAt_add_period h, ih]
  | hn n ih =>
      have e : ((x + (-(n : ℤ) - 1) * a, y) : Pt) + (a, 0) = (x + (-(n : ℤ)) * a, y) := by
        rw [Prod.mk_add_mk]; congr 1 <;> ring
      rw [← ih, ← e, patternAt_add_period h]

lemma patternAt_shift_y {P : Set Pt} {b : ℤ} (h : ∀ p, p ∈ P ↔ p + (0, b) ∈ P)
    (k x y : ℤ) (s : ℕ) : patternAt P (x, y + k * b) s = patternAt P (x, y) s := by
  induction k using Int.induction_on with
  | hz => simp
  | hp n ih =>
      have e : ((x, y + (n : ℤ) * b) : Pt) + (0, b) = (x, y + ((n : ℤ) + 1) * b) := by
        rw [Prod.mk_add_mk]; congr 1 <;> ring
      rw [← e, patternAt_add_period h, ih]
  | hn n ih =>
      have e : ((x, y + (-(n : ℤ) - 1) * b) : Pt) + (0, b) = (x, y + (-(n : ℤ)) * b) := by
        rw [Prod.mk_add_mk]; congr 1 <;> ring
      rw [← ih, ← e, patternAt_add_period h]

/-- Every window position is equivalent to one in the fundamental domain. -/
theorem patternAt_reduce {P : Set Pt} {a b : ℤ}
    (h1 : ∀ p, p ∈ P ↔ p + (a, 0) ∈ P) (h2 : ∀ p, p ∈ P ↔ p + (0, b) ∈ P)
    (v : Pt) (s : ℕ) : patternAt P (v.1 % a, v.2 % b) s = patternAt P v s := by
  have hx : v.1 % a + (v.1 / a) * a = v.1 := by
    have := Int.emod_add_ediv v.1 a; linarith
  have hy : v.2 % b + (v.2 / b) * b = v.2 := by
    have := Int.emod_add_ediv v.2 b; linarith
  have e1 : patternAt P (v.1 % a + (v.1 / a) * a, v.2 % b) s
      = patternAt P (v.1 % a, v.2 % b) s := patternAt_shift_x h1 _ _ _ _
  have e2 : patternAt P (v.1, v.2 % b + (v.2 / b) * b) s
      = patternAt P (v.1, v.2 % b) s := patternAt_shift_y h2 _ _ _ _
  rw [hx] at e1
  rw [hy] at e2
  rw [← e1, ← e2, Prod.mk.eta]

/-- **T18.4 (periodicity kills universality).**  A far field with period lattice containing
`(a,0)` and `(0,b)` has `|L_s(P)| ≤ ab` for *every* `s`, while `|L_s(X_W)| ≥ 2^{Θ(s²/W²)}`
(`entropy_lower`).  Hence C12 and C18–C20 are mutually exclusive, and P25's Bragg peak is a
one-shot refutation of the library conjecture. -/
theorem langP_finite_of_biperiodic {P : Set Pt} {a b : ℤ} (ha : 0 < a) (hb : 0 < b)
    (h1 : ∀ p, p ∈ P ↔ p + (a, 0) ∈ P) (h2 : ∀ p, p ∈ P ↔ p + (0, b) ∈ P) (s : ℕ) :
    (LangP P s).Finite := by
  have hsub : LangP P s ⊆
      (fun v : Pt => patternAt P v s) ''
        ↑((Finset.Ico (0 : ℤ) a) ×ˢ (Finset.Ico (0 : ℤ) b)) := by
    rintro C ⟨v, rfl⟩
    refine ⟨(v.1 % a, v.2 % b), ?_, patternAt_reduce h1 h2 v s⟩
    rw [Finset.mem_coe, Finset.mem_product]
    constructor
    · simpa using ⟨Int.emod_nonneg v.1 ha.ne', Int.emod_lt_of_pos v.1 ha⟩
    · simpa using ⟨Int.emod_nonneg v.2 hb.ne', Int.emod_lt_of_pos v.2 hb⟩
  exact Set.Finite.subset (Set.Finite.image _ (Finset.finite_toSet _)) hsub

/-! ### T18.6 / T18.7 — the two rigorous obstructions -/

/-- **T18.7 (saturation obstruction).**  Every empty cell of the greedy far field is blocked by a
pair **inside its own `W`-collar**.  So only patterns extending to a `W`-saturated configuration
can ever occur — and by P18.8 the maximum-population ones do, which is why the obstruction does
not bite where the project needs it. -/
theorem greedy_saturated_local {W : ℕ} (T : Traversal) (seed : Finset Pt) {c : Pt}
    (hc : c ∉ Gset T seed (W : ℕ∞)) :
    ∃ p ∈ Gset T seed (W : ℕ∞), ∃ q ∈ Gset T seed (W : ℕ∞),
      p ≠ q ∧ Coll c p q ∧ nrm (p - c) ≤ W ∧ nrm (q - c) ≤ W := by
  have hseed : c ∉ seed := fun h => hc ((mem_Gset_iff T seed _ c).mpr (Or.inl h))
  obtain ⟨p, hp, q, hq, hpq, hcoll, hadm, -, -⟩ := saturated T seed (W : ℕ∞) hseed hc
  obtain ⟨h1, h2, -⟩ := blocked_local hadm
  exact ⟨p, hp, q, hq, hpq, hcoll, h1, h2⟩

/-- The greedy far field is `W`-saturated as a set (T3.4, restated for §15/§18). -/
theorem Gset_WSaturated {W : ℕ} (T : Traversal) (seed : Finset Pt) :
    WSaturated (W : ℕ∞) (Gset T seed (W : ℕ∞)) := by
  intro c hc
  -- `saturated` hands us the full `Adm W c p q`, including the pair span `‖p-q‖∞ ≤ W`
  -- (that clause is a *field* of `Adm`, not a consequence of the other two — L2A.4).
  have hseed : c ∉ seed := fun h => hc ((mem_Gset_iff T seed _ c).mpr (Or.inl h))
  obtain ⟨p, hp, q, hq, hpq, hcoll, hadm, -, -⟩ := saturated T seed (W : ℕ∞) hseed hc
  exact ⟨p, hp, q, hq, hpq, hcoll, hadm⟩

/-- **T18.6 (erosion obstruction), qualitative form.**  No pattern with an empty `(2W+1)`-window
occurs, so `s*(W) < 3W` unconditionally and "the square of related length" is genuinely `Θ(W)`. -/
theorem no_empty_patch {W : ℕ} {P : Set Pt} (hsat : WSaturated (W : ℕ∞) P) (c : Pt) :
    ∃ p ∈ P, nrm (p - c) ≤ W := exists_near hsat c

/-- **T18.6, quantitative.**  `sorry` = `local_floor`. -/
theorem erosion_obstruction {W : ℕ} (hW : 2 ≤ W) {P : Set Pt}
    (hval : WValidS (W : ℕ∞) P) (hsat : WSaturated (W : ℕ∞) P)
    {s : ℕ} (hs : 2 * W + 2 ≤ s) (v : Pt) :
    (0.29 : ℝ) * (W : ℝ) ^ (-(4 : ℝ) / 3) * ((s : ℝ) - 2 * W) ^ 2 * (1 - 1 / (W : ℝ))
      ≤ (winCount P s v : ℝ) := local_floor hW hval hsat hs v

/-- A pattern is **saturable** if it is the restriction of some `W`-saturated `W`-valid
configuration; T18.7 says `L_s(P_W)` is contained in the saturable part of `L_s(X_W)`, and
C18–C20 assert equality. -/
def Saturable (W s : ℕ) (C : Set Pt) : Prop :=
  ∃ D : Set Pt, WValidS (W : ℕ∞) D ∧ WSaturated (W : ℕ∞) D ∧
    ∀ p, p ∈ C ↔ (p ∈ sq s ∧ p ∈ D)

/-! ### §18.4 — the harvest is a certificate, and is bounded by the true optimum -/

/-- The classical optimum of the `s × s` no-three-in-line problem. -/
noncomputable def opt (s : ℕ) : ℕ := ((sq s).powerset.filter (fun C => Valid C)).sup Finset.card

/-- `maxpop_R(s)` (§18.4). -/
noncomputable def maxpop (P : Set Pt) (s R : ℕ) : ℕ := (ballF R).sup (fun v => winCount P s v)

/-- The literature's ceiling, rigorously: `opt s ≤ 2s`, so `c(s) ≤ 2`.  C4's "bug detector"
reading is precisely that this bound is *not* approached. -/
theorem opt_le_two_mul (s : ℕ) : opt s ≤ 2 * s := by
  refine Finset.sup_le ?_
  intro C hC
  simp only [Finset.mem_filter, Finset.mem_powerset] at hC
  refine card_le_two_mul_of_valid (v := ((0 : ℤ), (0 : ℤ))) ?_ hC.2
  rw [← sq_eq_window]
  exact hC.1

/-- Every `s`-window of a `W`-valid field with `s ≤ W+1` is a genuine no-three-in-line
configuration: **the harvest needs none of §16 or §17 to be true** (§18.5 warning 1). -/
theorem window_pattern_valid {W s : ℕ} (hs : s ≤ W + 1) {P : Set Pt}
    (hP : WValidS (W : ℕ∞) P) (v : Pt) : Valid ((sq s).filter (fun p => v + p ∈ P)) := by
  have hd : ∀ x y : Pt, (0 ≤ x.1 ∧ x.1 < s ∧ 0 ≤ x.2 ∧ x.2 < s) →
      (0 ≤ y.1 ∧ y.1 < s ∧ 0 ≤ y.2 ∧ y.2 < s) → nrm ((v + x) - (v + y)) ≤ W := by
    intro x y hx hy
    rw [show (v + x) - (v + y) = x - y by abel, nrm_le_iff]
    simp only [Prod.fst_sub, Prod.snd_sub]
    omega
  intro p hp q hq r hr h1 h2 h3
  simp only [Finset.mem_filter, mem_sq] at hp hq hr
  have hadm : Adm (W : ℕ∞) (v + p) (v + q) (v + r) :=
    ⟨by exact_mod_cast hd p q hp.1 hq.1, by exact_mod_cast hd p r hp.1 hr.1,
      by exact_mod_cast hd q r hq.1 hr.1⟩
  have hne : ∀ x y : Pt, x ≠ y → v + x ≠ v + y := fun x y h hc => h (add_left_cancel hc)
  have hmain := hP (v + p) hp.2 (v + q) hq.2 (v + r) hr.2
    (hne _ _ h1) (hne _ _ h2) (hne _ _ h3) hadm
  intro hcoll
  exact hmain ((coll_translate v p q r).mpr hcoll)

lemma winCount_eq (P : Set Pt) (s : ℕ) (v : Pt) :
    winCount P s v = ((sq s).filter (fun p => v + p ∈ P)).card := by
  classical
  have hinj : Function.Injective (fun p : Pt => v + p) := fun x y h => by
    simpa using congrArg (fun z : Pt => -v + z) h
  have himg : (window v s).filter (fun p => p ∈ P)
      = ((sq s).filter (fun p => v + p ∈ P)).image (fun p => v + p) := by
    ext q
    simp only [Finset.mem_filter, Finset.mem_image, mem_window, mem_sq]
    constructor
    · rintro ⟨hq, hqP⟩
      refine ⟨q - v, ⟨?_, ?_⟩, ?_⟩
      · simp only [Prod.fst_sub, Prod.snd_sub]; omega
      · rw [show v + (q - v) = q by abel]; exact hqP
      · abel
    · rintro ⟨p, ⟨hp, hpP⟩, rfl⟩
      refine ⟨?_, hpP⟩
      simp only [Prod.fst_add, Prod.snd_add]
      omega
  rw [winCount, himg, Finset.card_image_of_injective _ hinj]

/-- **The harvest bound (§18.5 warning 2).**  At `W = s-1` the record over all `Θ(R²)` windows is
bounded by the *true* optimum `opt s`, not by the greedy's own density: C4 (about `k(R)/(2R+1)`)
and a spoke record are statements about different quantities and cannot contradict each other.
A reported `maxpop > opt` is a verifier bug, full stop. -/
theorem maxpop_le_opt {W s : ℕ} (hs : s ≤ W + 1) {P : Set Pt} (hP : WValidS (W : ℕ∞) P)
    (R : ℕ) : maxpop P s R ≤ opt s := by
  refine Finset.sup_le ?_
  intro v _
  rw [winCount_eq]
  refine Finset.le_sup (f := Finset.card) ?_
  simp only [Finset.mem_filter, Finset.mem_powerset]
  exact ⟨Finset.filter_subset _ _, window_pattern_valid hs hP v⟩

/-- …and therefore `maxpop ≤ 2s` unconditionally. -/
theorem maxpop_le_two_mul {W s : ℕ} (hs : s ≤ W + 1) {P : Set Pt} (hP : WValidS (W : ℕ∞) P)
    (R : ℕ) : maxpop P s R ≤ 2 * s :=
  le_trans (maxpop_le_opt hs hP R) (opt_le_two_mul s)

end No3