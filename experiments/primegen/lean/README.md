# `lean/` — machine-checked companion to `theory.md`

Status: **NORMATIVE FOR TRUTH, NON-NORMATIVE FOR PROSE.**
Where this directory and `theory.md` disagree about whether something is proved, this directory wins.

`theory.md` tags every claim **L/T/P** (proved), **H** (heuristic), **C** (conjecture), **Q** (open), **M**
(measurement). This project adds one axis to that table: whether the **L/T/P** rows are proved _here_, by a
machine, or merely proved _there_, by a human writing "∎".

## Build

```sh
cd lean && lake exe cache get && lake build
```

The axiom audit — the only number that matters — is:

```sh
lake env lean NoThreeInLine/Axioms.lean
```

Every theorem printed there must depend on `propext`, `Classical.choice`, `Quot.sound` **only**. Any occurrence of
`sorryAx` in that output is a claim this project does not actually have.

## Layout

| file               | `theory.md` section | contents                                                        |
| ------------------ | ------------------- | --------------------------------------------------------------- |
| `Basic.lean`       | §1                  | `Pt = ℤ²`, the L∞ gauge `nrm`, balls, rings, gauge algebra      |
| `Collinear.lean`   | §2                  | `cross`, `Coll`, `Valid`, L2.1, L2.2, L2.3, L2.4                |
| `Horizon.lean`     | §2A                 | `Adm`, `WValid`, L2A.2, L2A.4, L2A.5, L2A.6, `WValid ⊤ ↔ Valid` |
| `Gauge.lean`       | §4, §5              | `gline`, convexity (T4.1), C4.2, L4.3 chord bound, T5.3 witness |
| `Greedy.lean`      | §3, §5, §2A.1       | `Traversal`, the fold, P3.1, T5.1, T3.4, fold-validity, T2A.7   |
| `Witness.lean`     | §6                  | T6.1: the minimal `R = 1` witness, by `decide`                  |
| `Marks.lean`       | §7.3, §7.4          | T7.3 (mark algebra is ACI), T7.4 (placement is not)             |
| `Density.lean`     | §8, §9              | `Σ(P)`, T8.1, T9.1, T9.2, T2A.9 — statements, mostly `sorry`    |
| `Conjectures.lean` | §9.7, §9.9          | C1–C12 as `Prop`s. **No proofs, by design.**                    |
| `Axioms.lean`      | —                   | the audit                                                       |

## Status table

`✅` = proved, no `sorry` in its transitive dependencies. `🟡` = proved modulo a named `sorry`.
`📝` = stated only (the statement itself is the deliverable: it pins the doc's prose to a formula).

| doc   | Lean name                        | status | note                                                            |
| ----- | -------------------------------- | ------ | --------------------------------------------------------------- |
| L1.1  | `No3.Phi_asymptotic`             | 📝     | needs Mathlib's `Nat.Coprime` density / `ζ(2)`; not on any path |
| L1.2  | `No3.Psi_asymptotic`             | 📝     | ditto                                                           |
| L2.1  | `No3.lattice_line`               | ✅     | Bézout; the _only_ place `IsPrim` is essential                  |
| L2.2  | `No3.coll_iff_par`               | ✅     | in `Par` form (`cross = 0`), which is the engine's actual test  |
| L2.2  | `No3.par_iff_primDir`            | 🟡     | the `primDir`-equality form; `sorry`: two primitive parallels   |
| L2.3  | `No3.card_row_le_two` etc.       | ✅     | rows, columns, both diagonal families                           |
| L2.3  | `No3.card_ball_le`               | ✅     | `k(R) ≤ 2(2R+1)`, fibrewise over rows                           |
| L2.4  | `No3.card_ring_le_eight`         | ✅     | ring ⊆ 4 face lines, 2 each                                     |
| L2A.2 | `No3.wvalid_iff_windows`         | ✅     | the "`W` is the right dial" lemma                               |
| L2A.4 | `No3.blocked_local`              | ✅     | includes the third clause (`‖p-q‖ ≤ W`) the doc warns about     |
| L2A.5 | `No3.influence_interval`         | ✅     | `⌊W/‖d‖⌋` by `Nat.le_div_iff_mul_le`, no square roots           |
| L2A.6 | `No3.card_marks_le`              | ✅     | truncated chord bound                                           |
| T4.1  | `No3.g_convex`                   | ✅     | midpoint convexity from the triangle inequality — 3 lines       |
| C4.2  | `No3.g_mono_of_step`             | ✅     | monotone-after-vertex, by `omega` from convexity                |
| L4.3  | `No3.chord_bound`                | ✅     | sharp constant `2R = diam_∞ B(R)`                               |
| T4.4  | `No3.face_of_three_hits`         | 🟡     | `sorry`: level set of a convex `g` is an interval               |
| T5.1  | `No3.ring_locality`              | ✅     | the dependency result the whole schedule rests on               |
| T5.3  | `No3.not_monotone_witness`       | ✅     | `p = (0,5)`, `d = (1,-1)`, by `decide`                          |
| T3.4  | `No3.saturated`                  | ✅     | with the blockers' norms bounded, as §9.2 needs                 |
| P3.1  | `No3.mem_Gset_iff`               | ✅     | the fold is a function of `(≺, seed, W)` alone                  |
| —     | `No3.Gset_wvalid`                | ✅     | **the engine's output is `W`-valid.** Not stated in `theory.md` |
| T2A.7 | `No3.horizon_exact`              | 🟡     | `sorry`: one prefix-agreement step. This is P19's justification |
| T6.1  | `No3.crossOnly_is_unsound`       | ✅     | by `decide` on the `R = 1` ring                                 |
| T7.3  | `No3.marks_ACI`, `foldl_perm_eq` | ✅     | order/multiplicity independence ⇒ "bit-identical under GPU"     |
| T7.4  | `No3.placement_not_ACI`          | ✅     | explicit reordering that changes the output                     |
| T8.1  | `No3.mark_volume_le`             | 📝     | needs L1.1/L1.2                                                 |
| T9.1  | `No3.saturation_floor`           | 📝     | the union bound `(†)`; needs T8.1                               |
| T9.2  | `No3.Sigma_lower`                | 📝     | the reduction `α ↔ growth of Σ`                                 |
| T2A.9 | `No3.k_W_upper`                  | 🟡     | upper half provable from L2A.2 + L2.3; lower half is T9.4       |

## Rules for editing this directory

1. **Never delete a `sorry` by weakening a statement.** If the statement changes, change `theory.md` in the same
   commit and say so in the message.
2. **Never add an `axiom`.** The audit exists to make that visible; if it becomes normal, it becomes invisible.
3. Conjectures live in `Conjectures.lean` as `Prop`s and stay unproved. A conjecture that acquires a proof is
   promoted out of that file, and `theory.md`'s tag changes from **C** to **T** in the same commit.
4. `Gset_wvalid` and `horizon_exact` are the two theorems the engine's test-suite mirrors (`P19`). If either becomes
   false under a refactor, the engine is wrong, not the proof.
