# Comprehensive Lean 4 Research & Formalization Plan: The Ribbon Engine

> **Project Codename:** `RibbonEngine` (`Lean 4` + `Mathlib4` + `ProofWidgets4`)
> **Foundational Corpus:** `theory.md`, `q1.md`, `q2.md`, `q3.md`, `lean-idea.md`, `np-complete.md`
> **Core Mission:** Formalize the **Generalized Ribbon Engine** as a dependently typed, split-complexity topological compiler and relational double category in Lean 4—uniting fast $\mathsf{NC}^1$ static typechecking in $S_n$, polynomial-time Garside normalization in $B_n$, Călugăreanu–White–Fuller framing cohomology, symbolic wreath-product cascades, and polynomial-time verification of $\mathsf{NP}$ topological certificates.

---

## 1. Executive Summary & Architectural Philosophy

This document translates the mathematical synthesis of `theory.md` and `q1.md`–`q3.md`, the dependent-type innovations of `lean-idea.md`, and the complexity-theoretic guardrails of `np-complete.md` into an executable, multi-phase **Lean 4 Research and Engineering Plan**.

### 1.1 The Central Scientific Thesis: The Split-Complexity Topological Compiler
At the heart of the Ribbon Engine lies the fundamental short exact sequence of the Artin Braid Group:
$$1 \longrightarrow P_n \longrightarrow B_n \xrightarrow{\;\;\pi\;\;} S_n \longrightarrow 1$$
Rather than treating this sequence as a passive algebraic definition, our Lean 4 formalization implements it as a **Split-Complexity Compiler Architecture** (`q3.md` Section 2.1, `np-complete.md` Act II):
1. **The $\mathsf{NC}^1$ Abstract Interpretation Layer (Static Type System in $S_n$):**
    Projecting a braid word $\beta \in B_n$ of length $L$ to its permutation shadow $\tau = \pi(\beta) \in S_n$ and tracking its framing twist $m \in \mathbb{Z}$ and strand polarities $\mathbf{o} \in (\mathbb{Z}_2)^n$ lies in $\mathsf{TC}^0 \subseteq \mathsf{NC}^1 \subseteq \mathsf{P}$. Yet this fast projection completely determines the global combinatorial topology: the number of link components $k = |\text{cycles}(\tau)|$, the longitudinal length multiplier $l_r$ of each component, the wreath monodromy $\mu$ across hierarchical cuts, and biochemical $5' \to 3'$ Watson–Crick ligation legality. In Lean 4, this entire layer lives **inside the dependent type signature** and is discharged automatically at elaboration time via kernel computation (`by rfl`, `decide`, `omega`).
2. **The $\mathsf{P}$ Canonical Normalization Layer (Word Problem in Fixed $B_n$):**
    Within a fixed braid register $B_n$, equivalence of braid words ($\beta_1 = \beta_2$) and commutation of global ribbon twists ($\Delta_n \sigma_i \Delta_n^{-1} = \sigma_{n-i}$) are solvable in $O(L^2 n \log n)$ time via **Garside Left-Normal Form** ($\beta = \Delta_n^p A_{w_1} \dots A_{w_r}$) and Dehornoy handle reduction. In Lean 4, this layer is implemented via canonical Bruhat/Lehmer representations and verified `Lean.Meta` `dsimproc` normalizers.
3. **The $\mathsf{NP}$ Certificate Verification Layer (Relational Equivalence Across Axes):**
    Finding minimal braid words, Ultra Summit Set conjugators, non-monotonic Markov stabilization paths (Birman–Menasco MTWS), or Fox ribbon band surgeries is $\mathsf{NP}$-hard. Following the **Oracle + Certificate Principle** (`np-complete.md` Act II.2), Lean 4 **never searches** exponential summit graphs in the kernel. Instead, external heuristics or interactive human moves in the 3D WebGL sandbox generate an explicit witness certificate $w$ (a sequence of horizontal gauge morphisms in `RibbonDoubleCat`), and Lean 4 verifies $V(\beta_1, \beta_2, w) = 1$ in polynomial time.

### 1.2 The Four Architectural Golden Rules
To guarantee fast compilation, zero kernel out-of-memory (OOM) failures, and seamless interoperability with `Mathlib4`, all code in this project adheres to four strict engineering rules:

| Rule # | Architectural Principle | What Runs in the Lean 4 Kernel / Elaborator | What Runs Externally or Symbolically |
| :--- | :--- | :--- | :--- |
| **Rule 1** | **Computational Reflection Bridge** | Executable `Fin n → Fin n` arrays and bit-packed Lehmer codes for `by rfl` / `native_decide` on concrete braids. | Abstract `Mathlib` `Equiv.Perm (Fin n)` and `CycleType` proofs connected via a verified `@[csimp]` / equivalence bridge. |
| **Rule 2** | **Oracle + Certificate for $\mathsf{NP}$ Moves** | Polynomial-time verification of explicit conjugators $\gamma \in B_n$, Markov stabilizations $\mathcal{S}^{\pm}$, and band surgeries $\mathcal{R}_i^{\pm}$. | Heuristic search for Ultra Summit Sets, Reidemeister/Markov untangling paths, and 3D WLC elastic relaxation. |
| **Rule 3** | **Symbolic Induction for Wreath Cascades** | Symbolic proofs of `wreathMonodromy_conj_invariant` and $n=2$ vs. $n=3$ parity scaling over arbitrary $n_1, n_2, d$. | Explicit enumeration of $n^d$ strands is strictly capped at $d \le 3$ in tests; $d \to \infty$ is modeled coinductively. |
| **Rule 4** | **0-Indexed `Fin n` Standardization** | All Lean 4 definitions use 0-indexed `Fin n` (`0, ..., n-1`) and right-action strand tracing (`q3.md` Audit 1) for `omega` ergonomics. | Pretty-printers and InfoView widgets translate to 1-indexed mathematical cycle notation `(1 2 ... n)` for human display. |

