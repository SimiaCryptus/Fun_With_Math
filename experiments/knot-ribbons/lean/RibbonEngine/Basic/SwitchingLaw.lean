import RibbonEngine.Basic.CycleCalculus
import Mathlib.GroupTheory.Perm.Cycle.Factors

/-!
# The Fundamental Switching Law (`theory.md` §6, **T5**)

Right-multiplying any permutation `τ : Equiv.Perm (Fin n)` by an adjacent transposition `g.toPerm`
changes the total cycle count `numCycles` by exactly `±1`:
* If `g.leftStrand` and `g.rightStrand` belong to the same cycle of `τ`, multiplying by `g.toPerm`
  splits that cycle in two (`numCycles (τ * g.toPerm) = numCycles τ + 1`).
* If they belong to disjoint cycles of `τ`, multiplying by `g.toPerm` merges those two cycles into
  one (`numCycles τ = numCycles (τ * g.toPerm) + 1`).
-/

namespace RibbonEngine

open Equiv Perm


private lemma numCycles_add_support_card {n : ℕ} (τ : Perm (Fin n)) :
    numCycles τ + τ.support.card = n + τ.cycleFactorsFinset.card := by
  have h_card : τ.cycleType.card = τ.cycleFactorsFinset.card := by
    rw [cycleType_def, Multiset.card_map, Finset.card_def]
  have h_supp : τ.support.card ≤ Fintype.card (Fin n) := Finset.card_le_univ _
  have h_fintype : Fintype.card (Fin n) = n := Fintype.card_fin n
  unfold numCycles
  omega





