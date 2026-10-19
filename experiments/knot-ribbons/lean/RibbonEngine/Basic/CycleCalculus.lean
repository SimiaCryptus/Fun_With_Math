import RibbonEngine.Basic.ArtinBraid
import Mathlib.GroupTheory.Perm.Cycle.Factors
import Mathlib.GroupTheory.Perm.Cycle.Type

/-!
# Cycle calculus: executable counter + Mathlib `numCycles` + reflection bridge

The executable layer contains no `Finset` and no `Classical.choice`, so concrete
examples reduce by kernel `rfl` (Golden Rule 1).
-/

namespace RibbonEngine

/-- Executable cycle count by fuel-bounded orbit sweeping. -/
def countCyclesExec (n : ℕ) (f : Fin n → Fin n) : ℕ :=
  loop n (List.finRange n) 0
where
   /-- Fuel-bounded helper that strips one `f`-orbit per step and increments `acc`. -/
  loop : ℕ → List (Fin n) → ℕ → ℕ
    | 0, _, acc => acc
    | _, [], acc => acc
    | fuel + 1, x :: xs, acc =>
      let orbit := (List.range n).scanl (fun cur _ => f cur) x
      loop fuel ((x :: xs).filter (fun y => !orbit.contains y)) (acc + 1)

/-- Abstract cycle count: nontrivial cycles plus fixed points. -/
noncomputable def numCycles {n : ℕ} (τ : Equiv.Perm (Fin n)) : ℕ :=
  τ.cycleType.card + (Fintype.card (Fin n) - τ.support.card)



open Equiv Perm

lemma mem_support_iff_exists_cycleFactorsFinset {n : ℕ} (p : Perm (Fin n)) (a : Fin n) :
    a ∈ p.support ↔ ∃ c ∈ p.cycleFactorsFinset, a ∈ c.support := by
  refine ⟨fun ha => ⟨p.cycleOf a, cycleOf_mem_cycleFactorsFinset_iff.2 ha,
    mem_support.2 (by rw [cycleOf_apply_self]; exact mem_support.1 ha)⟩, ?_⟩
  rintro ⟨c, hc, hac⟩
  rw [mem_support, ← (mem_cycleFactorsFinset_iff.1 hc).2 a hac, ← mem_support]
  exact hac

