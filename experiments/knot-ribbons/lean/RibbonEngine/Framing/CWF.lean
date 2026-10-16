import Mathlib.Tactic.Ring

/-!
# Călugăreanu–White–Fuller framing state (`lean-idea.md` Flex V)

All quantities are measured in half-twists.
-/

namespace RibbonEngine

structure CWFRibbonState where
  twist2  : ℤ   -- 2·Tw
  writhe2 : ℤ   -- 2·Wr
  deriving DecidableEq, Repr

namespace CWFRibbonState

/-- `2·Lk = 2·Tw + 2·Wr`. -/
def linkingBudget (s : CWFRibbonState) : ℤ := s.twist2 + s.writhe2

/-- Fuller / Reidemeister-I uncoiling: trade `c` writhe coils for `c` full twists. -/
def fullerUncoil (s : CWFRibbonState) (c : ℤ) : CWFRibbonState where
  twist2  := s.twist2 + 2 * c
  writhe2 := s.writhe2 - 2 * c

/-- **T6** -/
theorem fullerUncoil_conserves_budget (s : CWFRibbonState) (c : ℤ) :
    (s.fullerUncoil c).linkingBudget = s.linkingBudget := by
  simp only [fullerUncoil, linkingBudget]
  ring

theorem fullerUncoil_add (s : CWFRibbonState) (a b : ℤ) :
    (s.fullerUncoil a).fullerUncoil b = s.fullerUncoil (a + b) := by
  simp only [fullerUncoil, CWFRibbonState.mk.injEq]
  constructor <;> ring

/-- Uncoiling only changes the twist by an even number of half-twists. -/
theorem fullerUncoil_twist_parity (s : CWFRibbonState) (c : ℤ) :
    (s.fullerUncoil c).twist2 % 2 = s.twist2 % 2 := by
  simp only [fullerUncoil]
  omega

end CWFRibbonState
end RibbonEngine