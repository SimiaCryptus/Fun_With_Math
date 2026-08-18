/-
§4 of the paper: Algorithm B, the wheeled streaming generator.

* `Claims W p m`      — "the stream of `p`, multipliers relaxed to the `W`-wheel, claims `m`"
* `coverage`          — Claim B1
* `not_prime_of_claims`, `sq_le_of_claims` — soundness and the `≥ p²` head bound (Claim B2 parts)
* `prime_iff_forall_not_claims` — Claim B3 in set form
* `claims_iff`, `mem_claimants` — Claim B5: exact duplicate accounting of §4.5
* `Inv`, `emit_iff`, `inv_step`, `inv_init` — the queue invariant and one turn of the loop
-/
import Mathlib
import Primegen.Ownership
import Primegen.Wheel

namespace Primegen
namespace AlgB

open Wheel

/-- A live stream record: the prime `p` and its current multiplier `a` (two words: Claim B4). -/
structure Rec where
  p : ℕ
  a : ℕ
deriving Repr, DecidableEq, Inhabited

/-- The key of a record. -/
def Rec.val (r : Rec) : ℕ := r.p * r.a

/-- The stream of `p` (multiplier set relaxed to the `W`-coprimes) claims `m`. -/
def Claims (W p m : ℕ) : Prop :=
  Nat.Prime p ∧ ¬ p ∣ W ∧ ∃ a, Nat.Coprime a W ∧ p ≤ a ∧ m = p * a

theorem not_dvd_of_coprime {W m p : ℕ} (hp : Nat.Prime p) (hpm : p ∣ m)
    (hcop : Nat.Coprime m W) : ¬ p ∣ W := by
  intro hpW
  have hg : Nat.gcd m W = 1 := hcop
  have h : p ∣ Nat.gcd m W := Nat.dvd_gcd hpm hpW
  rw [hg] at h
  exact hp.ne_one (Nat.dvd_one.mp h)

/-- **Claim B1 (coverage).**  A `W`-coprime composite is a value of the stream of its smallest
prime factor, and that prime does not divide `W` (i.e. it exceeds `p_w`). -/
theorem coverage {W m : ℕ} (h1 : 1 < m) (hc : ¬ Nat.Prime m) (hcop : Nat.Coprime m W) :
    Claims W m.minFac m := by
  have hp : Nat.Prime m.minFac := Nat.minFac_prime (by omega)
  have hpd : m.minFac ∣ m := Nat.minFac_dvd m
  have hm : m.minFac * (m / m.minFac) = m := Nat.mul_div_cancel' hpd
  have hdd : (m / m.minFac) ∣ m := ⟨m.minFac, by rw [Nat.mul_comm]; exact hm.symm⟩
  refine ⟨hp, not_dvd_of_coprime hp hpd hcop, m / m.minFac,
    Nat.Coprime.coprime_dvd_left hdd hcop, ?_, hm.symm⟩
  have hsq : m.minFac * m.minFac ≤ m := minFac_mul_self_le h1 hc
  have h2 : m.minFac * m.minFac ≤ m.minFac * (m / m.minFac) := by rw [hm]; exact hsq
  exact Nat.le_of_mul_le_mul_left h2 hp.pos

/-- Soundness: every key of every stream is composite, so a prime candidate is never claimed. -/
theorem not_prime_of_claims {W p m : ℕ} (h : Claims W p m) : ¬ Nat.Prime m := by
  obtain ⟨hp, -, a, -, hpa, rfl⟩ := h
  intro hpr
  have h2 : 2 ≤ p := hp.two_le
  have ha : 2 ≤ a := le_trans h2 hpa
  rcases hpr.eq_one_or_self_of_dvd p ⟨a, rfl⟩ with h | h
  · omega
  · have : p * 2 ≤ p * a := Nat.mul_le_mul le_rfl ha
    omega

/-- Deferred activation is safe: a stream has nothing to say below `p²`. -/
theorem sq_le_of_claims {W p m : ℕ} (h : Claims W p m) : p * p ≤ m := by
  obtain ⟨-, -, a, -, hpa, rfl⟩ := h
  exact Nat.mul_le_mul le_rfl hpa

/-- **Claim B3, set form.**  A `W`-coprime candidate is prime iff no stream claims it. -/
theorem prime_iff_forall_not_claims {W n : ℕ} (h1 : 1 < n) (hcop : Nat.Coprime n W) :
    Nat.Prime n ↔ ∀ p, ¬ Claims W p n := by
  refine ⟨fun hn p hcl => not_prime_of_claims hcl hn, fun h => ?_⟩
  by_contra hc
  exact h _ (coverage h1 hc hcop)

