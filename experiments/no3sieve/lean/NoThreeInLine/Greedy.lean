import NoThreeInLine.Gauge

/-!
# §3, §5 — The greedy sieve, and what the decision at a cell can depend on

A `Traversal` is a bijective enumeration of `Λ` that is **ring monotone**: the gauge is
non-decreasing along `≺`.  That single field is what makes §5's locality theorems true, and it is
exactly the first disjunct of `spiralPrec` in `Seams.lean`.

The sieve itself is a sequential fold (T7.4/T7.6: it *must* be one).  `stage` is the prefix after
`n` decisions, `Gset` its limit; `mem_Gset_iff` (P3.1) is the only characterisation the rest of the
project uses, and `saturated` (T3.4) is its contrapositive: **every absent cell is blocked by a
pair that was already present when the cell was tested.**

Nothing here is decidable-by-computation — the oracle quantifies over an unbounded set of pairs at
`W = ⊤` — so `stage` is `noncomputable` and the `if` is resolved classically.  `Witness.lean` and
`Marks.lean` carry the *executable* models of the same fold.
-/

namespace No3

open scoped Classical

/-! ### D3.1 — traversals -/

/-- A bijective enumeration `ℕ ≃ Λ` which is monotone in the gauge: `‖p‖∞ < ‖q‖∞ → p ≺ q`.
Ring-monotonicity is a *field*, not a lemma, because every locality statement of §5 is false
without it. -/
structure Traversal where
  enum : ℕ → Pt
  idx : Pt → ℕ
  idx_enum : ∀ n, idx (enum n) = n
  enum_idx : ∀ p, enum (idx p) = p
  ring_mono : ∀ p q : Pt, nrm p < nrm q → idx p < idx q

namespace Traversal

lemma idx_injective (T : Traversal) : Function.Injective T.idx := by
  intro x y h
  rw [← T.enum_idx x, ← T.enum_idx y, h]

lemma idx_ne (T : Traversal) {p q : Pt} (h : p ≠ q) : T.idx p ≠ T.idx q :=
  fun he => h (T.idx_injective he)

/-- The contrapositive of `ring_mono`: `≺`-earlier cells never live in a later ring. -/
lemma nrm_le_of_idx_le (T : Traversal) {p q : Pt} (h : T.idx p ≤ T.idx q) : nrm p ≤ nrm q := by
  by_contra hlt
  push_neg at hlt
  have := T.ring_mono q p hlt
  omega

end Traversal

/-! ### The oracle -/

/-- **The blocking oracle.**  `c` is `W`-blocked by the already-committed set `S` iff some
`W`-admissible pair of `S` is collinear with `c`. -/
def Blocked (W : ℕ∞) (S : Finset Pt) (c : Pt) : Prop :=
  ∃ p ∈ S, ∃ q ∈ S, p ≠ q ∧ Coll c p q ∧ Adm W c p q

/-- **T2A.7, admissibility half.**  Inside `B(R)` every triple is `W`-admissible as soon as
`W ≥ 2R = diam_∞ B(R)`; this is the *cheap* direction of horizon exactness. -/
theorem adm_of_small {R : ℕ} {W : ℕ∞} (hW : ((2 * R : ℕ) : ℕ∞) ≤ W) {p q r : Pt}
    (hp : nrm p ≤ R) (hq : nrm q ≤ R) (hr : nrm r ≤ R) : Adm W p q r := by
  have h : ∀ x y : Pt, nrm x ≤ R → nrm y ≤ R → ((nrm (x - y) : ℕ) : ℕ∞) ≤ W := by
    intro x y hx hy
    refine le_trans ?_ hW
    exact_mod_cast diam_ball hx hy
  exact ⟨h p q hp hq, h p r hp hr, h q r hq hr⟩

/-! ### D3.2 — the sieve -/

/-- The prefix of the fold after `n` decisions.  `stage 0 = seed`: the seed is committed before the
first test, which is why `mem_Gset_iff` carries a `c ∈ seed` disjunct. -/
noncomputable def stage (T : Traversal) (seed : Finset Pt) (W : ℕ∞) : ℕ → Finset Pt
  | 0 => seed
  | n + 1 =>
      if Blocked W (stage T seed W n) (T.enum n) then stage T seed W n
      else insert (T.enum n) (stage T seed W n)

/-- The limit of the fold. -/
def Gset (T : Traversal) (seed : Finset Pt) (W : ℕ∞) : Set Pt :=
  {p | p ∈ stage T seed W (T.idx p + 1)}

section
variable (T : Traversal) (seed : Finset Pt) (W : ℕ∞)

@[simp] lemma stage_zero : stage T seed W 0 = seed := by
  simp only [stage]

