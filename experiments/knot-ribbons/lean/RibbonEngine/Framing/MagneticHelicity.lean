import RibbonEngine.Framing.CWF
import Mathlib.Algebra.BigOperators.Ring.Finset
import Mathlib.Data.Fintype.BigOperators
import Mathlib.Data.Finset.Basic

/-!
# Moffatt–Berger–Field magnetic helicity & reconnection quanta (`q2.md` Part I.2)

An ensemble of `N` magnetic flux ribbons with integer flux weights `Φ i`, internal CWF
states `state i` (measured in half-twists), and pairwise Gauss linking numbers `lk i j`.
-/

namespace RibbonEngine

/-- `N` magnetic flux ribbons with flux weights, internal CWF states, and mutual linking. -/
structure FluxEnsemble (N : ℕ) where
  flux  : Fin N → ℤ
  state : Fin N → CWFRibbonState
  lk    : Fin N → Fin N → ℤ

namespace FluxEnsemble
variable {N : ℕ}

/-- Self-helicity contribution `∑ᵢ Φᵢ² · (2·Twᵢ + 2·Wrᵢ)`. -/
def selfHelicity (E : FluxEnsemble N) : ℤ :=
  ∑ i : Fin N, (E.flux i) ^ 2 * (E.state i).linkingBudget

/-- Mutual-helicity contribution `2 · ∑ᵢ ∑ⱼ Φᵢ Φⱼ Lkᵢⱼ`. -/
def mutualHelicity (E : FluxEnsemble N) : ℤ :=
  2 * ∑ i : Fin N, ∑ j : Fin N, E.flux i * E.flux j * E.lk i j

/-- Total Moffatt–Berger–Field helicity functional `ℋ_m`. -/
def totalHelicity (E : FluxEnsemble N) : ℤ :=
  E.selfHelicity + E.mutualHelicity

/-- Ideal Alfvénic frozen-in evolution (`E · B = 0`): each tube `i` uncoils `c i` writhe loops
    into twist without reconnecting across tubes. -/
def alfvenUncoil (E : FluxEnsemble N) (c : Fin N → ℤ) : FluxEnsemble N where
  flux  := E.flux
  state := fun i => (E.state i).fullerUncoil (c i)
  lk    := E.lk

/-- **T8**: ideal Alfvénic isotopies (`E · B = 0`) strictly conserve total magnetic helicity. -/
theorem alfven_isotopy_conserves_helicity (E : FluxEnsemble N) (c : Fin N → ℤ) :
    (E.alfvenUncoil c).totalHelicity = E.totalHelicity := by
  simp only [totalHelicity, selfHelicity, mutualHelicity, alfvenUncoil,
    CWFRibbonState.fullerUncoil_conserves_budget]

/-- Local reconnection pulse (`E_∥ ≠ 0`) on tube `i₀`: shifts its internal twist by `Δm`
    half-twists while leaving mutual linking and other tubes fixed. -/
def reconnectPulse (E : FluxEnsemble N) (i₀ : Fin N) (Δm : ℤ) : FluxEnsemble N where
  flux  := E.flux
  state := Function.update E.state i₀
    ⟨(E.state i₀).twist2 + Δm, (E.state i₀).writhe2⟩
  lk    := E.lk

/-- **T9**: a reconnection pulse of `Δm` half-twists on tube `i₀` changes `ℋ_m` by `Φ(i₀)² · Δm`. -/
theorem reconnection_helicity_quantum (E : FluxEnsemble N) (i₀ : Fin N) (Δm : ℤ) :
    (E.reconnectPulse i₀ Δm).totalHelicity =
      E.totalHelicity + (E.flux i₀) ^ 2 * Δm := by
  simp only [totalHelicity, mutualHelicity, selfHelicity, reconnectPulse]
  have h :
      ∀ i : Fin N,
        (E.flux i) ^ 2 * (Function.update E.state i₀
          ⟨(E.state i₀).twist2 + Δm, (E.state i₀).writhe2⟩ i).linkingBudget =
        (E.flux i) ^ 2 * (E.state i).linkingBudget +
          if i = i₀ then (E.flux i₀) ^ 2 * Δm else 0 := by
    intro i
    by_cases hi : i = i₀
    · subst hi
      simp [CWFRibbonState.linkingBudget]
      ring
    · simp [hi]
  simp_rw [h, Finset.sum_add_distrib, Finset.sum_ite_eq', Finset.mem_univ]
  simp only [↓reduceIte]
  ring

end FluxEnsemble
end RibbonEngine