import RibbonEngine.Garside.DiagramInvolution
import RibbonEngine.Basic.CycleCalculus

/-!
# Verified Twist-Pushing & Reidemeister-II Normalizer (`lean-plan.md` Phase 4.2 & Phase 6.2)

Provides two verified `O(L)` normalization passes on braid and ribbon programs:
1. `freeReduce`: cancels adjacent inverse Artin generators `σᵢ σᵢ⁻¹ ↦ ε`, with soundness theorem
   `traceStrand_freeReduce`.
2. `pushTwistsRight`: sweeps all global half-twist tokens `Δₙ` to the right boundary using the
   Garside diagram involution `Δₙ σᵢ = σ_{n-i} Δₙ`, with soundness theorem `pushTwistsRight_sound`.
-/

namespace RibbonEngine

variable {n : ℕ}

/-- Check whether two Artin generators are formal inverses (`σᵢ` and `σᵢ⁻¹`). -/
def ArtinGen.isInverseOf (g h : ArtinGen n) : Bool :=
  (g.idx == h.idx) && (g.sign == !h.sign)

theorem ArtinGen.act_of_isInverseOf (g h : ArtinGen n)
    (h_inv : g.isInverseOf h = true) (s : Fin n) :
    h.act (g.act s) = s := by
  simp only [isInverseOf, Bool.and_eq_true, beq_iff_eq] at h_inv
  have h_perm : h.toPerm = g.toPerm := by
    simp only [toPerm, leftStrand, rightStrand, h_inv.1]
  change h.toPerm (g.toPerm s) = s
  rw [h_perm]
  exact g.act_act s

/-- Insert a generator at the front of a reduced word, canceling an adjacent inverse pair. -/
def freeReduceCons (g : ArtinGen n) : BraidWord n → BraidWord n
  | []      => [g]
  | h :: w  => if g.isInverseOf h then w else g :: h :: w

/-- Linear-time Reidemeister-II free reduction of a braid word. -/
def freeReduce : BraidWord n → BraidWord n
  | []     => []
  | g :: w => freeReduceCons g (freeReduce w)

theorem traceStrand_freeReduceCons (g : ArtinGen n) (w : BraidWord n) (s : Fin n) :
    traceStrand (freeReduceCons g w) s = traceStrand w (g.act s) := by
  cases w with
  | nil => rfl
  | cons h rest =>
    simp only [freeReduceCons]
    by_cases h_inv : g.isInverseOf h = true
    · simp only [h_inv, ↓reduceIte, traceStrand, List.foldl_cons]
      rw [ArtinGen.act_of_isInverseOf g h h_inv s]
    · simp only [Bool.not_eq_true] at h_inv
      simp only [h_inv, Bool.false_eq_true, ↓reduceIte, traceStrand, List.foldl_cons]

/-- Soundness of Reidemeister-II free reduction: `freeReduce` preserves `traceStrand`. -/
theorem traceStrand_freeReduce (w : BraidWord n) (s : Fin n) :
    traceStrand (freeReduce w) s = traceStrand w s := by
  induction w generalizing s with
  | nil => rfl
  | cons g w ih =>
    simp only [freeReduce, traceStrand_freeReduceCons]
    exact ih (g.act s)

/-! ## Twist-pushing normalizer (`Δₙ σᵢ ↦ σ_{n-i} Δₙ`) -/

/-- A token in an unnormalized ribbon program: either a local crossing or a global
    half-twist `Δₙ`. -/
inductive RibbonToken (n : ℕ) where
  | crossing (g : ArtinGen n)
  | halfTwist
  deriving DecidableEq, Repr

/-- Trace a strand through a mixed sequence of crossings and global half-twists. -/
def traceTokens (toks : List (RibbonToken n)) (s : Fin n) : Fin n :=
  toks.foldl (fun p tok =>
    match tok with
    | .crossing g => g.act p
    | .halfTwist  => Fin.rev p) s

/-- Sweep all `halfTwist` tokens to the right boundary in `O(L)` steps, returning the
    Garside-conjugated internal braid word and the total half-twist count `m`. -/
def pushTwistsRight : List (RibbonToken n) → BraidWord n × ℕ
  | [] => ([], 0)
  | .crossing g :: rest =>
    let res := pushTwistsRight rest
    (g :: res.1, res.2)
  | .halfTwist :: rest =>
    let res := pushTwistsRight rest
    (garsideConjWord res.1, res.2 + 1)

@[simp] theorem traceTwistedRibbon_cons (g : ArtinGen n) (w : BraidWord n)
    (m : ℕ) (s : Fin n) :
    traceTwistedRibbon (g :: w) m s = traceTwistedRibbon w m (g.act s) := rfl

theorem traceStrand_garsideConjWord (w : BraidWord n) (s : Fin n) :
    traceStrand (garsideConjWord w) s = Fin.rev (traceStrand w (Fin.rev s)) := by
  have h := garsideConj_commutes_trace w (Fin.rev s)
  rw [Fin.rev_rev] at h
  exact h

/-- Soundness of Garside twist-pushing: sweeping all `halfTwist` tokens to the right boundary
    via `pushTwistsRight` strictly preserves the end-to-end strand trace. -/
theorem pushTwistsRight_sound (toks : List (RibbonToken n)) (s : Fin n) :
    traceTwistedRibbon (pushTwistsRight toks).1 (pushTwistsRight toks).2 s =
      traceTokens toks s := by
  induction toks generalizing s with
  | nil =>
    simp [pushTwistsRight, traceTwistedRibbon, traceTokens]
  | cons tok rest ih =>
    cases tok with
    | crossing g =>
      change traceTwistedRibbon (pushTwistsRight rest).1 (pushTwistsRight rest).2 (g.act s) =
        traceTokens rest (g.act s)
      exact ih (g.act s)
    | halfTwist =>
      change traceTwistedRibbon (garsideConjWord (pushTwistsRight rest).1)
          ((pushTwistsRight rest).2 + 1) s =
        traceTokens rest (Fin.rev s)
      rw [← ih (Fin.rev s)]
      simp only [traceTwistedRibbon, traceStrand_garsideConjWord]
      by_cases hm : (pushTwistsRight rest).2 % 2 = 1
      · have hm' : ((pushTwistsRight rest).2 + 1) % 2 = 0 := by omega
        simp [hm, hm']
      · have hm' : ((pushTwistsRight rest).2 + 1) % 2 = 1 := by omega
        simp [hm, hm']

end RibbonEngine