lemma stage_succ (n : ℕ) :
    stage T seed W (n + 1) =
      if Blocked W (stage T seed W n) (T.enum n) then stage T seed W n
      else insert (T.enum n) (stage T seed W n) := by
  simp only [stage]

lemma mem_stage_succ_iff (n : ℕ) (c : Pt) :
    c ∈ stage T seed W (n + 1) ↔
      (c ∈ stage T seed W n ∨ (c = T.enum n ∧ ¬ Blocked W (stage T seed W n) (T.enum n))) := by
  rw [stage_succ]
  split_ifs with hb
  · constructor
    · exact Or.inl
    · rintro (h | ⟨-, h⟩)
      · exact h
      · exact absurd hb h
  · simp only [Finset.mem_insert]
    constructor
    · rintro (h | h)
      · exact Or.inr ⟨h, hb⟩
      · exact Or.inl h
    · rintro (h | ⟨h, -⟩)
      · exact Or.inr h
      · exact Or.inl h

lemma stage_subset_succ (n : ℕ) : stage T seed W n ⊆ stage T seed W (n + 1) := by
  intro c hc
  exact (mem_stage_succ_iff T seed W n c).mpr (Or.inl hc)

lemma stage_mono_add (n k : ℕ) : stage T seed W n ⊆ stage T seed W (n + k) := by
  induction k with
  | zero => exact Finset.Subset.refl _
  | succ k ih =>
      intro x hx
      exact stage_subset_succ T seed W (n + k) (ih hx)

lemma stage_mono {m n : ℕ} (h : m ≤ n) : stage T seed W m ⊆ stage T seed W n := by
  obtain ⟨k, rfl⟩ := Nat.exists_eq_add_of_le h
  exact stage_mono_add T seed W m k

lemma seed_subset_stage (n : ℕ) : seed ⊆ stage T seed W n := by
  have h := stage_mono T seed W (Nat.zero_le n)
  rwa [stage_zero] at h

/-- A non-seed cell can only appear in a stage strictly after its own index. -/
lemma idx_lt_of_mem_stage {c : Pt} {n : ℕ} (hc : c ∈ stage T seed W n) (hs : c ∉ seed) :
    T.idx c < n := by
  induction n with
  | zero =>
      rw [stage_zero] at hc
      exact absurd hc hs
  | succ n ih =>
      rcases (mem_stage_succ_iff T seed W n c).mp hc with h | ⟨h, -⟩
      · exact Nat.lt_succ_of_lt (ih h)
      · rw [h, T.idx_enum]
        omega

/-- …and once it appears it appeared at its own index. -/
lemma mem_stage_of_idx_lt {c : Pt} {n : ℕ} (hc : c ∈ stage T seed W n) (h : T.idx c < n) :
    c ∈ stage T seed W (T.idx c + 1) := by
  induction n with
  | zero => exact absurd h (Nat.not_lt_zero _)
  | succ n ih =>
      rcases Nat.lt_or_ge (T.idx c) n with h' | h'
      · refine ih ?_ h'
        rcases (mem_stage_succ_iff T seed W n c).mp hc with h2 | ⟨h2, -⟩
        · exact h2
        · exfalso
          rw [h2, T.idx_enum] at h'
          omega
      · have h'' : T.idx c = n := by omega
        rw [h'']
        exact hc

/-- **P3.1.**  A cell is in the output iff it is in the seed, or it was *not* blocked by the prefix
that existed when it was tested.  This is the only characterisation of `Gset` used downstream. -/
theorem mem_Gset_iff (c : Pt) :
    c ∈ Gset T seed W ↔ (c ∈ seed ∨ ¬ Blocked W (stage T seed W (T.idx c)) c) := by
  have h0 : c ∈ Gset T seed W ↔ c ∈ stage T seed W (T.idx c + 1) := Iff.rfl
  rw [h0, mem_stage_succ_iff, T.enum_idx]
  constructor
  · rintro (h | ⟨-, h⟩)
    · by_cases hs : c ∈ seed
      · exact Or.inl hs
      · exact absurd (idx_lt_of_mem_stage T seed W h hs) (lt_irrefl _)
    · exact Or.inr h
  · rintro (hs | hb)
    · exact Or.inl (seed_subset_stage T seed W _ hs)
    · exact Or.inr ⟨rfl, hb⟩

lemma mem_Gset_of_mem_seed {c : Pt} (h : c ∈ seed) : c ∈ Gset T seed W :=
  (mem_Gset_iff T seed W c).mpr (Or.inl h)

lemma not_blocked_of_mem_Gset {c : Pt} (hc : c ∈ Gset T seed W) (hs : c ∉ seed) :
    ¬ Blocked W (stage T seed W (T.idx c)) c := by
  rcases (mem_Gset_iff T seed W c).mp hc with h | h
  · exact absurd h hs
  · exact h