---

## 2. Repository & Lake Package Architecture

The Lean 4 formalization will be organized as a standalone Lake package inside `experiments/knot-ribbons/lean/` (or root module `RibbonEngine`) depending on `mathlib4` and `ProofWidgets4`.

```text
experiments/knot-ribbons/lean/
├── lakefile.lean
├── lean-toolchain
├── RibbonEngine.lean                     -- Root import aggregator
└── RibbonEngine/
     ├── Basic/
     │   ├── ArtinBraid.lean               -- Artin generators, BraidWord, right-action strand tracing (Audit 1)
     │   ├── CycleCalculus.lean            -- Fuel-bounded countCycles, bridge to Mathlib Equiv.Perm.cycleType
     │   └── SwitchingLaw.lean             -- Fundamental Switching Law (Δk = ±1, Hamming distance d_H = 1)
     ├── Framing/
     │   ├── CWF.lean                      -- Călugăreanu-White-Fuller Lk = Tw + Wr, Fuller uncoiling 1-cocycle
     │   ├── BisectionAudit.lean           -- Proof of 4m₀ (Seifert) vs 2m₀+2 (planar) & even parity (Audit 2)
     │   └── MagneticHelicity.lean         -- Moffatt-Berger-Field helicity budget & E·B reconnection quanta
     ├── Compiler/
     │   ├── RibbonIR.lean                 -- Dependently typed RibbonIR indexed by (n, τ, polarity, m)
     │   ├── Typechecker.lean              -- Tabled typeclass synthesis for k=1 knots & 5'→3' DNA legality
     │   └── AncillaGuard.lean             -- Pure-braid P_n ancilla checksum functor (fault-tolerant guard)
     ├── Garside/
     │   ├── SimpleElements.lean           -- Positive permutation braids [1, Δ_n] ≅ S_n, Lehmer codes
     │   ├── DiagramInvolution.lean        -- Δ_n σ_i Δ_n⁻¹ = σ_{n-i} mirror involution & twist pushing
     │   └── LeftNormalForm.lean           -- Left-weighted descent condition & Bruhat trajectory theorem
     ├── DoubleCategory/
     │   ├── RelationalState.lean          -- Relational pairs R = (K rel A), winding number n_A = Lk(K, A)
     │   ├── HorizontalGauge.lean          -- C_γ (conjugation), S^± (stabilization), D_{p,q} (torus duality)
     │   ├── VerticalConstructive.lean     -- ⊙_A, F_n (foliation), T^m (twist), R_i^± (reconnection), W (wreath)
     │   └── TorusReciprocity.lean         -- Proof of T(p,q) ≃ T(q,p) cycle invariance via Nat.gcd_comm
     ├── Certificates/
     │   ├── MarkovTrace.lean              -- Certificate verifier for Markov equivalence & Audit 3 (4_1 + Δ_3 ≃ Hopf)
     │   └── FoxRibbon.lean                -- Symmetric unions & band-fission certificates for Fox ribbon knots
     ├── Wreath/
     │   ├── Monodromy.lean                -- Symbolic wreath product S_{n₂} ≀ S_{n₁} & monodromy μ (Audit 4)
     │   ├── CascadeParity.lean            -- Bisection death (n=2, d=2) vs. Immortal Trisection (n=3, d→∞)
     │   └── CantorSolenoid.lean           -- Coinductive Nekrashevych Mealy automaton on ℤ_3 Cantor streams
     └── Meta/
         ├── DSL.lean                      -- Custom `ribbon_engine%` syntax & `#ribbon_compile` command
         ├── GarsideSimproc.lean           -- Verified `garside_norm` dsimproc for O(L) twist-pushing
         └── OpenBookWidget.lean           -- ProofWidgets4 RPC server for 3D WebGL ribbon & magnetic axis view
