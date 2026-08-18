import NoThreeInLine.Horizon

/-!
# §4–§5 — Structure of the L∞ gauge along a lattice line

The whole scheduling story is one fact: `t ↦ ‖p + t·d‖∞` is **convex**.  Here that is three lines,
because midpoint convexity of a gauge along a line is just the triangle inequality applied to
`g(t-1) + g(t+1) = 2·g(t)` — no case analysis on the four affine pieces is needed.
-/

namespace No3

/-- The lattice line `t ↦ p + t·d`. -/
def gline (p d : Pt) (t : ℤ) : Pt := p + t • d

/-- The schedule key `g(t) = ‖p + t·d‖∞`, i.e. the ring index of the `t`-th mark. -/
def g (p d : Pt) (t : ℤ) : ℕ := nrm (gline p d t)

lemma gline_sub (p d : Pt) (t₁ t₂ : ℤ) :
    gline p d t₁ - gline p d t₂ = (t₁ - t₂) • d := by
  simp only [gline, sub_smul]
  abel

/-- **T4.1 (convexity).**  `2·g(t) ≤ g(t-1) + g(t+1)`.  Convexity of the key is the reason the
calendar's key sequence can be made monotone by a single split (C4.2). -/
theorem g_convex (p d : Pt) (t : ℤ) :
    2 * g p d t ≤ g p d (t - 1) + g p d (t + 1) := by
  have hsum : gline p d (t - 1) + gline p d (t + 1) = (2 : ℤ) • gline p d t := by
    simp only [gline, add_smul, sub_smul, one_smul, two_smul]
    abel
  have h := nrm_add_le (gline p d (t - 1)) (gline p d (t + 1))
  rw [hsum, nrm_smul] at h
  simpa [g] using h

/-- **C4.2 (ray splitting).**  Once the key has stopped decreasing it never decreases again: on each
of the two rays produced by splitting at `t*`, the ring index is non-decreasing.  T5.3 says this
split is a *correctness* requirement, not an optimisation. -/
theorem g_mono_of_step (p d : Pt) (t : ℤ) (h : g p d t ≤ g p d (t + 1)) :
    g p d (t + 1) ≤ g p d (t + 2) := by
  have hc := g_convex p d (t + 1)
  have e1 : t + 1 - 1 = t := by ring
  have e2 : t + 1 + 1 = t + 2 := by ring
  rw [e1, e2] at hc
  omega

theorem g_mono_forward (p d : Pt) (t : ℤ) (h : g p d t ≤ g p d (t + 1)) :
    ∀ n : ℕ, g p d (t + n) ≤ g p d (t + n + 1) := by
  intro n
  induction n with
  | zero => simpa using h
  | succ m ih =>
    have := g_mono_of_step p d (t + m) ih
    have e : t + (m : ℤ) + 2 = t + (m + 1 : ℕ) + 1 := by push_cast; ring
    have e' : t + (m : ℤ) + 1 = t + ((m + 1 : ℕ) : ℤ) := by push_cast; ring
    rw [e, e'] at this
    exact this

/-- **T5.3 (the correctness trap), as a concrete witness.**  For `p = (0,5)`, `d = (1,-1)` the key
falls from 5 to 3 and rises again: discarding marks by the *sign of a step*, rather than after
splitting at the vertex, deletes future marks and produces an **invalid** set. -/
theorem not_monotone_witness :
    g (0, 5) (1, -1) 3 < g (0, 5) (1, -1) 0 ∧ g (0, 5) (1, -1) 3 < g (0, 5) (1, -1) 5 := by
  constructor <;> decide

/-- **L4.3 (chord bound, sharp).**  Two lattice points of a line inside `B(R)` differ by at most
`2R/‖d‖∞` in the line parameter.  The constant `2R = diam_∞ B(R)` is attained by face lines. -/
theorem chord_bound {p d : Pt} {R : ℕ} {t₁ t₂ : ℤ}
    (h₁ : nrm (gline p d t₁) ≤ R) (h₂ : nrm (gline p d t₂) ≤ R) :
    (t₁ - t₂).natAbs * nrm d ≤ 2 * R := by
  have h := diam_ball h₁ h₂
  rwa [gline_sub, nrm_smul] at h

/-- **L4.3 + L2A.6.**  The effective truncation is `min(2R, 2W)/‖d‖∞`: the window and the horizon
truncate a line independently.  A runtime violation of this bound means a bad split, a non-primitive
direction, or an untruncated ray (P14 in §10). -/
theorem chord_bound_horizon {p d : Pt} {R W : ℕ} {t₁ t₂ : ℤ}
    (h₁ : nrm (gline p d t₁) ≤ R) (h₂ : nrm (gline p d t₂) ≤ R)
    (hW : nrm (gline p d t₁ - gline p d t₂) ≤ W) :
    (t₁ - t₂).natAbs * nrm d ≤ min (2 * R) (2 * W) := by
  refine le_min (chord_bound h₁ h₂) ?_
  rw [gline_sub, nrm_smul] at hW
  omega

/-- **T4.4, case 4 (the flat-face case).**  If a line meets a ring in three or more points then its
direction is axis-parallel and the line is a face line.  `sorry`: needs "the level set of a convex
integer function is an interval", plus the slope argument of the doc.  This is the case §11 prices
and §6 shows is entangled with T6.1 — it is *not* a rare edge case (P8.5). -/
theorem face_of_three_hits {p d : Pt} {R : ℕ} {t₁ t₂ t₃ : ℤ}
    (h₁₂ : t₁ < t₂) (h₂₃ : t₂ < t₃)
    (e₁ : g p d t₁ = R) (e₂ : g p d t₂ = R) (e₃ : g p d t₃ = R) :
    d.1 = 0 ∨ d.2 = 0 := by
  sorry

end No3