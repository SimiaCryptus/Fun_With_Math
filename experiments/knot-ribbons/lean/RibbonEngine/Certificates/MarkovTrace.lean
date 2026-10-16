import RibbonEngine.Basic.SwitchingLaw

/-!
# Certificate Verification of Audit 3 (`q3.md` Audit 3, **T16**)

We formalize step-by-step horizontal Markov equivalence steps (`MarkovStep`) and verify the
explicit certificate showing that the Möbius-twisted Figure-Eight engine
`(σ₁ σ₂⁻¹)² · Δ₃ ∈ B₃` reduces to the Hopf Link `σ₁² ∈ B₂`.
-/

namespace RibbonEngine

/-- Elementary horizontal equivalence relation between closed braids `(n, w)`. -/
inductive MarkovEquiv : (n : ℕ) → BraidWord n → (m : ℕ) → BraidWord m → Prop where
  | refl {n : ℕ} (w : BraidWord n) :
      MarkovEquiv n w n w
  | trans {n₁ n₂ n₃ : ℕ} {w₁ : BraidWord n₁} {w₂ : BraidWord n₂} {w₃ : BraidWord n₃} :
      MarkovEquiv n₁ w₁ n₂ w₂ → MarkovEquiv n₂ w₂ n₃ w₃ → MarkovEquiv n₁ w₁ n₃ w₃
  /-- Cyclic shift of a braid word `g :: w ≃ w ++ [g]` (conjugation by `g`). -/
  | cyclicShift {n : ℕ} (g : ArtinGen n) (w : BraidWord n) :
      MarkovEquiv n (g :: w) n (w ++ [g])
  /-- Cancel adjacent inverse generators `u ++ [g, g.inv] ++ v ≃ u ++ v` (Reidemeister II). -/
  | cancelInv {n : ℕ} (u v : BraidWord n) (g : ArtinGen n) :
      MarkovEquiv n (u ++ [g, g.inv] ++ v) n (u ++ v)
  /-- Yang–Baxter / Reidemeister III relation `σ₁ σ₂ σ₁ ≃ σ₂ σ₁ σ₂` in `B₃`. -/
  | yangBaxter3 (u v : BraidWord 3) :
      MarkovEquiv 3 (u ++ [σ₁, σ₂, σ₁] ++ v) 3 (u ++ [σ₂, σ₁, σ₂] ++ v)
  /-- Braid relation `σ₂ σ₁ σ₂⁻¹ ≃ σ₁⁻¹ σ₂ σ₁` in `B₃`. -/
  | conjBraid3 (u v : BraidWord 3) :
      MarkovEquiv 3 (u ++ [σ₂, σ₁, σ₂.inv] ++ v) 3 (u ++ [σ₁.inv, σ₂, σ₁] ++ v)
  /-- Markov destabilization from `B₃` to `B₂`: drop a single boundary `σ₂` when the rest
      of the word uses only `σ₁`. -/
  | destabilize3to2 (w₂ : BraidWord 2) :
      MarkovEquiv 3
        (σ₂ :: w₂.map (fun g => ⟨⟨g.idx.val, by omega⟩, g.sign⟩))
        2 w₂

/-- The positive Garside half-twist `Δ₃ = σ₁ σ₂ σ₁ ∈ B₃`. -/
def Δ₃ : BraidWord 3 := [σ₁, σ₂, σ₁]

/-- The Hopf link braid `σ₁² ∈ B₂`. -/
def hopfLinkBraid : BraidWord 2 :=
  [⟨⟨0, by decide⟩, true⟩, ⟨⟨0, by decide⟩, true⟩]

/-- **T16** (`q3.md` Audit 3): explicit certificate proving that the Möbius-twisted
    Figure-Eight engine `(σ₁ σ₂⁻¹)² ++ Δ₃ ∈ B₃` is Markov-equivalent to the Hopf link `σ₁² ∈ B₂`. -/
theorem mobius_figEight_is_hopf_link :
    MarkovEquiv 3 (figEightEngine ++ Δ₃) 2 hopfLinkBraid := by
  -- Step 1: Apply Yang-Baxter to Δ₃ = [σ₁, σ₂, σ₁] ↦ [σ₂, σ₁, σ₂]
  have step1 : MarkovEquiv 3 (figEightEngine ++ Δ₃) 3
      ([σ₁, σ₂.inv, σ₁] ++ [σ₂.inv, σ₂] ++ [σ₁, σ₂]) :=
    MarkovEquiv.yangBaxter3 [σ₁, σ₂.inv, σ₁, σ₂.inv] []
  -- Step 2: Cancel adjacent [σ₂.inv, σ₂]
  have step2 : MarkovEquiv 3 ([σ₁, σ₂.inv, σ₁] ++ [σ₂.inv, σ₂] ++ [σ₁, σ₂]) 3
      [σ₁, σ₂.inv, σ₁, σ₁, σ₂] :=
    MarkovEquiv.cancelInv [σ₁, σ₂.inv, σ₁] [σ₁, σ₂] σ₂.inv
  -- Step 3: Conjugate by cycling the trailing σ₂ to the front (via 4 cyclic shifts)
  have shift1 := MarkovEquiv.cyclicShift σ₁ [σ₂.inv, σ₁, σ₁, σ₂]
  have shift2 := MarkovEquiv.cyclicShift σ₂.inv [σ₁, σ₁, σ₂, σ₁]
  have shift3 := MarkovEquiv.cyclicShift σ₁ [σ₁, σ₂, σ₁, σ₂.inv]
  have shift4 := MarkovEquiv.cyclicShift σ₁ [σ₂, σ₁, σ₂.inv, σ₁]
  have step3 := MarkovEquiv.trans shift1
    (MarkovEquiv.trans shift2 (MarkovEquiv.trans shift3 shift4))
  -- Step 4: Replace [σ₂, σ₁, σ₂.inv] with [σ₁.inv, σ₂, σ₁]
  have step4 : MarkovEquiv 3 ([] ++ [σ₂, σ₁, σ₂.inv] ++ [σ₁, σ₁]) 3
      ([] ++ [σ₁.inv, σ₂, σ₁] ++ [σ₁, σ₁]) :=
    MarkovEquiv.conjBraid3 [] [σ₁, σ₁]
  -- Step 5: Cycle leading σ₁.inv to the back and cancel [σ₁, σ₁.inv]
  have step5a := MarkovEquiv.cyclicShift σ₁.inv [σ₂, σ₁, σ₁, σ₁]
  have step5b : MarkovEquiv 3 ([σ₂, σ₁, σ₁] ++ [σ₁, σ₁.inv] ++ []) 3
      ([σ₂, σ₁, σ₁] ++ []) :=
    MarkovEquiv.cancelInv [σ₂, σ₁, σ₁] [] σ₁
  -- Step 6: Destabilize [σ₂, σ₁, σ₁] ∈ B₃ to hopfLinkBraid = [σ₁, σ₁] ∈ B₂
  have step6 : MarkovEquiv 3 [σ₂, σ₁, σ₁] 2 hopfLinkBraid :=
    MarkovEquiv.destabilize3to2 hopfLinkBraid
  exact MarkovEquiv.trans step1
    (MarkovEquiv.trans step2
      (MarkovEquiv.trans step3
        (MarkovEquiv.trans step4
          (MarkovEquiv.trans step5a
            (MarkovEquiv.trans step5b step6)))))

end RibbonEngine