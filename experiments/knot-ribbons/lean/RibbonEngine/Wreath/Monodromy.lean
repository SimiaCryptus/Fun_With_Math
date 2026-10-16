import RibbonEngine.Basic.ArtinBraid
import Mathlib.Algebra.Group.Conj
import Mathlib.Tactic.Group

/-!
# Wreath product action & monodromy conjugacy (`q1.md` §3.IV, `q3.md` Audit 4, **T18**)
-/

namespace RibbonEngine

/-- Wreath product action `(τ₂, τ₁) ∈ S_{n₂} ≀ S_{n₁}` on `Fin n₁ × Fin n₂`:
    the parent permutation `τ₁` steps the macro-strand `i`, while `τ₂ i` steps the
    micro-strand `j` inside channel `i`. -/
def wreathPerm {n₁ n₂ : ℕ}
    (τ₁ : Equiv.Perm (Fin n₁)) (τ₂ : Fin n₁ → Equiv.Perm (Fin n₂)) :
    Equiv.Perm (Fin n₁ × Fin n₂) where
  toFun p := (τ₁ p.1, τ₂ p.1 p.2)
  invFun p := (τ₁⁻¹ p.1, (τ₂ (τ₁⁻¹ p.1))⁻¹ p.2)
  left_inv p := by
    rcases p with ⟨i, j⟩
    simp
  right_inv p := by
    rcases p with ⟨i, j⟩
    simp

/-- `k`-step ordered monodromy product `τ₂(τ₁^{k-1} x) ⋯ τ₂(τ₁ x) · τ₂(x)` in `S_{n₂}`. -/
def wreathMonodromySteps {n₁ n₂ : ℕ}
    (τ₁ : Equiv.Perm (Fin n₁)) (τ₂ : Fin n₁ → Equiv.Perm (Fin n₂))
    (k : ℕ) (x : Fin n₁) : Equiv.Perm (Fin n₂) :=
  match k with
  | 0 => 1
  | k' + 1 => wreathMonodromySteps τ₁ τ₂ k' (τ₁ x) * τ₂ x

/-- Full-orbit wreath monodromy `μ(x) ∈ S_{n₂}` across `n₁` steps of the parent permutation. -/
def wreathMonodromy {n₁ n₂ : ℕ}
    (τ₁ : Equiv.Perm (Fin n₁)) (τ₂ : Fin n₁ → Equiv.Perm (Fin n₂))
    (x : Fin n₁) : Equiv.Perm (Fin n₂) :=
  wreathMonodromySteps τ₁ τ₂ n₁ x

theorem wreathMonodromySteps_succ_right {n₁ n₂ : ℕ}
    (τ₁ : Equiv.Perm (Fin n₁)) (τ₂ : Fin n₁ → Equiv.Perm (Fin n₂))
    (k : ℕ) (x : Fin n₁) :
    wreathMonodromySteps τ₁ τ₂ (k + 1) x =
      τ₂ ((τ₁ ^ k) x) * wreathMonodromySteps τ₁ τ₂ k x := by
  induction k generalizing x with
  | zero => simp [wreathMonodromySteps]
  | succ k ih =>
    have e : wreathMonodromySteps τ₁ τ₂ (k + 1) x =
        wreathMonodromySteps τ₁ τ₂ k (τ₁ x) * τ₂ x := rfl
    have e2 : wreathMonodromySteps τ₁ τ₂ (k + 1 + 1) x =
        wreathMonodromySteps τ₁ τ₂ (k + 1) (τ₁ x) * τ₂ x := rfl
    have hp : (τ₁ ^ (k + 1)) x = (τ₁ ^ k) (τ₁ x) := by
      rw [pow_succ, Equiv.Perm.mul_apply]
    rw [e2, ih (τ₁ x), mul_assoc, ← e, hp]

/-- Shifting the base point `x ↦ τ₁ x` along a closed orbit of length `n₁` conjugates the
    monodromy product by `τ₂ x`. -/
theorem wreathMonodromy_shift_eq_conj {n₁ n₂ : ℕ}
    (τ₁ : Equiv.Perm (Fin n₁)) (τ₂ : Fin n₁ → Equiv.Perm (Fin n₂))
    (x : Fin n₁) (h_orbit : (τ₁ ^ n₁) x = x) :
    wreathMonodromy τ₁ τ₂ (τ₁ x) =
      τ₂ x * wreathMonodromy τ₁ τ₂ x * (τ₂ x)⁻¹ := by
  have h_step :
      wreathMonodromySteps τ₁ τ₂ (n₁ + 1) x =
        wreathMonodromy τ₁ τ₂ (τ₁ x) * τ₂ x := rfl
  rw [wreathMonodromySteps_succ_right, h_orbit] at h_step
  calc
    wreathMonodromy τ₁ τ₂ (τ₁ x)
        = (wreathMonodromy τ₁ τ₂ (τ₁ x) * τ₂ x) * (τ₂ x)⁻¹ := by group
    _ = τ₂ x * wreathMonodromy τ₁ τ₂ x * (τ₂ x)⁻¹ := by rw [← h_step]; rfl

/-- **T18** (`q3.md` Audit 4): the conjugacy class of the wreath monodromy `μ(x)` is invariant
    under shifting the base-point strand along any closed orbit `(τ₁ ^ n₁) x = x`. -/
theorem wreathMonodromy_conj_invariant {n₁ n₂ : ℕ}
    (τ₁ : Equiv.Perm (Fin n₁)) (τ₂ : Fin n₁ → Equiv.Perm (Fin n₂))
    (x : Fin n₁) (h_orbit : (τ₁ ^ n₁) x = x) :
    IsConj (wreathMonodromy τ₁ τ₂ x) (wreathMonodromy τ₁ τ₂ (τ₁ x)) := by
  rw [isConj_iff]
  refine ⟨τ₂ x, ?_⟩
  exact (wreathMonodromy_shift_eq_conj τ₁ τ₂ x h_orbit).symm

end RibbonEngine