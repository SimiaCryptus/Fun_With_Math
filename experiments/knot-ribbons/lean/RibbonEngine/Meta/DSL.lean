import RibbonEngine.Compiler.Typechecker
import RibbonEngine.Meta.GarsideSimproc

/-!
# Embedded Ribbon Engine DSL (`lean-idea.md` Flex VI, `lean-plan.md` Phase 6.2)

Provides concise notation `braid[n | k₁, k₂, …]` and `ribbon_ir[n | k₁, k₂, …]` that parse
1-based signed generator integers (`+i` for `σᵢ`, `-i` for `σᵢ⁻¹`, matching SageMath and the
JS sandbox) directly into verified `BraidWord n` and `RibbonIR` terms.
-/

namespace RibbonEngine

/-- Convert a 1-based signed generator integer `k` (`+i` for `σᵢ`, `-i` for `σᵢ⁻¹`)
    into an `ArtinGen n`, ignoring out-of-range indices. -/
def genOfSignedInt (n : ℕ) (k : ℤ) : Option (ArtinGen n) :=
  if k = 0 then none
  else
    let idx0 := k.natAbs - 1
    if h : idx0 < n - 1 then
      some ⟨⟨idx0, h⟩, decide (0 < k)⟩
    else
      none

/-- Build a `BraidWord n` from a list of 1-based Sage-style signed integers `[1, -2, 1, -2]`. -/
def wordOfSignedInts (n : ℕ) (ks : List ℤ) : BraidWord n :=
  ks.filterMap (genOfSignedInt n)

/-- Concise DSL macro `braid[n | k₁, k₂, …]` for 1-based signed braid words. -/
syntax "braid[" term "|" term,* "]" : term

macro_rules
  | `(braid[$n | $[$ks],*]) => `(wordOfSignedInts $n [$[$ks],*])

/-- Concise DSL macro `ribbon_ir[n | k₁, k₂, …]` lifting a signed braid word into `RibbonIR`
    with uniform `5' → 3'` duplex polarity. -/
syntax "ribbon_ir[" term "|" term,* "]" : term

macro_rules
  | `(ribbon_ir[$n | $[$ks],*]) =>
    `(RibbonIR.fromWord (uniformPolarity $n) (wordOfSignedInts $n [$[$ks],*]))

/-- Sanity check: `braid[3 | 1, -2, 1, -2]` elaborates definitionally to `figEightEngine`. -/
theorem dsl_figEight_eq :
    braid[3 | 1, -2, 1, -2] = figEightEngine := by
  rfl

/-- Compile-time verification of the Figure-Eight knot directly via the `ribbon_ir[…]` DSL. -/
theorem dsl_figEight_verified :
    LegalKnotClosure 3 (traceStrand braid[3 | 1, -2, 1, -2]) (uniformPolarity 3) 0 :=
  verifyKnotClosure ribbon_ir[3 | 1, -2, 1, -2]

end RibbonEngine