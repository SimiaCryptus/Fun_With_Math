/-
§3.1 of the paper: Algorithm A's stream tree, read from the largest prime factor.

`exists_unique_split` is Claim A1: every composite is `b·q` for exactly one pair `(b, q)` with
`b ≥ 2`, `q` prime and `P(b) ≤ q`.  That uniqueness *is* the one-touch property: it is the
machine-checkable certificate the paper says makes Algorithm A worth keeping.
-/
import Mathlib
import Primegen.Ownership

namespace Primegen
namespace AlgA

/-- `P(m)` : the largest prime factor of `m` (and `1` for `m ≤ 1`). -/
def maxPF (m : ℕ) : ℕ :=
  if h : m.primeFactors.Nonempty then m.primeFactors.max' h else 1

theorem primeFactors_nonempty {m : ℕ} (h1 : 1 < m) : m.primeFactors.Nonempty :=
  ⟨m.minFac, Nat.mem_primeFactors.mpr ⟨Nat.minFac_prime (by omega), Nat.minFac_dvd m, by omega⟩⟩

theorem maxPF_mem {m : ℕ} (h1 : 1 < m) : maxPF m ∈ m.primeFactors := by
  have h := primeFactors_nonempty h1
  unfold maxPF
  rw [dif_pos h]
  exact Finset.max'_mem _ _

theorem le_maxPF {m q : ℕ} (hq : q ∈ m.primeFactors) : q ≤ maxPF m := by
  have h : m.primeFactors.Nonempty := ⟨q, hq⟩
  unfold maxPF
  rw [dif_pos h]
  exact Finset.le_max' _ _ hq

theorem maxPF_prime {m : ℕ} (h1 : 1 < m) : Nat.Prime (maxPF m) :=
  (Nat.mem_primeFactors.mp (maxPF_mem h1)).1

theorem maxPF_dvd {m : ℕ} (h1 : 1 < m) : maxPF m ∣ m :=
  (Nat.mem_primeFactors.mp (maxPF_mem h1)).2.1

/-- If `m = b·q` with `q` prime and every prime factor of `b` at most `q`, then `q = P(m)`. -/
theorem eq_maxPF {m b q : ℕ} (h1 : 1 < m) (hb : 2 ≤ b) (hq : Nat.Prime q)
    (hbq : maxPF b ≤ q) (hm : m = b * q) : q = maxPF m := by
  have hm0 : m ≠ 0 := by omega
  have hqm : q ∈ m.primeFactors :=
    Nat.mem_primeFactors.mpr ⟨hq, ⟨b, by rw [hm]; ring⟩, hm0⟩
  obtain ⟨hrp, hrd, -⟩ := Nat.mem_primeFactors.mp (maxPF_mem h1)
  have hrd' : maxPF m ∣ b * q := by rw [← hm]; exact hrd
  refine le_antisymm (le_maxPF hqm) ?_
  rcases (Nat.Prime.dvd_mul hrp).mp hrd' with h | h
  · exact le_trans (le_maxPF (Nat.mem_primeFactors.mpr ⟨hrp, h, by omega⟩)) hbq
  · exact le_of_eq ((Nat.prime_dvd_prime_iff_eq hrp hq).mp h)

/-- **Claim A1 (stream tree).**  Every composite factors *uniquely* as `b·q` with `b ≥ 2`,
`q` prime and `P(b) ≤ q`; equivalently `{Σ_b}` partitions the composites, and Algorithm A pops
exactly one queue record per composite. -/
theorem exists_unique_split {m : ℕ} (h1 : 1 < m) (hc : ¬ Nat.Prime m) :
    ∃! bq : ℕ × ℕ, 2 ≤ bq.1 ∧ Nat.Prime bq.2 ∧ maxPF bq.1 ≤ bq.2 ∧ m = bq.1 * bq.2 := by
  have hm0 : m ≠ 0 := by omega
  have hq : Nat.Prime (maxPF m) := maxPF_prime h1
  have hqd : maxPF m ∣ m := maxPF_dvd h1
  have hqpos : 0 < maxPF m := hq.pos
  have hbq : (m / maxPF m) * maxPF m = m := Nat.div_mul_cancel hqd
  have hb0 : m / maxPF m ≠ 0 := by
    intro h; rw [h, Nat.zero_mul] at hbq; omega
  have hb1 : m / maxPF m ≠ 1 := by
    intro h
    rw [h, Nat.one_mul] at hbq
    exact hc (by rw [← hbq]; exact hq)
  -- `omega` handles `m / maxPF m` as an atom (the divisor is not a literal), so hand it
  -- positivity explicitly; `≠ 0`, `≠ 1` and `0 < ·` then give `2 ≤ ·`.
  have hbpos : 0 < m / maxPF m := Nat.pos_of_ne_zero hb0
  have hb2 : 2 ≤ m / maxPF m := by omega
  have hbdvd : (m / maxPF m) ∣ m := ⟨maxPF m, hbq.symm⟩
  have hmaxb : maxPF (m / maxPF m) ≤ maxPF m := by
    obtain ⟨hrp, hrd, -⟩ := Nat.mem_primeFactors.mp (maxPF_mem (by omega : 1 < m / maxPF m))
    exact le_maxPF (Nat.mem_primeFactors.mpr ⟨hrp, hrd.trans hbdvd, hm0⟩)
  refine ⟨(m / maxPF m, maxPF m), ⟨hb2, hq, hmaxb, hbq.symm⟩, ?_⟩
  rintro ⟨b', q'⟩ ⟨hb2', hq', hbq', hm'⟩
  have hq'eq : q' = maxPF m := eq_maxPF h1 hb2' hq' hbq' hm'
  have hb'eq : b' = m / maxPF m := by
    refine Nat.eq_of_mul_eq_mul_right hqpos ?_
    rw [hbq, ← hq'eq]
    exact hm'.symm
  simp [Prod.ext_iff, hb'eq, hq'eq]

/-- `Σ_b` of §3.1. -/
def Sigma (b : ℕ) : Set ℕ := {m | ∃ q, Nat.Prime q ∧ maxPF b ≤ q ∧ m = b * q}

/-- The streams of Algorithm A are pairwise disjoint: no composite is claimed twice. -/
theorem sigma_disjoint {b b' : ℕ} (hb : 2 ≤ b) (hb' : 2 ≤ b') (hne : b ≠ b') {m : ℕ}
    (h1 : 1 < m) (hc : ¬ Nat.Prime m) : ¬ (m ∈ Sigma b ∧ m ∈ Sigma b') := by
  rintro ⟨⟨q, hq, hbq, hm⟩, ⟨q', hq', hbq', hm'⟩⟩
  have h := (exists_unique_split h1 hc).unique
    (y₁ := (b, q)) (y₂ := (b', q')) ⟨hb, hq, hbq, hm⟩ ⟨hb', hq', hbq', hm'⟩
  exact hne (congrArg Prod.fst h)

end AlgA
end Primegen