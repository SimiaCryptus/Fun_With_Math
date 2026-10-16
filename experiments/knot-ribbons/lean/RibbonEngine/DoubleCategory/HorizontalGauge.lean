import RibbonEngine.Basic.CycleCalculus

/-!
# Relational Ribbon States & Horizontal Gauge Shifts (`q2.md` Part II.3, `lean-idea.md` Flex IV)
-/

namespace RibbonEngine

/-- A relational ribbon state `R = (K rel A)` wound around an axis `A` with strand count `n`. -/
structure RelationalRibbonState where
  n       : ℕ
  word    : BraidWord n
  framing : ℕ
  deriving Repr

namespace RelationalRibbonState

/-- Permutation shadow of a relational state. -/
def trace (R : RelationalRibbonState) : Fin R.n → Fin R.n :=
  traceTwistedRibbon R.word R.framing

/-- Executable cycle count `k = |\pi_0(K)|` of a relational state. -/
def componentCount (R : RelationalRibbonState) : ℕ :=
  countCyclesExec R.n R.trace

end RelationalRibbonState

/-- Embed `τ : Equiv.Perm (Fin n)` into `Equiv.Perm (Fin (n + 1))` by fixing `n`,
    then right-multiply by the boundary transposition `swap (n - 1) n` (Markov stabilization). -/
def stabilizePerm {n : ℕ} (h : 0 < n) (τ : Equiv.Perm (Fin n)) : Equiv.Perm (Fin (n + 1)) :=
  (Equiv.Perm.viaFintypeEmbedding τ Fin.castSuccEmb) *
    Equiv.swap ⟨n - 1, by omega⟩ ⟨n, by omega⟩

/-- Conjugating a permutation in `Sₙ` strictly conserves `numCycles`. -/
theorem numCycles_conj {n : ℕ} (σ τ : Equiv.Perm (Fin n)) :
    numCycles (σ * τ * σ⁻¹) = numCycles τ := by
  simp only [numCycles, Equiv.Perm.cycleType_conj, Equiv.Perm.card_support_conj]

/-- **T14** (concrete verification across small degrees): Markov stabilization preserves the
    cycle count of both the trefoil 2-cycle and the figure-eight 3-cycle. -/
theorem numCycles_stabilize_examples :
    let τ₂ := braidToPerm ([⟨⟨0, by decide⟩, true⟩] : BraidWord 2)
    let τ₃ := stabilizePerm (by decide : 0 < 2) τ₂
    let τ₄ := stabilizePerm (by decide : 0 < 3) (braidToPerm figEightEngine)
    (countCyclesExec 2 τ₂, countCyclesExec 3 τ₃, countCyclesExec 4 τ₄) = (1, 1, 1) := by
  rfl

end RibbonEngine