/-! ### §4.5 — the honest cost: who claims `m` -/

/-- The streams claiming a `W`-coprime composite `m` are exactly its prime factors `≤ √m`; the
factors `≤ p_w` are excluded automatically because `m` is `W`-coprime.  This is the identity the
`ln ln` estimate of §4.5 sums. -/
theorem claims_iff {W p m : ℕ} (hm : 0 < m) (hcop : Nat.Coprime m W) :
    Claims W p m ↔ (p ∈ m.primeFactors ∧ p * p ≤ m) := by
  constructor
  · intro h
    obtain ⟨hp, -, a, -, hpa, rfl⟩ := h
    exact ⟨Nat.mem_primeFactors.mpr ⟨hp, ⟨a, rfl⟩, by omega⟩, Nat.mul_le_mul le_rfl hpa⟩
  · rintro ⟨hmem, hsq⟩
    obtain ⟨hp, hpd, hm0⟩ := Nat.mem_primeFactors.mp hmem
    have hm' : p * (m / p) = m := Nat.mul_div_cancel' hpd
    have hdd : (m / p) ∣ m := ⟨p, by rw [Nat.mul_comm]; exact hm'.symm⟩
    refine ⟨hp, not_dvd_of_coprime hp hpd hcop, m / p,
      Nat.Coprime.coprime_dvd_left hdd hcop, ?_, hm'.symm⟩
    have h2 : p * p ≤ p * (m / p) := by rw [hm']; exact hsq
    exact Nat.le_of_mul_le_mul_left h2 hp.pos

/-- The (finite) multiset of pops charged to `m`: `ω_{>p_w, ≤ √m}(m)` records. -/
def claimants (m : ℕ) : Finset ℕ := m.primeFactors.filter (fun p => p * p ≤ m)

theorem mem_claimants {W m p : ℕ} (hm : 0 < m) (hcop : Nat.Coprime m W) :
    p ∈ claimants m ↔ Claims W p m := by
  rw [claims_iff (W := W) hm hcop, claimants, Finset.mem_filter]

/-! ### The queue invariant -/

/-- The invariant maintained by the loop of §4.3 at candidate `n`. -/
structure Inv (W n : ℕ) (rs : List Rec) : Prop where
  prime    : ∀ r ∈ rs, Nat.Prime r.p
  notDvd   : ∀ r ∈ rs, ¬ r.p ∣ W
  cop      : ∀ r ∈ rs, Nat.Coprime r.a W
  le       : ∀ r ∈ rs, r.p ≤ r.a
  /-- no key precedes the scan (Claim B2). -/
  ahead    : ∀ r ∈ rs, n ≤ r.val
  /-- each cursor is the *least* admissible multiplier with key `≥ n`. -/
  minimal  : ∀ r ∈ rs, ∀ b, Nat.Coprime b W → r.p ≤ b → n ≤ r.p * b → r.a ≤ b
  /-- every stream whose head has been reached is live (deferred activation). -/
  complete : ∀ p, Nat.Prime p → ¬ p ∣ W → p * p ≤ n → ∃ r ∈ rs, r.p = p

theorem coprime_val {W : ℕ} {r : Rec} (hp : Nat.Prime r.p) (hnd : ¬ r.p ∣ W)
    (hca : Nat.Coprime r.a W) : Nat.Coprime r.val W :=
  Nat.Coprime.mul ((Nat.Prime.coprime_iff_not_dvd hp).mpr hnd) hca

/-- **Claim B3 (kernel).**  Under the invariant, the loop's decision at `n` is correct: emit `n`
exactly when no record's key equals `n`.  Note the loop must drain *all* records with key `n`
— duplicates are expected — but the decision only depends on existence. -/
theorem emit_iff {W n : ℕ} {rs : List Rec} (h1 : 1 < n) (hcop : Nat.Coprime n W)
    (inv : Inv W n rs) : Nat.Prime n ↔ ∀ r ∈ rs, r.val ≠ n := by
  constructor
  · intro hn r hr hval
    exact not_prime_of_claims (W := W) (p := r.p)
      ⟨inv.prime r hr, inv.notDvd r hr, r.a, inv.cop r hr, inv.le r hr, hval.symm⟩ hn
  · intro h
    by_contra hc
    obtain ⟨hp, hnd, a, hca, hpa, hna⟩ := coverage h1 hc hcop
    have hsq : n.minFac * n.minFac ≤ n := by
      calc n.minFac * n.minFac ≤ n.minFac * a := Nat.mul_le_mul le_rfl hpa
        _ = n := hna.symm
    obtain ⟨r, hr, hrp⟩ := inv.complete _ hp hnd hsq
    have hb : r.a ≤ a := by
      refine inv.minimal r hr a hca (by rw [hrp]; exact hpa) ?_
      rw [hrp]; exact hna.le
    have hle : r.val ≤ n := by
      show r.p * r.a ≤ n
      rw [hrp]
      have h2 : n.minFac * r.a ≤ n.minFac * a := Nat.mul_le_mul le_rfl hb
      omega
    exact h r hr (le_antisymm hle (inv.ahead r hr))

/-! ### One turn of the loop -/

/-- Advance a record if it is claiming the current candidate: `a += step[a % W]`. -/
def bump (W n : ℕ) (r : Rec) : Rec :=
  if r.val = n then { p := r.p, a := nextCoprime W r.a } else r

def advance (W n : ℕ) (rs : List Rec) : List Rec := rs.map (bump W n)

/-- Deferred activation: the streams whose head `p*p` is the new candidate. -/
def activate (n : ℕ) (ps : List ℕ) : List Rec :=
  (ps.filter (fun p => decide (p * p = n))).map (fun p => ({ p := p, a := p } : Rec))

def stepRecs (W n n' : ℕ) (ps : List ℕ) (rs : List Rec) : List Rec :=
  activate n' ps ++ advance W n rs

theorem bump_pos {W n : ℕ} {r : Rec} (h : r.val = n) :
    bump W n r = { p := r.p, a := nextCoprime W r.a } := by simp [bump, h]

theorem bump_neg {W n : ℕ} {r : Rec} (h : r.val ≠ n) : bump W n r = r := by simp [bump, h]

@[simp] theorem bump_p (W n : ℕ) (r : Rec) : (bump W n r).p = r.p := by
  rcases eq_or_ne r.val n with h | h
  · rw [bump_pos h]
  · rw [bump_neg h]

/-- The initial state is valid: below the first head `p_{w+1}²` no stream is needed, so the loop
starts with an empty queue and no pre-pass — there is no global limit anywhere. -/
theorem inv_init {W n : ℕ} (h : ∀ p, Nat.Prime p → ¬ p ∣ W → n < p * p) : Inv W n [] where
  prime := by simp
  notDvd := by simp
  cop := by simp
  le := by simp
  ahead := by simp
  minimal := by simp
  complete := fun p hp hnd hsq => absurd hsq (not_le.mpr (h p hp hnd))

/-- **Invariant preservation.**  One turn of the loop of §4.3 — drain every record whose key is
`n`, advance it by one wheel step, then activate the streams whose head is the next candidate —
re-establishes the invariant at the next candidate.  Together with `emit_iff` and `inv_init`
this is the correctness core of Algorithm B; the remaining step (the outer induction stating
that the emitted list is exactly the primes below `n`) is left for future work. -/
theorem inv_step {W n : ℕ} {rs : List Rec} {ps : List ℕ} (hW : 0 < W)
    (inv : Inv W n rs)
    (hpsP : ∀ p ∈ ps, Nat.Prime p ∧ ¬ p ∣ W)
    (hact : ∀ p, Nat.Prime p → ¬ p ∣ W → p * p = nextCoprime W n → p ∈ ps) :
    Inv W (nextCoprime W n) (stepRecs W n (nextCoprime W n) ps rs) := by
  have hnn' : n < nextCoprime W n := lt_nextCoprime hW n
  have hmin' : ∀ z, n < z → Nat.Coprime z W → nextCoprime W n ≤ z :=
    fun z hz hc => nextCoprime_le hW hz hc
  have hmem : ∀ r' ∈ stepRecs W n (nextCoprime W n) ps rs,
      (∃ p, p ∈ ps ∧ p * p = nextCoprime W n ∧ r' = ⟨p, p⟩) ∨
      (∃ r ∈ rs, r' = bump W n r) := by
    intro r' hr'
    replace hr' : r' ∈ activate (nextCoprime W n) ps ++ advance W n rs := hr'
    rcases List.mem_append.mp hr' with h | h
    · left
      replace h : r' ∈ (ps.filter (fun p => decide (p * p = nextCoprime W n))).map
          (fun p => ({ p := p, a := p } : Rec)) := h
      rcases List.mem_map.mp h with ⟨p, hp, he⟩
      rcases List.mem_filter.mp hp with ⟨hps, hd⟩
      refine ⟨p, hps, ?_, he.symm⟩
      simpa using hd
    · right
      replace h : r' ∈ rs.map (bump W n) := h
      rcases List.mem_map.mp h with ⟨r, hr, he⟩
      exact ⟨r, hr, he.symm⟩
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  · -- prime
    intro r' hr'
    rcases hmem r' hr' with ⟨p, hps, -, rfl⟩ | ⟨r, hr, rfl⟩
    · exact (hpsP p hps).1
    · rw [bump_p]; exact inv.prime r hr
  · -- notDvd
    intro r' hr'
    rcases hmem r' hr' with ⟨p, hps, -, rfl⟩ | ⟨r, hr, rfl⟩
    · exact (hpsP p hps).2
    · rw [bump_p]; exact inv.notDvd r hr
  · -- cop
    intro r' hr'
    rcases hmem r' hr' with ⟨p, hps, -, rfl⟩ | ⟨r, hr, rfl⟩
    · exact (Nat.Prime.coprime_iff_not_dvd (hpsP p hps).1).mpr (hpsP p hps).2
    · rcases eq_or_ne r.val n with hv | hv
      · simp only [bump_pos hv]
        exact coprime_nextCoprime hW r.a
      · simp only [bump_neg hv]
        exact inv.cop r hr
  · -- le
    intro r' hr'
    rcases hmem r' hr' with ⟨p, hps, -, rfl⟩ | ⟨r, hr, rfl⟩
    · exact le_rfl
    · rcases eq_or_ne r.val n with hv | hv
      · simp only [bump_pos hv]
        exact le_trans (inv.le r hr) (le_of_lt (lt_nextCoprime hW r.a))
      · simp only [bump_neg hv]
        exact inv.le r hr
  · -- ahead (Claim B2)
    intro r' hr'
    rcases hmem r' hr' with ⟨p, hps, hpp, rfl⟩ | ⟨r, hr, rfl⟩
    · show nextCoprime W n ≤ p * p
      omega
    · rcases eq_or_ne r.val n with hv | hv
      · simp only [bump_pos hv, Rec.val]
        refine hmin' _ ?_ ?_
        · have h1 : r.p * r.a < r.p * nextCoprime W r.a :=
            mul_lt_mul_of_pos_left (lt_nextCoprime hW r.a) (inv.prime r hr).pos
          have h2 : r.p * r.a = n := hv
          omega
        · exact Nat.Coprime.mul
            ((Nat.Prime.coprime_iff_not_dvd (inv.prime r hr)).mpr (inv.notDvd r hr))
            (coprime_nextCoprime hW r.a)
      · simp only [bump_neg hv]
        refine hmin' _ (lt_of_le_of_ne (inv.ahead r hr) hv.symm) ?_
        exact coprime_val (inv.prime r hr) (inv.notDvd r hr) (inv.cop r hr)
  · -- minimal
    intro r' hr'
    rcases hmem r' hr' with ⟨p, hps, hpp, rfl⟩ | ⟨r, hr, rfl⟩
    · intro b _ hb _
      exact hb
    · rcases eq_or_ne r.val n with hv | hv
      · simp only [bump_pos hv]
        intro b hcb hpb hnb
        have h2 : r.p * r.a = n := hv
        have h3 : r.p * r.a < r.p * b := by omega
        exact nextCoprime_le hW (lt_of_mul_lt_mul_left h3 (Nat.zero_le _)) hcb
      · simp only [bump_neg hv]
        intro b hcb hpb hnb
        exact inv.minimal r hr b hcb hpb (le_trans (le_of_lt hnn') hnb)
  · -- complete (deferred activation fires exactly at `p²`)
    intro p hp hnd hsq
    rcases Nat.lt_or_ge n (p * p) with hlt | hge
    · have hcp : Nat.Coprime p W := (Nat.Prime.coprime_iff_not_dvd hp).mpr hnd
      have hpp : p * p = nextCoprime W n :=
        le_antisymm hsq (hmin' _ hlt (Nat.Coprime.mul hcp hcp))
      refine ⟨⟨p, p⟩, ?_, rfl⟩
      show (⟨p, p⟩ : Rec) ∈ activate (nextCoprime W n) ps ++ advance W n rs
      refine List.mem_append_left _ ?_
      simp only [activate, List.mem_map, List.mem_filter, decide_eq_true_eq]
      exact ⟨p, ⟨hact p hp hnd hpp, hpp⟩, rfl⟩
    · obtain ⟨r, hr, hrp⟩ := inv.complete p hp hnd hge
      refine ⟨bump W n r, ?_, ?_⟩
      · show bump W n r ∈ activate (nextCoprime W n) ps ++ advance W n rs
        refine List.mem_append_right _ ?_
        simp only [advance, List.mem_map]
        exact ⟨r, hr, rfl⟩
      · rw [bump_p]; exact hrp

end AlgB
end Primegen