import NoThreeInLine.Field

/-!
# §16 — The seam calculus: the history census

D16.1's past cone `N⁻(c)` and its cardinality `H(c)` are *pure combinatorics of the traversal*:
no placement, no blocking, no randomness.  §19's P32 therefore calls the census a **hard
invariant** — a mismatch is a traversal-order bug.  So it should be executable, and here it is.

`ringIdx` is the clockwise-from-`(0,R)` intra-ring index; `spiralPrec` is `≺`; `Hist W c` counts
`N⁻(c)` by brute force over `c + B(W)`.  Every row of the L16.2 table is then a `decide`.

## A discrepancy, found by the machine

Two rows of `theory_2.md`'s L16.2 table do not survive execution.  With the census as computed
here (and verified cell-by-cell for `W = 2, 3`):

| site                              | `theory_2.md`          | computed                  |
| --------------------------------- | ---------------------- | ------------------------- |
| other face of the same corner     | `W² + jW + j`          | `W² + (j+1)W + j`         |
| end of ring (branch cut, `x ≤ -1`)| `2W² + W + 2(W-j) + 1` | `2W² + 3W - j + 1`        |

The doc's own corner row (`H = W² + W` at `j = 0`) contradicts its "other face" row at `j = 0`,
which is the cheapest way to see that the corrected entry is the right one.  Both corrections are
`O(W)` and therefore change `θ` only at order `1/W`: **§16.3's spoke profile and every conclusion
drawn from it are unaffected**, and the doc's `θ` column is correct as stated.
-/

namespace No3

/-! ### The clockwise spiral order, executably -/

/-- Intra-ring index, clockwise from `(0,R)`, for a cell of `S(R)`; `R` is passed in so that the
definition reduces in the kernel without a `let`. -/
def ringIdxAux (R : ℤ) (p : Pt) : ℕ :=
  if p.2 = R ∧ 0 ≤ p.1 then p.1.toNat                    -- top face, `x ≥ 0` (ring start)
  else if p.1 = R then (R + (R - p.2)).toNat             -- right face
  else if p.2 = -R then (3 * R + (R - p.1)).toNat        -- bottom face
  else if p.1 = -R then (5 * R + (p.2 + R)).toNat        -- left face
  else (7 * R + (p.1 + R)).toNat                         -- top face, `x < 0` (ring end)

/-- `ringIdx p ∈ [0, 8R)` for `p ∈ S(R)`, `R > 0`; `ringIdx 0 = 0`. -/
def ringIdx (p : Pt) : ℕ := ringIdxAux (nrm p : ℤ) p

/-- `p ≺ c` for the ring-monotone clockwise spiral (`Traversal` with `ring_mono` by construction:
the first disjunct is exactly ring-monotonicity). -/
def spiralPrec (p c : Pt) : Bool :=
  decide (nrm p < nrm c) || (decide (nrm p = nrm c) && decide (ringIdx p < ringIdx c))

/-- `c + B(W)` as a list, so that the census reduces in the kernel. -/
def boxList (W : ℕ) (c : Pt) : List Pt :=
  (List.range (2 * W + 1)).foldr
    (fun i acc =>
      ((List.range (2 * W + 1)).map fun j => (c.1 + i - W, c.2 + j - W)) ++ acc) []

/-- **D16.1.**  `H(c) = |N⁻(c)| = |{p : p ≺ c, ‖p - c‖∞ ≤ W}|`.  By T5.4 this is *exactly* the
set of cells whose contents can affect the decision at `c`. -/
def Hist (W : ℕ) (c : Pt) : ℕ := ((boxList W c).filter (fun p => spiralPrec p c)).length

/-- **D16.1.**  The history fraction `θ(c) = H(c)/W²`; `θ → 2` in the bulk and `→ 1` at a corner
as `W → ∞` (the exact values carry an `O(1/W)` correction — see `hist_corner`). -/
noncomputable def theta (W : ℕ) (c : Pt) : ℝ := (Hist W c : ℝ) / (W : ℝ) ^ 2

