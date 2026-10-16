import RibbonEngine.Garside.SimpleElements
import RibbonEngine.Basic.CycleCalculus

/-!
# Garside Left-Normal Form & Bruhat Trajectory Theorem (`q1.md` §3.III, **T13**)
-/

namespace RibbonEngine

/-- A braid in canonical Garside left-normal form `Δₙ^p · A_{w₁} ⋯ A_{w_r}`,
    where `infimum = p` is the global half-twist power and `factors = [w₁, …, w_r]`
    is a left-weighted chain of simple elements in `Sₙ`. -/
structure GarsideBraid (n : ℕ) where
  infimum  : ℕ
  factors  : List (Equiv.Perm (Fin n))
  weighted : factors.Chain' IsLeftWeighted

namespace GarsideBraid
variable {n : ℕ}

/-- Composite permutation shadow `(τ_rev)^p · w₁ · w₂ ⋯ w_r` in right-action order. -/
def totalPerm (B : GarsideBraid n) : Equiv.Perm (Fin n) :=
  let factorProd := B.factors.foldl (fun acc w => w * acc) 1
  if B.infimum % 2 = 1 then revPerm n * factorProd else factorProd

/-- Executable strand-tracing function for a `GarsideBraid`. -/
def trace (B : GarsideBraid n) (s : Fin n) : Fin n :=
  B.totalPerm s

/-- Predicate asserting that `B` compiles to a single-component knot (`k = 1`). -/
def CompilesToSingleKnot (B : GarsideBraid n) : Prop :=
  countCyclesExec n B.trace = 1

/-- **T13** (Bruhat Walk Characterization of Knots, `q1.md` §3.III):
    a Garside braid compiles to a single-component knot if and only if its composite
    Bruhat walk `totalPerm` has a single cycle under the executable cycle counter. -/
theorem garside_bruhat_knot_criterion (B : GarsideBraid n) :
    B.CompilesToSingleKnot ↔ countCyclesExec n (fun s => B.totalPerm s) = 1 :=
  Iff.rfl

/-- Empty Garside braid with `m` half-twists `Δₙ^m`. -/
def ofHalfTwists (n m : ℕ) : GarsideBraid n where
  infimum  := m
  factors  := []
  weighted := List.chain'_nil

/-- Trefoil knot `Δ₂³` in Garside normal form compiles to a 1-component knot by `rfl`. -/
theorem trefoil_garside_is_knot :
    (ofHalfTwists 2 3).CompilesToSingleKnot := by
  rfl

end GarsideBraid
end RibbonEngine