/-- The stages are exactly the `≺`-prefixes of `Gset` (together with the seed). -/
theorem mem_stage_iff (c : Pt) (n : ℕ) :
    c ∈ stage T seed W n ↔ (c ∈ seed ∨ (T.idx c < n ∧ c ∈ Gset T seed W)) := by
  constructor
  · intro hc
    by_cases hs : c ∈ seed
    · exact Or.inl hs
    · have hlt := idx_lt_of_mem_stage T seed W hc hs
      exact Or.inr ⟨hlt, mem_stage_of_idx_lt T seed W hc hlt⟩
  · rintro (hs | ⟨hlt, hg⟩)
    · exact seed_subset_stage T seed W n hs
    · have hg' : c ∈ stage T seed W (T.idx c + 1) := hg
      exact stage_mono T seed W (show T.idx c + 1 ≤ n by omega) hg'

/-! ### §5 — locality -/

/-- **T5.1 (ring locality).**  Everything committed when `c` is tested lies in a ring no later than
`c`'s: the fold never looks outward.  (For a seed inside `B(‖c‖∞)`; the seed is the only way to
violate ring monotonicity, which is P3.3's warning.) -/
theorem ring_locality {c p : Pt} (hs : ∀ x ∈ seed, nrm x ≤ nrm c)
    (hp : p ∈ stage T seed W (T.idx c)) : nrm p ≤ nrm c := by
  by_cases h : p ∈ seed
  · exact hs p h
  · exact T.nrm_le_of_idx_le (le_of_lt (idx_lt_of_mem_stage T seed W hp h))

/-- **T5.4 (transverse locality).**  At finite horizon the blockers of `c` live in `c + B(W)`:
the past cone `N⁻(c)` of D16.1 is *exactly* the set of cells that can affect the decision. -/
theorem transverse_locality {V : ℕ} {c : Pt}
    (h : Blocked (V : ℕ∞) (stage T seed (V : ℕ∞) (T.idx c)) c) :
    ∃ p ∈ stage T seed (V : ℕ∞) (T.idx c), ∃ q ∈ stage T seed (V : ℕ∞) (T.idx c),
      p ≠ q ∧ Coll c p q ∧ nrm (p - c) ≤ V ∧ nrm (q - c) ≤ V := by
  obtain ⟨p, hp, q, hq, hpq, hcoll, hadm⟩ := h
  obtain ⟨h1, h2, -⟩ := blocked_local hadm
  exact ⟨p, hp, q, hq, hpq, hcoll, h1, h2⟩

/-! ### T3.4 — saturation, and the runtime invariant -/

/-- **T3.4 (saturation).**  Every cell the sieve rejects is blocked by an admissible collinear pair
of `Gset` that was **already committed** when the cell was tested.  The last two components record
that: they are what makes §15/§18's erosion arguments possible. -/
theorem saturated {c : Pt} (_hseed : c ∉ seed) (hc : c ∉ Gset T seed W) :
    ∃ p ∈ Gset T seed W, ∃ q ∈ Gset T seed W,
      p ≠ q ∧ Coll c p q ∧ Adm W c p q ∧
      (p ∈ seed ∨ T.idx p < T.idx c) ∧ (q ∈ seed ∨ T.idx q < T.idx c) := by
  have hb : Blocked W (stage T seed W (T.idx c)) c := by
    by_contra hb
    exact hc ((mem_Gset_iff T seed W c).mpr (Or.inr hb))
  obtain ⟨p, hp, q, hq, hpq, hcoll, hadm⟩ := hb
  have hP := (mem_stage_iff T seed W p (T.idx c)).mp hp
  have hQ := (mem_stage_iff T seed W q (T.idx c)).mp hq
  refine ⟨p, ?_, q, ?_, hpq, hcoll, hadm, ?_, ?_⟩
  · rcases hP with h | ⟨-, h⟩
    · exact mem_Gset_of_mem_seed T seed W h
    · exact h
  · rcases hQ with h | ⟨-, h⟩
    · exact mem_Gset_of_mem_seed T seed W h
    · exact h
  · rcases hP with h | ⟨h, -⟩
    · exact Or.inl h
    · exact Or.inr h
  · rcases hQ with h | ⟨h, -⟩
    · exact Or.inl h
    · exact Or.inr h

