import NoThreeInLine.Greedy

/-!
# §7.3–§7.4 — Mark algebra vs placement algebra

T7.3 and T7.4 are the formal reason the engine can be GPU-offloaded *and* must keep a serial commit
loop.  Both are cheap to prove and both are load-bearing for the "bit-identical output" claim in §12.
-/

namespace No3

/-- Depositing a set of marks onto the blocked predicate. -/
def deposit (B M : Set Pt) : Set Pt := B ∪ M

/-- **T7.3 (mark algebra is ACI).**  "Blocked" is a join in a Boolean lattice. -/
theorem marks_ACI :
    (∀ B M N : Set Pt, deposit (deposit B M) N = deposit (deposit B N) M) ∧
    (∀ B M N : Set Pt, deposit (deposit B M) N = deposit B (deposit M N)) ∧
    (∀ B M : Set Pt, deposit (deposit B M) M = deposit B M) := by
  refine ⟨?_, ?_, ?_⟩ <;> intros <;> simp [deposit, Set.union_assoc, Set.union_comm,
    Set.union_left_comm]

lemma deposit_rightCommutative : RightCommutative deposit := by
  intro b m n
  simp [deposit, Set.union_assoc, Set.union_comm, Set.union_left_comm]

/-- Order-independence of a fold of marks: **the set of produced marks, not their arrival order,
determines the blocked predicate.**  This is the licence for T7.5 (banding) and for arbitrary
parallel/offloaded mark production with bit-identical results. -/
theorem foldl_perm_eq {l l' : List (Set Pt)} (h : l.Perm l') (B : Set Pt) :
    l.foldl deposit B = l'.foldl deposit B :=
  h.foldl_eq deposit_rightCommutative B

/-- Multiplicity-independence: re-deposition is free. -/
theorem foldl_dup_eq (B M : Set Pt) (l : List (Set Pt)) :
    (M :: M :: l).foldl deposit B = (M :: l).foldl deposit B := by
  simp [deposit, Set.union_assoc]

/-! ### T7.4 — the placement fold is *not* ACI

Reordering the ring-1 walk changes the output set, so the commit loop is a sequential fold and must
remain one (T7.6: LFMIS is P-complete, so this is a complexity obstruction, not an artifact). -/

/-- A list-level model of the fold, for exhibiting order dependence concretely. -/
def foldPlace (S : List Pt) : List Pt → List Pt
  | [] => S
  | c :: cs =>
      if (S.any fun p => S.any fun q => decide (p ≠ q) && decide (Coll c p q))
      then foldPlace S cs
      else foldPlace (c :: S) cs

/-- **T7.4.**  Two orders of the same three candidates give different outputs: `(1,-1)` is placed by
one and rejected by the other.  Hence no "propose then filter" formulation exists (C6.2). -/
theorem placement_not_ACI :
    foldPlace [(0, 1), (0, 0)] [(1, 1), (1, 0), (1, -1)] ≠
    foldPlace [(0, 1), (0, 0)] [(1, -1), (1, 1), (1, 0)] := by
  decide

end No3