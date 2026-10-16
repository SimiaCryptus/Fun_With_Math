import Mathlib.GroupTheory.Perm.Fin

/-!
# Artin generators, braid words, right-action strand tracing (`q3.md` Audit 1)

Conventions (Golden Rule 4): everything is 0-indexed `Fin n`; a braid word is read
left-to-right and `traceStrand w s` is the position at `t = 1` of the strand that
starts at position `s`.
-/

namespace RibbonEngine

/-- Elementary Artin generator `σᵢ^{±1}` in `Bₙ`, with `i : Fin (n - 1)`. -/
structure ArtinGen (n : ℕ) where
  idx  : Fin (n - 1)
  sign : Bool   -- true = +1 (over), false = -1 (under)
  deriving DecidableEq, Repr

abbrev BraidWord (n : ℕ) := List (ArtinGen n)

namespace ArtinGen
variable {n : ℕ}

/-- Left strand position `i` touched by `σᵢ`. -/
@[inline] def leftStrand (g : ArtinGen n) : Fin n :=
  ⟨g.idx.val, by have := g.idx.isLt; omega⟩

/-- Right strand position `i + 1` touched by `σᵢ`. -/
@[inline] def rightStrand (g : ArtinGen n) : Fin n :=
  ⟨g.idx.val + 1, by have := g.idx.isLt; omega⟩

@[simp] theorem leftStrand_val (g : ArtinGen n) : g.leftStrand.val = g.idx.val := rfl
@[simp] theorem rightStrand_val (g : ArtinGen n) : g.rightStrand.val = g.idx.val + 1 := rfl

/-- Permutation shadow `π(σᵢ^{±1}) = (i i+1)`; crossing sign is forgotten. -/
def toPerm (g : ArtinGen n) : Equiv.Perm (Fin n) :=
  Equiv.swap g.leftStrand g.rightStrand

/-- One step of strand tracing through a single crossing. -/
@[inline] def act (g : ArtinGen n) (p : Fin n) : Fin n := g.toPerm p

theorem act_act (g : ArtinGen n) (p : Fin n) : g.act (g.act p) = p :=
  Equiv.swap_apply_self _ _ _

/-- Formal inverse `σᵢ^{∓1}`. -/
def inv (g : ArtinGen n) : ArtinGen n := { g with sign := !g.sign }

@[simp] theorem toPerm_inv (g : ArtinGen n) : g.inv.toPerm = g.toPerm := rfl

/-- Garside diagram involution `Δₙ σᵢ Δₙ⁻¹ = σ_{n-i}` (0-indexed: `i ↦ n - 2 - i`). -/
def garsideConj (g : ArtinGen n) : ArtinGen n :=
  ⟨⟨n - 2 - g.idx.val, by have := g.idx.isLt; omega⟩, g.sign⟩

theorem garsideConj_garsideConj (g : ArtinGen n) : g.garsideConj.garsideConj = g := by
  rcases g with ⟨⟨i, hi⟩, s⟩
  simp only [garsideConj, ArtinGen.mk.injEq, Fin.mk.injEq, and_true]
  omega

end ArtinGen

variable {n : ℕ}

/-- Right-action strand tracing `x ↦ x · π(β)`. -/
def traceStrand (w : BraidWord n) (s : Fin n) : Fin n :=
  w.foldl (fun p g => g.act p) s

/-- **T1**: tracing a concatenation traces the pieces in order. -/
theorem traceStrand_append (w₁ w₂ : BraidWord n) (s : Fin n) :
    traceStrand (w₁ ++ w₂) s = traceStrand w₂ (traceStrand w₁ s) := by
  simp [traceStrand, List.foldl_append]

@[simp] theorem traceStrand_nil (s : Fin n) : traceStrand ([] : BraidWord n) s = s := rfl

/-- Lift to Mathlib permutations. Since `(f * g) x = f (g x)`, later gates go on the left. -/
def braidToPerm (w : BraidWord n) : Equiv.Perm (Fin n) :=
  w.foldl (fun acc g => g.toPerm * acc) 1

private theorem foldl_perm_apply (w : BraidWord n) (acc : Equiv.Perm (Fin n)) (s : Fin n) :
    (w.foldl (fun acc g => g.toPerm * acc) acc) s
      = w.foldl (fun p g => g.act p) (acc s) := by
  induction w generalizing acc with
  | nil => rfl
  | cons g w ih =>
    simp only [List.foldl_cons]
    rw [ih]
    rfl

theorem braidToPerm_apply (w : BraidWord n) (s : Fin n) :
    braidToPerm w s = traceStrand w s := by
  simpa [braidToPerm, traceStrand] using foldl_perm_apply w 1 s

/-- Strand tracing is a bijection on `Fin n`. -/
theorem traceStrand_bijective (w : BraidWord n) : Function.Bijective (traceStrand w) := by
  have h : traceStrand w = braidToPerm w := funext fun s => (braidToPerm_apply w s).symm
  rw [h]
  exact (braidToPerm w).bijective

theorem braidToPerm_append (w₁ w₂ : BraidWord n) :
    braidToPerm (w₁ ++ w₂) = braidToPerm w₂ * braidToPerm w₁ := by
  ext s
  simp [braidToPerm_apply, traceStrand_append, Equiv.Perm.mul_apply]

/-- Reversal involution `τ_rev(i) = n - 1 - i`, the shadow of `Δₙ`. -/
abbrev revPerm (n : ℕ) : Equiv.Perm (Fin n) := Fin.revPerm

theorem revPerm_sq (n : ℕ) : revPerm n * revPerm n = 1 := by
  ext i; simp

/-- Close a braid word inside a carrier ribbon with `m` half-twists. -/
def traceTwistedRibbon (w : BraidWord n) (m : ℕ) (s : Fin n) : Fin n :=
  let p := traceStrand w s
  if m % 2 = 1 then Fin.rev p else p

end RibbonEngine