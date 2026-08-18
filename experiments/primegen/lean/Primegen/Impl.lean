/-
A runnable model of Algorithm B, built from exactly the `activate` / `advance` used in the
proofs of `AlgorithmB.lean` (so the executable loop and the verified step are the same code).

This file contains no theorems about the *loop*; it is here to exercise the definitions and to
measure the duplicate factor of §4.5 at small scale.
-/
import Primegen.AlgorithmB

namespace Primegen
namespace Impl

open AlgB Wheel

structure BState where
  n : ℕ
  recs : List Rec
  primes : List ℕ
deriving Repr

/-- One turn of the main loop of §4.3: decide `n`, drain and advance, then activate for `n'`. -/
def stepB (W : ℕ) (s : BState) : BState :=
  let n' := nextCoprime W s.n
  let claimed := s.recs.any (fun r => r.val == s.n)
  let primes' := if claimed then s.primes else s.primes ++ [s.n]
  { n := n', recs := stepRecs W s.n n' primes' s.recs, primes := primes' }

def runB (W : ℕ) : ℕ → BState → BState
  | 0, s => s
  | k + 1, s => runB W k (stepB W s)

/-- Algorithm B on the wheel `W = 2·3·5 = 30` (`w = 3`): emit `2,3,5` then run. -/
def demo (steps : ℕ) : BState := runB 30 steps { n := 7, recs := [], primes := [] }

/-- The start state of `demo` satisfies the queue invariant of §4.3. -/
theorem inv_start : AlgB.Inv 30 7 [] := by
  refine AlgB.inv_init ?_
  intro p hp hnd
  have h2 := hp.two_le
  by_contra hle
  push_neg at hle
  have hp3 : p < 3 := by
    by_contra h
    push_neg at h
    have : 3 * 3 ≤ p * p := Nat.mul_le_mul h h
    omega
  interval_cases p
  · exact hnd (by decide)

#eval (demo 40).primes

-- Sanity check: `[2,3,5] ++ emitted` is exactly the list of primes below the next candidate.
-- (a plain comment: doc comments cannot be attached to `#eval`)
#eval
  let s := demo 40
  ([2, 3, 5] ++ s.primes) == (List.range s.n).filter (fun m => decide (Nat.Prime m))

/-- §4.5 measured: `(total pops, number of `W`-coprime composites)` below `N`.
The ratio is the duplicate factor `≈ 2–2.5` the paper predicts. -/
def dupStats (W N : ℕ) : ℕ × ℕ :=
  let comps := (List.range N).filter
    (fun m => decide (1 < m ∧ ¬ Nat.Prime m ∧ Nat.gcd m W = 1))
  ((comps.map (fun m => (claimants m).card)).sum, comps.length)

#eval dupStats 30 2000

end Impl
end Primegen