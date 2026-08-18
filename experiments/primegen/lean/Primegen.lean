/-
Companion formalisation for `experiments/primegen/paper.md`.

`Ownership`   — §2  : the smallest-prime-factor partition, roughness, phase separation, causality.
`Wheel`       — §4.2: the successor function of a fixed wheel `W`, specified and proved.
`AlgorithmA`  — §3.1: the largest-prime-factor stream tree (one-touch partition).
`AlgorithmB`  — §4  : coverage, the queue invariant, the emit decision, duplicate accounting.
`Impl`        — runnable model of Algorithm B plus sanity `#eval`s.
-/
import Primegen.Ownership
import Primegen.Wheel
import Primegen.AlgorithmA
import Primegen.AlgorithmB
import Primegen.Impl