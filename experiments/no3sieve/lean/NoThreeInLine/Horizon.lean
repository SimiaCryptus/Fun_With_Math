import NoThreeInLine.Collinear

/-!
# §2A — The horizon `W`

`W : ℕ∞`, so that `W = ⊤` *is* the classical object rather than a separate code path — this is the
formal counterpart of the doc's claim that a finite horizon is a resource dial, not an approximation.
-/

namespace No3

/-- `W`-admissibility of a triple: all three pairwise spans are `≤ W`.  The third clause is not
implied by the first two (L2A.4's warning); it is a field of the structure so it cannot be dropped. -/
def Adm (W : ℕ∞) (p q r : Pt) : Prop :=
  (nrm (p - q) : ℕ∞) ≤ W ∧ (nrm (p - r) : ℕ∞) ≤ W ∧ (nrm (q - r) : ℕ∞) ≤ W

lemma adm_top (p q r : Pt) : Adm ⊤ p q r := ⟨le_top, le_top, le_top⟩

lemma adm_mono {W W' : ℕ∞} (h : W ≤ W') {p q r : Pt} (ha : Adm W p q r) : Adm W' p q r :=
  ⟨ha.1.trans h, ha.2.1.trans h, ha.2.2.trans h⟩

lemma adm_rot {W : ℕ∞} {p q r : Pt} (h : Adm W p q r) : Adm W r p q := by
  obtain ⟨h1, h2, h3⟩ := h
  exact ⟨by rwa [nrm_sub_comm] at h2, by rwa [nrm_sub_comm] at h3, h1⟩

lemma adm_swap {W : ℕ∞} {p q r : Pt} (h : Adm W p q r) : Adm W p r q := by
  obtain ⟨h1, h2, h3⟩ := h
  exact ⟨h2, h1, by rwa [nrm_sub_comm] at h3⟩

/-- **D2A.1.**  `P` is `W`-valid iff it has no `W`-admissible collinear triple. -/
def WValid (W : ℕ∞) (P : Finset Pt) : Prop :=
  ∀ p ∈ P, ∀ q ∈ P, ∀ r ∈ P, p ≠ q → p ≠ r → q ≠ r → Adm W p q r → ¬ Coll p q r

/-- `W = ⊤` recovers §2 exactly. -/
theorem wvalid_top_iff (P : Finset Pt) : WValid ⊤ P ↔ Valid P := by
  constructor
  · intro h p hp q hq r hr h1 h2 h3
    exact h p hp q hq r hr h1 h2 h3 (adm_top p q r)
  · intro h p hp q hq r hr h1 h2 h3 _
    exact h p hp q hq r hr h1 h2 h3

/-- **The rigorous half of P2A.13.**  Lowering the horizon only removes constraints, so a `W`-valid
set is `W'`-valid for every `W' ≤ W`.  This — not C11 — is what C2A.3's certification rests on. -/
theorem wvalid_mono {W W' : ℕ∞} (h : W' ≤ W) {P : Finset Pt} (hP : WValid W P) : WValid W' P :=
  fun p hp q hq r hr h1 h2 h3 ha => hP p hp q hq r hr h1 h2 h3 (adm_mono h ha)

/-- **L2A.2 (window form).**  `W`-validity is exactly validity in every axis-aligned
`(W+1) × (W+1)` window.  `⇐` needs the bounding box of the triple, i.e. the componentwise min. -/
theorem wvalid_iff_windows (W : ℕ) (P : Finset Pt) :
    WValid (W : ℕ∞) P ↔
      ∀ v : Pt, Valid (P.filter
        (fun p => v.1 ≤ p.1 ∧ p.1 ≤ v.1 + W ∧ v.2 ≤ p.2 ∧ p.2 ≤ v.2 + W)) := by
  classical
  constructor
  · intro h v p hp q hq r hr h1 h2 h3
    simp only [Finset.mem_filter] at hp hq hr
    refine h p hp.1 q hq.1 r hr.1 h1 h2 h3 ?_
    refine ⟨?_, ?_, ?_⟩ <;>
      · rw [Nat.cast_le (α := ℕ∞)] at *
        rw [nrm_le_iff]
        obtain ⟨-, a1, a2, a3, a4⟩ := hp
        obtain ⟨-, b1, b2, b3, b4⟩ := hq
        obtain ⟨-, c1, c2, c3, c4⟩ := hr
        simp only [Prod.fst_sub, Prod.snd_sub]
        omega
  · intro h p hp q hq r hr h1 h2 h3 ha
    -- anchor the window at the componentwise minimum of the triple
    set v : Pt := (min p.1 (min q.1 r.1), min p.2 (min q.2 r.2)) with hv
    have hspan := ha
    obtain ⟨s1, s2, s3⟩ := hspan
    rw [Nat.cast_le (α := ℕ∞)] at s1 s2 s3
    rw [nrm_le_iff] at s1 s2 s3
    simp only [Prod.fst_sub, Prod.snd_sub] at s1 s2 s3
    refine h v p ?_ q ?_ r ?_ h1 h2 h3
    all_goals
      simp only [Finset.mem_filter, hv]
      refine ⟨by assumption, ?_, ?_, ?_, ?_⟩ <;> omega

/-- **L2A.4 (local oracle).**  Only points within `W` of `c` can `W`-block it, so the oracle costs
`Θ(|P ∩ (c + B(W))|)`.  Stated as the extraction of the two distance bounds from `Adm`. -/
theorem blocked_local {W : ℕ} {c p q : Pt} (h : Adm (W : ℕ∞) c p q) :
    nrm (p - c) ≤ W ∧ nrm (q - c) ≤ W ∧ nrm (p - q) ≤ W := by
  obtain ⟨h1, h2, h3⟩ := h
  rw [Nat.cast_le (α := ℕ∞)] at h1 h2 h3
  exact ⟨by rwa [nrm_sub_comm], by rwa [nrm_sub_comm], h3⟩

/-! ### L2A.5 / L2A.6 — the influence region is an integer interval -/

/-- **L2A.5.**  Along a line with direction `d`, the cells within `W` of `p + t₀·d` are exactly the
parameters with `|t - t₀| ≤ ⌊W/‖d‖∞⌋`: **one integer division, no square roots.** -/
theorem influence_interval {W : ℕ} {p d : Pt} (hd : nrm d ≠ 0) (t₀ t : ℤ) :
    nrm ((p + t • d) - (p + t₀ • d)) ≤ W ↔ (t - t₀).natAbs ≤ W / nrm d := by
  have hstep : (p + t • d) - (p + t₀ • d) = (t - t₀) • d := by
    simp only [sub_smul]
    abel
  rw [hstep, nrm_smul, Nat.le_div_iff_mul_le (Nat.pos_of_ne_zero hd)]

/-- **L2A.6 (truncated chord bound).**  An admissible pair deposits at most `2⌊W/‖d‖∞⌋ + 1` marks,
*independently of `R`*; a pair of span `> W` deposits none. -/
theorem card_marks_le {W : ℕ} {d : Pt} (_hd : nrm d ≠ 0) (t₀ : ℤ) :
    ((Finset.Icc (t₀ - (W / nrm d : ℕ)) (t₀ + (W / nrm d : ℕ))).card) = 2 * (W / nrm d) + 1 := by
  rw [Int.card_Icc]
  omega

end No3