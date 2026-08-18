/-
§4.2 of the paper: the wheel successor function.

The paper implements `next_coprime` with a `step` table over `[0, W)`; here it is *specified*
(least `W`-coprime integer strictly greater than `x`) and the three properties the algorithm
relies on are proved.  A table implementation is a refinement of this spec.
-/
import Mathlib

namespace Primegen
namespace Wheel

/-- Every residue `1 mod W` is coprime to `W`; this is what makes the wheel period `W`. -/
theorem coprime_mul_add_one (W k : ℕ) : Nat.gcd (W * k + 1) W = 1 := by
  have h1 := Nat.gcd_dvd_left (W * k + 1) W
  have h2 := Nat.gcd_dvd_right (W * k + 1) W
  have h3 : Nat.gcd (W * k + 1) W ∣ W * k := h2.mul_right k
  have h4 : Nat.gcd (W * k + 1) W ∣ (W * k + 1) - W * k := Nat.dvd_sub' h1 h3
  have h5 : (W * k + 1) - W * k = 1 := by omega
  rw [h5] at h4
  exact Nat.dvd_one.mp h4

/-- There is a `W`-coprime integer in every window of length `W + 1`: the wheel never stalls. -/
theorem exists_coprime_gt (W x : ℕ) (hW : 0 < W) : ∃ y, x < y ∧ Nat.gcd y W = 1 := by
  refine ⟨W * (x / W + 1) + 1, ?_, coprime_mul_add_one W _⟩
  have h1 : W * (x / W) + x % W = x := Nat.div_add_mod x W
  have h2 : x % W < W := Nat.mod_lt _ hW
  have h3 : W * (x / W + 1) = W * (x / W) + W := by ring
  omega

/-- `next_coprime` of §4.2: the least `W`-coprime integer strictly greater than `x`. -/
def nextCoprime (W x : ℕ) : ℕ :=
  if h : 0 < W then Nat.find (exists_coprime_gt W x h) else x + 1

theorem lt_nextCoprime {W : ℕ} (hW : 0 < W) (x : ℕ) : x < nextCoprime W x := by
  rw [nextCoprime, dif_pos hW]
  exact (Nat.find_spec (exists_coprime_gt W x hW)).1

theorem coprime_nextCoprime {W : ℕ} (hW : 0 < W) (x : ℕ) : Nat.Coprime (nextCoprime W x) W := by
  rw [nextCoprime, dif_pos hW]
  exact (Nat.find_spec (exists_coprime_gt W x hW)).2

/-- Minimality: nothing `W`-coprime hides between `x` and `nextCoprime W x`.  This is the
property that makes the candidate scan of §4.3 lose no composite. -/
theorem nextCoprime_le {W : ℕ} (hW : 0 < W) {x z : ℕ} (hz : x < z) (hc : Nat.Coprime z W) :
    nextCoprime W x ≤ z := by
  rw [nextCoprime, dif_pos hW]
  exact Nat.find_min' _ ⟨hz, hc⟩

end Wheel
end Primegen