/-! ### L16.2, executed (`W = 2`, `R = 10`) -/

set_option maxRecDepth 10000 in
/-- bulk of a face: `H = 2W² + 2W`. -/
theorem hist_bulk_W2 : Hist 2 (5, 10) = 12 := by decide

set_option maxRecDepth 10000 in
/-- the corner itself: `H = W² + W`. -/
theorem hist_corner_W2 : Hist 2 (10, 10) = 6 := by decide

set_option maxRecDepth 10000 in
/-- approach to a corner, `j = 1`: `H = W² + (j+1)W`. -/
theorem hist_approach1_W2 : Hist 2 (9, 10) = 8 := by decide

set_option maxRecDepth 10000 in
/-- approach to a corner, `j = 2 = W`. -/
theorem hist_approach2_W2 : Hist 2 (8, 10) = 10 := by decide

set_option maxRecDepth 10000 in
/-- other face of the same corner, `j = 1`: `H = W² + (j+1)W + j` (**not** the doc's
`W² + jW + j`, which would give 7). -/
theorem hist_nextface1_W2 : Hist 2 (10, 9) = 9 := by decide

set_option maxRecDepth 10000 in
/-- other face of the same corner, `j = 2 = W`. -/
theorem hist_nextface2_W2 : Hist 2 (10, 8) = 12 := by decide

set_option maxRecDepth 10000 in
/-- start of ring (branch cut, `x ≥ 0`), `j = 0`: `H = 2W² + W + j`. -/
theorem hist_start0_W2 : Hist 2 (0, 10) = 10 := by decide

set_option maxRecDepth 10000 in
/-- start of ring, `j = 1`. -/
theorem hist_start1_W2 : Hist 2 (1, 10) = 11 := by decide

set_option maxRecDepth 10000 in
/-- end of ring (branch cut, `x ≤ -1`), `j = 1`: `H = 2W² + 3W - j + 1` (**not** the doc's
`2W² + W + 2(W-j) + 1`, which would give 13). -/
theorem hist_end1_W2 : Hist 2 (-1, 10) = 14 := by decide

set_option maxRecDepth 10000 in
/-- end of ring, `j = 2 = W`. -/
theorem hist_end2_W2 : Hist 2 (-2, 10) = 13 := by decide

set_option maxRecDepth 10000 in
/-- The headline of §16, executed: **a corner cell has exactly half the history of a bulk cell.**
(`2(W² + W) = 2W² + 2W`, exactly — the halving is not asymptotic.) -/
theorem hist_corner_half_bulk_W2 : 2 * Hist 2 (10, 10) = Hist 2 (5, 10) := by decide

set_option maxRecDepth 20000 in
theorem hist_corner_W3 : Hist 3 (20, 20) = 12 := by decide

set_option maxRecDepth 20000 in
theorem hist_bulk_W3 : Hist 3 (10, 20) = 24 := by decide

set_option maxRecDepth 20000 in
theorem hist_corner_half_bulk_W3 : 2 * Hist 3 (20, 20) = Hist 3 (10, 20) := by decide

/-! ### L16.2 in general

Each of the following is a finite count of a lattice rectangle against a piecewise-linear index;
the proofs are pure `omega`-grade bookkeeping over four cases, but they need a rewriting of
`boxList`/`filter` into a sum over the two coordinates first, which is the missing infrastructure.
The `_W2`/`_W3` instances above are the acceptance tests for whoever writes it. -/

/-- bulk of a face (`W < x₀ < R - W`): `θ = 2 + 2/W`. -/
theorem hist_bulk (W R x₀ : ℕ) (h1 : W < x₀) (h2 : x₀ + W < R) :
    Hist W ((x₀ : ℤ), (R : ℤ)) = 2 * W ^ 2 + 2 * W := by
  sorry

