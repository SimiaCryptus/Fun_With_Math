/-
Companion formalisation for `experiments/primegen/paper.md`.

`Ownership`   — §2  : the smallest-prime-factor partition, roughness, phase separation, causality.
`Wheel`       — §4.2: the successor function of a fixed wheel `W`, specified and proved.
`AlgorithmA`  — §3.1: the largest-prime-factor stream tree (one-touch partition).
`AlgorithmB`  — §4  : coverage, the queue invariant, the emit decision, duplicate accounting.
`Impl`        — runnable model of Algorithm B plus sanity `#eval`s.
`MinFactor`   — `min_factor.md`: `B_p`, the min-factor normal form (M1), the *corrected* cone
                 recursion (M2, plus the counterexample to the form printed in §2.2), phase
                 separation and causality (M3, M4), and the wheeled layer streams of Algorithm C
                 (M6–M11), including `claimants_C ⊆ claimants_B` and its strictness witness 847.
`Twin`        — `twin_prime.md`: the pair lattice, TP8 deletion geometry, Claim W, and TP7
                 (`W ⟹ TPC`) from `prime_of_rough_of_lt_sq` alone.
-/
import Primegen.Ownership
import Primegen.Wheel
import Primegen.AlgorithmA
import Primegen.AlgorithmB
import Primegen.Impl
import Primegen.MinFactor
import Primegen.Twin