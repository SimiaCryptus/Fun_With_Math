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