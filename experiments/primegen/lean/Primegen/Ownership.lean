/-
§2 of the paper: ownership by smallest prime factor.

* `Rough p m`                  — `m` is `p`-rough (paper: `gcd (m, P_{<p}) = 1`)
* `theta_eq_image`             — Claim O1 (ownership): `Θ_p = p · A_p`
* `prime_of_rough_of_lt_sq`    — Claim O2 (phase separation)
* `sq_mem_theta`, `sq_le_of_mem_theta` — `min Θ_p = p²`
* `theta_disjoint`, `exists_unique_owner` — orthogonality: the streams partition the composites
* `causality`                  — Claim C1 (no lookahead)
-/
import Mathlib

namespace Primegen

/-! ### Roughness -/

/-- `Rough p m` : no prime `< p` divides `m`.  This is the paper's `gcd (m, P_{<p}) = 1`,
stated in the bounded form that makes it decidable. -/
def Rough (p m : ℕ) : Prop := ∀ q < p, Nat.Prime q → ¬ q ∣ m

instance (p m : ℕ) : Decidable (Rough p m) :=
  decidable_of_iff (∀ q ∈ Finset.range p, Nat.Prime q → ¬ q ∣ m)
    (by simp only [Finset.mem_range]; exact Iff.rfl)

theorem rough_iff {p m : ℕ} : Rough p m ↔ ∀ q, Nat.Prime q → q ∣ m → p ≤ q := by
  constructor
  · intro h q hq hqm
    by_contra hlt
    exact h q (not_le.mp hlt) hq hqm
  · intro h q hqp hq hqm
    exact absurd (h q hq hqm) (not_le.mpr hqp)

theorem rough_self {p : ℕ} (hp : Nat.Prime p) : Rough p p := by
  intro q hqp hq hd
  have := (Nat.prime_dvd_prime_iff_eq hq hp).mp hd
  omega

theorem rough_of_prime_ge {p q : ℕ} (hq : Nat.Prime q) (hpq : p ≤ q) : Rough p q := by
  intro r hrp hr hd
  have := (Nat.prime_dvd_prime_iff_eq hr hq).mp hd
  omega

/-- `minFac m * minFac m ≤ m` for composite `m`.  Proved from scratch so that the
development does not depend on the exact spelling of the Mathlib lemma. -/
theorem minFac_mul_self_le {m : ℕ} (h1 : 1 < m) (hc : ¬ Nat.Prime m) :
    m.minFac * m.minFac ≤ m := by
  have hp : Nat.Prime m.minFac := Nat.minFac_prime (by omega)
  obtain ⟨a, ha⟩ := Nat.minFac_dvd m
  have ha0 : a ≠ 0 := by
    intro h; rw [h, Nat.mul_zero] at ha; omega
  have ha1 : a ≠ 1 := by
    intro h
    rw [h, Nat.mul_one] at ha
    exact hc (by rw [ha]; exact hp)
  have hadvd : a ∣ m := ⟨m.minFac, by rw [Nat.mul_comm]; exact ha⟩
  have hple : m.minFac ≤ a := by
    have h2 : Nat.Prime a.minFac := Nat.minFac_prime ha1
    have h3 : a.minFac ∣ m := (Nat.minFac_dvd a).trans hadvd
    exact le_trans (Nat.minFac_le_of_dvd h2.two_le h3) (Nat.minFac_le (by omega))
  calc m.minFac * m.minFac ≤ m.minFac * a := Nat.mul_le_mul le_rfl hple
    _ = m := ha.symm

/-! ### The partition `Θ_p` -/

/-- `Θ_p` : the composites owned by `p`, i.e. those whose smallest prime factor is `p`. -/
def Theta (p : ℕ) : Set ℕ := {m | 1 < m ∧ ¬ Nat.Prime m ∧ m.minFac = p}

/-- `A_p` : the multiplier set of the stream of `p`. -/
def Mult (p : ℕ) : Set ℕ := {a | p ≤ a ∧ Rough p a}

