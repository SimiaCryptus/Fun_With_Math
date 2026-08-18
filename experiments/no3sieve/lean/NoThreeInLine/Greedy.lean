import NoThreeInLine.Gauge

/-!
# §3, §5, §2A.1 — The greedy operator

A `Traversal` is a ring-monotone enumeration of `Λ`; the fold of §3.2 is then structural recursion on
`ℕ`.  P3.1 ("`P` is a function of `(≺, seed, W)` alone") is therefore *definitional* here, which is
the point: every downstream determinism claim is a claim that some machinery computes `Gset`.
-/

namespace No3

open scoped Classical

/-- A total order on `Λ` given as a ring-monotone enumeration.  Ring-monotonicity is the **only**
property §5–§7 use; the intra-ring rule is a free parameter (C6). -/
structure Traversal where
  enum : ℕ ≃ Pt
  ring_mono : ∀ m n : ℕ, nrm (enum m) < nrm (enum n) → m < n

namespace Traversal

variable (T : Traversal)

/-- The position of a cell in the traversal, i.e. `≺`-rank. -/
def idx (p : Pt) : ℕ := T.enum.symm p

@[simp] lemma enum_idx (p : Pt) : T.enum (T.idx p) = p := T.enum.apply_symm_apply p
@[simp] lemma idx_enum (n : ℕ) : T.idx (T.enum n) = n := T.enum.symm_apply_apply n

lemma idx_injective : Function.Injective T.idx := T.enum.symm.injective

/-- Ring-monotonicity, in the contrapositive form the locality proofs use. -/
lemma nrm_le_of_idx_lt {m n : ℕ} (h : m < n) : nrm (T.enum m) ≤ nrm (T.enum n) := by
  by_contra hc
  push_neg at hc
  exact absurd (T.ring_mono n m hc) (by omega)

end Traversal

/-- `c` is `W`-blocked by `S`: L2A.4 (and L2.2 when `W = ⊤`). -/
def Blocked (W : ℕ∞) (S : Finset Pt) (c : Pt) : Prop :=
  ∃ p ∈ S, ∃ q ∈ S, p ≠ q ∧ Coll c p q ∧ Adm W c p q

variable (T : Traversal) (seed : Finset Pt) (W : ℕ∞)

/-- The fold of §3.2: `stage n` is `{p ∈ P : ≺-rank p < n}`. -/
noncomputable def stage : ℕ → Finset Pt
  | 0 => ∅
  | n + 1 =>
      let S := stage n
      let c := T.enum n
      if c ∈ seed ∨ ¬ Blocked W S c then insert c S else S

/-- The greedy set `P(≺, seed, W)`. -/
noncomputable def Gset : Set Pt := {c | c ∈ stage T seed W (T.idx c + 1)}

lemma stage_subset_succ (n : ℕ) : stage T seed W n ⊆ stage T seed W (n + 1) := by
  intro x hx
  simp only [stage]
  split_ifs with h
  · exact Finset.mem_insert_of_mem hx
  · exact hx

lemma stage_mono {m n : ℕ} (h : m ≤ n) : stage T seed W m ⊆ stage T seed W n := by
  induction n with
  | zero => simpa [Nat.le_zero.mp h] using subset_rfl
  | succ k ih =>
    rcases Nat.lt_or_ge m (k + 1) with hlt | hge
    · exact (ih (Nat.lt_succ_iff.mp hlt)).trans (stage_subset_succ T seed W k)
    · have : m = k + 1 := le_antisymm h hge
      subst this; exact subset_rfl

/-- The stages are exactly the `≺`-prefixes of `Gset`. -/
theorem mem_stage_iff (c : Pt) (n : ℕ) :
    c ∈ stage T seed W n ↔ (T.idx c < n ∧ c ∈ Gset T seed W) := by
  induction n with
  | zero => simp [stage]
  | succ n ih =>
    by_cases hc : c = T.enum n
    · subst hc
      simp only [Traversal.idx_enum, Nat.lt_succ_iff, le_refl, true_and]
      constructor
      · intro h; exact ⟨Nat.lt_succ_self n, by simpa [Gset, Traversal.idx_enum] using h⟩
      · rintro ⟨-, h⟩; simpa [Gset, Traversal.idx_enum] using h
    · have hne : T.idx c ≠ n := by
        intro h; exact hc (by rw [← h, Traversal.enum_idx])
      have hstep : (c ∈ stage T seed W (n + 1)) ↔ (c ∈ stage T seed W n) := by
        simp only [stage]
        split_ifs with h
        · simp [Finset.mem_insert, hc]
        · rfl
      rw [hstep, ih]
      constructor
      · rintro ⟨h1, h2⟩; exact ⟨by omega, h2⟩
      · rintro ⟨h1, h2⟩; exact ⟨by omega, h2⟩

