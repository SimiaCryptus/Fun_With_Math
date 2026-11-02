  # Interactive 3D Demonstrator: Plan

  ## 1. Goal

  Build a browser-based, interactive 3D demonstrator for the Coupled Uncertain Theory Tree algorithm in `idea.md`. It runs a small set of synthetic problems. It lets a user watch, step through, and perturb each stage of the algorithm:

  1. compilation into point-trees;
  2. SUPPORT SOLVE;
  3. SOLVE;
  4. CHALLENGE;
  5. BOUNDS;
  6. epistemic status.

  The demonstrator has two jobs, in priority order.

  1. **Test.** It is the first executable implementation of the fixed-tree core (§5.1–5.7). It must pass the verification properties of §7. It must reproduce stage gates 1 and 2 (§8.16) on hand-specified trees.
  2. **Demonstrate.** It makes the central ideas visible:
     - observations as regions;
     - splitting compiles uncertainty into topology;
     - the hard/soft firewall;
     - the latent Rashomon set, where theories agree on predictions but disagree on where points were.

  Non-goals for this plan:

  - real datasets (E10);
  - correlated supports (E5);
  - regression leaves;
  - structural CHALLENGE;
  - full measurement recommendation.

  A minimal structural learner is included late, as an optional milestone (M8).

  ## 2. Technology

  **Runtime**

  - Plain HTML and native ES6 modules. There is no bundler and no build step.
  - Three.js is loaded through an import map from a pinned CDN version, together with `three/addons` for `OrbitControls`. A vendored copy in `vendor/` serves as an offline fallback.
  - UI panels are plain DOM. Small charts are drawn with Canvas 2D. The tree diagram is SVG.
  - Serve locally with any static server, e.g. `python3 -m http.server`. Modules do not load from `file://`.

  **Testing**

  - Core tests run under Node's built-in `node --test`. The core engine has no DOM or three.js dependency.
  - `tests.html` runs the same test modules in the browser.

  **Architectural rule**

  The algorithm core (`src/core/`) is pure, deterministic, and DOM-free. Visualization only reads core state, plus per-iteration snapshots the core emits. It never mutates core state. This keeps the demonstrator honest: what is drawn is what was computed.

  ## 3. Directory Layout

      index.html                 app shell, import map, panel containers
      tests.html                 browser test runner
      style.css
      vendor/                    pinned three.module.js + OrbitControls (fallback)
      src/
        main.js                  bootstraps app, wires UI <-> controller <-> viz
        controller.js            run orchestration, stepping, snapshot history, URL state
        presets.js               strict / balanced / exploratory hyperparameter bundles
        core/
          rng.js                 seeded PRNG (mulberry32), Dirichlet, uniform-in-box
          box.js                 box ops, length ratios, degenerate-dim handling
          tree.js                master tree: nodes, regions R_n, leaves, hand-specified builders
          compile.js             point-tree compilation, pi caching, inverse index, incremental split
          fragments.js           flat fragment table (typed arrays) + per-observation offsets
          stats.js               Clopper-Pearson upper bound (incomplete beta), Dirichlet phi, LOO
          anchors.js             anchor detection, derivation depth, class counts
          support.js             SUPPORT SOLVE: exclusions, latching, face erosion, sweeps, provenance
          solve.js               SOLVE: free energy, LOO EM, damping, restarts
          challenge.js           CHALLENGE: nearest-theory repulsion, lambda grid, saturation
          bounds.js              ensemble envelope + local exponential-tilt envelope (bisection on nu)
          status.js              epistemic classification incl. evidence test
          predict.js             query compilation, prediction + envelope
          learn.js               (M8) greedy learner, S1 and S3 scoring, prior-mass stopping
          metrics.js             M2a, M2b, M3, M4, M5, M6, M8 on evaluation cells; oracle B6-T
          invariants.js          runtime assertion helpers for section 7 properties
        data/
          corrupt.js             interval corruption (uniform offset, never centered), label corruption
          scenarios.js           scenario registry: generator + tree + defaults + narrative
        viz/
          scene.js               renderer, camera, OrbitControls, lights, resize, picking
          layout.js              feature space -> world coords, axis frames, grid
          dataLayer.js           raw and contracted support boxes, latent truth points
          partitionLayer.js      master leaf regions colored by phi or anchor counts
          massLayer.js           extruded fragment columns (height = mass density)
          theoryLayer.js         stacked theory planes / theory morph
          envelopeLayer.js       min/max ghost columns per fragment
          statusLayer.js         fragment coloring by epistemic status
          tween.js               animation of face erosion, mass changes, theory transitions
          palette.js             class colors, status colors, colorblind-safe
        ui/
          panels.js              scenario picker, parameter sliders, step controls
          inspector.js           selected-observation detail: point-tree SVG, masses, provenance
          treeView.js            master tree SVG with per-node anchor counts and phi bars
          charts.js              diversity-fit curve, metric-vs-iteration plots, calibration curve
          metricsPanel.js        live metric table vs baselines B5 / B6-T
      tests/
        compile.test.js
        support.test.js
        solve.test.js
        challenge.test.js
        bounds.test.js
        invariants.test.js       randomized section 7 property checks
        reduction.test.js        E0: exact data -> one fragment, no-op solves, (M8) CART equivalence

  ## 4. Core Engine Specification

  The engine implements `idea.md` §5.1–5.7 for general dimension $d$. Demos use $d = 2$ and $d = 3$.

  ### 4.1 Data structures

  **Observation**

  - `lo[d]`, `hi[d]` give the current support. `lo0`, `hi0` keep the raw support.
  - `Y` is a bitmask of allowed labels. `rho` is the label prior.
  - The latent truth `xStar` and `yStar` are stored only in a separate evaluation record. The core never reads them. A test asserts that no core module imports it.

  **Master tree**

  - Each node has a split `(dim, t)`, children, and a box region.
  - Leaves carry stable ids.
  - The tree is built from hand-specified definitions per scenario, or by `learn.js`.

  **Fragment table**

  - Flat typed arrays: `obs`, `leaf`, `pi`, `w`, `wLo`, `wHi`, `admissible`, `status`.
  - Each observation owns a contiguous range of entries. The inverse index lists, for each leaf, the fragment indices that occupy it.
  - Point-tree internal nodes are not stored explicitly. Their masses are derived on demand from fragments and the master tree path. This satisfies "node = sum of children" by construction.
  - The inspector reconstructs the point-tree for display.

  **Theory**

  - A theory holds a `Float64Array` of fragment masses, cached `phi` (leaves × classes), `F`, and `L`.

  **Snapshot**

  - A cheap copy of whatever changed in one step: supports, masses, and exclusions.
  - The controller stores a history of snapshots so the user can scrub backward.

  ### 4.2 Compilation (§5.1)

  - Use strict-inequality routing exactly as tabulated in §5.1.
  - Compute $\pi$ multiplicatively from per-dimension length ratios along tree edges. Never form $d$-volumes. Skip degenerate dimensions.
  - Incremental split of leaf $\ell$ is implemented and tested against full recompilation, even though fixed-tree demos rarely need it. M8 depends on it.

  ### 4.3 SUPPORT SOLVE (§5.3)

  - **Exclusion test.** The test is $n_\ell \ge m_{\min}$ and $\mathrm{CP}_{\mathrm{upper}}(n_{\ell c}, n_\ell, \alpha_{\mathrm{excl}}/(L C)) < \tau_{\mathrm{excl}}$.
    - The Clopper–Pearson upper bound uses the inverse regularized incomplete beta. It is computed by bisection on a continued-fraction implementation of $I_x(a, b)$.
    - It is unit-tested against tabulated values.
  - **Partial-label anchors.** These count toward every class in $Y_i$, which is the worst case for exclusion.
  - **Sweeps.** Each sweep has three steps:
    1. freeze the exclusions;
    2. erode faces round-robin to the most aggressive removable master threshold;
    3. recount anchors and exclusions.

    Anchors carry derivation depth, and only anchors of depth $\le k_{\mathrm{prop}}$ may vote.
  - **Latching and diagnostics.** Exclusions are latched. The engine maintains an exclusion-inconsistency list and a contradiction list. A contradicted observation is never contracted.
  - **Provenance.** Each removed slab records the leaf, the anchor ids and their depths, the classes involved, and the sweep index.
  - **Snapshots.** The solver emits one snapshot per sweep, which drives the erosion animation.
  - **Out of scope.** Subtree anchors (A10) and contraction levels above 0 (A5) are not implemented in this plan. A clean extension point is left for both.

  ### 4.4 SOLVE (§5.4)

  - **Update rule.** Each observation is updated as $w_{i\ell} \propto \pi_{i\ell}\, g_{i\ell}^{1/\beta}$, using leave-one-out $\varphi^{-i}$.
    - Leave-one-out uses cached leaf numerators and denominators, minus $i$'s own contribution.
  - **Partial labels.** These are marginalized through $\rho$. The read-off of $q_i$ happens after convergence.
    - The alternating ablation (A11) is a toggle. It is used only in the stress scenario.
  - **Iteration.** Updates are damped by $\eta$. The run stops on maximum per-observation total-variation change, or at an iteration cap.
  - **Restarts.** There are $R$ restarts, initialized with Dirichlet noise around $\pi$.
    - Distinct fixed points are kept as candidate theories.
    - $\theta_0$ is the restart with minimum $F$.
  - **Objectives.** $F$ and $L$ are computed exactly as defined, with leave-one-out leaf statistics.
  - **Toggles.**
    - The "no LOO" toggle (A3) exists for E3 and E6.
    - The "herd init" option places all spanning observations on one mode.
  - **Snapshots.** The solver emits one snapshot per iteration (masses, $F$), which drives the mass-morph animation and the iteration charts.

  ### 4.5 CHALLENGE (§5.5)

  - **Repulsion.** The nearest previous theory $k^\star$ is recomputed at each outer iteration. The update is $w \propto \pi\, g^{1/\beta} \exp(-(\lambda/\beta)\, \hat{w}^{(k^\star)})$.
  - **$\lambda$ grid.** Each $\lambda$ in the grid is run from $\theta_0$ and from fresh perturbations.
    - The accepted result is the one with maximum $D$ among results with $F \le F(\theta_0) + N\bar{\epsilon}$.
    - The distance $D$ takes the minimum over previous theories outside the average.
  - **Saturation.** The loop stops when $D < \delta_D$, or when no envelope widens by more than $\delta_{\mathrm{env}}$.
  - **Diversity–fit record.** For every $\lambda$ tried, accepted or not, the engine records $D$, predictive disagreement on a fixed query grid, $\Delta F$, and $\Delta L$.

  ### 4.6 BOUNDS (§5.6)

  - **Ensemble envelope.** The minimum and maximum mass across accepted theories.
  - **Local convex envelope.** Per-observation budget $\bar{\epsilon}$. Holding $\Phi$ at each accepted theory in turn, maximize or minimize each fragment by bisection on the tilt $\nu$. Take the union over theories.
  - **Labeling.** Both envelopes are shown with the label "inner / theory-conditional, not certified" wherever they are displayed.
  - **Interval-semantics variant.** Optional toggle, implemented only if time permits.

  ### 4.7 Status (§5.7)

  - Statuses: Observed, Excluded, Forced, Robust, Theory-dependent, Underdetermined.
  - The evidence test $\max \lvert \log g_{i\ell} - \log g_{i\ell'} \rvert > \kappa_u$ is evaluated in at least one accepted theory before Forced or Robust can be assigned.
  - Observation-level status aggregates the fragment statuses, mass-weighted.

  ### 4.8 Metrics and oracle

  - **Evaluation cells.** Metrics use a fixed spatial grid, by default 8 × 8 in 2D and 6 × 6 × 6 in 3D, independent of the master tree.
    - Fragment mass is mapped to cells as piecewise-uniform.
  - **Live metrics.**
    - M2a: mean log true-cell mass, and the fraction with $m_i \ge 0.5$.
    - M2b: latent information gain, split into support and weight parts.
    - M3: tightening.
    - M4: false exclusion, broken down by derivation depth.
    - M5: false certainty, both fitted and envelope versions.
    - M6: reliability curve and ECE, plus credal coverage against B6-T.
    - M8: number of theories, and the diversity–fit curve.
  - **B6-T.** The generators have known densities. B6-T integrates the density times the label likelihood over each fragment numerically. Generators are simple, so a fine grid or closed form suffices.
  - **B5.** The geometric prior $\pi$. It is always displayed next to the learned value.

  ### 4.9 Presets

  The values below are initial guesses. They are tuned against scenario acceptance criteria and documented in `presets.js`.

  | Param | strict | balanced | exploratory |
  |---|---|---|---|
  | $m_{\min}$ | 8 | 5 | 3 |
  | $\alpha_{\mathrm{excl}}$ | 0.01 | 0.05 | 0.1 |
  | $\tau_{\mathrm{excl}}$ | 0.02 | 0.05 | 0.1 |
  | $k_{\mathrm{prop}}$ | 1 | 2 | 3 |
  | $\beta$ | 2 | 1 | 1 |
  | $\bar{\epsilon}$ | 0.01 | 0.02 | 0.05 |
  | $\lambda$ grid | 0.5–8 | 0.5–16 | 0.5–32 (×2 steps) |
  | $\kappa_f$, $\kappa_r$, $\kappa_u$ | 0.05, 0.05, 0.3 | 0.1, 0.1, 0.2 | 0.15, 0.15, 0.1 |
  | Dirichlet $\alpha$ | 1 | 1 | 0.5 |
  | Damping $\eta$ | 0.5 | 0.5 | 0.7 |
  | Restarts $R$ | 8 | 8 | 16 |

  ### 4.10 Performance budget

  - Target size: 2D scenarios with $N \le 600$ and master depth $\le 6$, i.e. up to about 3000 fragments.
  - Timing targets:
    - one SOLVE iteration: under 5 ms;
    - full SOLVE with restarts: under 300 ms;
    - CHALLENGE with saturation: under 3 s.
  - If CHALLENGE exceeds its budget, move `controller.run*` into a Web Worker. The core is already DOM-free, so this is a transport change only. The UI shows progress and stays responsive.

  ## 5. Visual Design

  ### 5.1 World mapping

  **2D problems (most scenarios)**

  - Features $(x_1, x_2)$ map onto the ground plane (world X, Z) over $[0, 1]^2$.
  - The vertical axis (world Y) is a data channel, chosen by the active view:
    - fitted mass density;
    - theory index;
    - envelope;
    - iteration.

  This is the main reason for 3D: the extra axis shows the soft layer *above* the hard geometry. That makes the firewall spatially literal.

  - **Hard layer:** on the floor. Supports, master partition, and exclusions.
  - **Soft layer:** above the floor. Masses, theories, and envelopes.

  **3D problems (one scenario)**

  - Features map to X, Y, Z directly.
  - Supports are translucent 3D boxes. Fragments are sub-boxes.
  - The soft layer is shown through opacity and color instead of height.

  ### 5.2 Views

  The user switches views with tabs. Views can also be combined, and each layer has its own visibility toggle.

  1. **Data view.**
     - Raw supports are drawn as wire rectangles, or wire boxes in 3D, colored by allowed label set. Multi-label sets use a hatched or striped material.
     - Exact observations are drawn as points.
     - Missing coordinates are drawn as full-span bars.
     - The "Reveal truth" toggle shows latent points with a line to their box. It is off by default and labeled "evaluation only".
  2. **Partition view.**
     - Master leaf regions are drawn as floor tiles.
     - Tiles are colored by anchor class counts (hard) or by $\varphi_\ell$ (soft), with an explicit toggle labeled for which layer is shown.
     - Excluded classes appear as a crossed icon on the tile.
  3. **Contraction view.**
     - Animates SUPPORT SOLVE sweep by sweep. Faces slide inward to thresholds.
     - Removed slabs flash in the color of the excluding leaf. They then remain as faint "ghost" slabs, which carry the Excluded status.
     - New anchors pulse when they are created.
  4. **Mass view.**
     - Each fragment is a column on its floor region. The column height is $\hat{w}_{i\ell} / \mathrm{area}(R_{i\ell})$, normalized per scene.
     - The geometric prior B5 appears as a flat lid at uniform height, so deviation from the prior is visible at a glance.
     - SOLVE iterations morph the columns.
     - Option: show only the selected observation, or the total mass landscape summed over all observations.
  5. **Theory view.**
     - Accepted theories are drawn as stacked semi-transparent mass planes at increasing heights, one per theory. The user can also choose a single plane morphing between theories with a scrubber.
     - Leaf tiles recolor by each theory's $\varphi$, which shows leaf semantics changing between theories.
     - A side-by-side mini-map shows predictions per theory. Near-identical prediction maps with very different mass planes are the latent Rashomon signature.
  6. **Envelope view.**
     - Each fragment shows a solid column at $\hat{w}$, a ghost column at $\overline{w}$, and a floor ring at $\underline{w}$.
     - A toggle switches between the ensemble envelope and the local envelope.
     - The permanent caption reads: "Not certified bounds (§5.6)".
  7. **Status view.**
     - Fragments and observations are colored by epistemic status. A legend shows the counts per status.
     - The evidence test failure is shown distinctly, as Underdetermined with a dotted outline, from a wide envelope.

  ### 5.3 Side panels

  - **Scenario panel.**
    - Scenario picker, seed, and $N$.
    - Corruption width (the main sweep axis), width mode (symmetric or asymmetric), anchor-floor fraction, partial-label rate, and noise rate.
  - **Algorithm panel.**
    - Preset selector, with every hyperparameter exposed in an "advanced" fold.
    - Safeguard toggles, all marked as ablations: LOO, marginalized vs alternating labels, herd init.
    - Stage buttons:
      - `Compile`
      - `Support step` / `Support run`
      - `Solve step` / `Solve run`
      - `Challenge`
      - `Bounds`
      - `Run all`
    - A timeline scrubber over snapshot history.
  - **Inspector** (when an observation is clicked or picked by raycast).
    - Raw and current interval per dimension.
    - Point-tree as an SVG subtree of the master tree. Nodes are sized by mass. Fragment leaves show $\pi$, $\hat{w}$, the envelope, and status.
    - Exclusion provenance list. Clicking an entry highlights the leaf and its anchors in 3D.
    - $q_i$ bars for partial labels.
    - Feature-level credible intervals (§6), drawn as two nested bars per dimension.
  - **Master tree panel.** SVG of the tree, with per-node anchor counts and per-theory $\varphi$ bars. Hovering a node highlights its region in 3D.
  - **Metrics panel.** A live table of M2a, M2b, M3, M4, M5, and the theory count, each next to its B5 and B6-T reference values. Failure-signal rows turn red, for example M4 > 0 under clean labels.
  - **Charts.**
    - Diversity–fit curve: latent $D$ and predictive disagreement against $\Delta F$.
    - Metric vs iteration: confidence, M5, and true-cell mass. Used by the stress scenario.
    - Reliability curve (M6).
    - Width-sweep chart: runs the full pipeline at about 10 widths and plots M3, M2b, theory count, status fractions, and M4. This shows the phase transition.

  ### 5.4 Reproducibility

  - All state lives in the URL hash: scenario, seed, widths, preset, overrides, and toggles. A copied link reproduces the exact run.
  - `Export run` downloads JSON containing inputs, the tree, supports, theories, envelopes, statuses, metrics, preset, and overrides. This matches the output list in §6 of `idea.md`.

  ## 6. Scenarios

  Each scenario is a registry entry with the following parts:

  - a generator;
  - a corruption config;
  - a master tree (hand-specified unless noted);
  - default view sequence and parameters;
  - a short on-screen narrative;
  - **acceptance checks**, which are evaluated automatically and shown as pass/fail badges.

  | Id | Name | Maps to | Tree |
  |---|---|---|---|
  | S0 | Exact data | E0 | hand + (M8) learned |
  | S1 | Uncertain XOR | E1(a), E1(b) in M8 | hand, true thresholds |
  | S2 | Redundant features | E2(a) | hand, x- and y-splits |
  | S3 | Unidentifiable modes | E3 | hand |
  | S4 | Self-reinforcement | E6 subset | uses S1/S3 configs |
  | S5 | Circle & fragment blowup | E4 | learned (M8), depth slider |
  | S6 | 3D parity | E1 in 3D | hand, 3 splits |
  | S7 | Mixed observation types | E8 (light) | hand (XOR) |

  ### S0 Exact data

  - **Setup.** Degenerate intervals and singleton labels.
  - **Checks.**
    - one fragment per observation;
    - SUPPORT SOLVE is a no-op;
    - SOLVE is trivial;
    - one theory;
    - all §7 invariants pass.

### S1 Uncertain XOR

  - **Setup.**
    - Data: $x, y \sim U[0, 1]$, label = XOR of the two half-tests.
    - Tree: splits at 0.5, with deeper splits at 0.25 and 0.75 so that face erosion has intermediate thresholds.
    - Anchor floor: 15%.
  - **Controls.** The width slider runs from 0 to 0.7. An asymmetric-width toggle is provided.
  - **What the user should see.**
    - At small widths, faces erode toward the correct quadrant and columns rise in the true quadrant.
    - Status is Forced or Robust.
    - Only one theory is found.
  - **Width sweep.** The sweep chart shows the identifiable → ambiguous → unknowable transition.
  - **Checks.**
    - M4 = 0;
    - M2b > 0;
    - true-cell mass above B5 and at most B6-T plus tolerance;
    - theory count 1 at small width;
    - M5 low at all widths.

  ### S2 Redundant features

  - **Setup.**
    - Data: label $= (x > 0.5)$, with $y$ correlated to $x$ (correlation slider).
    - A declared off-diagonal occupancy fraction, with its slider and the reported occupancy.
    - Widening mode: x only, y only, or both.
    - Tree: root split on $x$ at 0.5, both children split on $y$ at 0.5. Both explanations are expressible.
  - **What the user should see.**
    - Theory view: two or more planes. One concentrates straddling mass by $x$, the other by $y$.
    - The prediction mini-maps are nearly identical.
    - The diversity–fit curve is flat.
    - Lowering correlation collapses the theory count to 1.
  - **Checks.**
    - redundant regime: at least 2 theories with $D \ge \delta$ and low predictive disagreement;
    - non-redundant regime: 1 theory;
    - Theory-dependent status concentrated on straddling fragments.

  ### S3 Unidentifiable modes

  - **Setup.**
    - Data: two modes in $x$, near 0.25 and 0.75.
    - A fraction of observations receive intervals spanning both modes, and nothing distinguishes the modes for them.
    - Control toggle: a $y$-feature that does distinguish the modes.
    - Herd-init toggle.
  - **What the user should see.**
    - Spanning observations keep mass in both modes.
    - The support is not trimmed.
    - The envelopes are wide.
    - Status is Underdetermined.
    - With LOO off and low $\beta$, the columns collapse onto one mode.
    - With herd init, CHALLENGE produces the mirror theory.
  - **Checks.**
    - M5 ≈ 0 for spanning observations;
    - control set resolves correctly;
    - herd-init run ends with the mirror theory accepted and wide envelopes.

  ### S4 Self-reinforcement

  - **Setup.** Long SOLVE runs with the S1 and S3 configs, with these switches:
    - LOO on/off;
    - alternating labels on/off (with partial labels enabled);
    - "weight → support leak". This is a deliberately broken mode that zeroes fragments under a mass threshold. It is labeled as violating P1.
  - **Display.** The main display is the metric-vs-iteration chart.
  - **Checks.**
    - safeguarded runs plateau;
    - broken runs show M5 rising while true-cell mass stays flat.

  ### S5 Circle and fragment blowup (requires M8)

  - **Setup.** Circular boundary. Controls for depth, fragment budget, and S1/S3 criterion.
  - **Displays.**
    - Fragments-per-observation shown as a floor heatmap.
    - A Pareto chart of fragments against M2a and accuracy.

### S6 3D parity

  - **Setup.**
    - Data: $x, y, z \sim U[0, 1]$, label = parity of three half-tests.
    - Tree: splits at 0.5 on each axis.
    - Supports and fragments are true 3D boxes.
  - **Purpose.** Shows compilation into up to 8 fragments per observation, and 3D face erosion.
  - **Checks.** Same as S1, at reduced $N$.

  ### S7 Mixed observation types

  - **Setup.** The XOR generator, with a mixture of exact values, noisy intervals, one-sided censoring, and fully missing coordinates.
  - **Purpose.** Shows that one representation handles all of these.
  - **Inspector.** Shows feature-level credible intervals for the missing coordinates.

  ## 7. Testing Strategy

  ### 7.1 Unit tests (Node)

  - **Compilation.**
    - Strict-inequality edge cases: an endpoint exactly on a threshold, and a degenerate interval exactly at a threshold.
    - $\pi$ sums to 1.
    - No zero-mass fragments.
    - Incremental compilation equals full compilation.
  - **Clopper–Pearson.** Matches reference values to $10^{-6}$.
  - **Support.**
    - Only singleton-label anchors exclude.
    - Partial labels count under the worst case.
    - Results are independent of order across random permutations.
    - Latching and the inconsistency flag work.
    - Contradictions never empty a support.
  - **Solve.**
    - LOO correctness: perturbing $i$'s own masses does not change $i$'s update.
    - As $\beta \to \infty$, $\hat{w} = \pi$.
    - $F$ decreases under undamped updates in small cases (diagnostic, not asserted universally).
  - **Bounds.**
    - Bisection hits the budget to tolerance.
    - Nesting: the ensemble envelope lies within the local envelope, which lies within $[0, 1]$.
  - **Challenge.** At $\beta = \infty$ no new theory is found. On a hand-built two-mode toy, the mirror theory is found.

  ### 7.2 Randomized invariant suite (§7)

  - Runs 200 random small problems per seed: random trees, boxes, labels, and hyperparameters.
  - Checks every property listed in §7 of `idea.md`.
  - Failures print a minimal reproducing seed.

  ### 7.3 In-app invariant guard

  In development mode, `invariants.js` asserts mass conservation, support monotonicity, and non-emptiness after every step. Violations appear as a red banner. They never fail silently.

  ### 7.4 Scenario acceptance

  `node --test` also runs each scenario headless at its default parameters and asserts its acceptance checks. This is the automated stage-gate record.

  ## 8. Milestones

  Each milestone ends in a runnable state. M1 and M6 correspond to stage gates 1 and 2.

  - **M0 — Scaffold.**
    - `index.html`, import map, empty scene with OrbitControls, axis frame, panel skeleton, URL state, seeded RNG.
    - Static server instructions in README.
  - **M1 — Representation (gate 1).**
    - `box`, `tree`, `compile`, `fragments`, `invariants`.
    - Compilation and invariant tests.
    - S0 data view and partition view render.
  - **M2 — Data and partition visuals.**
    - Data layer, partition layer, picking, and inspector with point-tree SVG.
    - Master tree panel.
  - **M3 — SUPPORT SOLVE.**
    - `stats`, `anchors`, `support`, plus tests.
    - Contraction view with sweep animation and provenance in the inspector.
    - M3 and M4 metrics.
  - **M4 — SOLVE.**
    - `solve`, plus tests.
    - Mass view with prior lid, iteration morph, and restarts.
    - M2a and M2b against B5, and B6-T oracle.
  - **M5 — CHALLENGE, BOUNDS, status.**
    - `challenge`, `bounds`, `status`, plus tests.
    - Theory view, envelope view, status view.
    - Diversity–fit chart and M5/M6/M8.
  - **M6 — Fixed-tree scenarios (gate 2).**
    - S1, S2, S3, and S6 with acceptance badges and the width-sweep chart.
    - Headless acceptance tests pass.
    - Tune `balanced` defaults.
  - **M7 — Safeguards (gate 3, partial).**
    - S4 with ablation toggles and metric-vs-iteration charts.
    - S7 mixed types.
  - **M8 — Structural (optional).**
    - `learn.js` with S1 and S3 scoring, prior-mass stopping, and incremental recompilation.
    - CART-equivalence test on S0.
    - S1 learned variant and S5.
    - Rebuild loop from contracted supports only (P6).
  - **M9 — Polish.**
    - Guided "tour" mode per scenario that walks the view sequence with narrative text.
    - Run export.
    - Worker offload if needed.
    - Colorblind palette check.
    - README with screenshots.

  ## 9. Honesty Requirements for the UI

  These mirror the binding principles of `idea.md` and are acceptance criteria for the demonstrator itself.

  - Hard and soft layers are never drawn with the same visual channel.
    - Supports and exclusions sit on the floor, as geometry.
    - Masses and theories sit above it, as height and opacity.
  - Any view coloring leaves by $\varphi$ says so. Any view coloring leaves by anchor counts says so.
  - Envelopes always carry the "not certified" caption.
  - Statuses always carry the line "conditional on topology: <tree id>".
  - Latent truth is hidden by default. Revealing it never changes any computation, and a test enforces this.
  - Broken ablation modes (no LOO, alternating labels, weight → support leak) render with a warning stripe and are excluded from `Run all`.
  - The current preset and all overrides are always visible.

  ## 10. Open Decisions

  - **Mass column normalization.** Columns can be normalized per observation (density) or by global total mass. The default is density, since that shows the location belief directly. Total mass is offered as an option.
  - **Theory display.** Stacked planes versus a scrubber morph. Both will be built. Which one is the default is decided after usability checks on S2.
  - **Evaluation cell resolution.** The resolution must be finer than the tree leaves to avoid flattering hand trees. The default is 8 × 8. A finer option is provided.
  - **Worker offload.** Decided at M5 based on measured CHALLENGE time.