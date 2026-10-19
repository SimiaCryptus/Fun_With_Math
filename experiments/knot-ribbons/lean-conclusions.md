# `RibbonEngine`: Lean 4 Formalization Conclusions

`RibbonEngine` is a zero-`sorry` Lean 4 formalization library built on Mathlib (`v4.36.0-rc1`) for the **knot-ribbons** experiment. Across 19 modules in 8 thematic directories, it formalizes the algebraic, topological, physical, and compiler-theoretic mechanics of braided ribbons, framing twists, and hierarchical cabling cascades.

---

## 1. What Was Proven? (The 18 Core Theorems, **T1–T18**)

The formalization establishes 18 machine-checked theorems spanning six mathematical and physical domains:

### I. Braid Permutation Shadows & The Cycle Calculus (`Basic/`)
* **T1 (`traceStrand_append`, `braidToPerm_append`):** Right-action strand tracing (`x ↦ x · π(β)`) composes functorially under braid word concatenation and lifts compatibly into Mathlib's symmetric group `Equiv.Perm (Fin n)`.
* **T2 (`countCyclesExec_eq_numCycles`):** *The Reflection Bridge.* Proves that the pure-functional, fuel-bounded orbit sweeper `countCyclesExec` computes the exact same number of disjoint cycles (`|\pi_0(K)|`) as Mathlib's noncomputable `Equiv.Perm.cycleType` and `support` decomposition (`numCycles`).
* **T3 & T4 (`uniform_twist_countCycles_small`, `figure_eight_mobius_fracture`):** Kernel-verified (`rfl`) confirmations that an $n$-slit Möbius half-twist yields $\lceil n/2 \rceil$ components, and that placing the 3-strand Figure-Eight engine $(\sigma_1 \sigma_2^{-1})^2 \in B_3$ inside a Möbius carrier ($m = 1$) fractures a 1-component knot into a 2-component link.
* **T5 (`fundamental_switching_law`):** *The Fundamental Switching Law.* For any permutation $\tau \in S_n$ and any Artin generator $g = \sigma_i^{\pm 1}$, right-multiplying by $g$ changes the cycle count by $\Delta k = \pm 1$:
  $$\text{numCycles}(\tau \cdot g) = \text{numCycles}(\tau) + 1 \quad \lor \quad \text{numCycles}(\tau) = \text{numCycles}(\tau \cdot g) + 1$$
  depending on whether strands $i$ and $i+1$ share an orbit (split) or belong to distinct orbits (merge).

### II. Framing Budgets & Magnetohydrodynamic Helicity (`Framing/`)
* **T6 (`fullerUncoil_conserves_budget`):** Formalizes Călugăreanu–White–Fuller (`CWFRibbonState`) conservation ($\text{Lk} = \text{Tw} + \text{Wr}$ in half-twists) and proves that Fuller/Reidemeister-I uncoiling strictly conserves the linking budget while preserving twist parity mod 2.
* **T7 (`mobius_bisection_framing_reconciliation`):** Resolves the apparent discrepancy between the Seifert linking budget ($4m_0$) and planar unfolding twist ($2m_0 + 2$) after bisecting an $m_0$-half-twist ribbon: the difference is exactly one writhe loop uncoiled via `fullerUncoil 1`, and twist parity remains even in every gauge.
* **T8 & T9 (`alfven_isotopy_conserves_helicity`, `reconnection_helicity_quantum`):** Models an $N$-tube Moffatt–Berger–Field magnetic flux ensemble $\mathcal{H}_m = \sum_i \Phi_i^2 (2\text{Tw}_i + 2\text{Wr}_i) + 2\sum_{i,j} \Phi_i \Phi_j \text{Lk}_{ij}$. Proves that ideal Alfvénic frozen-in uncoiling ($\mathbf{E}\cdot\mathbf{B}=0$) strictly conserves $\mathcal{H}_m$, whereas a local reconnection pulse of $\Delta m$ half-twists on tube $i_0$ shifts $\mathcal{H}_m$ by the exact quantum $\Phi_{i_0}^2 \Delta m$.

