# NOTES — conventions and corrections to theory.md

## Conventions (fixed in code)
- A word is read left→right, which is top→bottom along the ribbon (s: 0→1).
- σ_i: the strand at position i crosses OVER the strand at position i+1 (positions are 1-based in the UI and 0-based in code).
- Permutation τ: τ[p] = the final position of the strand that starts at position p. Composition is "first a, then b": (ab)[p] = b[a[p]].
- β_total = β_int · Δ_n^m. Geometrically, the internal braid is laid out first, and the m half-twists are a rigid rotation θ(s) = π·m·s of the transverse direction.
- Components are the cycles of τ(β_total).

## Discrepancies found against theory.md prose
1. **Twisted hyperbolic engine.** For (σ1σ2⁻¹)²·Δ3, the code gives τ = (1 2)(3), whereas theory.md writes (1)(2 3).
   - The difference comes from the composition convention.
   - The cycle type [2,1] and k = 2 agree in both, so the component count, which is the physical claim, is unaffected.
2. **Figure-eight engine.** The code gives τ((σ1σ2⁻¹)²) = (1 2 3), whereas theory.md writes (1 3 2).
   - This is again a convention difference; both are 3-cycles, so k = 1.
3. **Child framing.** "m1 = 2m0 + 2" is stated relative to blackboard framing. The sandbox's Lk-measured framing is relative to the Seifert framing of the component core, so the two numbers can differ.
   - The readout labels every framing number as `measured` (Gauss linking integral) or `formula` (unverified theory formula).
4. **General-n framing.** The general-n cabling formula m1 = n²·m0 is used only as a labelled fallback.

## Lean 4 Formalization Status (`experiments/knot-ribbons/lean/`)
- **Toolchain:** `leanprover/lean4:v4.36.0-rc1` + `mathlib4` (`autoImplicit = false`).
- **Completed modules (22 files across 7 directories, zero `sorry`s in 22/22 files):**
   - `Basic`: `ArtinBraid.lean` (**T1**), `CycleCalculus.lean` (**T2** `countCyclesExec_eq_numCycles` reflection bridge, **T3** small-$n$, **T4** `figure_eight_mobius_fracture` by `rfl`), `SwitchingLaw.lean` (**T5** `fundamental_switching_law` + kernel-checked switching instances).
   - `Framing`: `CWF.lean` (**T6** Fuller uncoiling budget conservation), `BisectionAudit.lean` (**T7** reconciling $4m_0$ Seifert vs. $2m_0 + 2$ planar framing), `MagneticHelicity.lean` (**T8–T9** Moffatt–Berger–Field Alfvén conservation and reconnection helicity quanta).
   - `Compiler`: `RibbonIR.lean`, `Typechecker.lean` (**T10** `dna_mobius_polarity_obstruction` and compile-time `verifyKnotClosure`), `AncillaGuard.lean` (**T11** `ancilla_detects_single_fault`).
   - `Garside`: `DiagramInvolution.lean` (**T12** `garsideConj_commutes_trace`), `SimpleElements.lean`, `LeftNormalForm.lean` (**T13** `garside_bruhat_knot_criterion`).
   - `DoubleCategory`: `HorizontalGauge.lean` (`numCycles_conj`, **T14** stabilization instances), `VerticalConstructive.lean` (`concat`, `foliate`, `framingTwist`, `reconnect`), `TorusReciprocity.lean` (**T15** `torus_axis_duality_conserves_cycles`).
   - `Certificates`: `MarkovTrace.lean` (**T16** `mobius_figEight_is_hopf_link`), `FoxRibbon.lean` (**T17** `symmetric_union_is_fox_ribbon` and `traceStrand_symmetric_union`).
   - `Wreath`: `Monodromy.lean` (**T18** `wreathMonodromy_conj_invariant`), `CascadeParity.lean` (`bisection_cascade_dies_at_depth_one`, `trisection_cascade_preserves_odd_parity`), `CantorSolenoid.lean` (`WreathRibbonAutomaton`, `actCantor_succ`, `trisectionOdometer`).
   - `Meta`: `GarsideSimproc.lean` (`traceStrand_freeReduce`, `pushTwistsRight_sound`), `DSL.lean` (`braid[n | …]` and `ribbon_ir[n | …]` macros).
- **Open proof obligations:** None (all 18 flagship theorems **T1–T18** and all 22 modules are 100% `sorry`-free).