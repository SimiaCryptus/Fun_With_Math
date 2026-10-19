import RibbonEngine.DoubleCategory.HorizontalGauge
import RibbonEngine.Basic.SwitchingLaw

/-!
# Vertical Constructive Operations (`q2.md` Part II.2–3, `lean-plan.md` Phase 5.2)

Implements the state-constructive vertical morphisms of `RibbonDoubleCat`:
1. `concat` (`⊙_A`) — longitudinal sequential composition along a shared axis `A`,
2. `foliate` (`𝓕_n`) — transverse slicing of a framed carrier ribbon into `n` channels,
3. `framingTwist` (`𝓣^{Δm}`) — global framing twist injection,
4. `reconnect` (`𝓡_i^{±}`) — local crossing insertion / smoothing.
-/

namespace RibbonEngine

namespace RelationalRibbonState

/-- Vertical Operator 1 (`⊙_A`): longitudinal concatenation along a shared axis `A`. -/
def concat (R : RelationalRibbonState) (w₂ : BraidWord R.n) (m₂ : ℕ) :
    RelationalRibbonState where
  n       := R.n
  word    := R.word ++ w₂
  framing := R.framing + m₂

/-- Vertical Operator 2 (`𝓕_n`): transverse foliation of a single framed ribbon into `n` strands. -/
def foliate (n framing : ℕ) : RelationalRibbonState where
  n       := n
  word    := []
  framing := framing

/-- Vertical Operator 3 (`𝓣^{Δm}`): global framing twist injection. -/
def framingTwist (R : RelationalRibbonState) (Δm : ℕ) : RelationalRibbonState where
  n       := R.n
  word    := R.word
  framing := R.framing + Δm

/-- Vertical Operator 4 (`𝓡_i^{±}`): local crossing reconnection. -/
def reconnect (R : RelationalRibbonState) (g : ArtinGen R.n) : RelationalRibbonState where
  n       := R.n
  word    := R.word ++ [g]
  framing := R.framing

/-- Injecting an even number of half-twists (`2 * k`) strictly preserves the permutation shadow. -/
theorem framingTwist_even_trace (R : RelationalRibbonState) (k : ℕ) :
    (R.framingTwist (2 * k)).trace = R.trace := by
  funext s
  have h : (R.framing + 2 * k) % 2 = R.framing % 2 := by omega
  simp only [trace, framingTwist, traceTwistedRibbon, h]

/-- Injecting an even number of half-twists (`2 * k`) strictly conserves `componentCount`. -/
theorem framingTwist_even_componentCount (R : RelationalRibbonState) (k : ℕ) :
    (R.framingTwist (2 * k)).componentCount = R.componentCount := by
  simp only [componentCount, framingTwist_even_trace]
  rfl

/-- On an untwisted carrier (`framing = 0`), `reconnect` steps the strand trace by `g.act`. -/
theorem reconnect_untwisted_trace (n : ℕ) (w : BraidWord n) (g : ArtinGen n) (s : Fin n) :
    (RelationalRibbonState.mk n w 0 |>.reconnect g).trace s =
      g.act ((RelationalRibbonState.mk n w 0).trace s) := by
  simp only [trace, reconnect, traceTwistedRibbon, traceStrand_append]
  rfl

/-- Foliating a 3-half-twist Möbius strip into `n = 2` strands produces a 1-component knot
    (the trefoil `3₁`), whereas foliating into `n = 3` strands produces 2 components. -/
theorem foliate_mobius_examples :
    ((foliate 2 3).componentCount, (foliate 3 3).componentCount) = (1, 2) := by
  rfl

end RelationalRibbonState
end RibbonEngine