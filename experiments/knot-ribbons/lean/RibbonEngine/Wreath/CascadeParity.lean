import RibbonEngine.Basic.CycleCalculus
import RibbonEngine.Framing.BisectionAudit
import RibbonEngine.Wreath.Monodromy

/-!
# Bisection death (`n = 2`) vs. Immortal trisection (`n = 3`) (`lean-idea.md` Flex III)
-/

namespace RibbonEngine

/-- Iterated `n`-cut Seifert framing budget at depth `d`: `m_d = (n²)^d · m₀`. -/
def cascadeFraming (n : ℕ) (m₀ : ℤ) : ℕ → ℤ
  | 0 => m₀
  | d + 1 => (n : ℤ) ^ 2 * cascadeFraming n m₀ d

theorem cascadeFraming_closed_form (n : ℕ) (m₀ : ℤ) (d : ℕ) :
    cascadeFraming n m₀ d = ((n : ℤ) ^ 2) ^ d * m₀ := by
  induction d with
  | zero => simp [cascadeFraming]
  | succ d ih =>
    simp only [cascadeFraming, ih, pow_succ']
    ring

/-- Classical bisection (`n = 2`) makes the child framing even at every depth `d ≥ 1`,
    so `traceTwistedRibbon [] m₁` collapses to the identity on `Fin 2` (2 components). -/
theorem bisection_cascade_dies_at_depth_one (m₀ : ℕ) :
    countCyclesExec 2 (traceTwistedRibbon ([] : BraidWord 2) (4 * m₀)) = 2 ∧
    countCyclesExec 2 (traceTwistedRibbon ([] : BraidWord 2) (2 * m₀ + 2)) = 2 ∧
    countCyclesExec 2 (traceTwistedRibbon ([] : BraidWord 2) (2 * m₀)) = 2 := by
  have h1 : (4 * m₀) % 2 = 0 := by omega
  have h2 : (2 * m₀ + 2) % 2 = 0 := by omega
  have h3 : (2 * m₀) % 2 = 0 := by omega
  have h_even (m : ℕ) (hm : m % 2 = 0) :
      traceTwistedRibbon ([] : BraidWord 2) m = id := by
    funext s
    simp [traceTwistedRibbon, hm]
  rw [h_even _ h1, h_even _ h2, h_even _ h3]
  exact ⟨rfl, rfl, rfl⟩

/-- Trisection (`n = 3`) preserves odd framing parity `m_d % 2 = 1` for all depths `d : ℕ`. -/
theorem trisection_cascade_preserves_odd_parity (m₀ : ℤ) (hm : m₀ % 2 = 1) (d : ℕ) :
    cascadeFraming 3 m₀ d % 2 = 1 := by
  induction d with
  | zero => exact hm
  | succ d ih =>
    unfold cascadeFraming
    omega

end RibbonEngine