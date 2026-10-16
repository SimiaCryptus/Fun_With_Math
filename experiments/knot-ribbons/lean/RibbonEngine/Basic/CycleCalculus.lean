import RibbonEngine.Basic.ArtinBraid
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
  loop : ℕ → List (Fin n) → ℕ → ℕ
    | 0, _, acc => acc
    | _, [], acc => acc
    | fuel + 1, x :: xs, acc =>
      let orbit := (List.range n).scanl (fun cur _ => f cur) x
      loop fuel ((x :: xs).filter (fun y => !orbit.contains y)) (acc + 1)

/-- Abstract cycle count: nontrivial cycles plus fixed points. -/
noncomputable def numCycles {n : ℕ} (τ : Equiv.Perm (Fin n)) : ℕ :=
  τ.cycleType.card + (Fintype.card (Fin n) - τ.support.card)

/-- **T2** (reflection bridge).

Proof plan: each `loop` step removes exactly the orbit `{x, τ x, …}` of the head
`x`, and orbits of `τ` are its cycles or its fixed points. Induct on the
`SameCycle`-closed list `unvisited`, using `Equiv.Perm.card_support_eq_sum…`
together with the partition of `Fin n` into `τ`-orbits.

STATUS: open (Milestone 2 remainder). -/
theorem countCyclesExec_eq_numCycles {n : ℕ} (τ : Equiv.Perm (Fin n)) :
    countCyclesExec n τ = numCycles τ := by
  sorry

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