### III. Static Topological & Biochemical Typechecking (`Compiler/`)
* **T10 (`dna_mobius_polarity_obstruction`):** *Biochemical Möbius Obstruction.* In the dependently typed `RibbonIR n τ pol m` intermediate representation, every global half-twist flips the $5' \to 3'$ strand polarity vector over $\mathbb{Z}/2\mathbb{Z}$. Proves that an odd number of half-twists on a uniform-polarity duplex ribbon obstructs fixed-point ligation ($5' \leftrightarrow 5'$ mismatch).
* **T11 (`ancilla_detects_single_fault`):** *Pure-Braid Ancilla Guard.* Appending $a$ unbraided checksum strands to an $n$-strand register guarantees that any single accidental crossing touching an ancilla strand moves it off its fixed point and falsifies `AncillaIntact`.

### IV. Garside Normal Form & Normalization Passes (`Garside/`, `Meta/`)
* **T12 (`garsideConj_commutes_trace`):** Proves the Garside diagram involution $\Delta_n \sigma_i \Delta_n^{-1} = \sigma_{n-i}$ (0-indexed: $i \mapsto n - 2 - i$) at the permutation trace level: tracing the mirror-conjugated braid word commutes with strand reversal `Fin.rev`.
* **T13 (`garside_bruhat_knot_criterion`):** Formalizes Garside left-normal form $\Delta_n^p \cdot A_{w_1} \cdots A_{w_r}$ with left-weighted simple elements (`RightDescent(w_k) ⊇ LeftDescent(w_{k+1})`) and characterizes single-component knot closures via the composite Bruhat walk.
* **Verified Normalizers (`traceStrand_freeReduce`, `pushTwistsRight_sound`):** Proves soundness for two $O(L)$ compiler passes: Reidemeister-II adjacent inverse cancellation (`freeReduce`) and sweeping interleaved $\Delta_n$ half-twists to the right boundary via Garside conjugation (`pushTwistsRight`).

### V. Double-Categorical Gauge Duality & Certificates (`DoubleCategory/`, `Certificates/`)
* **T14 & T15 (`numCycles_conj`, `torus_axis_duality_conserves_cycles`):** Proves that horizontal braid conjugation strictly conserves `numCycles` and verifies Markov stabilization and torus link axis reciprocity $T(p,q) \simeq T(q,p)$ conserving $k = \gcd(p,q)$.
* **T16 (`mobius_figEight_is_hopf_link`):** An explicit 6-stage Markov equivalence certificate (`MarkovEquiv` via Yang–Baxter $\sigma_1\sigma_2\sigma_1 \simeq \sigma_2\sigma_1\sigma_2$, Reidemeister-II cancellation, cyclic conjugation, and $B_3 \to B_2$ destabilization) proving that the Möbius-twisted Figure-Eight braid $(\sigma_1 \sigma_2^{-1})^2 \cdot \Delta_3 \in B_3$ reduces to the Hopf link $\sigma_1^2 \in B_2$.
* **T17 (`symmetric_union_is_fox_ribbon`, `traceStrand_symmetric_union`):** Bridges framed ribbons (Sense A) with Fox slice-ribbon knots (Sense B) by proving that any palindromic symmetric union $w \cdot w^{-1}$ reduces in $O(|w|)$ Reidemeister-II steps to the trivial unlink.

### VI. Iterated Wreath Products & Cantor Solenoids (`Wreath/`)
* **T18 (`wreathMonodromy_conj_invariant`):** Formalizes the wreath product action $S_{n_2} \wr S_{n_1}$ on `Fin n₁ × Fin n₂` and proves that shifting the base-point macro-strand along a closed parent orbit conjugates the $n_1$-step micro-strand monodromy $\mu(x) \in S_{n_2}$ by $\tau_2(x)$, leaving its conjugacy class (and cycle structure) invariant.
* **Cascade Parity & Solenoids (`bisection_cascade_dies_at_depth_one`, `trisection_cascade_preserves_odd_parity`, `actCantor_succ`):** Proves that $n=2$ bisection forces even framing at depth $d \ge 1$ ($m_d = (n^2)^d m_0$), whereas $n=3$ trisection preserves odd framing parity for all $d \in \mathbb{N}$, culminating in a self-similar Nekrashevych Mealy automaton (`trisectionOdometer`) acting on profinite Cantor streams `ℕ → Fin 3`.

---

## 2. What Was Interesting in the Lean Implementation?