```

---

## 3. Phased Research & Implementation Roadmap

The research plan is structured into **six sequential phases**, progressing from concrete kernel-computable primitives (`Phase 1`–`Phase 3`) to deep structural algebra (`Phase 4`–`Phase 6`). Every phase produces self-contained, `sorry`-free deliverables before the next phase begins.

---

### Phase 1: Strand-Tracing Permutations, Cycle Calculus, and the $\mathsf{NC}^1$ Shadow
**Target Modules:** `RibbonEngine/Basic/ArtinBraid.lean`, `CycleCalculus.lean`, `SwitchingLaw.lean`
**Theoretical Anchors:** `theory.md` §§2–4, `q1.md` §3, `q3.md` Audit 1, `lean-idea.md` Flex I

#### 1.1 Objectives
Establish the core data structures for Artin braids, the right-action strand-tracing homomorphism $\pi: B_n \to S_n$, and a dual executable/abstract cycle counter that enables instant `by rfl` verification on concrete knots while unlocking `Mathlib.GroupTheory.Perm` lemmas for general $n$.

#### 1.2 Technical Specifications
1. **Standardized Right-Action Strand Tracing (`q3.md` Audit 1):**
    * Define `ArtinGen (n : ℕ)` with `idx : Fin (n - 1)` and `sign : Bool`.
    * Define `traceStrand : BraidWord n → Fin n → Fin n` via left-to-right `List.foldl` so that reading a braid word left-to-right physically traces each strand from $t = 0$ to $t = 1$:
      $$x \cdot \pi(\beta_1 \cdot \beta_2) = (x \cdot \pi(\beta_1)) \cdot \pi(\beta_2)$$
    * Prove that `traceStrand w` is a bijection on `Fin n` and lift it to a group homomorphism `braidToPerm : BraidWord n → Equiv.Perm (Fin n)`.
2. **Executable-to-Mathlib Cycle Reflection Bridge:**
    * Implement `countCyclesExec (n : ℕ) (f : Fin n → Fin n) : ℕ` using fuel-bounded orbit sweeping (`lean-idea.md` Flex I) so the Lean 4 kernel reduces concrete examples in microseconds via `by rfl`.
    * Define the abstract cycle count `numCycles (τ : Equiv.Perm (Fin n)) : ℕ := τ.cycleType.card + (Fintype.card (Fin n) - τ.support.card)` (counting non-trivial disjoint cycles plus fixed points).
    * Prove the reflection bridge theorem:
      ```lean
      theorem countCyclesExec_eq_numCycles {n : ℕ} (τ : Equiv.Perm (Fin n)) :
          countCyclesExec n τ = numCycles τ
      ```
3. **The Classical Twist & Figure-Eight Möbius Fracture (`Flex I`):**
    * Define the reversal involution $\tau_{\text{rev}}(i) = n - 1 - i$ (0-indexed) and prove $\tau_{\text{rev}}^2 = \text{id}$.
    * Prove the closed-form cycle count of uniform twists $\Delta_n^m$ (`theory.md` §3):
      $$\text{numCycles}(\tau_{\text{rev}}^m) = \begin{cases} n & \text{if } m \equiv 0 \pmod 2 \\ \lceil n / 2 \rceil & \text{if } m \equiv 1 \pmod 2 \end{cases}$$
    * Prove `figure_eight_mobius_fracture` (`lean-idea.md` Flex I) purely by `rfl`: closing $\beta_{\text{int}} = (\sigma_1 \sigma_2^{-1})^2 \in B_3$ with $m=0$ yields $k=1$ component ($4_1$), whereas $m=1$ fractures it into $k=2$ components.
4. **The Fundamental Switching Law (`theory.md` §6):**
    * Prove that right-multiplying any permutation $\tau \in S_n$ by an adjacent transposition $s_i = \text{swap}(i, i+1)$ changes `numCycles` by exactly $\pm 1$:
      ```lean
      theorem fundamental_switching_law {n : ℕ} (τ : Equiv.Perm (Fin n)) (i : Fin (n - 1)) :
          let sᵢ := Equiv.swap ⟨i.val, by omega⟩ ⟨i.val + 1, by omega⟩
          (numCycles (τ * sᵢ) = numCycles τ + 1) ∨ (numCycles τ = numCycles (τ * sᵢ) + 1)
      ```
      *(Proof Strategy: Apply `Mathlib`'s `Equiv.Perm.SameCycle` dichotomy—either $i$ and $i+1$ lie in the same cycle of $\tau$, splitting it in two, or in disjoint cycles, merging them.)*

---

### Phase 2: Călugăreanu–White–Fuller Framing Cohomology & MHD Helicity
**Target Modules:** `RibbonEngine/Framing/CWF.lean`, `BisectionAudit.lean`, `MagneticHelicity.lean`
**Theoretical Anchors:** `theory.md` §§1, 5; `q2.md` Part I; `q3.md` Audit 2; `lean-idea.md` Flex V

#### 2.1 Objectives
Formalize the continuous/discrete topological conservation law $\text{Lk} = \text{Tw} + \text{Wr}$, reconcile the $4m_0$ (Seifert) vs. $2m_0 + 2$ (planar paper-strip) Möbius bisection framing formulas (`q3.md` Audit 2), and formalize the Moffatt–Berger–Field magnetic helicity budget in $(3+1)$D magnetohydrodynamics.

#### 2.2 Technical Specifications
1. **The CWF Framed Immersion State & Fuller Uncoiling 1-Cocycle (`Flex V`):**
    * Define `CWFRibbonState` with integer half-twist coordinates `twist2 : ℤ` ($2\cdot\text{Tw}$) and `writhe2 : ℤ` ($2\cdot\text{Wr}$), and `linkingBudget := twist2 + writhe2`.
    * Define the Reidemeister-I / Fuller uncoiling operator `fullerUncoil (c : ℤ)` trading $\Delta\text{Wr} = -c$ full coils for $\Delta\text{Tw} = +c$ full twists, and prove `fullerUncoil_conserves_budget`.
2. **Audit 2 Reconciliation Theorem (`mobius_bisection_framing_reconciliation`):**
    * Formalize the general $n$-cut cabling framing operator `sliceFraming (n : ℕ) (m₀ : ℤ) : CWFRibbonState` where intrinsic twist scales by $n \cdot m_0$ and coiled tubular writhe scales by $n(n-1) m_0$, yielding total Seifert self-linking budget $n^2 m_0$ half-twists.
    * Prove that for $n = 2$ (bisection of an $m_0$-half-twist Möbius strip), uncoiling $c = 1$ loop converts the coiled state $\langle 2m_0, 2m_0 \rangle$ ($\text{Lk}_2 = 4m_0$) into the flat planar state with $\text{twist}_2 = 2m_0 + 2$ ($8$ half-twists for $m_0 = 3$), and prove that **under all three framing gauges** ($2m_0$, $2m_0+2$, $4m_0$), the child twist parity is strictly even ($\equiv 0 \pmod 2$).
3. **Spacetime MHD Magnetic Helicity & Reconnection Quanta (`q2.md` Part I.2):**
    * Define a multi-ribbon magnetic flux ensemble `FluxEnsemble (N : ℕ)` equipped with flux weights $\Phi : \text{Fin } N \to \mathbb{Z}$, internal CWF states $s_i$, and pairwise Gauss linking numbers $\text{Lk}_{ij}$.
    * Formalize the **Moffatt–Berger–Field Helicity Functional**:
      $$\mathcal{H}_m = \sum_{i=1}^N \Phi_i^2 (\text{Tw}_i + \text{Wr}_i) + 2 \sum_{i < j} \Phi_i \Phi_j \text{Lk}_{ij}$$
    * Prove that ideal Alfvénic frozen-in evolutions ($\mathbf{E} \cdot \mathbf{B} = 0$, modeled as arbitrary combinations of local Fuller uncoiling moves) strictly conserve $\mathcal{H}_m$, whereas a localized parallel electric field reconnection pulse $\mathcal{R}_i^{\pm}$ ($E_\parallel \neq 0$) shifts $\mathcal{H}_m$ by an exact quantized flux step $\Delta \mathcal{H}_m = \pm 2 \Phi_i \Phi_{i+1}$.

---

### Phase 3: Dependently Typed `RibbonIR` & Fault-Tolerant Ancilla Typechecker
**Target Modules:** `RibbonEngine/Compiler/RibbonIR.lean`, `Typechecker.lean`, `AncillaGuard.lean`
**Theoretical Anchors:** `theory.md` §§2, 4, 6; `q3.md` §2.1 & Avenue 1; `lean-idea.md` Flex II; `np-complete.md` Act II.3

#### 3.1 Objectives
Turn Lean 4's dependent type system and tabled typeclass synthesizer into an $\mathsf{NC}^1$ static topological compiler that verifies component counts, enforces antiparallel $5' \to 3'$ DNA phosphodiester ligation rules, and guards against $d_H = 1$ single-crossing faults via pure-braid ancilla checksums.

#### 3.2 Technical Specifications
1. **Indexed Inductive Intermediate Representation (`RibbonIR`):**
    ```lean
    inductive RibbonIR (n : ℕ) : (Fin n → Fin n) → (Fin n → ZMod 2) → ℤ → Type where
      | nil (pol₀ : Fin n → ZMod 2) :
          RibbonIR n id pol₀ 0
      | crossing (g : ArtinGen n) {τ pol m} (prev : RibbonIR n τ pol m) :
          RibbonIR n (stepStrand g ∘ τ) (stepStrand g ∘ pol) m
      | halfTwist (sign : Bool) {τ pol m} (prev : RibbonIR n τ pol m) :
          -- A 180° Möbius flip reverses strand indices AND flips 5'→3' duplex polarity!
          RibbonIR n (revIdx ∘ τ) (fun i => pol (revIdx i) + 1) (m + if sign then 1 else -1)
    ```
2. **Compile-Time Biochemical & Topological Typeclasses (`Flex II`):**
    * Define `class LegalKnotClosure (n : ℕ) (τ : Fin n → Fin n) (pol : Fin n → ZMod 2) (m : ℤ) : Prop`:
      1. `is_single_knot : countCyclesExec n τ = 1`
      2. `polarity_conserved : ∀ i : Fin n, pol (τ i) = pol i` (ensuring that when strand $i$ glues to strand $\tau(i)$ at the splicing boundary, $5'\to 3'$ backbones never ligate head-to-head $5'\leftrightarrow 5'$).
    * Provide a decidable instance via `decide` so that illegal B-DNA Möbius splices fail **at elaboration time**.
    * Prove the **Biochemical Möbius Obstruction Theorem** (`theory.md` §4): for any $n$-strand ribbon with uniform duplex polarity, an odd framing twist ($m \equiv 1 \pmod 2$) can never satisfy `polarity_conserved` on any odd-length permutation cycle!
3. **Pure-Braid Ancilla Checksum Monad (`AncillaGuard.lean`):**
    * Define an embedding functor `injectAncillas (a : ℕ) : RibbonIR n τ pol m → RibbonIR (n + a) τ' pol' m` where the $a$ ancilla strands only execute pure-braid wraps ($\beta_{\text{anc}} \in P_{n+a}$).
    * Define the predicate `AncillaIntact (τ' : Fin (n + a) → Fin (n + a)) : Prop := ∀ j : Fin a, τ' ⟨n + j, _⟩ = ⟨n + j, _⟩`.
    * Prove the **Single-Fault Detection Theorem**: any single accidental crossing fault $\mathcal{R}_i^{\pm}$ between a data strand and an ancilla strand (or between two ancilla strands) falsifies `AncillaIntact` with $100\%$ certainty (raising the effective fault distance of the boundary typecheck from $d_H = 1$ to $d_H = 2$).

---

### Phase 4: Canonical Garside Left-Normal Form & Bruhat Trajectories
**Target Modules:** `RibbonEngine/Garside/SimpleElements.lean`, `DiagramInvolution.lean`, `LeftNormalForm.lean`
**Theoretical Anchors:** `theory.md` §§3–4, `q1.md` §3.III, `lean-idea.md` Flex I & VI, `np-complete.md` Act II.1

#### 4.1 Objectives
Formalize Garside's positive simple elements $[1, \Delta_n] \cong S_n$, the diagram involution $\Delta_n \sigma_i \Delta_n^{-1} = \sigma_{n-i}$, and the characterization of knots around an axis as constrained permutation walks in the weak Bruhat lattice of $S_n$.

#### 4.2 Technical Specifications
1. **Garside Diagram Involution & Twist Pushing (`DiagramInvolution.lean`):**
    * Define `ArtinGen.garsideConj (g : ArtinGen n) : ArtinGen n` mapping index $i \mapsto n - 2 - i$ (0-indexed).
    * Prove that `garsideConj` is an involution on `BraidWord n` and commutes with the permutation projection up to conjugation by $\tau_{\text{rev}}$:
      $$\pi(\text{garsideConj}(\beta)) = \tau_{\text{rev}} \circ \pi(\beta) \circ \tau_{\text{rev}}$$
    * Implement the $O(L)$ twist-pushing normalizer `pushTwistsRight` that sweeps all $\Delta_n^{\pm 1}$ framing tokens to the right end of a ribbon program while applying `garsideConj` to intermediate crossings.
2. **Simple Elements $[1, \Delta_n]$ via Inversion Sets (`SimpleElements.lean`):**
    * Represent a positive simple element $A_w \in [1, \Delta_n]$ by its canonical permutation $w \in \text{Equiv.Perm (Fin } n)$, equipped with its inversion set $\text{Inv}(w) = \{(i, j) \mid i < j \text{ and } w(i) > w(j)\}$.
    * Define left and right descent sets:
      $$\text{LeftDescent}(w) = \{i \in \text{Fin}(n-1) \mid w(i) > w(i+1)\}, \quad \text{RightDescent}(w) = \text{LeftDescent}(w^{-1})$$
    * Define the **Left-Weightedness Condition** for a pair of simple elements $(w_1, w_2)$:
      $$\text{IsLeftWeighted }(w_1, w_2) \iff \text{RightDescent}(w_1) \supseteq \text{LeftDescent}(w_2)$$
3. **Garside Left-Normal Form & Bruhat Trajectory Theorem (`q1.md` §3.III):**
    * Define `GarsideBraid (n : ℕ)` as a dependent record:
      ```lean
      structure GarsideBraid (n : ℕ) where
        infimum : ℤ
        factors : List (Equiv.Perm (Fin n))
        non_id  : ∀ w ∈ factors, w ≠ 1
        non_rev : ∀ w ∈ factors, w ≠ revPerm n
        weighted : factors.Chain' IsLeftWeighted
      ```
    * Prove the **Bruhat Walk Characterization of Knots**: a `GarsideBraid n` compiles to a single-component knot ($k=1$) if and only if the composite permutation product $(\tau_{\text{rev}})^{\text{infimum}} \cdot \prod_{k=1}^r w_k$ in $S_n$ is a single transitive $n$-cycle.

---

### Phase 5: The Relational Double Category, Markov Certificates, & Fox Ribbon Bridges
**Target Modules:** `RibbonEngine/DoubleCategory/*`, `RibbonEngine/Certificates/*`
**Theoretical Anchors:** `q1.md` §2–3, `q2.md` Part II, `q3.md` Audit 3, `lean-idea.md` Flex IV, `np-complete.md` Act II.2 & II.4

#### 5.1 Objectives
Formalize the **Relational Constructive Operation Family** ($\mathfrak{Op}_{\text{Ribbon}}$) as a Double Category (`RibbonDoubleCat`) separating **Horizontal Frame-Shift Morphisms** (which change the winding axis $A$ while conserving cycle count $k$) from **Vertical Constructive Morphisms** (which actively build knots and mutate $k$). Implement polynomial-time verifiers for $\mathsf{NP}$ Markov equivalence traces and Fox Slice-Ribbon band-surgery certificates.

#### 5.2 Technical Specifications
1. **The Double Category `RibbonDoubleCat` (`q2.md` Part II.3, `Flex IV`):**
    * **Objects:** `RelationalRibbonState` tuples $(n_A, \beta_A \in B_{n_A}, m_A \in \mathbb{Z})$ representing a link wound around an axis $A$ with linking/winding number $n_A = \text{Lk}(K, A)$.
    * **Horizontal 1-Morphisms (`HorizGaugeShift` — Axis / Frame Transformations):**
      1. `conjugate (γ : BraidWord n)` : Splicing page rotation $\beta \mapsto \gamma \beta \gamma^{-1}$.
      2. `stabilize (sign : Bool)` : Pushing axis $A$ across a twisted strand ($B_n \to B_{n+1}$, $\beta \mapsto \beta \sigma_n^{\pm 1}$).
      3. `destabilize (sign : Bool)` : Inverse of `stabilize`.
      4. `braidRel` : Local Artin relations $\sigma_i \sigma_i^{-1} = 1$, $\sigma_i \sigma_j = \sigma_j \sigma_i$ ($|i-j|\ge 2$), and $\sigma_i \sigma_{i+1} \sigma_i = \sigma_{i+1} \sigma_i \sigma_{i+1}$.
      5. `torusDualize (p q : ℕ)` : Swapping Hopf-linked Heegaard axes $A_1 \leftrightarrow A_2$ between $(\sigma_1 \dots \sigma_{p-1})^q \in B_p$ and $(\sigma_1 \dots \sigma_{q-1})^p \in B_q$.
    * **Vertical 1-Morphisms (`VertConstructiveOp` — State Operations):**
      1. `concat` ($\odot_A$), 2. `foliate` ($\mathcal{F}_n$), 3. `framingTwist` ($\mathcal{T}^m$), 4. `reconnect` ($\mathcal{R}_i^{\pm}$), 5. `wreathSubstitute` ($\mathcal{W}$).
2. **The Master Horizontal Conservation Theorem (`HorizGaugeShift.conserves_numCycles`):**
    Prove that **every Horizontal 1-Morphism strictly preserves the permutation cycle count $k$ across the infinite symmetric tower $\bigcup_{n \ge 1} S_n$**:
    * **Conjugation Invariance:** `numCycles (σ * τ * σ⁻¹) = numCycles τ` (from `Equiv.Perm.cycleType_conj`).
    * **Stabilization Splice Invariance (`q1.md` §3.II):** Embedding $\tau \in S_n \hookrightarrow S_{n+1}$ adds $n+1$ as a fixed point (increasing `numCycles` by $+1$), and right-multiplying by the boundary transposition $(n \;\; n+1)$ merges $(n+1)$ into the cycle of $n$ (decreasing `numCycles` by $-1$), yielding:
      ```lean
      theorem numCycles_stabilize {n : ℕ} [NeZero n] (τ : Equiv.Perm (Fin n)) :
          numCycles (stabilizePerm τ) = numCycles τ
      ```
    * **Torus Modular Reciprocity (`TorusReciprocity.lean`, `q1.md` §3.II):**
      Prove that for the canonical $p$-cycle $C_p = (0 \;\; 1 \;\; \dots \;\; p-1) \in S_p$, the $q$-th power $C_p^q$ decomposes into exactly $\gcd(p, q)$ disjoint cycles of length $p / \gcd(p, q)$ (and symmetrically for $C_q^p \in S_q$), so that:
      ```lean
      theorem torus_axis_duality_conserves_cycles (p q : ℕ) [NeZero p] [NeZero q] :
          numCycles ((canonicalCycle p) ^ q) = Nat.gcd p q ∧
          numCycles ((canonicalCycle q) ^ p) = Nat.gcd q p ∧
          numCycles ((canonicalCycle p) ^ q) = numCycles ((canonicalCycle q) ^ p)
      ```
3. **Certificate Verification of Audit 3 (`MarkovTrace.lean`):**
    * Formalize the explicit 5-step `HorizGaugeShift` certificate from `q3.md` Audit 3 proving that the Möbius-twisted Figure-Eight engine $\beta_{\text{total}} = (\sigma_1 \sigma_2^{-1})^2 \Delta_3 \in B_3$ reduces via Artin braid relations, conjugation by $\sigma_2$, and Markov destabilization ($B_3 \to B_2$) to the **Hopf Link** $\sigma_1^2 \in B_2$!
4. **Fox Slice-Ribbon Band-Surgery Certificates (`FoxRibbon.lean`, `np-complete.md` Act II.4):**
    * Bridge Sense A ribbons (framed $I$-bundles) and Sense B ribbons (Fox 1962 slice-ribbon knots bounding immersed disks $D^2 \looparrowright S^3$):
    * Define `FoxRibbonCertificate (n : ℕ) (β : BraidWord n)` as a sequence of $n-1$ vertical band-fission reconnections $\mathcal{R}_{i_1}^{\epsilon_1}, \dots, \mathcal{R}_{i_{n-1}}^{\epsilon_{n-1}}$ (each strictly increasing `numCycles` from $1 \to 2 \to \dots \to n$ via the Fundamental Switching Law) paired with a `HorizGaugeShift` certificate proving the resulting $n$-component link is Markov-equivalent to the $n$-strand trivial braid $\varepsilon \in B_n$.
    * Prove Lamm's **Symmetric Union Ribbon Theorem**: any palindromic braid word of the form $\beta \cdot \mathcal{R}_{i_1}^{\pm} \cdots \beta^{-1}$ automatically admits a valid `FoxRibbonCertificate` verified in $O(L)$ steps!

---

### Phase 6: Symbolic Wreath Cascades, Coinductive Solenoids, & Metaprogramming
**Target Modules:** `RibbonEngine/Wreath/*`, `RibbonEngine/Meta/*`
**Theoretical Anchors:** `theory.md` §5, `q1.md` §3.IV, `q2.md` Part II.3, `q3.md` Audit 4, `lean-idea.md` Flex III & VI, `np-complete.md` Act II.5

#### 6.1 Objectives
Formalize the Salvatore–Wahl $E_2^{\text{fr}}$ operadic wreath substitution $B_{n_2} \wr B_{n_1} \to B_{n_1 n_2}$, prove the **Wreath Monodromy Transitivity Criterion** symbolically for all $n_1, n_2$, establish the dichotomy between $n=2$ bisection death and $n=3$ 3-adic solenoidal immortality, and build the custom Lean 4 DSL and `ProofWidgets4` 3D visualizer.

#### 6.2 Technical Specifications
1. **Wreath Monodromy Conjugacy & Transitivity (`Monodromy.lean`, `q3.md` Audit 4):**
    * Define the wreath product action `wreathPerm (τ₁ : Equiv.Perm (Fin n₁)) (τ₂ : Fin n₁ → Equiv.Perm (Fin n₂)) : Equiv.Perm (Fin n₁ × Fin n₂)`.
    * Define the base-point monodromy product $\mu(x_0) = \prod_{k=0}^{n_1-1} \tau_2(\tau_1^k(x_0)) \in S_{n_2}$.
    * Prove **Audit 4 (`wreathMonodromy_conj_invariant`)**: shifting the base point $x_0 \mapsto \tau_1(x_0)$ along any transitive $n_1$-cycle conjugates $\mu(x_0)$ by $\tau_2(x_0) \in S_{n_2}$, preserving its cycle type.
    * Prove the **Wreath Transitivity Criterion**: `wreathPerm τ₁ τ₂` is a single $(n_1 n_2)$-cycle if and only if $\tau_1$ is a single $n_1$-cycle and $\mu(x_0)$ is a single $n_2$-cycle.
2. **Classical Bisection Death ($n=2$) vs. Immortal Trisection ($n=3$) (`CascadeParity.lean`, `Flex III`):**
    * **Theorem A (`bisection_cascade_dies_at_depth_two`):** For $n_1 = n_2 = 2$ and any odd initial twist $m_0 = 2k+1$, prove that under *any* of the three CWF framing conventions ($2m_0$, $2m_0+2$, $4m_0$), the child framing $m_1$ is even, so $\mu = \tau_{\text{rev}}^{m_1} = \text{id} \in S_2$ and the depth-2 cascade fractures into $k = 2$ components.
    * **Theorem B (`trisection_cascade_immortal`):** For $n = 3$ with a transitive $3$-cycle internal engine and odd initial framing $m_0$, prove by induction on depth $d \in \mathbb{N}$ that $m_d = 9^d m_0$ remains strictly odd for all $d \ge 0$, maintaining a single $3^d$-cycle at every finite depth!
3. **Coinductive Cantor-Ribbon Solenoid (`CantorSolenoid.lean`):**
    * Encode the $d \to \infty$ limit as a Nekrashevych self-similar Mealy automaton (`WreathRibbonAutomaton n State`) acting on profinite Cantor streams `CantorStrand n := ℕ → Fin n`, and prove that the 3-adic trisection automaton induces a minimal, transitive odometer action on $\mathbb{Z}_3$.
4. **Metaprogramming & Interactive 3D Open-Book InfoView Widget (`Meta/*`, `Flex VI`):**
    * Implement the `ribbon_engine%` custom elaborator (`DSL.lean`) allowing ASCII/Unicode braid diagrams and operadic cabling blocks to elaborate directly into typed `RibbonIR` terms.
    * Implement `garside_norm` (`GarsideSimproc.lean`), a verified `Simp.DSimpProc` that calls `pushTwistsRight` and cancels adjacent $\sigma_i \sigma_i^{-1}$ pairs in $O(L)$ meta-steps.
    * Implement `OpenBookWidget.lean` using `ProofWidgets4`: render the 3D ribbon manifold $R \subset S^3$, the central Biot–Savart magnetic axis $A$, the live CWF budget ($\text{Lk} = \text{Tw} + \text{Wr}$), and the cycle partition $\lambda \vdash n$, with RPC click handlers that insert `apply VertConstructiveOp.reconnect` or `apply CWFRibbonState.fullerUncoil` directly into the user's Lean proof script.

---

## 4. Master Theorem Inventory & Verification Ledger

The table below catalogs the 18 flagship theorems across the 6 phases, specifying their exact complexity stratum, proof mechanism in Lean 4, and source reference in the project documents:

| ID | Theorem / Artifact Name | Module | Complexity Class | Lean 4 Proof Mechanism | Source Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T1** | `traceStrand_append` | `Basic.ArtinBraid` | $\mathsf{NC}^1$ | `List.foldl_append` + `rfl` | `q3.md` Audit 1 |
| **T2** | `countCyclesExec_eq_numCycles` | `Basic.CycleCalculus` | Bridge | Orbit induction on `Finset.univ` | `lean-idea.md` Flex I |
| **T3** | `uniform_twist_numCycles` | `Basic.CycleCalculus` | $\mathsf{TC}^0$ | Parity split + involution orbit size | `theory.md` §3 |
| **T4** | `figure_eight_mobius_fracture` | `Basic.CycleCalculus` | $\mathsf{NC}^1$ ($n=3$) | **1-line `by rfl`** | `lean-idea.md` Flex I |
| **T5** | `fundamental_switching_law` | `Basic.SwitchingLaw` | $\mathsf{NC}^1$ | `Equiv.Perm.SameCycle` case split | `theory.md` §6 |
| **T6** | `fullerUncoil_conserves_budget` | `Framing.CWF` | $\mathsf{TC}^0$ | `simp` + `omega` (Presburger) | `lean-idea.md` Flex V |
| **T7** | `mobius_bisection_framing_reconciliation` | `Framing.BisectionAudit` | $\mathsf{TC}^0$ | `ring` + `omega` | `q3.md` Audit 2, Flex V |
| **T8** | `alfven_isotopy_conserves_helicity` | `Framing.MagneticHelicity` | $\mathsf{TC}^0$ | `Finset.sum` invariance + `ring` | `q2.md` Part I.2 |
| **T9** | `reconnection_helicity_quantum` | `Framing.MagneticHelicity` | $\mathsf{TC}^0$ | Bilinear form difference + `ring` | `q2.md` Part I.2 |
| **T10** | `dna_mobius_polarity_obstruction` | `Compiler.Typechecker` | $\mathsf{NC}^1$ | Cycle sum in `ZMod 2` + parity | `theory.md` §4, Flex II |
| **T11** | `ancilla_detects_single_fault` | `Compiler.AncillaGuard` | $\mathsf{NC}^1$ | Support of transposition $\text{swap}(i,j)$ | `theory.md` §6, Flex II |
| **T12** | `garsideConj_commutes_trace` | `Garside.DiagramInvolution`| $\mathsf{P}$ | Induction on `BraidWord n` + `omega` | `theory.md` §4, Flex I |
| **T13** | `garside_bruhat_knot_criterion` | `Garside.LeftNormalForm` | $\mathsf{P}$ | Homomorphism product in $S_n$ | `q1.md` §3.III |
| **T14** | `numCycles_stabilize` | `DoubleCategory.Horizontal`| $\mathsf{NC}^1$ | Cycle splice of fixed point $n+1$ | `q1.md` §3.II, Flex IV |
| **T15** | `torus_axis_duality_conserves_cycles`| `DoubleCategory.Torus` | $\mathsf{TC}^0$ | `ZMod` cosets + `Nat.gcd_comm` | `q1.md` §3.II, Flex IV |
| **T16** | `mobius_figEight_is_hopf_link` | `Certificates.MarkovTrace` | $\mathsf{NP}$ Cert | Explicit 5-step certificate + `rfl` | `q3.md` Audit 3 |
| **T17** | `symmetric_union_is_fox_ribbon` | `Certificates.FoxRibbon` | $\mathsf{NP}$ Cert | Induction on palindrome bands | `np-complete.md` II.4 |
| **T18** | `wreathMonodromy_conj_invariant` | `Wreath.Monodromy` | Symbolic | Cyclic shift conjugacy in $S_{n_2}$ | `q3.md` Audit 4, Flex III |

---

## 5. Engineering Risk Mitigation & Technical Best Practices

### 5.1 Avoiding `Fin n` Dependent-Index Hell
Working with `Fin n` and `Fin (n - 1)` in Lean 4 can produce brittle proof terms when embedding $B_n \hookrightarrow B_{n+1}$ (Markov stabilization) or reversing strand indices $i \mapsto n - 1 - i$.
* **Mitigation:** Centralize all arithmetic index coercions inside three `@[inline]` helper definitions (`ArtinGen.leftStrand`, `ArtinGen.rightStrand`, `revFin`) backed by `by omega`, and prove `@[simp]` lemmas for their `.val` projections so downstream proofs never manipulate raw `Fin` proof fields.

### 5.2 Preventing Kernel Reduction Slowdowns (`by rfl` vs. `Mathlib` `Equiv.Perm`)
In `Mathlib4`, `Equiv.Perm (Fin n)` operations often go through non-computable or slow `Fintype` / `Finset` layers that stall kernel `rfl` reduction.
* **Mitigation:** Keep the executable layer (`BraidWord n`, `traceStrand`, `countCyclesExec`, `CWFRibbonState`) completely free of `Finset` and `Classical.choice` so that `RibbonEngine/Basic` and `RibbonEngine/Compiler` reduce in $O(L \cdot n)$ native kernel operations. Isolate `Mathlib`'s `Equiv.Perm.cycleType` inside the proof-only bridge theorems (`T2`, `T5`, `T14`, `T15`, `T18`).

### 5.3 Handling Non-Monotonic Markov Equivalence (`MTWS`)
As highlighted in `np-complete.md` Act I.3, braid equivalence under Markov moves is non-monotonic (sometimes requiring stabilization $B_n \to B_{n+1}$ before simplification).
* **Mitigation:** Our `garside_norm` `dsimproc` (`Phase 6`) is strictly scoped to **fixed-$n$ twist-pushing and handle reduction** (which is confluent and polynomial-time terminating). Cross-$n$ Markov equivalences (`Phase 5`) are represented as explicit `HorizGaugeShift` path certificates where every stabilization/destabilization step is explicitly supplied by the user or external solver.

---

## 6. Execution Schedule, Milestones, and Target Venues

### 6.1 Milestone Execution Checklist
- [ ] **Milestone 1 (Weeks 1–2): Core Executable Engine & `Flex I` / `Flex V` Proofs**
   - Initialize `lakefile.lean` with `mathlib4`.
   - Complete `RibbonEngine/Basic/ArtinBraid.lean` and `Framing/CWF.lean`.
   - Verify `figure_eight_mobius_fracture` (`by rfl`) and `mobius_bisection_framing_reconciliation` (`ring` + `omega`) with zero `sorry`s.
- [ ] **Milestone 2 (Weeks 3–4): `Mathlib` Permutation Bridge & Fundamental Switching Law**
   - Complete `CycleCalculus.lean` and `SwitchingLaw.lean`.
   - Prove `countCyclesExec_eq_numCycles` and `fundamental_switching_law` ($\Delta k = \pm 1$).
- [ ] **Milestone 3 (Weeks 5–6): Dependently Typed `RibbonIR` & Ancilla Typechecker (`Flex II`)**
   - Complete `RibbonEngine/Compiler/*`.
   - Demonstrate compile-time elaboration rejection of antiparallel $5'\to 3'$ B-DNA Möbius violations and single-crossing ancilla faults.
- [ ] **Milestone 4 (Weeks 7–9): Double Category, Torus Reciprocity, & $\mathsf{NP}$ Certificates (`Flex IV`)**
   - Complete `RibbonEngine/DoubleCategory/*` and `RibbonEngine/Certificates/*`.
   - Prove `numCycles_stabilize`, `torus_axis_duality_conserves_cycles`, `mobius_figEight_is_hopf_link` (Audit 3), and `symmetric_union_is_fox_ribbon`.
- [ ] **Milestone 5 (Weeks 10–12): Symbolic Wreath Cascades, Garside Normal Form, & `ProofWidgets4` (`Flex III` & `VI`)**
   - Complete `RibbonEngine/Garside/*`, `RibbonEngine/Wreath/*`, and `RibbonEngine/Meta/*`.
   - Prove `wreathMonodromy_conj_invariant` (Audit 4) and the $n=2$ vs. $n=3$ cascade parity theorems.
   - Connect the `ProofWidgets4` RPC bridge to the interactive 3D WebGL open-book shader.

### 6.2 Target Academic & Artifact Deliverables
1. **Formal Verification & Programming Languages Venue (CPP / ITP / POPL):**
    * *Paper Title:* **"The Ribbon Engine: A Split-Complexity Topological Compiler and $\mathsf{NP}$-Certificate Verifier in Lean 4"**
    * *Focus:* The $\mathsf{NC}^1$ dependent type system in $S_n$, CWF framing cohomology via Presburger arithmetic, symbolic wreath monodromy, and polynomial-time verification of Markov and Fox ribbon certificates.
2. **Mathematical Physics & Low-Dimensional Topology Venue (CMP / Geometry & Topology):**
    * *Paper Title:* **"Relational Winding Axes, Wreath Monodromy Cascades, and the Double Category of Framed Ribbon Operations"**
    * *Focus:* The double-category synthesis of relational braid axes, the spacetime MHD dictionary ($\mathbf{B}$ as open-book hinge axis of $\mathbf{E}$), and the $n=2$ vs. $n=3$ solenoidal parity dichotomy.