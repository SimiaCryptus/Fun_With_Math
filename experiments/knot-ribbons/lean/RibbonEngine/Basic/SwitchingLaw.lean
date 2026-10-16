import RibbonEngine.Basic.CycleCalculus

/-!
# The Fundamental Switching Law (`theory.md` §6)

Right-multiplying by an adjacent transposition changes the cycle count by exactly ±1.
-/

namespace RibbonEngine

/-- **T5**: right-multiplying by an adjacent transposition changes the cycle count by exactly ±1.

Proof plan: case split on `τ.SameCycle (g.leftStrand) (g.rightStrand)`.
* Same cycle: `τ * swap` splits that cycle into two, so the count rises by 1.
* Different cycles: `τ * swap` merges them into one, so the count falls by 1.

Mathlib provides the support/cycle lemmas for `swap_mul` (`Equiv.Perm.IsCycle.swap_mul`,
`card_support_swap_mul`); the remaining work is bookkeeping in `numCycles`.

STATUS: open (Milestone 2 remainder). -/
theorem fundamental_switching_law {n : ℕ} (τ : Equiv.Perm (Fin n)) (g : ArtinGen n) :
    numCycles (τ * g.toPerm) = numCycles τ + 1 ∨
      numCycles τ = numCycles (τ * g.toPerm) + 1 := by
  sorry

/-! ## Kernel-checked instances of the law -/

def σ₁ : ArtinGen 3 := ⟨⟨0, by decide⟩, true⟩
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