/-- **The engine's runtime invariant.**  If the seed is `W`-valid then so is the whole output: the
`≺`-last member of any admissible collinear triple would have been blocked by the other two.
Note the seed hypothesis is *necessary* — a triple inside the seed is never tested. -/
theorem Gset_wvalid (hseed : WValid W seed) : WValidS W (Gset T seed W) := by
  have key : ∀ c x y : Pt, c ∈ Gset T seed W → c ∉ seed →
      x ∈ Gset T seed W → y ∈ Gset T seed W →
      (x ∈ seed ∨ T.idx x < T.idx c) → (y ∈ seed ∨ T.idx y < T.idx c) →
      x ≠ y → Adm W c x y → ¬ Coll c x y := by
    intro c x y hc hcs hx hy hx' hy' hxy hadm hcoll
    refine not_blocked_of_mem_Gset T seed W hc hcs ⟨x, ?_, y, ?_, hxy, hcoll, hadm⟩
    · rcases hx' with h | h
      · exact seed_subset_stage T seed W _ h
      · exact (mem_stage_iff T seed W x (T.idx c)).mpr (Or.inr ⟨h, hx⟩)
    · rcases hy' with h | h
      · exact seed_subset_stage T seed W _ h
      · exact (mem_stage_iff T seed W y (T.idx c)).mpr (Or.inr ⟨h, hy⟩)
  intro p hp q hq r hr hpq hpr hqr hadm hcoll
  have Kp : p ∉ seed → (q ∈ seed ∨ T.idx q < T.idx p) →
      (r ∈ seed ∨ T.idx r < T.idx p) → False :=
    fun h1 h2 h3 => key p q r hp h1 hq hr h2 h3 hqr hadm hcoll
  have Kq : q ∉ seed → (r ∈ seed ∨ T.idx r < T.idx q) →
      (p ∈ seed ∨ T.idx p < T.idx q) → False :=
    fun h1 h2 h3 => key q r p hq h1 hr hp h2 h3 (Ne.symm hpr)
      (adm_rot (adm_rot hadm)) (coll_rot' hcoll)
  have Kr : r ∉ seed → (p ∈ seed ∨ T.idx p < T.idx r) →
      (q ∈ seed ∨ T.idx q < T.idx r) → False :=
    fun h1 h2 h3 => key r p q hr h1 hp hq h2 h3 hpq (adm_rot hadm) (coll_rot hcoll)
  by_cases hps : p ∈ seed
  · by_cases hqs : q ∈ seed
    · by_cases hrs : r ∈ seed
      · exact hseed p hps q hqs r hrs hpq hpr hqr hadm hcoll
      · exact Kr hrs (Or.inl hps) (Or.inl hqs)
    · by_cases hrs : r ∈ seed
      · exact Kq hqs (Or.inl hrs) (Or.inl hps)
      · rcases lt_or_gt_of_ne (T.idx_ne hqr) with h | h
        · exact Kr hrs (Or.inl hps) (Or.inr h)
        · exact Kq hqs (Or.inr h) (Or.inl hps)
  · by_cases hqs : q ∈ seed
    · by_cases hrs : r ∈ seed
      · exact Kp hps (Or.inl hqs) (Or.inl hrs)
      · rcases lt_or_gt_of_ne (T.idx_ne hpr) with h | h
        · exact Kr hrs (Or.inr h) (Or.inl hqs)
        · exact Kp hps (Or.inl hqs) (Or.inr h)
    · by_cases hrs : r ∈ seed
      · rcases lt_or_gt_of_ne (T.idx_ne hpq) with h | h
        · exact Kq hqs (Or.inl hrs) (Or.inr h)
        · exact Kp hps (Or.inr h) (Or.inl hrs)
      · rcases lt_or_gt_of_ne (T.idx_ne hpq) with h1 | h1
        · rcases lt_or_gt_of_ne (T.idx_ne hqr) with h2 | h2
          · exact Kr hrs (Or.inr (by omega)) (Or.inr h2)
          · exact Kq hqs (Or.inr h2) (Or.inr h1)
        · rcases lt_or_gt_of_ne (T.idx_ne hpr) with h2 | h2
          · exact Kr hrs (Or.inr h2) (Or.inr (by omega))
          · exact Kp hps (Or.inr h1) (Or.inr h2)

end

/-- **T2A.7 (horizon exactness).**  Inside `B(R)` the run at `W = 2R` and the run at `W = ⊤` agree
cell by cell.  `sorry`: the induction needs that a *rejected* cell of `B(R)` is rejected by an
admissible pair of `B(R)`, which is `adm_of_small` plus the statement that the two runs have the
same prefix — i.e. the strengthened induction hypothesis.  This is the obligation worth closing
first (P19): it is what licenses running the engine at a finite horizon and reporting a classical
certificate. -/
theorem horizon_exact (T : Traversal) (seed : Finset Pt) (R : ℕ) {c : Pt} (hc : nrm c ≤ R) :
    c ∈ Gset T seed ((2 * R : ℕ) : ℕ∞) ↔ c ∈ Gset T seed ⊤ := by
  sorry

end No3