/-- **Claim O1 (ownership).**  `Θ_p = p · A_p`, with `a ↦ p * a` the bijection. -/
theorem theta_eq_image {p : ℕ} (hp : Nat.Prime p) :
    Theta p = (fun a => p * a) '' Mult p := by
  ext m
  constructor
  · rintro ⟨hm1, hmc, hmin⟩
    have hpd : p ∣ m := by rw [← hmin]; exact Nat.minFac_dvd m
    have hm : p * (m / p) = m := Nat.mul_div_cancel' hpd
    have hsq : m.minFac * m.minFac ≤ m := minFac_mul_self_le hm1 hmc
    have hpp : p * p ≤ p * (m / p) := by
      rw [hm, ← hmin]; exact hsq
    have hple : p ≤ m / p := Nat.le_of_mul_le_mul_left hpp hp.pos
    have hdd : (m / p) ∣ m := ⟨p, by rw [Nat.mul_comm]; exact hm.symm⟩
    refine ⟨m / p, ⟨hple, ?_⟩, hm⟩
    rw [rough_iff]
    intro q hq hqa
    rw [← hmin]
    exact Nat.minFac_le_of_dvd hq.two_le (hqa.trans hdd)
  · rintro ⟨a, ⟨hpa, hra⟩, rfl⟩
    -- `rfl` leaves the goal as `(fun a => p * a) a ∈ Theta p`; `omega` treats that
    -- application as an atom distinct from `p * a`, so beta-reduce it first.
    show p * a ∈ Theta p
    have hp2 : 2 ≤ p := hp.two_le
    have ha2 : 2 ≤ a := le_trans hp2 hpa
    have h4 : 1 < p * a := by
      have : 2 * 2 ≤ p * a := Nat.mul_le_mul hp2 ha2
      omega
    refine ⟨h4, ?_, ?_⟩
    · intro hpr
      rcases hpr.eq_one_or_self_of_dvd p ⟨a, rfl⟩ with h | h
      · omega
      · have : p * 2 ≤ p * a := Nat.mul_le_mul le_rfl ha2
        omega
    · have hle : (p * a).minFac ≤ p := Nat.minFac_le_of_dvd hp2 ⟨a, rfl⟩
      have hq : Nat.Prime (p * a).minFac := Nat.minFac_prime (by omega)
      have hge : p ≤ (p * a).minFac := by
        rcases (Nat.Prime.dvd_mul hq).mp (Nat.minFac_dvd (p * a)) with h | h
        · exact le_of_eq ((Nat.prime_dvd_prime_iff_eq hq hp).mp h).symm
        · exact rough_iff.mp hra _ hq h
      omega

/-- **Claim O2 (phase separation).**  A `p`-rough number below `p²` is prime: the multipliers of
`p` below `p²` are exactly the primes in `[p, p²)`. -/
theorem prime_of_rough_of_lt_sq {p a : ℕ} (h1 : 1 < a) (hra : Rough p a) (hlt : a < p * p) :
    Nat.Prime a := by
  by_contra hc
  have hsq : a.minFac * a.minFac ≤ a := minFac_mul_self_le h1 hc
  have hq : Nat.Prime a.minFac := Nat.minFac_prime (by omega)
  have hge : p ≤ a.minFac := rough_iff.mp hra _ hq (Nat.minFac_dvd a)
  have : p * p ≤ a.minFac * a.minFac := Nat.mul_le_mul hge hge
  omega

/-- The head of the stream of `p` is `p²` — it really is owned by `p` … -/
theorem sq_mem_theta {p : ℕ} (hp : Nat.Prime p) : p * p ∈ Theta p := by
  rw [theta_eq_image hp]
  exact ⟨p, ⟨le_rfl, rough_self hp⟩, rfl⟩

/-- … and nothing smaller is (`min Θ_p = p²`, always, not just typically). -/
theorem sq_le_of_mem_theta {p m : ℕ} (hp : Nat.Prime p) (hm : m ∈ Theta p) : p * p ≤ m := by
  rw [theta_eq_image hp] at hm
  obtain ⟨a, ⟨hpa, -⟩, rfl⟩ := hm
  exact Nat.mul_le_mul le_rfl hpa

/-- **Orthogonality.**  distinct primes own disjoint sets of composites. -/
theorem theta_disjoint {p q : ℕ} (hpq : p ≠ q) : Disjoint (Theta p) (Theta q) := by
  rw [Set.disjoint_left]
  rintro m ⟨-, -, hp⟩ ⟨-, -, hq⟩
  exact hpq (hp.symm.trans hq)

/-- **The partition.**  every composite has exactly one owner. -/
theorem exists_unique_owner {m : ℕ} (h1 : 1 < m) (hc : ¬ Nat.Prime m) :
    ∃! p, Nat.Prime p ∧ m ∈ Theta p := by
  refine ⟨m.minFac, ⟨Nat.minFac_prime (by omega), h1, hc, rfl⟩, ?_⟩
  rintro p ⟨-, -, -, hp⟩
  exact hp.symm

/-- **Claim C1 (causality).**  If `n = p·a` is owned by `p` then the next `p`-rough multiplier
lies strictly below `n`: no step of the generator ever needs an integer `≥ n`. -/
theorem causality {p a : ℕ} (hp : Nat.Prime p) (h1 : 1 < a) (hpa : p ≤ a) :
    ∃ a', a < a' ∧ Rough p a' ∧ a' < p * a := by
  rcases eq_or_lt_of_le hp.two_le with h2 | h2
  · refine ⟨a + 1, by omega, ?_, ?_⟩
    · intro q hqp hq _
      have := hq.two_le
      omega
    · have h : 2 * a = p * a := by rw [h2]
      omega
  · obtain ⟨q, hq, haq, hq2⟩ := Nat.exists_prime_lt_and_le_two_mul a (by omega)
    refine ⟨q, haq, rough_of_prime_ge hq (by omega), ?_⟩
    have hlt : 2 * a < p * a := mul_lt_mul_of_pos_right h2 (by omega)
    omega

/-- The multiplier of a composite is at most half of it (the trivial half of C1). -/
theorem mult_le_half {p a : ℕ} (hp : Nat.Prime p) : 2 * a ≤ p * a :=
  Nat.mul_le_mul hp.two_le le_rfl

end Primegen