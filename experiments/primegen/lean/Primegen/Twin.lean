/-
Companion formalisation for `experiments/primegen/twin_prime.md`.

The point of this file is the **period–window dichotomy** made machine-visible (§5, §8.3):

* `Window` / `WindowAt`        — Claim W, the *certified-side* hypothesis (§6);
* `infinite_twins_of_window`   — Claim TP7, `W ⟹ TPC`, whose entire primality content is
                                 `Primegen.prime_of_rough_of_lt_sq` (Claim O2).  The promotion
                                 recursion appears nowhere in the proof — that is the content
                                 of §8.3, and it is the reason this proof is two lines long;
* `pairLattice`, `T`           — the pair lattice `S_k^{(2)}` and its count `T_k` (§1, §3),
                                 with the prime-modulus case `|S^{(2)} mod p| = p - 2` proved
                                 (the `p - 2` of TP1);
* `deleted_tiles_ne`,
  `deleted_tile_offset`        — Claim TP8(a)/(b): no copy of a class is deleted twice, and
                                 the two deletions sit at a fixed offset `δ` independent of
                                 the class.

One thing the formalisation catches immediately: Claim W as literally stated ("for every
prime `p`") is *false at `p = 2`* — the window `[2, 4)` has no room for a pair at all
(`not_windowAt_two`).  `Window` therefore quantifies over `p > 2`, which is all TP7 needs.
-/
import Mathlib
import Primegen.Ownership

namespace Primegen
namespace Twin

/-! ### The pair lattice `S^{(2)}` (§1, §3) -/

/-- `S^{(2)} mod n` : the twin-candidate residues, `{ r < n : gcd (r (r+2), n) = 1 }`,
written as two coprimality conditions so that it is decidable and executable. -/
def pairLattice (n : ℕ) : Finset ℕ :=
  (Finset.range n).filter (fun r => Nat.gcd r n = 1 ∧ Nat.gcd (r + 2) n = 1)

/-- `T_k = |S_k^{(2)}|` of §1, as a function of the modulus. -/
def T (n : ℕ) : ℕ := (pairLattice n).card

theorem mem_pairLattice {n r : ℕ} :
    r ∈ pairLattice n ↔ r < n ∧ Nat.gcd r n = 1 ∧ Nat.gcd (r + 2) n = 1 := by
  simp only [pairLattice, Finset.mem_filter, Finset.mem_range]

/-- The prime-modulus case: exactly the two classes `0` and `p - 2` die.  This is the
"two strikes, never coinciding" of TP8(a) at the level of residues, and it is the source of
the multiplier `p - 2` in TP1 (`T_{k+1} = (p - 2) T_k`). -/
theorem pairLattice_prime {p : ℕ} (hp : Nat.Prime p) (hp3 : 3 ≤ p) :
    pairLattice p = ((Finset.range p).erase 0).erase (p - 2) := by
  have key : ∀ m : ℕ, ¬ p ∣ m → Nat.gcd m p = 1 := fun m hm =>
    Nat.Coprime.symm ((Nat.Prime.coprime_iff_not_dvd hp).mpr hm)
  ext r
  simp only [mem_pairLattice, Finset.mem_erase, Finset.mem_range]
  constructor
  · rintro ⟨hr, h0, h2⟩
    refine ⟨?_, ?_, hr⟩
    · rintro rfl
      have he : p - 2 + 2 = p := by omega
      rw [he, Nat.gcd_self] at h2
      omega
    · rintro rfl
      rw [Nat.gcd_zero_left] at h0
      omega
  · rintro ⟨hne2, hne0, hr⟩
    refine ⟨hr, key _ ?_, key _ ?_⟩
    · intro hd
      have hle := Nat.le_of_dvd (by omega) hd
      omega
    · rintro ⟨c, hc⟩
      have h2 : ¬ (2 ≤ c) := by
        intro h
        have hle : p * 2 ≤ p * c := Nat.mul_le_mul le_rfl h
        omega
      have h0 : c ≠ 0 := by
        rintro rfl
        rw [Nat.mul_zero] at hc
        omega
      have hc1 : c = 1 := by omega
      rw [hc1, Nat.mul_one] at hc
      omega

/-- `|S^{(2)} mod p| = p - 2` for every prime `p ≥ 3`: the per-stage factor of TP1. -/
theorem card_pairLattice_prime {p : ℕ} (hp : Nat.Prime p) (hp3 : 3 ≤ p) :
    T p = p - 2 := by
  have h0 : (0 : ℕ) ∈ Finset.range p := Finset.mem_range.mpr (by omega)
  have h1 : p - 2 ∈ (Finset.range p).erase 0 :=
    Finset.mem_erase.mpr ⟨by omega, Finset.mem_range.mpr (by omega)⟩
  rw [T, pairLattice_prime hp hp3, Finset.card_erase_of_mem h1,
    Finset.card_erase_of_mem h0, Finset.card_range]
  omega

-- the table of §3, computed: `T_k` for `P_k = 2, 6, 30, 210, 2310, 30030`
#eval [T 2, T 6, T 30, T 210, T 2310, T 30030]

-- TP1 (`T_{k+1} = (p_{k+1} - 2) T_k`) checked numerically at the first few stages
#eval (T 210 == (7 - 2) * T 30, T 2310 == (11 - 2) * T 210, T 30030 == (13 - 2) * T 2310)

/-! ### TP8 — deletion geometry (§4.4)

A tile of the promotion is `S_k^{(2)} + j·P`; the lift `r + j·P` of a class dies iff the new
prime `p` divides one of its two coordinates. -/

theorem cast_eq_zero_iff_dvd (p a : ℕ) : ((a : ZMod p) = 0) ↔ p ∣ a :=
  CharP.cast_eq_zero_iff (ZMod p) p a

/-- **TP8(a): no copy is deleted twice.**  The two strikes can never coincide, so exactly
`p - 2` of the `p` copies survive — never fewer, and in particular no class ever dies. -/
theorem deleted_tiles_ne {p m : ℕ} (hp : Nat.Prime p) (hp2 : p ≠ 2) :
    ¬ (p ∣ m ∧ p ∣ m + 2) := by
  rintro ⟨h1, h2⟩
  have hd : p ∣ (m + 2) - m := Nat.dvd_sub' h2 h1
  have he : m + 2 - m = 2 := by omega
  rw [he] at hd
  exact hp2 ((Nat.prime_dvd_prime_iff_eq hp Nat.prime_two).mp hd)

/-- Tile form of TP8(a): the left-coordinate hit and the right-coordinate hit never land on
the same tile. -/
theorem deleted_tiles_ne_tile {p P r j : ℕ} (hp : Nat.Prime p) (hp2 : p ≠ 2) :
    ¬ (p ∣ r + j * P ∧ p ∣ r + j * P + 2) :=
  deleted_tiles_ne hp hp2

/-- **TP8(b): the offset is a stage invariant.**  If tile `j₀` loses the left coordinate of
class `r` and tile `j₁` loses the right coordinate, then `(j₁ - j₀)·P = -2` in `ZMod p`.
Note that `r` has disappeared: the offset does not depend on the class. -/
theorem deleted_tile_offset {p P r j₀ j₁ : ℕ}
    (h₀ : p ∣ r + j₀ * P) (h₁ : p ∣ r + j₁ * P + 2) :
    ((j₁ : ZMod p) - j₀) * P = -2 := by
  have e₀ : (r : ZMod p) + j₀ * P = 0 := by
    have h := (cast_eq_zero_iff_dvd p (r + j₀ * P)).mpr h₀
    push_cast at h
    exact h
  have e₁ : (r : ZMod p) + j₁ * P + 2 = 0 := by
    have h := (cast_eq_zero_iff_dvd p (r + j₁ * P + 2)).mpr h₁
    push_cast at h
    exact h
  linear_combination e₁ - e₀

/-- `δ_k = -2·P̄ (mod p_{k+1})` of §1. -/
def delta (p P : ℕ) : ZMod p := -2 * (P : ZMod p)⁻¹

/-- TP8(b) in the form of §4.4: `j₁ - j₀ ≡ δ`, independent of the class `r`. -/
theorem deleted_tile_offset_eq {p : ℕ} (hp : Nat.Prime p) {P r j₀ j₁ : ℕ}
    (hP : ¬ p ∣ P) (h₀ : p ∣ r + j₀ * P) (h₁ : p ∣ r + j₁ * P + 2) :
    ((j₁ : ZMod p) - j₀) = delta p P := by
  haveI := Fact.mk hp
  have hP0 : (P : ZMod p) ≠ 0 := fun h => hP ((cast_eq_zero_iff_dvd p P).mp h)
  have key := deleted_tile_offset (r := r) h₀ h₁
  simp only [delta]
  rw [← key, mul_assoc, mul_inv_cancel₀ hP0, mul_one]

/-! ### Claim W — window occupancy (§6)

`WindowAt p` says: the certified window `[p, p²)` of the stage below `p` contains a
hole-*pair*, i.e. two `p`-rough integers at distance 2.  The `Finset.range` clause is
redundant (it follows from `h + 2 < p * p`) and is carried only to keep the statement
decidable, so that witnesses can be searched for by evaluation. -/

/-- Claim W at a single prime. -/
def WindowAt (p : ℕ) : Prop :=
  ∃ h ∈ Finset.range (p * p), p ≤ h ∧ h + 2 < p * p ∧ Rough p h ∧ Rough p (h + 2)

/-- **Claim W (window occupancy).**  Quantified over `p > 2`: see `not_windowAt_two` — the
window of `p = 2` is `[2, 4)`, which cannot contain a pair at distance 2 at all.  This is
exactly the amount of W that TP7 consumes. -/
def Window : Prop := ∀ p : ℕ, Nat.Prime p → 2 < p → WindowAt p

/-- The one prime at which the unrestricted form of W fails, for width reasons only. -/
theorem not_windowAt_two : ¬ WindowAt 2 := by
  rintro ⟨h, hmem, h2, hlt, -, -⟩
  simp only [Finset.mem_range] at hmem
  omega

/-- A twin pair inside the window witnesses `WindowAt` — the direction that makes W
*checkable*: primes are `p`-rough as soon as they are `≥ p`. -/
theorem windowAt_of_twin {p q : ℕ} (hpq : p ≤ q) (hlt : q + 2 < p * p)
    (hq : Nat.Prime q) (hq2 : Nat.Prime (q + 2)) : WindowAt p :=
  ⟨q, Finset.mem_range.mpr (by omega), hpq, hlt, rough_of_prime_ge hq hpq,
    rough_of_prime_ge hq2 (by omega)⟩

example : WindowAt 3 :=
  windowAt_of_twin (q := 3) (by norm_num) (by norm_num) (by norm_num) (by norm_num)

example : WindowAt 5 :=
  windowAt_of_twin (q := 11) (by norm_num) (by norm_num) (by norm_num) (by norm_num)

example : WindowAt 7 :=
  windowAt_of_twin (q := 11) (by norm_num) (by norm_num) (by norm_num) (by norm_num)

example : WindowAt 11 :=
  windowAt_of_twin (q := 11) (by norm_num) (by norm_num) (by norm_num) (by norm_num)

example : WindowAt 13 :=
  windowAt_of_twin (q := 17) (by norm_num) (by norm_num) (by norm_num) (by norm_num)

/-! The executable side of §10.2: enumerate the hole-pairs actually inside the window. -/

/-- Every `h` witnessing `WindowAt p`; `[]` would refute W at `p`. -/
def windowWitnesses (p : ℕ) : List ℕ :=
  (List.range (p * p)).filter fun h =>
    decide (p ≤ h ∧ h + 2 < p * p ∧ Rough p h ∧ Rough p (h + 2))

theorem windowAt_of_witness {p h : ℕ} (hmem : h ∈ windowWitnesses p) : WindowAt p := by
  simp only [windowWitnesses, List.mem_filter] at hmem
  have hd := of_decide_eq_true hmem.2
  exact ⟨h, Finset.mem_range.mpr (by omega), hd.1, hd.2.1, hd.2.2.1, hd.2.2.2⟩

-- occupancy of the certified window, prime by prime: `(p, #hole-pairs in [p, p²))`
#eval ((List.range 60).filter (fun p => decide (Nat.Prime p))).map
  fun p => (p, (windowWitnesses p).length)

/-! ### TP7 — `W ⟹ TPC` (§6, §8.3)

The whole proof is: Claim O2 (`prime_of_rough_of_lt_sq`) applied to each coordinate.  No
recursion, no counting, no promotion — the certified window carries all of the primality
content, which is precisely the shape §5 asserts. -/

/-- The twin primes, as a set. -/
def TwinPrimes : Set ℕ := {q | Nat.Prime q ∧ Nat.Prime (q + 2)}

/-- One window occupancy statement gives one twin pair above `p`. -/
theorem twin_of_windowAt {p : ℕ} (hp : Nat.Prime p) (hw : WindowAt p) :
    ∃ q, p ≤ q ∧ Nat.Prime q ∧ Nat.Prime (q + 2) := by
  obtain ⟨h, -, hph, hlt, hr, hr2⟩ := hw
  have hp2 : 2 ≤ p := hp.two_le
  have h1 : 1 < h := by omega
  exact ⟨h, hph, prime_of_rough_of_lt_sq h1 hr (by omega),
    prime_of_rough_of_lt_sq (by omega) hr2 hlt⟩

/-- **Claim TP7**, unbounded form: W produces twin pairs above every bound. -/
theorem exists_twin_ge (hW : Window) (N : ℕ) :
    ∃ q, N ≤ q ∧ Nat.Prime q ∧ Nat.Prime (q + 2) := by
  obtain ⟨p, hNp, hp⟩ := Nat.exists_infinite_primes (max N 3)
  have h3 : 3 ≤ p := le_trans (le_max_right N 3) hNp
  have hN : N ≤ p := le_trans (le_max_left N 3) hNp
  obtain ⟨q, hpq, hq, hq2⟩ := twin_of_windowAt hp (hW p hp (by omega))
  exact ⟨q, le_trans hN hpq, hq, hq2⟩

/-- **Claim TP7: `W ⟹ TPC`.**  Formalisable now, from `prime_of_rough_of_lt_sq` alone
(`twin_prime.md` §6, §8.3). -/
theorem infinite_twins_of_window (hW : Window) : TwinPrimes.Infinite := by
  by_contra hfin
  rw [Set.not_infinite] at hfin
  obtain ⟨N, hN⟩ := hfin.bddAbove
  obtain ⟨q, hq, hqp, hq2⟩ := exists_twin_ge hW (N + 1)
  have hmem : q ∈ TwinPrimes := ⟨hqp, hq2⟩
  have : q ≤ N := hN hmem
  omega

/-! ### TP0 — the containment, and its direction (§2)

A twin pair above `p` is a hole-pair of the stage below `p`; the converse fails (§5.1), which
is why nothing here can be run backwards into a count. -/

theorem rough_pair_of_twin {p q : ℕ} (hq : Nat.Prime q) (hq2 : Nat.Prime (q + 2))
    (hpq : p ≤ q) : Rough p q ∧ Rough p (q + 2) :=
  ⟨rough_of_prime_ge hq hpq, rough_of_prime_ge hq2 (by omega)⟩

/-- §5.1, made concrete: `(167, 169)` is a hole-pair of the mod-`210` wheel, inside its own
first period, with `169 = 13²` composite.  Holes are *candidates*; only the window certifies. -/
example : Rough 11 167 ∧ Rough 11 169 ∧ ¬ Nat.Prime 169 := by
  refine ⟨by decide, by decide, by norm_num⟩

end Twin
end Primegen