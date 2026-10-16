import RibbonEngine.Basic.CycleCalculus
import Mathlib.Data.ZMod.Basic

/-!
# Dependently typed `RibbonIR` (`lean-idea.md` Flex II)

A ribbon program is indexed at the type level by:
* `n : ℕ` — the strand register width,
* `τ : Fin n → Fin n` — the right-action permutation shadow `x ↦ x · π(β)`,
* `pol : Fin n → ZMod 2` — the `5' → 3'` strand polarity at `t = 1`,
* `m : ℤ` — the net global framing in half-twists.
-/

namespace RibbonEngine

/-- Flip every strand's `5' → 3'` polarity (`0 ↔ 1` in `ZMod 2`) after a `180°` Möbius flip. -/
def flipPolarity {n : ℕ} (pol : Fin n → ZMod 2) : Fin n → ZMod 2 :=
  fun s => pol s + 1

@[simp] theorem flipPolarity_flipPolarity {n : ℕ} (pol : Fin n → ZMod 2) :
    flipPolarity (flipPolarity pol) = pol := by
  funext s
  simp only [flipPolarity]
  have h : (1 + 1 : ZMod 2) = 0 := by decide
  rw [add_assoc, h, add_zero]

/-- Dependently typed Ribbon IR indexed by `(n, τ, pol, m)`. -/
inductive RibbonIR (n : ℕ) : (Fin n → Fin n) → (Fin n → ZMod 2) → ℤ → Type where
  | nil (pol₀ : Fin n → ZMod 2) :
      RibbonIR n id pol₀ 0
  | crossing {τ : Fin n → Fin n} {pol : Fin n → ZMod 2} {m : ℤ}
      (g : ArtinGen n) (prev : RibbonIR n τ pol m) :
      RibbonIR n (fun s => g.act (τ s)) pol m
  | halfTwist {τ : Fin n → Fin n} {pol : Fin n → ZMod 2} {m : ℤ}
      (sign : Bool) (prev : RibbonIR n τ pol m) :
      RibbonIR n (fun s => Fin.rev (τ s)) (flipPolarity pol)
        (m + if sign then 1 else -1)

namespace RibbonIR
variable {n : ℕ}

/-- Left-to-right fold builder matching `traceStrand`: append a list of Artin generators
    to a `RibbonIR` state. -/
def buildFrom :
    {τ : Fin n → Fin n} → {pol : Fin n → ZMod 2} → {m : ℤ} →
    RibbonIR n τ pol m → (w : BraidWord n) →
    RibbonIR n (fun s => traceStrand w (τ s)) pol m
  | _, _, _, ir, [] => ir
  | _, _, _, ir, g :: gs => buildFrom (RibbonIR.crossing g ir) gs

/-- Canonical constructor lifting any `w : BraidWord n` into `RibbonIR`. -/
def fromWord (pol₀ : Fin n → ZMod 2) (w : BraidWord n) :
    RibbonIR n (traceStrand w) pol₀ 0 :=
  buildFrom (RibbonIR.nil pol₀) w

/-- Extract the underlying braid word (ignoring global `halfTwist` tokens). -/
def toBraidWord {τ : Fin n → Fin n} {pol : Fin n → ZMod 2} {m : ℤ} :
    RibbonIR n τ pol m → BraidWord n
  | .nil _ => []
  | .crossing g prev => prev.toBraidWord ++ [g]
  | .halfTwist _ prev => prev.toBraidWord

end RibbonIR
end RibbonEngine