/-- approach to a corner, `c = (R-j, R)`, `0 ≤ j ≤ W`: `θ = 1 + (j+1)/W`. -/
theorem hist_approach (W R j : ℕ) (hj : j ≤ W) (hR : 2 * W + 2 ≤ R) :
    Hist W ((R : ℤ) - j, (R : ℤ)) = W ^ 2 + (j + 1) * W := by
  sorry

/-- the corner itself.  `hist_approach` at `j = 0`; stated separately because it is the site the
whole section is about. -/
theorem hist_corner (W R : ℕ) (hR : 2 * W + 2 ≤ R) :
    Hist W ((R : ℤ), (R : ℤ)) = W ^ 2 + W := by
  sorry

/-- other face of the same corner, `c = (R, R-j)`, `0 ≤ j ≤ W`.  **Corrected** relative to
`theory_2.md`; agrees with `hist_corner` at `j = 0`, which the doc's entry does not. -/
theorem hist_next_face (W R j : ℕ) (hj : j ≤ W) (hR : 2 * W + 2 ≤ R) :
    Hist W ((R : ℤ), (R : ℤ) - j) = W ^ 2 + (j + 1) * W + j := by
  sorry

/-- start of ring (branch cut, `x ≥ 0`), `c = (j, R)`, `0 ≤ j ≤ W`.  At `j = W` this meets the
bulk value, as it must. -/
theorem hist_branch_start (W R j : ℕ) (hj : j ≤ W) (hR : 2 * W + 2 ≤ R) :
    Hist W ((j : ℤ), (R : ℤ)) = 2 * W ^ 2 + W + j := by
  sorry

/-- end of ring (branch cut, `x ≤ -1`), `c = (-j, R)`, `1 ≤ j ≤ W`.  **Corrected** relative to
`theory_2.md`.  Note the deviation from the bulk is `+(W - j + 1)`, i.e. *positive* on this side
of the cut and zero on the other: this is P16.5's **dipole**, and its sign is what P24's
reversal test flips. -/
theorem hist_branch_end (W R j : ℕ) (hj1 : 1 ≤ j) (hj2 : j ≤ W) (hR : 2 * W + 2 ≤ R) :
    Hist W (-(j : ℤ), (R : ℤ)) = 2 * W ^ 2 + 3 * W - j + 1 := by
  sorry

/-- **T16.3, first half.**  In the bulk of a face the census — hence, by D16.1, the whole decision
rule — is translation invariant.  All the anisotropy of §16 lives in the `O(W)`-wide strips that
the other five rows describe. -/
theorem hist_bulk_translation_invariant (W R x₁ x₂ : ℕ)
    (h1 : W < x₁) (h2 : x₁ + W < R) (h3 : W < x₂) (h4 : x₂ + W < R) :
    Hist W ((x₁ : ℤ), (R : ℤ)) = Hist W ((x₂ : ℤ), (R : ℤ)) := by
  rw [hist_bulk W R x₁ h1 h2, hist_bulk W R x₂ h3 h4]

/-- **T16.3, second half (the halving).**  `2·H(corner) = H(bulk)` exactly, for every `W` and
every large enough `R`: the greedy arrives at a gauge corner knowing precisely half as much as it
knows in the bulk, because `B(c,W)` is truncated to a quadrant instead of a half-plane. -/
theorem hist_corner_half_bulk (W R x₀ : ℕ) (h1 : W < x₀) (h2 : x₀ + W < R)
    (hR : 2 * W + 2 ≤ R) :
    2 * Hist W ((R : ℤ), (R : ℤ)) = Hist W ((x₀ : ℤ), (R : ℤ)) := by
  rw [hist_corner W R hR, hist_bulk W R x₀ h1 h2]
  ring

/-- `θ → 2` in the bulk (the doc's normalisation).  Along the diagonal family `c_W = (2W, 4W)`,
which is bulk for every `W ≥ 1`. -/
theorem theta_bulk_tendsto :
    Filter.Tendsto (fun W : ℕ => theta W ((2 * W : ℤ), (4 * W : ℤ))) Filter.atTop (nhds 2) := by
  sorry

end No3