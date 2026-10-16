import RibbonEngine.Basic.SwitchingLaw

/-!
# Pure-braid ancilla checksum guard (`lean-idea.md` Flex II, **T11**)

We append `a` checksum strands `n, …, n + a - 1` that are required to remain fixed points of the
permutation shadow `τ : Fin (n + a) → Fin (n + a)`. Any single accidental crossing `g` that
touches an ancilla strand moves it to its neighbor, immediately falsifying `AncillaIntact`.
-/

namespace RibbonEngine

/-- Index of the `j`-th ancilla strand in an `(n + a)`-strand register. -/
@[inline] def ancillaIdx (n a : ℕ) (j : Fin a) : Fin (n + a) :=
  ⟨n + j.val, by omega⟩

@[simp] theorem ancillaIdx_val (n a : ℕ) (j : Fin a) :
    (ancillaIdx n a j).val = n + j.val := rfl

/-- All `a` ancilla strands return to their starting positions at `t = 1`. -/
def AncillaIntact {n a : ℕ} (τ : Fin (n + a) → Fin (n + a)) : Prop :=
  ∀ j : Fin a, τ (ancillaIdx n a j) = ancillaIdx n a j

/-- Executable Boolean ancilla checksum. -/
def ancillaIntactExec (n a : ℕ) (τ : Fin (n + a) → Fin (n + a)) : Bool :=
  (List.finRange a).all (fun j => τ (ancillaIdx n a j) == ancillaIdx n a j)

/-- **T11** (Single-fault detection): if a state satisfies `AncillaIntact`, then a single
    accidental crossing `g` touching ancilla `j` (either as `g.leftStrand` or `g.rightStrand`)
    falsifies `AncillaIntact` after the fault. -/
theorem ancilla_detects_single_fault {n a : ℕ}
    (τ : Fin (n + a) → Fin (n + a)) (h_intact : AncillaIntact τ)
    (g : ArtinGen (n + a)) (j : Fin a)
    (h_touch : g.leftStrand = ancillaIdx n a j ∨ g.rightStrand = ancillaIdx n a j) :
    ¬ AncillaIntact (fun s => g.act (τ s)) := by
  intro h_after
  have hj : g.act (τ (ancillaIdx n a j)) = ancillaIdx n a j := h_after j
  rw [h_intact j] at hj
  have h_ne : g.leftStrand ≠ g.rightStrand := by
    intro h_eq
    have := congrArg Fin.val h_eq
    simp at this
  rcases h_touch with hL | hR
  · rw [← hL] at hj
    change Equiv.swap g.leftStrand g.rightStrand g.leftStrand = g.leftStrand at hj
    rw [Equiv.swap_apply_left] at hj
    exact h_ne hj.symm
  · rw [← hR] at hj
    change Equiv.swap g.leftStrand g.rightStrand g.rightStrand = g.rightStrand at hj
    rw [Equiv.swap_apply_right] at hj
    exact h_ne hj

end RibbonEngine