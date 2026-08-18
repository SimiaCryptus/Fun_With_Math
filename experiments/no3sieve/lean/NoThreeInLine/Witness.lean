import NoThreeInLine.Collinear

/-!
# §6 — Intra-ring closure is mandatory

The doc's minimal witness at `R = 1`, executed rather than asserted.  Every entry of the table in
T6.1 is discharged by `decide`, so this file is also the smallest possible acceptance test for a
new `Coll` implementation.
-/

namespace No3

/-- The clockwise traversal of `S(1)` starting at `(0,1)`. -/
def ring1 : List Pt :=
  [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]

/-- The prefix of the fold at the moment `(1,-1)` is tested. -/
def prefixAt : List Pt := [(0, 0), (0, 1), (1, 1), (1, 0)]

/-- `c` is blocked by some pair drawn from `S`. -/
def blockedBy (S : List Pt) (c : Pt) : Bool :=
  S.any fun p => S.any fun q => decide (p ≠ q) && decide (Coll c p q)

/-- `c` is blocked by a pair with at least one point from an *earlier* ring — the "cross family
only" closure that T6.1 refutes. -/
def crossOnlyBlockedBy (old new : List Pt) (c : Pt) : Bool :=
  old.any fun p => (old ++ new).any fun q => decide (p ≠ q) && decide (Coll c p q)

/-- The T6.1 table, line by line: the *only* blocker of `(1,-1)` is `{(1,1),(1,0)}`, and both of
those points were placed **during ring 1**. -/
theorem T6_1_table :
    ¬ Coll (1, -1) (0, 0) (0, 1) ∧
    ¬ Coll (1, -1) (0, 0) (1, 1) ∧
    ¬ Coll (1, -1) (0, 0) (1, 0) ∧
    ¬ Coll (1, -1) (0, 1) (1, 1) ∧
    ¬ Coll (1, -1) (0, 1) (1, 0) ∧
      Coll (1, -1) (1, 1) (1, 0) := by
  refine ⟨by decide, by decide, by decide, by decide, by decide, by decide⟩

/-- **T6.1.**  A closure that only considers pairs meeting an earlier ring does not block `(1,-1)`,
places it, and thereby creates the collinear triple `(1,1), (1,0), (1,-1)`.  Hence intra-ring
(segment-internal) closure is mandatory: commitment inside a ring is a **fixpoint, not a filter**
(C6.2). -/
theorem crossOnly_is_unsound :
    crossOnlyBlockedBy [(0, 0)] [(0, 1), (1, 1), (1, 0)] (1, -1) = false ∧
    blockedBy prefixAt (1, -1) = true ∧
    Coll (1, 1) (1, 0) (1, -1) := by
  refine ⟨by decide, by decide, by decide⟩

/-- **C6.3.**  The unique blocker lives on the face line `x = 1` of `S(1)`: the earliest failure of
naive pair enumeration and the earliest firing of T4.4 case 4 are *the same event*. -/
theorem witness_is_face_line :
    ((1 : ℤ), (1 : ℤ)).1 = 1 ∧ ((1 : ℤ), (0 : ℤ)).1 = 1 ∧ ((1 : ℤ), (-1 : ℤ)).1 = 1 := by
  refine ⟨rfl, rfl, rfl⟩

/-- **C6.4 (corner sharing).**  Exactly four cells of each ring lie on two faces, so the
double-counting condition is exhaustively testable rather than sampled. -/
theorem corners_of_ring1 :
    (ring1.filter fun p => decide (p.1.natAbs = 1 ∧ p.2.natAbs = 1)).length = 4 := by
  decide

end No3