private lemma not_sameCycle_swap_mul_of_sameCycle {n : ℕ} {p : Perm (Fin n)} {x y : Fin n}
    (hxy : x ≠ y) (hsc : p.SameCycle x y) :
    ¬ (swap x y * p).SameCycle x y := by
  have h_reach : ∃ m : ℕ, 0 < m ∧ (p ^ m) x = y := by
    obtain ⟨m, hm⟩ := (sameCycle_iff_exists_nat_pow p x y).1 hsc
    refine ⟨m, ?_, hm⟩
    rcases Nat.eq_zero_or_pos m with rfl | hm_pos
    · exfalso; exact hxy (by simpa using hm)
    · exact hm_pos
  let k₀ := Nat.find h_reach
  have hk₀_spec := Nat.find_spec h_reach
  have hk₀_pos : 0 < k₀ := hk₀_spec.1
  have hk₀_eq : (p ^ k₀) x = y := hk₀_spec.2
  have h_ne_x : ∀ j : ℕ, 0 < j → j < k₀ → (p ^ j) x ≠ x := by
    intro j hj_pos hj_lt h_eq
    have h_sub : (p ^ (k₀ - j)) x = y := by
      have h_add : k₀ - j + j = k₀ := Nat.sub_add_cancel (le_of_lt hj_lt)
      calc (p ^ (k₀ - j)) x = (p ^ (k₀ - j)) ((p ^ j) x) := by rw [h_eq]
        _ = (p ^ (k₀ - j + j)) x := by rw [← mul_apply, ← pow_add]
        _ = (p ^ k₀) x := by rw [h_add]
        _ = y := hk₀_eq
    exact Nat.find_min h_reach (Nat.sub_lt hk₀_pos hj_pos) ⟨Nat.sub_pos_of_lt hj_lt, h_sub⟩
  have h_agree : ∀ j : ℕ, j < k₀ → ((swap x y * p) ^ j) x = (p ^ j) x := by
    intro j hj
    induction j with
    | zero => rfl
    | succ j ih =>
      have hj' : j < k₀ := Nat.lt_of_succ_lt hj
      have h_step : (p ^ (j + 1)) x = p ((p ^ j) x) := by rw [pow_succ', mul_apply]
      rw [pow_succ', mul_apply, ih hj', mul_apply, ← h_step]
      exact swap_apply_of_ne_of_ne (h_ne_x (j + 1) (Nat.succ_pos j) hj)
        (fun h_eq => Nat.find_min h_reach hj ⟨Nat.succ_pos j, h_eq⟩)
  have h_ret : ((swap x y * p) ^ k₀) x = x := by
    rcases eq_k₀ : k₀ with _ | k'
    · rw [eq_k₀] at hk₀_pos; omega
    · have h_step : (p ^ (k' + 1)) x = p ((p ^ k') x) := by rw [pow_succ', mul_apply]
      rw [pow_succ', mul_apply, h_agree k' (by omega), mul_apply, ← h_step, ← eq_k₀,
        hk₀_eq, swap_apply_right]
  rw [sameCycle_iff_exists_nat_pow]
  rintro ⟨m, hm_eq⟩
  revert hm_eq
  induction m using Nat.strong_induction_on with
  | h m ih =>
    by_cases hm : m < k₀
    · rw [h_agree m hm]
      rcases Nat.eq_zero_or_pos m with rfl | hm_pos
      · simpa using hxy
      · exact fun h_eq => Nat.find_min h_reach hm ⟨hm_pos, h_eq⟩
    · have hm_ge : k₀ ≤ m := le_of_not_gt hm
      have h_sub_lt : m - k₀ < m := Nat.sub_lt (lt_of_lt_of_le hk₀_pos hm_ge) hk₀_pos
      have h_eq_sub : ((swap x y * p) ^ m) x = ((swap x y * p) ^ (m - k₀)) x := by
        calc ((swap x y * p) ^ m) x
            = ((swap x y * p) ^ (m - k₀ + k₀)) x := by rw [Nat.sub_add_cancel hm_ge]
          _ = ((swap x y * p) ^ (m - k₀)) (((swap x y * p) ^ k₀) x) := by rw [pow_add, mul_apply]
          _ = ((swap x y * p) ^ (m - k₀)) x := by rw [h_ret]
      rw [h_eq_sub]
      exact ih (m - k₀) h_sub_lt


/-- Left-multiplying `p` by `swap x y` when `x ≠ y` and `p.SameCycle x y` increases the
    number of cycles by 1. -/
private lemma numCycles_swap_mul_of_sameCycle {n : ℕ} {p : Perm (Fin n)} {x y : Fin n}
    (hxy : x ≠ y) (hsc : p.SameCycle x y) :
    numCycles (swap x y * p) = numCycles p + 1 := by
  have hx : x ∈ p.support := by
    rcases hsc with ⟨k, hk⟩
    by_contra hx
    rw [notMem_support] at hx
    have : (p ^ k) x = x := by
      exact zpow_apply_eq_self_of_apply_eq_self hx k
    exact hxy (this.symm.trans hk)
  obtain ⟨c, hc_mem, hxc⟩ := (mem_support_iff_exists_cycleFactorsFinset p x).1 hx
  have hyc : y ∈ c.support :=
    (mem_support_of_mem_cycleFactorsFinset_iff_sameCycle hc_mem hxc y).2 hsc
  have hy : y ∈ p.support :=
    (mem_support_iff_exists_cycleFactorsFinset p y).2 ⟨c, hc_mem, hyc⟩
  let q := swap x y * p
  have hnot_sc_q : ¬ q.SameCycle x y := not_sameCycle_swap_mul_of_sameCycle hxy hsc
  have h_supp_erase : (p.support.erase x).erase y = (q.support.erase x).erase y := by
    ext a
    simp only [Finset.mem_erase, mem_support, ne_eq]
    refine and_congr_right fun hay => and_congr_right fun hax => ?_
    change p a ≠ a ↔ swap x y (p a) ≠ a
    constructor
    · intro hpa hqa
      have h_swap := congrArg (swap x y) hqa
      rw [swap_apply_self, swap_apply_of_ne_of_ne hax hay] at h_swap
      exact hpa h_swap
    · intro hqa hpa
      apply hqa
      rw [hpa, swap_apply_of_ne_of_ne hax hay]
  have h_p_supp_card : ((p.support.erase x).erase y).card + 2 = p.support.card := by
    have hy_er : y ∈ p.support.erase x := Finset.mem_erase.2 ⟨hxy.symm, hy⟩
    have h1 := Finset.card_erase_add_one hy_er
    have h2 := Finset.card_erase_add_one hx
    omega
  have h_cf_iff : ∀ d : Perm (Fin n),
      d ∈ p.cycleFactorsFinset.erase c ↔
        d ∈ q.cycleFactorsFinset ∧ x ∉ d.support ∧ y ∉ d.support := by
    intro d
    rw [Finset.mem_erase]
    constructor
    · rintro ⟨hd_ne, hd_mem⟩
      have h_disj := Perm.Disjoint.disjoint_support
        (cycleFactorsFinset_pairwise_disjoint p hd_mem hc_mem hd_ne)
      have hxd : x ∉ d.support := Finset.disjoint_right.1 h_disj hxc
      have hyd : y ∉ d.support := Finset.disjoint_right.1 h_disj hyc
      refine ⟨mem_cycleFactorsFinset_iff.2 ⟨(mem_cycleFactorsFinset_iff.1 hd_mem).1, ?_⟩, hxd, hyd⟩
      intro a ha
      have hda := (mem_cycleFactorsFinset_iff.1 hd_mem).2 a ha
      have hda_mem : d a ∈ d.support := by
        rw [mem_support]
        intro h_eq
        exact mem_support.1 ha (d.injective h_eq)
      have hda_x : d a ≠ x := fun h => hxd (h ▸ hda_mem)
      have hda_y : d a ≠ y := fun h => hyd (h ▸ hda_mem)
      change d a = swap x y (p a)
      rw [← hda, swap_apply_of_ne_of_ne hda_x hda_y]
    · rintro ⟨hd_mem, hxd, hyd⟩
      have hd_p : d ∈ p.cycleFactorsFinset := by
        refine mem_cycleFactorsFinset_iff.2 ⟨(mem_cycleFactorsFinset_iff.1 hd_mem).1, ?_⟩
        intro a ha
        have hda : d a = swap x y (p a) := (mem_cycleFactorsFinset_iff.1 hd_mem).2 a ha
        have hda_mem : d a ∈ d.support := by
          rw [mem_support]
          intro h_eq
          exact mem_support.1 ha (d.injective h_eq)
        have hda_x : d a ≠ x := fun h => hxd (h ▸ hda_mem)
        have hda_y : d a ≠ y := fun h => hyd (h ▸ hda_mem)
        have h_swap := congrArg (swap x y) hda
        rwa [swap_apply_self, swap_apply_of_ne_of_ne hda_x hda_y] at h_swap
      refine ⟨fun h_eq => hxd (h_eq ▸ hxc), hd_p⟩
  have h_p_cf_card : (p.cycleFactorsFinset.erase c).card + 1 = p.cycleFactorsFinset.card :=
    Finset.card_erase_add_one hc_mem
  have hp_num := numCycles_add_support_card p
  have hq_num := numCycles_add_support_card q
  change numCycles q = numCycles p + 1
  by_cases hxq : x ∈ q.support <;> by_cases hyq : y ∈ q.support
  · obtain ⟨cx, hcx_mem, hxcx⟩ := (mem_support_iff_exists_cycleFactorsFinset q x).1 hxq
    obtain ⟨cy, hcy_mem, hycy⟩ := (mem_support_iff_exists_cycleFactorsFinset q y).1 hyq
    have hcx_ne_cy : cx ≠ cy := by
      intro h_eq
      subst h_eq
      exact hnot_sc_q
        ((mem_support_of_mem_cycleFactorsFinset_iff_sameCycle hcx_mem hxcx y).1 hycy)
    have h_cf_eq : p.cycleFactorsFinset.erase c = (q.cycleFactorsFinset.erase cx).erase cy := by
      ext d
      rw [h_cf_iff, Finset.mem_erase, Finset.mem_erase]
      refine ⟨fun ⟨hd, hxd, hyd⟩ => ⟨fun h => hyd (h ▸ hycy), fun h => hxd (h ▸ hxcx), hd⟩, ?_⟩
      rintro ⟨hne_cy, hne_cx, hd⟩
      have hxd : x ∉ d.support :=
        Finset.disjoint_right.1 (Perm.Disjoint.disjoint_support
          (cycleFactorsFinset_pairwise_disjoint q hd hcx_mem hne_cx)) hxcx
      have hyd : y ∉ d.support :=
        Finset.disjoint_right.1 (Perm.Disjoint.disjoint_support
          (cycleFactorsFinset_pairwise_disjoint q hd hcy_mem hne_cy)) hycy
      exact ⟨hd, hxd, hyd⟩
    have h_q_cf_card : ((q.cycleFactorsFinset.erase cx).erase cy).card + 2 =
        q.cycleFactorsFinset.card := by
      have hcy_er : cy ∈ q.cycleFactorsFinset.erase cx :=
        Finset.mem_erase.2 ⟨hcx_ne_cy.symm, hcy_mem⟩
      have h1 := Finset.card_erase_add_one hcy_er
      have h2 := Finset.card_erase_add_one hcx_mem
      omega
    have h_q_supp_card : ((q.support.erase x).erase y).card + 2 = q.support.card := by
      have hy_er : y ∈ q.support.erase x := Finset.mem_erase.2 ⟨hxy.symm, hyq⟩
      have h1 := Finset.card_erase_add_one hy_er
      have h2 := Finset.card_erase_add_one hxq
      omega
    rw [← h_cf_eq] at h_q_cf_card
    rw [← h_supp_erase] at h_q_supp_card
    omega
  · obtain ⟨cx, hcx_mem, hxcx⟩ := (mem_support_iff_exists_cycleFactorsFinset q x).1 hxq
    have h_cf_eq : p.cycleFactorsFinset.erase c = q.cycleFactorsFinset.erase cx := by
      ext d
      rw [h_cf_iff, Finset.mem_erase]
      refine ⟨fun ⟨hd, hxd, _⟩ => ⟨fun h => hxd (h ▸ hxcx), hd⟩, ?_⟩
      rintro ⟨hne_cx, hd⟩
      have hxd : x ∉ d.support :=
        Finset.disjoint_right.1 (Perm.Disjoint.disjoint_support
          (cycleFactorsFinset_pairwise_disjoint q hd hcx_mem hne_cx)) hxcx
      have hyd : y ∉ d.support := fun hyd =>
        hyq ((mem_support_iff_exists_cycleFactorsFinset q y).2 ⟨d, hd, hyd⟩)
      exact ⟨hd, hxd, hyd⟩
    have h_q_cf_card : (q.cycleFactorsFinset.erase cx).card + 1 = q.cycleFactorsFinset.card :=
      Finset.card_erase_add_one hcx_mem
    have h_q_supp_card : ((q.support.erase x).erase y).card + 1 = q.support.card := by
      rw [Finset.erase_eq_of_notMem (fun h => hyq (Finset.mem_of_mem_erase h))]
      exact Finset.card_erase_add_one hxq
    rw [← h_cf_eq] at h_q_cf_card
    rw [← h_supp_erase] at h_q_supp_card
    omega
  · obtain ⟨cy, hcy_mem, hycy⟩ := (mem_support_iff_exists_cycleFactorsFinset q y).1 hyq
    have h_cf_eq : p.cycleFactorsFinset.erase c = q.cycleFactorsFinset.erase cy := by
      ext d
      rw [h_cf_iff, Finset.mem_erase]
      refine ⟨fun ⟨hd, _, hyd⟩ => ⟨fun h => hyd (h ▸ hycy), hd⟩, ?_⟩
      rintro ⟨hne_cy, hd⟩
      have hxd : x ∉ d.support := fun hxd =>
        hxq ((mem_support_iff_exists_cycleFactorsFinset q x).2 ⟨d, hd, hxd⟩)
      have hyd : y ∉ d.support :=
        Finset.disjoint_right.1 (Perm.Disjoint.disjoint_support
          (cycleFactorsFinset_pairwise_disjoint q hd hcy_mem hne_cy)) hycy
      exact ⟨hd, hxd, hyd⟩
    have h_q_cf_card : (q.cycleFactorsFinset.erase cy).card + 1 = q.cycleFactorsFinset.card :=
      Finset.card_erase_add_one hcy_mem
    have h_q_supp_card : ((q.support.erase x).erase y).card + 1 = q.support.card := by
      rw [Finset.erase_eq_of_notMem hxq]
      exact Finset.card_erase_add_one hyq
    rw [← h_cf_eq] at h_q_cf_card
    rw [← h_supp_erase] at h_q_supp_card
    omega
  · have h_cf_eq : p.cycleFactorsFinset.erase c = q.cycleFactorsFinset := by
      ext d
      rw [h_cf_iff]
      refine ⟨fun h => h.1, fun hd => ⟨hd, ?_, ?_⟩⟩
      · exact fun hxd => hxq ((mem_support_iff_exists_cycleFactorsFinset q x).2 ⟨d, hd, hxd⟩)
      · exact fun hyd => hyq ((mem_support_iff_exists_cycleFactorsFinset q y).2 ⟨d, hd, hyd⟩)
    have h_q_supp_card : ((q.support.erase x).erase y).card = q.support.card := by
      rw [Finset.erase_eq_of_notMem hxq, Finset.erase_eq_of_notMem hyq]
    rw [h_cf_eq] at h_p_cf_card
    rw [h_supp_erase, h_q_supp_card] at h_p_supp_card
    omega

/-- Left-multiplying `p` by `swap x y` splits a cycle iff `p.SameCycle x y`, and merges two
    cycles otherwise (since `swap x y * (swap x y * p) = p` has `(swap x y * p).SameCycle x y`). -/
private lemma numCycles_swap_mul {n : ℕ} (p : Perm (Fin n)) {x y : Fin n} (hxy : x ≠ y) :
    numCycles (swap x y * p) = numCycles p + 1 ∨
      numCycles p = numCycles (swap x y * p) + 1 := by
  by_cases hsc : p.SameCycle x y
  · left
    exact numCycles_swap_mul_of_sameCycle hxy hsc
  · right
    have hsc' : (swap x y * p).SameCycle x y := by
      -- Since `¬ p.SameCycle x y`, `swap x y` links the orbits of `x` and `y` in `swap x y * p`.
      -- Alternatively, we use `SameCycle` under `swap_mul` directly:
      rcases Classical.em ((swap x y * p).SameCycle x y) with h | h
      · exact h
      · exfalso
        -- Let `c_x` be the cycle of `p` at `x` and `c_y` at `y`; in `swap x y * p` they merge!
        exact h (by
          obtain ⟨k, hk⟩ : ∃ k : ℤ, ((swap x y * p) ^ k) x = y := by
            -- `p` is finite-order on `Fin n`, so `∃ m > 0, (p ^ m) x = x`, and the first positive
            -- return of `x` to `{x, y}` under `p` is `x` (since `¬ p.SameCycle x y`).
            have h_fin : ∃ m : ℕ, 0 < m ∧ (p ^ m) x = x := by
              obtain ⟨m, hm_pos, hm⟩ := isOfFinOrder_iff_pow_eq_one.1 (isOfFinOrder_of_finite p)
              exact ⟨m, hm_pos, by rw [hm, one_apply]⟩
            let m₀ := Nat.find h_fin
            have hm₀_spec := Nat.find_spec h_fin
            have hm₀_pos : 0 < m₀ := hm₀_spec.1
            have hm₀_eq : (p ^ m₀) x = x := hm₀_spec.2
            have h_agree : ∀ j : ℕ, j < m₀ → ((swap x y * p) ^ j) x = (p ^ j) x := by
              intro j hj
              induction j with
              | zero => rfl
              | succ j ih =>
                have hj' : j < m₀ := Nat.lt_of_succ_lt hj
                have h_step : (p ^ (j + 1)) x = p ((p ^ j) x) := by rw [pow_succ', mul_apply]
                rw [pow_succ', mul_apply, ih hj', mul_apply, ← h_step]
                have h_ne_x : (p ^ (j + 1)) x ≠ x := by
                  intro h_eq
                  exact Nat.find_min h_fin hj ⟨Nat.succ_pos j, h_eq⟩
                have h_ne_y : (p ^ (j + 1)) x ≠ y := by
                  intro h_eq
                  exact hsc ⟨j + 1, by exact_mod_cast h_eq⟩
                exact swap_apply_of_ne_of_ne h_ne_x h_ne_y
            refine ⟨(m₀ : ℤ), ?_⟩
            rw [zpow_natCast]
            rcases eq_m₀ : m₀ with _ | m'
            · rw [eq_m₀] at hm₀_pos; omega
            · have h_step : (p ^ (m' + 1)) x = p ((p ^ m') x) := by rw [pow_succ', mul_apply]
              rw [pow_succ', mul_apply, h_agree m' (by omega),
                mul_apply, ← h_step, ← eq_m₀, hm₀_eq, swap_apply_left]
          exact ⟨k, hk⟩)
    have h_eq := numCycles_swap_mul_of_sameCycle hxy hsc'
    have h_inv : swap x y * (swap x y * p) = p := swap_mul_self_mul x y p
    rwa [h_inv] at h_eq

/-- Conjugate `τ * s` by `τ⁻¹` to turn right-multiplication by a transposition into
    left-multiplication while preserving `numCycles`. -/
private lemma numCycles_mul_swap {n : ℕ} (τ : Perm (Fin n)) {x y : Fin n} (hxy : x ≠ y) :
    numCycles (τ * swap x y) = numCycles τ + 1 ∨
      numCycles τ = numCycles (τ * swap x y) + 1 := by
  have h_conj : numCycles (τ * swap x y) = numCycles (swap x y * τ) := by
    have : τ * swap x y = τ * (swap x y * τ) * τ⁻¹ := by group
    rw [this]
    simp only [numCycles, cycleType_conj, card_support_conj]
  rw [h_conj]
  exact numCycles_swap_mul τ hxy

/-- **T5** (The Fundamental Switching Law, `theory.md` §6):
    right-multiplying by an adjacent transposition `g.toPerm` changes `numCycles` by `±1`. -/
theorem fundamental_switching_law {n : ℕ} (τ : Equiv.Perm (Fin n)) (g : ArtinGen n) :
    numCycles (τ * g.toPerm) = numCycles τ + 1 ∨
      numCycles τ = numCycles (τ * g.toPerm) + 1 := by
  have h_ne : g.leftStrand ≠ g.rightStrand := by
    intro h_eq
    have := congrArg Fin.val h_eq
    simp at this
  exact numCycles_mul_swap τ h_ne

/-! ## Kernel-checked instances of the law -/

/-- First positive Artin generator `σ₁` in `B₃` (0-indexed `idx = 0`). -/

def σ₁ : ArtinGen 3 := ⟨⟨0, by decide⟩, true⟩

/-- Second positive Artin generator `σ₂` in `B₃` (0-indexed `idx = 1`). -/
def σ₂ : ArtinGen 3 := ⟨⟨1, by decide⟩, true⟩

/-- Local reconnection `R₁⁺`: `4₁ ↦` Whitehead link (`k : 1 → 2`, `q3.md` Audit 3). -/
theorem figEight_reconnect_splits :
    countCyclesExec 3 (traceStrand (figEightEngine ++ [σ₁])) = 2 := by
  rfl

/-- A second reconnection on the other strand pair merges the components back (`k : 2 → 1`). -/
theorem figEight_reconnect_merges :
    countCyclesExec 3 (traceStrand (figEightEngine ++ [σ₂, σ₁])) = 1 := by
  rfl

/-- On the pure (trivial) braid, every single crossing merges two of the 3 rings. -/
theorem trivial_reconnect :
    (countCyclesExec 3 (traceStrand ([] : BraidWord 3)),
     countCyclesExec 3 (traceStrand [σ₁]),
     countCyclesExec 3 (traceStrand [σ₂])) = (3, 2, 2) := by
  rfl

end RibbonEngine