1. **Proof by Reflection (`countCyclesExec` vs. `numCycles`):**
   Mathlib's `Equiv.Perm.cycleFactorsFinset` and `cycleType` rely on `Finset` and `Classical.choice`, making them noncomputable and opaque to Lean's kernel reducer. By building a purely functional orbit sweeper `countCyclesExec` using `List.finRange` and `List.scanl`, concrete topological queries (like trefoil, figure-eight, and torus link component counts) evaluate instantaneously by kernel `rfl`, while **T2** transfers all abstract group-theoretic theorems from Mathlib onto the executable counter.
2. **Proving the Fundamental Switching Law (`SwitchingLaw.lean`):**
   Proving $\Delta k = \pm 1$ under transposition multiplication required a delicate finite-group orbit argument (`not_sameCycle_swap_mul_of_sameCycle`) using `Nat.find` on the minimal positive return time $k_0 > 0$ where $p^{k_0}(x) = y$, combined with a 4-way case split on whether $x$ and $y$ remain in the support of $\text{swap}(x,y) \cdot p$ after splitting a cycle, and then using involutivity ($\text{swap}(x,y)^2 = 1$) and conjugation invariance to get the merge case for free.
3. **Compile-Time Topological & Biochemical Typechecking (`RibbonIR` & `LegalKnotClosure`):**
   Indexing `RibbonIR n τ pol m` by its permutation shadow $\tau$, $5' \to 3'$ polarity map `pol`, and half-twist framing $m$ turns topological knot closure and DNA ligation compatibility into *type-level propositions*. The smart constructor `verifyKnotClosure` uses `(h_knot : countCyclesExec n τ = 1 := by rfl)` as an auto-filled default parameter: legal knot programs elaborate silently, while illegal programs (such as a Möbius-twisted Figure-Eight knot) fail at compile time.

---

## 3. What Does the Software Contribute & How Can Users Leverage It?

### Contributions
* **A Verified Braid & Ribbon Kernel:** Provides reusable, linter-clean data structures for Artin braids (`BraidWord n`), Garside normal forms (`GarsideBraid n`), CWF framing states (`CWFRibbonState`), MHD flux ensembles (`FluxEnsemble N`), and self-similar wreath automata (`WreathRibbonAutomaton n State`).
* **Executable Certificates for Knot & Link Audits:** Replaces hand-waving diagram manipulations with step-by-step formal certificates (`MarkovEquiv`) and $O(L)$ verified normalizers (`freeReduce`, `pushTwistsRight`).
* **Zero-Boilerplate Embedded DSL:** Bridges informal 1-based signed braid notation (used in SageMath and the interactive JS sandbox) with 0-based `Fin n` dependent types.

### How to Leverage `RibbonEngine`

1. **Rapid Knot & Link Prototyping with the `braid[…]` and `ribbon_ir[…]` DSL:**
   Users can write standard 1-based signed Artin words and let Lean's kernel verify component counts and DNA splice legality via `rfl`:
   ```lean
   import RibbonEngine

   open RibbonEngine

   -- Define a 3-strand braid word using 1-based signed generators (+1 = σ₁, -2 = σ₂⁻¹)
   def myBraid : BraidWord 3 := braid[3 | 1, -2, 1, -2]

   -- Compute the number of link components at compile time by kernel reduction
   example : countCyclesExec 3 (traceStrand myBraid) = 1 := rfl

   -- Statically typecheck both single-knot closure (k = 1) and 5' → 3' polarity matching
   def myVerifiedKnot :
       LegalKnotClosure 3 (traceStrand braid[3 | 1, -2, 1, -2]) (uniformPolarity 3) 0 :=
     verifyKnotClosure ribbon_ir[3 | 1, -2, 1, -2]
   ```

2. **Normalizing Mixed Crossing / Twist Programs:**
   Users compiling programs with interleaved local crossings and global half-twists (`RibbonToken n`) can run `pushTwistsRight` and `freeReduce` to obtain a canonical `(BraidWord n × ℕ)` pair, backed by `pushTwistsRight_sound` and `traceStrand_freeReduce`.

3. **Constructing Markov & Slice-Ribbon Equivalence Proofs:**
   Researchers can use the constructors of `MarkovEquiv` (`cyclicShift`, `cancelInv`, `yangBaxter3`, `conjBraid3`, `destabilize3to2`) and `markovEquiv_cancel_palindrome` to machine-check braid isotopies, destabilizations, and symmetric-union ribbon disk certificates.