lemma sameCycle_iff_exists_nat_pow {n : ℕ} (p : Perm (Fin n)) (x y : Fin n) :
    p.SameCycle x y ↔ ∃ m : ℕ, (p ^ m) x = y := by
  refine ⟨?_, fun ⟨m, hm⟩ => ⟨m, by exact_mod_cast hm⟩⟩
  rintro ⟨k, hk⟩
  obtain ⟨M, hM_pos, hM⟩ := isOfFinOrder_iff_pow_eq_one.1 (isOfFinOrder_of_finite p)
  have h_inv_pow : p⁻¹ = p ^ (M - 1) := by
    apply inv_eq_of_mul_eq_one_right
    rw [← pow_succ', Nat.sub_add_cancel hM_pos, hM]
  cases k with
  | ofNat m =>
    exact ⟨m, by simpa using hk⟩
  | negSucc m =>
    refine ⟨(M - 1) * (m + 1), ?_⟩
    rw [pow_mul, ← h_inv_pow, inv_pow, ← zpow_negSucc]
    exact hk

lemma pow_apply_eq_of_mem_cycleFactorsFinset {n : ℕ} {p c : Perm (Fin n)}
    (hc : c ∈ p.cycleFactorsFinset) {x : Fin n} (hx : x ∈ c.support) (m : ℕ) :
    (p ^ m) x = (c ^ m) x ∧ (c ^ m) x ∈ c.support := by
  induction m with
  | zero => exact ⟨rfl, hx⟩
  | succ m ih =>
    rcases ih with ⟨hm_eq, hm_mem⟩
    have h_step : c ((c ^ m) x) = p ((c ^ m) x) :=
      (mem_cycleFactorsFinset_iff.1 hc).2 _ hm_mem
    refine ⟨?_, ?_⟩
    · rw [pow_succ', mul_apply, hm_eq, ← h_step, ← mul_apply, ← pow_succ']
    · rw [pow_succ', mul_apply, mem_support]
      intro h_fix
      exact mem_support.1 hm_mem (c.injective h_fix)

lemma mem_support_of_mem_cycleFactorsFinset_iff_sameCycle {n : ℕ} {p c : Perm (Fin n)}
    (hc : c ∈ p.cycleFactorsFinset) {x : Fin n} (hx : x ∈ c.support) (y : Fin n) :
    y ∈ c.support ↔ p.SameCycle x y := by
  constructor
  · intro hy
    rcases (mem_cycleFactorsFinset_iff.1 hc).1 with ⟨z, _, hzw⟩
    have hsc_c : c.SameCycle x y :=
      (hzw (mem_support.1 hx)).symm.trans (hzw (mem_support.1 hy))
    obtain ⟨m, hm⟩ := (sameCycle_iff_exists_nat_pow c x y).1 hsc_c
    exact (sameCycle_iff_exists_nat_pow p x y).2
      ⟨m, by rw [(pow_apply_eq_of_mem_cycleFactorsFinset hc hx m).1, hm]⟩
  · intro hsc
    obtain ⟨m, rfl⟩ := (sameCycle_iff_exists_nat_pow p x y).1 hsc
    obtain ⟨h1, h2⟩ := pow_apply_eq_of_mem_cycleFactorsFinset hc hx m
    rwa [h1]

private def iterList {α : Type*} (f : α → α) : ℕ → α → List α
  | 0, x => [x]
  | m + 1, x => x :: iterList f m (f x)

private lemma scanl_const_eq_iterList {α β : Type*} (f : α → α) (x : α) (l : List β) :
    l.scanl (fun cur _ => f cur) x = iterList f l.length x := by
  induction l generalizing x with
  | nil => rfl
  | cons _ tl ih =>
     simp only [List.scanl_cons, List.length_cons, iterList]
     exact congrArg (x :: ·) (ih (f x))

private lemma mem_iterList_iff {n : ℕ} (τ : Perm (Fin n)) (m : ℕ) (x y : Fin n) :
    y ∈ iterList (⇑τ) m x ↔ ∃ k ≤ m, (τ ^ k) x = y := by
  induction m generalizing x with
  | zero =>
    simp only [iterList, List.mem_singleton]
    refine ⟨fun h => ⟨0, le_rfl, h.symm⟩, ?_⟩
    rintro ⟨k, hk, hky⟩
    rw [Nat.le_zero.1 hk] at hky
    exact hky.symm
  | succ m ih =>
    simp only [iterList, List.mem_cons]
    rw [ih (τ x)]
    constructor
    · rintro (rfl | ⟨k, hk, hky⟩)
      · exact ⟨0, Nat.zero_le _, rfl⟩
      · refine ⟨k + 1, Nat.succ_le_succ hk, ?_⟩
        rw [pow_succ, Perm.mul_apply, hky]
    · rintro ⟨k, hk, rfl⟩
      cases k with
      | zero => exact Or.inl rfl
      | succ k =>
        refine Or.inr ⟨k, Nat.le_of_succ_le_succ hk, ?_⟩
        rw [pow_succ, Perm.mul_apply]

private lemma sameCycle_iff_exists_le_card {n : ℕ} (τ : Perm (Fin n)) (x y : Fin n) :
    τ.SameCycle x y ↔ ∃ k ≤ n, (τ ^ k) x = y := by
  rw [sameCycle_iff_exists_nat_pow]
  refine ⟨?_, fun ⟨k, _, hk⟩ => ⟨k, hk⟩⟩
  intro h
  classical
  let k₀ := Nat.find h
  have hk₀ : (τ ^ k₀) x = y := Nat.find_spec h
  suffices hk₀_le : k₀ ≤ n from ⟨k₀, hk₀_le, hk₀⟩
  have h_no_lt : ∀ a b : ℕ, a < b → b < k₀ → (τ ^ a) x ≠ (τ ^ b) x := by
    intro a b hab hbk h_eq
    have hd_pos : 0 < b - a := Nat.sub_pos_of_lt hab
    have h_eq_x : (τ ^ (b - a)) x = x := by
      apply (τ ^ a).injective
      calc (τ ^ a) ((τ ^ (b - a)) x)
          = (τ ^ (a + (b - a))) x := by rw [← Perm.mul_apply, ← pow_add]
        _ = (τ ^ b) x := by rw [Nat.add_sub_of_le (le_of_lt hab)]
        _ = (τ ^ a) x := h_eq.symm
    have h_lt_k₀ : k₀ - (b - a) < k₀ :=
      Nat.sub_lt (Nat.zero_lt_of_lt hbk) hd_pos
    have h_le_k₀ : b - a ≤ k₀ :=
      le_of_lt (lt_of_le_of_lt (Nat.sub_le _ _) hbk)
    have h_shorter : (τ ^ (k₀ - (b - a))) x = y := by
      calc (τ ^ (k₀ - (b - a))) x
          = (τ ^ (k₀ - (b - a))) ((τ ^ (b - a)) x) := by rw [h_eq_x]
        _ = (τ ^ (k₀ - (b - a) + (b - a))) x := by rw [← Perm.mul_apply, ← pow_add]
        _ = (τ ^ k₀) x := by rw [Nat.sub_add_cancel h_le_k₀]
        _ = y := hk₀
    exact Nat.find_min h h_lt_k₀ h_shorter
  have h_inj : Function.Injective (fun i : Fin k₀ => (τ ^ i.val) x) := by
    intro i j hij
    ext
    rcases lt_trichotomy i.val j.val with hlt | h_eq | hgt
    · exact False.elim (h_no_lt i.val j.val hlt j.isLt hij)
    · exact h_eq
    · exact False.elim (h_no_lt j.val i.val hgt i.isLt hij.symm)
  have h_card := Fintype.card_le_of_injective _ h_inj
  simpa only [Fintype.card_fin] using h_card

private lemma list_contains_eq_true_iff {α : Type*} [DecidableEq α] (l : List α) (y : α) :
    l.contains y = true ↔ y ∈ l := by
  simp

private lemma orbit_contains_iff {n : ℕ} (τ : Perm (Fin n)) (x y : Fin n) :
    ((List.range n).scanl (fun cur _ => τ cur) x).contains y = true ↔ τ.SameCycle x y := by
  rw [list_contains_eq_true_iff, scanl_const_eq_iterList, List.length_range,
    mem_iterList_iff, sameCycle_iff_exists_le_card]

private lemma not_orbit_contains_iff {n : ℕ} (τ : Perm (Fin n)) (x y : Fin n) :
    (!((List.range n).scanl (fun cur _ => τ cur) x).contains y) = true ↔ ¬ τ.SameCycle x y := by
  rw [← orbit_contains_iff]
  cases ((List.range n).scanl (fun cur _ => τ cur) x).contains y <;> decide

private noncomputable def cfIn {n : ℕ} (τ : Perm (Fin n)) (S : Finset (Fin n)) :
    Finset (Perm (Fin n)) :=
  τ.cycleFactorsFinset.filter (fun c => c.support ⊆ S)

private noncomputable def fpIn {n : ℕ} (τ : Perm (Fin n)) (S : Finset (Fin n)) :
    Finset (Fin n) :=
  S.filter (fun y => y ∉ τ.support)

private lemma cfIn_fpIn_empty {n : ℕ} (τ : Perm (Fin n)) :
    (cfIn τ ∅).card + (fpIn τ ∅).card = 0 := by
  classical
  have h_cf : cfIn τ ∅ = ∅ := by
    ext c
    simp only [cfIn, Finset.mem_filter, Finset.notMem_empty, iff_false, not_and]
    intro hc h_sub
    rcases (mem_cycleFactorsFinset_iff.1 hc).1 with ⟨x, hx, _⟩
    exact Finset.notMem_empty x (h_sub (mem_support.2 hx))
  have h_fp : fpIn τ ∅ = ∅ := by
    ext y
    simp [fpIn]
  simp [h_cf, h_fp]

private lemma cfIn_fpIn_univ {n : ℕ} (τ : Perm (Fin n)) :
    (cfIn τ Finset.univ).card + (fpIn τ Finset.univ).card = numCycles τ := by
  classical
  have h_cf : cfIn τ Finset.univ = τ.cycleFactorsFinset := by
    ext c
    simp [cfIn]
  have h_cf_card : (cfIn τ Finset.univ).card = τ.cycleType.card := by
    rw [h_cf, cycleType_def, Multiset.card_map, Finset.card_def]
  have h_disj : Disjoint (fpIn τ Finset.univ) τ.support := by
    rw [Finset.disjoint_left]
    intro y hy
    simp only [fpIn, Finset.mem_filter, Finset.mem_univ, true_and] at hy
    exact hy
  have h_union : fpIn τ Finset.univ ∪ τ.support = Finset.univ := by
    ext y
    simp only [Finset.mem_union, fpIn, Finset.mem_filter, Finset.mem_univ, true_and]
    by_cases hy : y ∈ τ.support <;> simp [hy]
  have h_fp_card : (fpIn τ Finset.univ).card + τ.support.card = Fintype.card (Fin n) := by
    rw [← Finset.card_union_of_disjoint h_disj, h_union, Finset.card_univ]
  unfold numCycles
  omega

private lemma cfIn_fpIn_step {n : ℕ} (τ : Perm (Fin n)) (S S' : Finset (Fin n)) (x : Fin n)
    (hxS : x ∈ S)
    (h_closed : ∀ a ∈ S, ∀ b, τ.SameCycle a b → b ∈ S)
    (hS' : ∀ y, y ∈ S' ↔ y ∈ S ∧ ¬ τ.SameCycle x y) :
    (cfIn τ S).card + (fpIn τ S).card = (cfIn τ S').card + (fpIn τ S').card + 1 := by
  classical
  by_cases hx : x ∈ τ.support
  · obtain ⟨c₀, hc₀_mem, hxc₀⟩ := (mem_support_iff_exists_cycleFactorsFinset τ x).1 hx
    have hc₀_iff : ∀ y, y ∈ c₀.support ↔ τ.SameCycle x y :=
      mem_support_of_mem_cycleFactorsFinset_iff_sameCycle hc₀_mem hxc₀
    have hc₀_in_S : c₀ ∈ cfIn τ S := by
      simp only [cfIn, Finset.mem_filter]
      exact ⟨hc₀_mem, fun y hy => h_closed x hxS y ((hc₀_iff y).1 hy)⟩
    have h_cf : cfIn τ S' = (cfIn τ S).erase c₀ := by
      ext c
      simp only [cfIn, Finset.mem_filter, Finset.mem_erase]
      constructor
      · rintro ⟨hc_mem, hc_sub⟩
        refine ⟨?_, hc_mem, fun y hy => ((hS' y).1 (hc_sub hy)).1⟩
        rintro rfl
        exact ((hS' x).1 (hc_sub hxc₀)).2 Perm.SameCycle.rfl
      · rintro ⟨hc_ne, hc_mem, hc_sub⟩
        refine ⟨hc_mem, fun y hy => (hS' y).2 ⟨hc_sub hy, ?_⟩⟩
        rw [← hc₀_iff]
        have h_disj := Perm.Disjoint.disjoint_support
          (cycleFactorsFinset_pairwise_disjoint τ hc_mem hc₀_mem hc_ne)
        exact Finset.disjoint_left.1 h_disj hy
    have h_fp : fpIn τ S' = fpIn τ S := by
      ext y
      simp only [fpIn, Finset.mem_filter, hS']
      refine ⟨fun ⟨⟨hyS, _⟩, hy_supp⟩ => ⟨hyS, hy_supp⟩, fun ⟨hyS, hy_supp⟩ => ⟨⟨hyS, ?_⟩, hy_supp⟩⟩
      rw [← hc₀_iff]
      intro hyc₀
      exact hy_supp ((mem_support_iff_exists_cycleFactorsFinset τ y).2 ⟨c₀, hc₀_mem, hyc₀⟩)
    have h_card_cf := Finset.card_erase_add_one hc₀_in_S
    rw [h_cf, h_fp]
    omega
  · have hx_fix : τ x = x := notMem_support.1 hx
    have hsc_x : ∀ y, τ.SameCycle x y ↔ y = x := by
      intro y
      refine ⟨?_, fun h => h ▸ Perm.SameCycle.rfl⟩
      rintro ⟨k, hk⟩
      exact hk.symm.trans (zpow_apply_eq_self_of_apply_eq_self hx_fix k)
    have h_cf : cfIn τ S' = cfIn τ S := by
      ext c
      simp only [cfIn, Finset.mem_filter]
      refine and_congr_right fun hc_mem => ⟨fun h y hy => ((hS' y).1 (h hy)).1, fun h y hy => ?_⟩
      rw [hS', hsc_x]
      refine ⟨h hy, ?_⟩
      rintro rfl
      exact hx ((mem_support_iff_exists_cycleFactorsFinset τ _).2 ⟨c, hc_mem, hy⟩)
    have hx_in_fp : x ∈ fpIn τ S := by
      simp only [fpIn, Finset.mem_filter]
      exact ⟨hxS, hx⟩
    have h_fp : fpIn τ S' = (fpIn τ S).erase x := by
      ext y
      simp only [fpIn, Finset.mem_filter, Finset.mem_erase, hS', hsc_x]
      tauto
    have h_card_fp := Finset.card_erase_add_one hx_in_fp
    rw [h_cf, h_fp]
    omega

private lemma loop_eq_cfIn_add_fpIn {n : ℕ} (τ : Perm (Fin n)) :
    ∀ (fuel : ℕ) (l : List (Fin n)) (acc : ℕ),
      l.length ≤ fuel →
      (∀ a ∈ l.toFinset, ∀ b, τ.SameCycle a b → b ∈ l.toFinset) →
      countCyclesExec.loop n τ fuel l acc =
        (cfIn τ l.toFinset).card + (fpIn τ l.toFinset).card + acc := by
  intro fuel
  induction fuel with
  | zero =>
    intro l acc hl _
    cases l with
    | nil =>
      simp only [countCyclesExec.loop, List.toFinset_nil, cfIn_fpIn_empty, zero_add]
    | cons x xs =>
      simp only [List.length_cons] at hl
      omega
  | succ fuel ih =>
    intro l acc hl h_closed
    cases l with
    | nil =>
      simp only [countCyclesExec.loop, List.toFinset_nil, cfIn_fpIn_empty, zero_add]
    | cons x xs =>
      simp only [countCyclesExec.loop]
      let p : Fin n → Bool :=
        fun y => !((List.range n).scanl (fun cur _ => τ cur) x).contains y
      change countCyclesExec.loop n τ fuel ((x :: xs).filter p) (acc + 1) =
        (cfIn τ (x :: xs).toFinset).card + (fpIn τ (x :: xs).toFinset).card + acc
      have hpx : p x = false := by
        rw [Bool.eq_false_iff, ne_eq, not_orbit_contains_iff, Classical.not_not]
      have h_filter_cons : (x :: xs).filter p = xs.filter p := by
        simp [List.filter, hpx]
      have hl' : ((x :: xs).filter p).length ≤ fuel := by
        rw [h_filter_cons]
        have h1 : (xs.filter p).length ≤ xs.length := List.length_filter_le p xs
        simp only [List.length_cons] at hl
        omega
      have hS' : ∀ y, y ∈ ((x :: xs).filter p).toFinset ↔
          y ∈ (x :: xs).toFinset ∧ ¬ τ.SameCycle x y := by
        intro y
        simp only [List.mem_toFinset, List.mem_filter, p, not_orbit_contains_iff]
      have h_closed' : ∀ a ∈ ((x :: xs).filter p).toFinset, ∀ b,
          τ.SameCycle a b → b ∈ ((x :: xs).filter p).toFinset := by
        intro a ha b hab
        rw [hS'] at ha ⊢
        refine ⟨h_closed a ha.1 b hab, fun hxb => ha.2 (hxb.trans hab.symm)⟩
      have hxS : x ∈ (x :: xs).toFinset := by
        simp
      have h_step := cfIn_fpIn_step τ (x :: xs).toFinset ((x :: xs).filter p).toFinset
        x hxS h_closed hS'
      rw [ih ((x :: xs).filter p) (acc + 1) hl' h_closed']
      omega

/-- **T2** (reflection bridge): the executable fuel-bounded cycle counter `countCyclesExec`
    computes the exact abstract cycle count `numCycles` for every `τ : Equiv.Perm (Fin n)`. -/
theorem countCyclesExec_eq_numCycles {n : ℕ} (τ : Equiv.Perm (Fin n)) :
    countCyclesExec n τ = numCycles τ := by
  classical
  unfold countCyclesExec
  have h_univ : (List.finRange n).toFinset = (Finset.univ : Finset (Fin n)) := by
    ext x
    simp
  have h_len : (List.finRange n).length ≤ n := by
    simp
  have h_closed : ∀ a ∈ (List.finRange n).toFinset, ∀ b,
      τ.SameCycle a b → b ∈ (List.finRange n).toFinset := by
    intro _ _ b _
    simp
  rw [loop_eq_cfIn_add_fpIn τ n (List.finRange n) 0 h_len h_closed, add_zero, h_univ,
    cfIn_fpIn_univ]

/-- **T3** (executable form, small `n`): `τ_rev` has `⌈n/2⌉` cycles, the identity has `n`. -/
theorem uniform_twist_countCycles_small :
    (countCyclesExec 1 Fin.rev, countCyclesExec 2 Fin.rev, countCyclesExec 3 Fin.rev,
     countCyclesExec 4 Fin.rev, countCyclesExec 5 Fin.rev, countCyclesExec 6 Fin.rev)
      = (1, 1, 2, 2, 3, 3) := by
  rfl

theorem untwisted_countCycles_small :
    (countCyclesExec 3 id, countCyclesExec 5 id) = (3, 5) := by
  rfl

/-- Figure-eight internal engine `(σ₁ σ₂⁻¹)² ∈ B₃` (0-indexed generators). -/
def figEightEngine : BraidWord 3 :=
  [⟨⟨0, by decide⟩, true⟩, ⟨⟨1, by decide⟩, false⟩,
   ⟨⟨0, by decide⟩, true⟩, ⟨⟨1, by decide⟩, false⟩]

/-- **T4**: a Möbius carrier (`m = 1`) fractures `4₁` (`k = 1`) into a 2-component link. -/
theorem figure_eight_mobius_fracture :
    (countCyclesExec 3 (traceTwistedRibbon figEightEngine 0),
     countCyclesExec 3 (traceTwistedRibbon figEightEngine 1)) = (1, 2) := by
  rfl

/-- Strand-level sanity check: `0 ↦ 1 ↦ 2 ↦ 0` (the 3-cycle `(1 2 3)` in 1-indexed notation). -/
theorem figEight_trace :
    (traceStrand figEightEngine 0, traceStrand figEightEngine 1,
     traceStrand figEightEngine 2) = (1, 2, 0) := by
  rfl

end RibbonEngine