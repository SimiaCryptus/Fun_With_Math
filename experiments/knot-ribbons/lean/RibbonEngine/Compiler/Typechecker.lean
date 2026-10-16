import RibbonEngine.Compiler.RibbonIR

/-!
# Static `NC¹` topological & biochemical typechecker (`lean-idea.md` Flex II)

Checks at elaboration time:
1. `countCyclesExec n τ = 1` (single-component knot closure),
2. `∀ s, pol (τ s) = pol s` (`5' → 3'` polarity compatibility across the splice).
-/

namespace RibbonEngine

/-- Executable Boolean check that every strand glues to a strand of matching polarity. -/
def polarityCompatibleExec (n : ℕ) (τ : Fin n → Fin n) (pol : Fin n → ZMod 2) : Bool :=
  (List.finRange n).all (fun s => pol (τ s) == pol s)

/-- Compile-time legality class for closing a `RibbonIR` program into a single knot. -/
class LegalKnotClosure (n : ℕ) (τ : Fin n → Fin n) (pol : Fin n → ZMod 2) (m : ℤ) : Prop where
  is_single_knot     : countCyclesExec n τ = 1
  polarity_conserved : polarityCompatibleExec n τ pol = true

instance (n : ℕ) (τ : Fin n → Fin n) (pol : Fin n → ZMod 2) (m : ℤ)
    [h₁ : Fact (countCyclesExec n τ = 1)]
    [h₂ : Fact (polarityCompatibleExec n τ pol = true)] :
    LegalKnotClosure n τ pol m where
  is_single_knot     := h₁.out
  polarity_conserved := h₂.out

/-- Smart constructor: elaborates only when `countCyclesExec n τ = 1` and polarities match. -/
theorem verifyKnotClosure {n : ℕ} {τ : Fin n → Fin n} {pol : Fin n → ZMod 2} {m : ℤ}
     (_ir : RibbonIR n τ pol m)
    (h_knot : countCyclesExec n τ = 1 := by rfl)
    (h_pol  : polarityCompatibleExec n τ pol = true := by rfl) :
    LegalKnotClosure n τ pol m :=
  ⟨h_knot, h_pol⟩

/-- Uniform duplex polarity (`0` on every channel). -/
def uniformPolarity (n : ℕ) : Fin n → ZMod 2 := fun _ => 0

/-- **T10** (Biochemical Möbius obstruction): after an odd number of half-twists on a
    uniform-polarity ribbon, every strand has flipped polarity (`1 ≠ 0`), so no fixed point or
    closed splice with initial polarity `0` can ligate without a `5' ↔ 5'` mismatch. -/
theorem dna_mobius_polarity_obstruction {n : ℕ} (s : Fin n) :
    flipPolarity (uniformPolarity n) s ≠ uniformPolarity n s := by
  simp only [flipPolarity, uniformPolarity, zero_add]
  decide

/-- The untwisted Figure-Eight engine (`m = 0`) passes `verifyKnotClosure` by `rfl`. -/
theorem figEightVerified :
    LegalKnotClosure 3 (traceStrand figEightEngine) (uniformPolarity 3) 0 :=
  verifyKnotClosure (RibbonIR.fromWord (uniformPolarity 3) figEightEngine)

/-- Applying a Möbius half-twist (`m = 1`) to the Figure-Eight engine fails the knot check
    (`countCyclesExec = 2 ≠ 1`). -/
theorem figEight_mobius_rejected :
    countCyclesExec 3 (fun s => Fin.rev (traceStrand figEightEngine s)) ≠ 1 := by
  decide

end RibbonEngine