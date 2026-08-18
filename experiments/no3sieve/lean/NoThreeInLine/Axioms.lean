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
#print axioms adm_of_small              -- the admissibility half of T2A.7
#print axioms T6_1_table                -- T6.1
#print axioms crossOnly_is_unsound      -- T6.1
#print axioms marks_ACI                 -- T7.3
#print axioms foldl_perm_eq             -- T7.3 ⇒ bit-identical under any schedule
#print axioms placement_not_ACI         -- T7.4
#print axioms C8_subwindow              -- C8 (rigorous)

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

end Sorry

end No3