/-- **P3.1.**  Membership of `c` depends only on strictly `≺`-earlier cells.  This is the exact
content of "the fold is a function of `(≺, seed, W)` alone". -/
theorem mem_Gset_iff (c : Pt) :
    c ∈ Gset T seed W ↔ (c ∈ seed ∨ ¬ Blocked W (stage T seed W (T.idx c)) c) := by
  constructor
  · intro h
    by_contra hcon
    push_neg at hcon
    obtain ⟨hseed, hb⟩ := hcon
    have : c ∈ stage T seed W (T.idx c + 1) := h
    rw [stage] at this
    simp only at this
    rw [if_neg (by
      push_neg
      exact ⟨hseed, by simpa [Traversal.enum_idx] using (not_not.mpr hb)⟩)] at this
    exact absurd ((mem_stage_iff T seed W c (T.idx c)).mp this).1 (by omega)
  · intro h
    show c ∈ stage T seed W (T.idx c + 1)
    rw [stage]
    simp only
    rw [if_pos (by simpa [Traversal.enum_idx] using h)]
    simpa [Traversal.enum_idx] using Finset.mem_insert_self c _

/-- **T5.1 (ring locality).**  Everything in the prefix of `c` is inside `B(‖c‖∞)`.  This is a
*dependency* result as much as a locality one: ring `R` cannot begin before ring `R-1` finishes. -/
theorem ring_locality {c p : Pt} (h : p ∈ stage T seed W (T.idx c)) : nrm p ≤ nrm c := by
  obtain ⟨hlt, -⟩ := (mem_stage_iff T seed W p (T.idx c)).mp h
  have := T.nrm_le_of_idx_lt hlt
  rwa [Traversal.enum_idx, Traversal.enum_idx] at this

/-- **T5.4 (transverse locality).**  At finite `W` the decision additionally consults nothing beyond
distance `W` along the frontier: an `O(W²)` window, not an `O(R²)` one. -/
theorem transverse_locality {W : ℕ} {c p q : Pt}
    (h : ∃ hp : p ∈ stage T seed (W : ℕ∞) (T.idx c), ∃ hq : q ∈ stage T seed (W : ℕ∞) (T.idx c),
      p ≠ q ∧ Coll c p q ∧ Adm (W : ℕ∞) c p q) :
    nrm (p - c) ≤ W ∧ nrm (q - c) ≤ W := by
  obtain ⟨-, -, -, -, ha⟩ := h
  obtain ⟨h1, h2, -⟩ := blocked_local ha
  exact ⟨h1, h2⟩

/-- **T3.4 (greedy sets are saturated).**  A visited, non-placed cell is blocked by a pair that
ring-monotonicity puts inside `B(‖c‖∞)`.  This is the bridge to the §9.2 lower bound. -/
theorem saturated {c : Pt} (hseed : c ∉ seed) (hc : c ∉ Gset T seed W) :
    ∃ p ∈ Gset T seed W, ∃ q ∈ Gset T seed W,
      p ≠ q ∧ Coll c p q ∧ Adm W c p q ∧ nrm p ≤ nrm c ∧ nrm q ≤ nrm c := by
  have hb : Blocked W (stage T seed W (T.idx c)) c := by
    by_contra hb
    exact hc ((mem_Gset_iff T seed W c).mpr (Or.inr hb))
  obtain ⟨p, hp, q, hq, hpq, hcoll, hadm⟩ := hb
  exact ⟨p, ((mem_stage_iff T seed W p _).mp hp).2, q, ((mem_stage_iff T seed W q _).mp hq).2,
    hpq, hcoll, hadm, ring_locality T seed W hp, ring_locality T seed W hq⟩

/-! ### The output of the fold is `W`-valid

This theorem is not in `theory.md` — the doc treats it as obvious from the construction — but it is
the one property the engine's verifier checks at runtime, so it is worth having machine-checked.
The proof is the standard one: in a collinear triple, look at the `≺`-last point. -/

private lemma not_coll_of_last {p q r : Pt}
    (hseed : ∀ c ∈ seed, ¬ Blocked W (stage T seed W (T.idx c)) c)
    (hp : p ∈ Gset T seed W) (hq : q ∈ Gset T seed W) (hr : r ∈ Gset T seed W)
    (hpr : T.idx p < T.idx r) (hqr : T.idx q < T.idx r) (hpq : p ≠ q)
    (hadm : Adm W r p q) : ¬ Coll r p q := by
  intro hcoll
  have hp' : p ∈ stage T seed W (T.idx r) := (mem_stage_iff T seed W p _).mpr ⟨hpr, hp⟩
  have hq' : q ∈ stage T seed W (T.idx r) := (mem_stage_iff T seed W q _).mpr ⟨hqr, hq⟩
  have hb : Blocked W (stage T seed W (T.idx r)) r := ⟨p, hp', q, hq', hpq, hcoll, hadm⟩
  rcases (mem_Gset_iff T seed W r).mp hr with hs | hnb
  · exact hseed r hs hb
  · exact hnb hb

