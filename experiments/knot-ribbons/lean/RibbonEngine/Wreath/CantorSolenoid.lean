import RibbonEngine.Wreath.CascadeParity

/-!
# Coinductive Cantor-Ribbon Solenoid & Nekrashevych Wreath Automaton (`lean-idea.md` Flex III)

Models the infinite slicing limit `d → ∞` as a self-similar Mealy automaton acting on profinite
Cantor streams `CantorStrand n := ℕ → Fin n`.
-/

namespace RibbonEngine

/-- A point in the transverse Cantor set `∏_{d=0}^∞ Fin n` of an infinitely sliced ribbon. -/
abbrev CantorStrand (n : ℕ) := ℕ → Fin n

/-- A self-similar Nekrashevych ribbon automaton acting on the infinite `n`-ary rooted tree. -/
structure WreathRibbonAutomaton (n : ℕ) (State : Type) where
  /-- Local permutation acting on the current slicing level. -/
  rootPerm : State → Equiv.Perm (Fin n)
  /-- Wreath section propagating the state into the `i`-th sub-ribbon. -/
  childState : State → Fin n → State

namespace WreathRibbonAutomaton
variable {n : ℕ} {State : Type}

/-- Automaton state reached at slicing depth `d` along a Cantor strand `x`. -/
def stateAtDepth (A : WreathRibbonAutomaton n State) (q : State) (x : CantorStrand n) :
    ℕ → State
  | 0     => q
  | d + 1 => A.childState (A.stateAtDepth q x d) (x d)

/-- Action of the self-similar wreath automaton on a profinite Cantor strand `x : ℕ → Fin n`. -/
def actCantor (A : WreathRibbonAutomaton n State) (q : State) (x : CantorStrand n) :
    CantorStrand n :=
  fun d => A.rootPerm (A.stateAtDepth q x d) (x d)

@[simp] theorem actCantor_zero (A : WreathRibbonAutomaton n State) (q : State)
    (x : CantorStrand n) :
    A.actCantor q x 0 = A.rootPerm q (x 0) := rfl

theorem stateAtDepth_succ (A : WreathRibbonAutomaton n State) (q : State)
    (x : CantorStrand n) (d : ℕ) :
    A.stateAtDepth q x (d + 1) =
      A.stateAtDepth (A.childState q (x 0)) (fun k => x (k + 1)) d := by
  induction d generalizing q x with
  | zero => rfl
  | succ d ih =>
    change A.childState (A.stateAtDepth q x (d + 1)) (x (d + 1)) =
      A.childState (A.stateAtDepth (A.childState q (x 0)) (fun k => x (k + 1)) d) (x (d + 1))
    rw [ih]

/-- Self-similar wreath recursion identity: the action at depth `d + 1` is governed by the
    child state `A.childState q (x 0)` acting on the shifted Cantor stream `k ↦ x (k + 1)`. -/
theorem actCantor_succ (A : WreathRibbonAutomaton n State) (q : State)
    (x : CantorStrand n) (d : ℕ) :
    A.actCantor q x (d + 1) =
      A.actCantor (A.childState q (x 0)) (fun k => x (k + 1)) d := by
  simp only [actCantor, stateAtDepth_succ]

end WreathRibbonAutomaton

/-- Cyclic increment permutation `i ↦ (i + 1) mod 3` on `Fin 3` (a single transitive 3-cycle). -/
def cycle3Perm : Equiv.Perm (Fin 3) :=
  braidToPerm ([⟨⟨0, by decide⟩, true⟩, ⟨⟨1, by decide⟩, true⟩] : BraidWord 3)

/-- The 3-adic odometer automaton on `CantorStrand 3` (`State = Bool` tracks the carry bit):
    when `carry = true`, it applies the 3-cycle `cycle3Perm` and propagates the carry into
    sub-ribbon `2` (`2 + 1 ≡ 0 mod 3`), realizing the minimal 3-adic solenoid action. -/
def trisectionOdometer : WreathRibbonAutomaton 3 Bool where
  rootPerm   := fun carry => if carry then cycle3Perm else 1
  childState := fun carry i => carry && (i.val == 2)

/-- Sanity check: the root permutation of the active 3-adic odometer is a single 3-cycle
    (`k = 1`). -/
theorem trisectionOdometer_root_is_single_cycle :
    countCyclesExec 3 (trisectionOdometer.rootPerm true) = 1 := by
  rfl

end RibbonEngine