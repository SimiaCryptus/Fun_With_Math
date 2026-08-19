import NoThreeInLine

/-!
# The audit

`lake env lean NoThreeInLine/Axioms.lean` prints the axiom dependencies of every claim this project
makes.  A theorem whose output mentions `sorryAx` is **not** proved here, whatever the prose says.

Rule: this list only grows, and a line only moves from the second block to the first.
-/

namespace No3

section Proved

#print axioms nrm_add_le
#print axioms nrm_smul
#print axioms card_ballF
#print axioms lattice_line              -- L2.1
#print axioms coll_iff_par              -- L2.2 (Par form)
#print axioms card_row_le_two           -- L2.3
#print axioms card_col_le_two           -- L2.3
#print axioms card_diag_le_two          -- L2.3
#print axioms card_ball_le              -- L2.3, k(R) ≤ 2(2R+1)
#print axioms card_ring_le_eight        -- L2.4, |A_R| ≤ 8   (W = ∞ only!)
#print axioms wvalid_top_iff            -- W = ⊤ is the classical object
#print axioms wvalid_mono               -- the certification direction of P2A.13
#print axioms wvalid_iff_windows        -- L2A.2
#print axioms blocked_local             -- L2A.4 (all three clauses)
#print axioms influence_interval        -- L2A.5
#print axioms card_marks_le             -- L2A.6
#print axioms g_convex                  -- T4.1
#print axioms g_mono_of_step            -- C4.2
#print axioms g_mono_forward            -- C4.2
#print axioms not_monotone_witness      -- T5.3
#print axioms chord_bound               -- L4.3
#print axioms chord_bound_horizon       -- L4.3 + L2A.6
#print axioms mem_stage_iff
#print axioms mem_Gset_iff              -- P3.1
#print axioms ring_locality             -- T5.1
#print axioms transverse_locality       -- T5.4
#print axioms saturated                 -- T3.4
#print axioms Gset_wvalid               -- the engine's runtime invariant
#print axioms adm_of_small              -- the admissibility half of T2A.7 (cheap direction)
#print axioms Traversal.nrm_le_of_idx_le -- ring monotonicity, contrapositive form
#print axioms T6_1_table                -- T6.1
#print axioms crossOnly_is_unsound      -- T6.1
#print axioms marks_ACI                 -- T7.3
#print axioms foldl_perm_eq             -- T7.3 ⇒ bit-identical under any schedule
#print axioms placement_not_ACI         -- T7.4
#print axioms C8_subwindow              -- C8 (rigorous)
-- theory_2.md §15 — the field
#print axioms card_window               -- |Q| = s²
#print axioms density_fades             -- L15.1, no field at W = ∞
#print axioms card_le_two_mul_of_valid  -- T15.3, any window, any position
#print axioms card_window_le_two_mul    -- T15.3 at s ≤ W+1
#print axioms blocker_in_window         -- the erosion lemma (core of T15.2)
#print axioms erode_subset
#print axioms exists_near               -- the floor, qualitative: no empty (2W+1)-window
-- theory_2.md §16 — the history census, executed (P32 is a HARD INVARIANT)
#print axioms hist_bulk_W2
#print axioms hist_corner_W2
#print axioms hist_approach1_W2
#print axioms hist_nextface1_W2         -- ≠ theory_2.md's table entry; see Seams.lean
#print axioms hist_end1_W2              -- ≠ theory_2.md's table entry; see Seams.lean
#print axioms hist_corner_half_bulk_W2  -- "the greedy knows half as much" — exactly
#print axioms hist_corner_half_bulk_W3
-- theory_2.md §17 — mean field
#print axioms spoke_ratio               -- δ ∝ 1/θ, independent of κ
#print axioms spoke_peak_two            -- peak contrast 2 at a gauge corner
-- theory_2.md §18 — the library
#print axioms coll_translate
#print axioms adm_translate
#print axioms wvalidS_coe
#print axioms langP_subset_langX        -- L_s(P) ⊆ L_s(X): the harvest is always valid
#print axioms sublattice_wvalid         -- positive entropy of X_W
#print axioms entropy_lower             -- L18.5, lower half
#print axioms patternAt_add_period
#print axioms patternAt_reduce
#print axioms langP_finite_of_biperiodic -- T18.4: periodicity kills universality
#print axioms greedy_saturated_local    -- T18.7
#print axioms no_empty_patch            -- T18.6, qualitative ⇒ s*(W) < 3W
#print axioms window_pattern_valid      -- a harvested window is a certificate
#print axioms winCount_eq
#print axioms opt_le_two_mul
#print axioms maxpop_le_opt             -- §18.5 warning 2: harvest ≤ true optimum, not C4
#print axioms maxpop_le_two_mul
#print axioms Gset_WSaturated           -- T3.4 as a Set statement (span bound now sharp: W)


end Proved

section Sorry
/-- These are the project's open obligations.  Each is expected to print `sorryAx`. -/

#print axioms par_iff_primDir           -- L2.2, primdir form
#print axioms face_of_three_hits        -- T4.4 case 4
#print axioms horizon_exact             -- T2A.7  ← the one worth closing first (P19)
#print axioms Phi_asymptotic            -- L1.1
#print axioms Psi_asymptotic            -- L1.2
#print axioms mark_volume_le            -- T8.1
#print axioms saturation_floor          -- T9.1
#print axioms Sigma_lower               -- T9.2
#print axioms k_W_upper                 -- T2A.9 (upper)
#print axioms W_saturation_floor        -- T9.4
-- theory_2.md
#print axioms card_window_le            -- T15.3, general s
#print axioms local_floor               -- T15.2 ← T9.4 localised; the headline obligation of §15
#print axioms erosion_obstruction       -- T18.6, quantitative (= local_floor)
#print axioms hist_bulk                 -- L16.2, row 1
#print axioms hist_approach             -- L16.2, row 2
#print axioms hist_corner               -- L16.2, row 3
#print axioms hist_next_face            -- L16.2, row 4 (corrected)
#print axioms hist_branch_start         -- L16.2, row 5
#print axioms hist_branch_end           -- L16.2, row 6 (corrected)
#print axioms hist_bulk_translation_invariant  -- T16.3, first half
#print axioms hist_corner_half_bulk     -- T16.3, second half, in general
#print axioms theta_bulk_tendsto
#print axioms langX_card_upper          -- L18.5, upper half
#print axioms mf_solution_exists        -- T17.1: the finite-W root exists
#print axioms cstar_tendsto             -- H17.2 ⇒ α = 1
#print axioms models_differ             -- P17.3: the two fits are genuinely different models


end Sorry

end No3