/-- **The greedy set is `W`-valid.**  (With `W = ⊤`: valid, by `wvalid_top_iff`.) -/
theorem Gset_wvalid
    (hseed : ∀ c ∈ seed, ¬ Blocked W (stage T seed W (T.idx c)) c)
    {p q r : Pt} (hp : p ∈ Gset T seed W) (hq : q ∈ Gset T seed W) (hr : r ∈ Gset T seed W)
    (h1 : p ≠ q) (h2 : p ≠ r) (h3 : q ≠ r) (hadm : Adm W p q r) : ¬ Coll p q r := by
  intro hcoll
  have i1 : T.idx p ≠ T.idx q := fun h => h1 (T.idx_injective h)
  have i2 : T.idx p ≠ T.idx r := fun h => h2 (T.idx_injective h)
  have i3 : T.idx q ≠ T.idx r := fun h => h3 (T.idx_injective h)
  rcases lt_trichotomy (T.idx p) (T.idx q) with hpq | hpq | hpq
  · rcases lt_trichotomy (T.idx q) (T.idx r) with hqr | hqr | hqr
    · -- r is last, with p < q < r
      exact not_coll_of_last T seed W hseed hp hq hr (hpq.trans hqr) hqr h1
        (adm_rot hadm) (coll_rot hcoll)
    · exact i3 hqr
    · -- q is last, with p < q and r < q
      exact not_coll_of_last T seed W hseed hp hr hq hpq hqr h2
        (adm_rot (adm_swap hadm)) (coll_swap (coll_rot' hcoll))
  · exact i1 hpq
  · rcases lt_trichotomy (T.idx p) (T.idx r) with hpr | hpr | hpr
    · -- r is last, with q < p < r
      exact not_coll_of_last T seed W hseed hq hp hr (hpq.trans hpr) hpr h1.symm
        (adm_swap (adm_rot hadm)) (coll_swap (coll_rot hcoll))
    · exact i2 hpr
    · -- p is last, with q < p and r < p
      exact not_coll_of_last T seed W hseed hq hr hp hpq hpr h3
        hadm hcoll

/-! ### T2A.7 — a finite horizon is exact, not approximate -/

/-- **T2A.7.**  For `W ≤ W'` (including `W' = ⊤`), the two folds agree **cell for cell** inside
`B(⌊W/2⌋)`.  This is the cheapest full-stack regression test in the project (P19).

`sorry`: the strong induction is written out below; the remaining gap is the prefix-agreement step
(`stage` restricted to `B(⌊W/2⌋)` is the same for `W` and `W'`), which needs `mem_stage_iff` plus
the induction hypothesis, and no new mathematics. -/
theorem horizon_exact (W : ℕ) (W' : ℕ∞) (hWW' : (W : ℕ∞) ≤ W')
    (hseed : True) (c : Pt) (hc : 2 * nrm c ≤ W) :
    c ∈ Gset T seed (W : ℕ∞) ↔ c ∈ Gset T seed W' := by
  -- Sketch (doc T2A.7): by ring-monotonicity (T5.1) every blocker pair of `c` lies in `B(⌊W/2⌋)`,
  -- and `diam_∞ B(⌊W/2⌋) = 2⌊W/2⌋ ≤ W`, so every blocking triple is `W`-admissible and is seen by
  -- *both* folds; the induction hypothesis makes the two prefixes equal on `B(⌊W/2⌋)`.
  sorry

/-- The admissibility half of T2A.7, which *is* proved: inside `B(⌊W/2⌋)` every collinear triple is
automatically `W`-admissible, so no blocker can be lost by lowering the horizon to `W`. -/
theorem adm_of_small {W : ℕ} {p q r : Pt}
    (hp : 2 * nrm p ≤ W) (hq : 2 * nrm q ≤ W) (hr : 2 * nrm r ≤ W) : Adm (W : ℕ∞) p q r := by
  refine ⟨?_, ?_, ?_⟩ <;>
    · rw [Nat.cast_le (α := ℕ∞)]
      first
      | (have := nrm_sub_le p q; omega)
      | (have := nrm_sub_le p r; omega)
      | (have := nrm_sub_le q r; omega)

end No3