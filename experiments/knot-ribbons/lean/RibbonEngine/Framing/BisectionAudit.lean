import RibbonEngine.Framing.CWF

/-!
# Audit 2: `4m₀` (Seifert) vs `2m₀ + 2` (planar) after Möbius bisection
-/

namespace RibbonEngine
open CWFRibbonState

/-- `n`-cut cabling framing: twist `n·m₀`, coiled writhe `n(n-1)·m₀`. -/
def sliceFraming (n : ℕ) (m₀ : ℤ) : CWFRibbonState where
  twist2  := (n : ℤ) * m₀
  writhe2 := (n : ℤ) * ((n : ℤ) - 1) * m₀

theorem sliceFraming_budget (n : ℕ) (m₀ : ℤ) :
    (sliceFraming n m₀).linkingBudget = (n : ℤ) ^ 2 * m₀ := by
  simp only [sliceFraming, linkingBudget]
  ring

theorem sliceFraming_two (m₀ : ℤ) : sliceFraming 2 m₀ = ⟨2 * m₀, 2 * m₀⟩ := by
  simp only [sliceFraming, CWFRibbonState.mk.injEq]
  constructor <;> push_cast <;> ring

/-- **T7**: the Seifert budget is `4m₀`, the planar unfolding gives `2m₀ + 2`, and the twist is even in every gauge. -/
theorem mobius_bisection_framing_reconciliation (m₀ : ℤ) :
    (⟨2 * m₀, 2 * m₀⟩ : CWFRibbonState).linkingBudget = 4 * m₀ ∧
    ((⟨2 * m₀, 2 * m₀⟩ : CWFRibbonState).fullerUncoil 1).twist2 = 2 * m₀ + 2 ∧
    (2 * m₀) % 2 = 0 ∧
    ((⟨2 * m₀, 2 * m₀⟩ : CWFRibbonState).fullerUncoil 1).twist2 % 2 = 0 ∧
    (4 * m₀) % 2 = 0 := by
   simp only [linkingBudget, fullerUncoil]
   refine ⟨?_, ?_, ?_, ?_, ?_⟩ <;> omega

/-- Trefoil instance: `m₀ = 3` gives 12 (Seifert) and 8 (planar). -/
example :
    (sliceFraming 2 3).linkingBudget = 12 ∧
    ((sliceFraming 2 3).fullerUncoil 1).twist2 = 8 := by
  decide

end RibbonEngine