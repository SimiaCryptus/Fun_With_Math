# Plan: Residual-Volume Coding Lab (3D, browser)

## 0. Goal

Build a self-contained browser lab that **proves** and **demonstrates** the residual-volume coding tree from `idea.md` on a gallery of 3D point clouds. The headline dataset is the bilogistic ribbon.

The lab has two jobs, and it should keep them separate.

1. **Prove.** Run executable checks of every identity, bound, and soundness claim the method depends on. Then run honest held-out comparisons against baselines. If a claim fails, the lab should show the failure plainly.
2. **Demonstrate.** Let a user watch a tree discover structure. The views should show splits proposed, gain intervals raced, boxes refined, constraints accepted, and the bits-per-point ledger falling.

Stack: plain HTML, modular ES6 (native `import`, no bundler), three.js loaded through an import map, and module Web Workers for training. It runs from any static server, for example `python -m http.server`.

---

## 1. Scope decisions

- **Dimension is fixed at 3.** The 3D cap lets the certified box oracle (Tiers 1–3) carry the whole load, including vertex enumeration with 8 corners per box. The statistical tier (Tier 4) is implemented as an ablation, not a necessity.
- **The reference domain is the unit cube `[0,1]^3`.** Every dataset is normalized into it, with a configurable margin. The reference measure is Lebesgue by default. One optional weighted measure is offered as an ablation (§3.5 of the idea).
- **The resolution is `eps = 2^-k`, default `k = 10`.** So `v_eps = 2^-30`, and the no-model cost is exactly 30 bits/point. The maximum possible saving is therefore 30 bits/point, which keeps every ledger readable.
- **Arithmetic is Float64 throughout**, with log2 in bits.
- **Everything is deterministic from a seed.** This uses a seeded PRNG, and the configuration is serialized into the URL hash so any run can be shared and reproduced.

---

## 2. Datasets (the gallery)

Each dataset module exports the following:

~~~js
export default {
  id, name, description,
  params: { /* name: {value, min, max, step} */ },
  generate(params, rng) -> Float64Array (N*3, already in [0,1]^3),
  truth?: { relations: [...], codim: number | "varies" }  // for recovery scoring
}
~~~

### 2.1 Bilogistic ribbon (headline)

The plan as written is:

    y* = r · y · (1 − y)          (standard logistic)
    x* = (1 − r) · x · (1 − x)    (reversed logistic)

Taken literally with `r ∈ [0,1]`, both maps collapse to 0, so the literal formula is not the interesting reading. The intended reading is a **normalized sweep parameter** `s ∈ [0,1]` mapped to the logistic parameter range `R(s) = r0 + (r1 − r0)·s`. Under that reading:

    y* = R(s)     · y · (1 − y)
    x* = R(1 − s) · x · (1 − x)
    point = (s, x, y)

The defaults are `r0 = 2.8` and `r1 = 4.0`. The "reversed" map runs the bifurcation cascade backwards along `s`.

A `mode` switch offers three choices:
- `normalized` (default),
- `literal` (the formula exactly as written, with an `r` range control, kept for honesty),
- `custom` (separate `r` ranges for each map).

Generation:
- Choose `s` either on a grid of `S` slices or uniformly at random. Use random by default, which avoids lattice artifacts that the tree would happily "explain".
- For each `s`, iterate from independent random `x0` and `y0` for `burn = 1000` steps. Then emit `M` consecutive iterates.
- Use independent initial conditions for `x` and `y`. At `s = 0.5`, both maps share a parameter, so a shared initial condition would synchronize them onto the diagonal. The diagonal is itself an interesting optional feature (`sync` toggle).
- Optional measurement noise `σ` (default 0) and optional dithering to the resolution cell.

Why it is a good test, and what the tree should find:
- Where both maps sit at fixed points, the cloud is a **1D curve**, for example `x = 1 − 1/R(1−s)`, so the codimension is 2.
- Where one map is periodic and the other chaotic, it is a set of **2D sheets** (codimension 1).
- Where both maps are chaotic, it is a 2D patch, a product of attractor supports, with fractal holes.
- Periodic windows cut crisp gaps. Period-doubling points are sharp seams.
- The `x` and `y` dynamics are independent given `s`, so sheets are products. Axis-aligned splits are partly sufficient, while the fixed-point branches are curved. That makes it a fair contest between axis, affine, and quadratic generators.
- Without noise, points lie exactly on measure-zero sets. This exercises the resolution floor (§7.5) and `V+` as a touched-cell count.

### 2.2 Supporting gallery

| id | cloud | purpose |
|---|---|---|
| `uniform` | uniform in cube | **null control**: tree must make ~0 splits |
| `blob` | 98% in a ball of 1% volume + 2% uniform | the §3.3 worked example (~6.37 bits/pt) |
| `noisy-plane` | slab around `z = 0.3 + 0.4x − 0.2y`, width w | 3D analogue of §7.2; affine-slab recovery |
| `shell` | noisy sphere shell | quadratic slab recovery |
| `torus` | noisy torus | quartic: tests what quadratic generators do with it |
| `helix` | noisy helix | codim-2 curve, needs ≥2 constraints |
| `gmm` | 3-component Gaussian mixture | diffuse density: expect tiling, not laws |
| `lorenz` | Lorenz attractor (RK4) | fractal-ish 2D-sheet structure |
| `rossler` | Rössler attractor | thin folded band |
| `thomas` | Thomas cyclically symmetric attractor | many lobes, stress test |
| `henon-sweep` | Hénon map swept over `a` (like bilogistic) | second bifurcation ribbon |
| `swiss-roll` | swiss roll | curved 2D sheet |

Each dataset that has a known relation declares it in `truth`. The recovery scorer can then compare the accepted constraints against the generating law.

---

## 3. Architecture and files

~~~
index.html                 # layout, import map (three@0.160.x, OrbitControls)
tests.html                 # browser test runner page
styles.css
src/
  main.js                  # wires UI, viz, worker
  config.js                # defaults, URL-hash (de)serialization
  core/
    rng.js                 # mulberry32 / xoshiro128**, normal(), shuffle()
    special.js             # lgamma (Lanczos), log2, logsumexp, log2Binom
    linalg.js              # 3x3/10x10 sym eig (Jacobi), solve, cov, PCA
    codelength.js          # KT, plug-in H2, param/threshold costs, gain, gain interval
    ledger.js              # model-bit bookkeeping per protocol
  geometry/
    box.js                 # Box {lo, hi}, volume, bisect longest, corners
    predicates/
      affine.js            # exact range O(d)
      quadratic.js         # Hessian class (convex/concave/indefinite), DC split, vertex+tangent bounds
      rbf.js               # per-center dmin/dmax bounds, center dropping
      taylor.js            # 1st-order Taylor-model range (fallback/tightener)
      field.js             # common interface {eval(x), range(box, corners?), hessianInfo}
    region.js              # Region = root box ∩ list of (field, op, t | t1,t2)
    oracle.js              # subdivision measure, IN/OUT/UNKNOWN, constraint dropping
    fieldBoxTree.js        # per-(region, field) box tree with [fmin,fmax]; shared threshold sweep
    cornerCache.js         # dyadic-key corner memo (optional, for RBF)
    sampler.js             # Tier-4: sample from UNKNOWN boxes, confidence sequences
    tetmesh.js             # marching tetrahedra for rendering level surfaces
  generators/
    index.js               # registry; each: propose(nodeCtx) -> [{field, family, hp, paramCost}]
    tightBox.js            # mandatory baseline (2d thresholds)
    axis.js                # coordinate fields x_k (DET-like baseline family)
    affinePCA.js           # principal directions, incl. smallest (plane-law) direction
    affineContrast.js      # logistic regression data-vs-reference
    quadEllipsoid.js       # Mahalanobis field from covariance
    quadImplicit.js        # algebraic quadric fit: smallest eigvec of lifted scatter
    quadContrast.js        # L1 logistic on degree-2 monomials (sparse quadratic)
    rbfContrast.js         # kernel logistic, centers = data indices (pointers)
  tree/
    node.js                # Node/Leaf structures, serialization
    sweep.js               # holdout sweep: one-sided thresholds + slabs
    race.js                # decision-directed refinement
    train.js               # TrainNode recursion (step-able generator function)
    evaluate.js            # held-out code length, escape mixture, density
    profile.js             # codimension & scale profile per path
    recovery.js            # compare accepted constraints vs dataset.truth
  baselines/
    uniformBox.js          # 30 bits/pt reference
    axisDET.js             # same codec, axis family only
    mdlHistogram.js        # regular grid, MDL-chosen bins
    kde.js                 # Gaussian KDE, CV bandwidth (held-out bits at eps)
  overlap/
    overlap.js             # P(A|B), Jaccard via oracle; matrix
  workers/
    train.worker.js        # runs train.js; posts progress events
    protocol.js            # message types
  viz/
    scene.js               # renderer, camera, OrbitControls, unit-cube frame
    pointsLayer.js         # THREE.Points, colorings
    leafLayer.js           # InstancedMesh of IN boxes (solid), UNKNOWN (wire)
    surfaceLayer.js        # split surfaces via tetmesh / plane clipping
    raceView.js            # 2D canvas: gain-interval bars over refinement steps
    ledgerView.js          # bits/pt stacked bar: path, residual, model
    profileView.js         # Δlog2 μ vs cumulative C_split per path
    treeView.js            # collapsible outline of the tree
  ui/
    panel.js               # lightweight custom controls (no external GUI dep)
datasets/
  index.js, bilogistic.js, uniform.js, blob.js, noisyPlane.js, shell.js, torus.js,
  helix.js, gmm.js, lorenz.js, rossler.js, thomas.js, henonSweep.js, swissRoll.js
tests/
  run.js                   # tiny assert/describe harness, renders to tests.html
  codelength.test.js
  oracle.test.js
  predicates.test.js
  gainInterval.test.js
  sweep.test.js
  tree.test.js
  datasets.test.js
~~~

Design rules:
- **Pure core.** Everything under `core/`, `geometry/`, `generators/`, `tree/`, `baselines/`, and `overlap/` is DOM-free. It can be imported by the worker, the tests, and (later) Node.
- **Typed arrays at hot spots.** The box pools in `fieldBoxTree` use struct-of-arrays `Float64Array`s with free lists, and corners are stored per box (8 values).
- **Interval values carry provenance.** Every interval is `{lo, hi, kind: "certified" | "probabilistic", delta?}`, as §5.7 of the idea requires.

---

## 4. Core math (`core/codelength.js`)

All quantities are in bits.

- `kt(nL, nR)`: computes `−log2[ Γ(nL+½)Γ(nR+½) / (π Γ(n+1)) ]` using `lgamma`.
- `h2plug(nL, nR)`: returns `n·H2(nL/n)`.
- `paramBits(n, k)`: returns `k/2 · log2 n`.
- `thresholdBits(m)`: returns `log2 m`. A slab costs `log2 C(m,2)`.
- `pointerBits(n, k)`: returns `log2Binom(n, k)`.
- `sparseQuadBits(n, k, p=10)`: returns `log2Binom(p,k) + k/2·log2 n`.
- `familyBits(F)`: returns `log2 F`. `gridBits(G)`: returns `log2 G`. `topologyBit = 1`.
- `gainAtShare(qL, nL, nR, branchBits, cSplit)`: returns `nL·log2(1/qL) + nR·log2(1/(1−qL)) − branchBits − cSplit`.
- `gainInterval({nL, nR, VL, VR, vEps, branchBits, cSplit})` implements §6.1:
  - clamp each lower volume as `V̂− = max(V−, vEps)`;
  - compute `q_lo = V̂L− / (V̂L− + VR+)` and `q_hi = VL+ / (VL+ + V̂R−)`;
  - set `G+` to the endpoint maximum;
  - set `G−` to `G(pL)` if `pL ∈ [q_lo, q_hi]`, else the endpoint minimum.

**Resolution floor inside the gain.** The share `qL` used in the gain is computed from floored volumes. This prevents a child of zero measure from claiming infinite savings.

---

## 5. Measure oracle

### 5.1 Regions and predicates

A `Region` is the root box together with a list of constraints `(fieldRef, kind, t)`. Here `kind ∈ {lt, ge, slabIn, slabOut}`. Every field implements:

~~~js
range(box, ctx) -> {lo, hi}   // certified enclosure of f over box
eval(x)                        // scalar
~~~

- **Affine:** returns `f(m) ± Σ|a_i| h_i`, which is exact.
- **Quadratic:** classifies `H` once, using a 3×3 eigendecomposition.
  - *Convex:* the upper bound is the maximum over the 8 corners. The lower bound is the tangent plane at the center, then the exact box-QP when that is inconclusive. In 3D the box-QP is solved exactly by enumerating faces, edges, and the interior; this is cheap and exact.
  - *Concave:* the mirror image of the convex case.
  - *Indefinite:* uses the DC split `H = H+ − H−` from the eigendecomposition.
  - Corners are inherited from the parent box. New corners are computed with the incremental update `q(x+δe_k) = q + δ∂_k q + ½δ²H_kk`, with the gradient cached.
- **RBF:** uses separable `d²min`/`d²max` per center with sign-aware sums. It maintains a per-box active-center list, so centers with `|c_i| e^{−γ d²min} < τ` are folded into an error term that the children inherit.
- **Taylor fallback:** gives `f(m) + ∇f(m)·(x−m)` plus a remainder bound. The remainder comes from the Hessian bound, which is exact for quadratics and bounded per center for RBFs. It is tried before subdividing any box that is UNKNOWN only because of an RBF.

### 5.2 `oracle.measure(region, opts)`

This runs subdivision with IN/OUT/UNKNOWN tags. Two rules apply:
- **Constraint dropping:** a box stores only its still-active constraints.
- **Stopping:** subdivision stops at side length `eps` or at the box budget.

It returns `{V−, V+, boxesIN, boxesUNK}`. Results are cached per leaf so they can be reused by children and by the visualization.

### 5.3 `FieldBoxTree` (the shared sweep, §9)

A `FieldBoxTree` is built once per `(node region N, candidate field f)`. Its leaf boxes are those that are IN or UNKNOWN with respect to `N`, and each carries `[fmin, fmax]`. To answer a threshold `t`:
- `VL−(t) = Σ μ(B)` over boxes that are IN with respect to `N` and have `fmax < t`;
- `VL+(t) = Σ μ(B)` over all boxes with `fmin < t`.

`VR` is computed the same way, mirrored. These sums use two sorted arrays and prefix sums, giving `O(log B)` per threshold. Slab bounds come from differences of the one-sided bounds.

The tree also supports `refine(tSet, k)`. It bisects up to `k` boxes whose `[fmin, fmax]` straddles any contested threshold, or that are UNKNOWN with respect to `N`, chosen by priority (`μ(B) × sensitivity`). After refining it updates the prefix structures incrementally. A rebuild of the sorted arrays is acceptable at the sizes involved here.

### 5.4 Tier 4: statistical fallback (`sampler.js`)

This tier samples uniformly from the UNKNOWN boxes, weighted by measure, while IN boxes are counted exactly. It uses a Bernoulli **confidence sequence** (a betting / Hoeffding-style time-uniform bound) and a union bound over active candidates. In 3D it serves as an ablation and a cross-check. It can also be used to check that the certified intervals contain the sampled estimates.

---

## 6. Generators (3D)

Each `propose(ctx)` receives the fitting points, the node region, and a reference sampler for `N`. It returns fields together with metadata `{family, hp, paramCount | encoding}`.

1. **`tightBox`:** the mandatory baseline. The child is `N ∩ bbox(points)`.
2. **`axis`:** the coordinate fields `x`, `y`, and `z`. Together with KT and topology costs, this family is the DET-like baseline.
3. **`affinePCA`:** the three principal directions of the node's points. The smallest-variance direction is the plane-law candidate; with a slab, it is the §7.2 lawful slab.
4. **`affineContrast`:** logistic regression of the data against `m` reference samples drawn from `N`. It uses IRLS with a ridge penalty.
5. **`quadEllipsoid`:** the Mahalanobis distance from the mean and covariance. Sublevel sets are ellipsoids, and slabs are shells.
6. **`quadImplicit`:** the **law finder**.
   - Lift each point to the 10 degree-≤2 monomials.
   - Take the eigenvector of the (Taubin-normalized) scatter with the smallest eigenvalue. This gives an implicit quadric `g(x) ≈ 0`.
   - Offer slabs `|g| < w`, normalized by the gradient magnitude.
   - Optionally prune small coefficients to obtain a sparse encoding.
7. **`quadContrast`:** L1-logistic regression on the degree-2 monomials, using the sparse-quadratic encoding.
8. **`rbfContrast`** (later milestone):
   - Choose `k`-means++ centers, then snap each one to its nearest data point so that it can be encoded as a pointer.
   - Fit kernel logistic regression on data versus reference over a small `(γ, k)` grid.

The reference samples for contrast fitting come from the node's cached IN/UNKNOWN boxes. This sidesteps rejection from the root (§5.7 of the idea).

---

## 7. Training (`tree/train.js`)

Training is written as a **generator function**, `function* trainNode(...)`. It yields events, so the worker can stream progress and the UI can single-step:
- `nodeStart`,
- `candidatesProposed`,
- `sweepDone`,
- `raceStep {intervals}`,
- `accepted` / `leaf`,
- `nodeEnd`.

Per node:
1. Stop if `n < nMin`, the depth is at least `maxDepth`, or the global box budget is exhausted.
2. Split the node's points into fitting and holdout sets. The default fraction is 0.5, seeded.
3. For each family and grid point:
   - propose a field and build its `FieldBoxTree` with a coarse initial depth;
   - sweep the thresholds (holdout quantiles, `m ≤ 64`) and slabs (pairs from those quantiles, pruned to `≤ 256`);
   - compute gain intervals.
4. **Race** (§6.2):
   - drop candidates with `G+ < 0`;
   - loop while the race is unsettled and budget remains: pick the contested candidate with the largest `(G+ − G−) × sensitivity`, refine its tree, and recompute;
   - when the budget runs out, take the largest positive `G−`, or else make the node a leaf.
5. **Accounting protocol** (UI toggle, §4.3):
   - `conditional` (default for RBF): the fitting points are coded under the parent. The charge is family, grid, threshold, and KT. The gain is credited on the holdout points.
   - `fullSample` (default otherwise): holdout points are used for screening only. The final gain is recomputed on all `n` points with full parameter costs, and the race is re-run if the winner changes.
   - `blockPrequential`: implemented in a later milestone.
6. Recurse into the children. Each child region is the parent's constraints plus the winning constraint. The `IN` boxes of the child are seeded directly from the winning `FieldBoxTree`, so no work is redone.

### Evaluation (`tree/evaluate.js`)

- The data are split into train and test sets, with 20% held out for test.
- The test code length per point is computed as follows:
  - the path cost uses KT-smoothed probabilities along the path;
  - the residual cost is `log2(μ(leaf)/v_eps)`, using the midpoint estimate, with both certified bounds shown;
  - the escape mixture with parameter `η` guards against empty leaves.
- The reported total is `model bits / N_train` plus the test bits/point. A **bits-vs-model-bits curve** is produced by sweeping a model-complexity multiplier.

---

## 8. Visualization and UI

The layout has three regions:
- **Left panel:** dataset and parameters, generator families on/off, accounting protocol, `eps`, budgets, and seed. Buttons: **Generate**, **Train**, **Step node**, **Step race**, **Reset**.
- **Center:** the three.js viewport with OrbitControls and the unit-cube frame.
- **Right panel:** the tree outline, ledger, race view, and profile.

Layers (all toggleable):
- **Points.** These can be colored by leaf id, by `log2 f̂` (density), or by residual bits. Points in the selected node are highlighted.
- **Leaf volumes.** An `InstancedMesh` of IN boxes uses a translucent fill in the leaf color. UNKNOWN boxes are drawn as wireframe; they make the certified gap literally visible.
- **Split surfaces.**
  - Affine splits are drawn as the plane clipped to the node region, using the node's boxes as a mask.
  - Quadric and RBF splits are drawn with marching tetrahedra over the `FieldBoxTree`'s fine boxes, restricted to the node region. Slabs show both faces.
- **Selected node.** Shows the parent region, the candidate surfaces (ghosted), and the winner (solid).

Panels:
- **Ledger.** A stacked bar of bits per point:
  - 30 (no model) → path + residual + model.
  - Totals are shown for train and test.
  - The null-control expectation (≈ 30 for `uniform`) is marked.
- **Race view.** Horizontal interval bars, one per candidate, animated across refinement steps. Accept and reject events are highlighted.
- **Profile view** (§7.4). For each root→leaf path, it plots cumulative `−Δlog2 μ` against cumulative `C_split`. The step pattern shows collapse-then-plateau versus tiling.
- **Tree outline.** Each node shows family, constraint text, `[G−, G+]`, `n`, and the volume interval.
  - Affine and quadric laws are printed symbolically, for example `|0.41x − 0.89z + 0.12| < 0.012`.
  - Clicking a node selects it in 3D.
- **Recovery card.** For datasets with a `truth`, it shows the matched relation, the angle or coefficient error, the width error, and the estimated codimension compared with the truth.

---

## 9. "Prove": the test suite (`tests.html`)

The tests are deterministic and seeded, and each test prints the numbers it checks.

**Code length identities**
1. **KL identity.** For random `(nL, nR, VL, VR)`, check that `nlog2VP − nL log2VL − nR log2VR − nH2 = n·KL(p‖q)` to within 1e-9.
2. **Multiway identity.** Check the §3.3 multiway form on random partitions.
3. **Blob example.** Check that the per-point gain is `6.37 ± 0.01`.
4. **Noisy line.** Check that `log2(1/0.02) = 5.64`.
5. **KT.** Check the exact small-`n` values against direct products, check that `kt ≈ nH2 + ½log2 n + O(1)` as `n` grows, and check that `kt(n, 0)` is finite.
6. **Piecewise-uniform equivalence (§3.2).** On a fixed tree, check that the summed code length equals the NLL of `f̂` plus `N log2 v_eps`.

**Oracle soundness** (property tests with random boxes and fields)
7. **Enclosures contain samples.** For affine, quadratic (convex, concave, and indefinite), RBF, and Taylor fields, check `range(box)` against 10⁴ samples per box. Zero violations are allowed.
8. **Affine exactness.** Check that the range equals the min and max over the vertices.
9. **Monotone tightening.** Check that `V−` is non-decreasing and `V+` non-increasing under refinement, and that the true volume lies inside the interval for analytic cases (ball, half-space ∩ cube, ellipsoid, shell). The true volumes have closed forms or are computed by high-precision quadrature.
10. **Corner inheritance.** Check that inherited or incremental corner values match direct evaluation to within 1e-12, and that the evaluation count for one bisection is `2^(d−1)`.
11. **Shared sweep.** Check that `FieldBoxTree` bounds for every threshold match independent `oracle.measure` calls on the same final boxes.
12. **Tier-4.** Check that the confidence sequences cover the true volume at a rate of at least `1−δ` over 500 seeded repeats, with optional stopping included.

**Gain intervals and racing**
13. **Gain interval containment.** Check that `[G−, G+]` contains `G(true q)` for random volume intervals.
14. **Convexity.** Check `G(qL)` numerically, and check that its argmin is at `pL` under the plug-in branch code.
15. **Racing agrees with brute force.** Check that the racing winner equals the brute-force winner (all candidates refined to the floor) in more than 99% of seeded nodes. Log the disagreements; they must be near-ties.

**Model behavior** (the claims themselves)
16. **Null control.** On `uniform` with N=20k, check that the tree makes at most 1 split and that test bits/pt ≥ 30 − 0.05.
17. **Plane law.** On `noisy-plane`, the root winner should be an affine slab. Check that the normal angle error is under 2° and the width error under 15%.
18. **Shell.** On `shell`, check that the winner is a quadric slab and that the radius is recovered.
19. **Helix.** On `helix`, check that the profile shows 2 large collapses before the plateau.
20. **Overfitting guard.** With RBF enabled on `noisy-plane`, check that RBF does not win the root.
21. **Baseline ordering.** On every structured dataset, check that test bits/pt satisfies uniform > axisDET ≥ full-family tree, compared at matched model bits. Report KDE and the MDL histogram alongside.
22. **Bilogistic.** Check that the accepted constraints include curved fixed-point branches (`quadImplicit` or `quadEllipsoid`) and that compression is at least 10 bits/pt at the default settings. **This threshold is provisional**: calibrate it in M7 and record the calibrated value.

---

## 10. Milestones

| M | deliverable | acceptance |
|---|---|---|
| M0 | scaffold: `index.html`, import map, scene with unit cube, dataset registry, `uniform` + `bilogistic` rendered | ribbon visible, seeded, URL-hash config round-trips |
| M1 | `core/` (rng, special, codelength) + test harness | tests 1–6 pass |
| M2 | box, affine predicate, oracle, FieldBoxTree, tightBox + axis generators, train (no racing: refine to floor) | tests 7–8, 9 (affine cases), 11, 16; axisDET runs on all datasets |
| M3 | viz layers (points, IN/UNKNOWN boxes, planes), ledger, tree outline, worker streaming | train on bilogistic with axis family, watch it live |
| M4 | quadratic predicates (Hessian classes, DC, corners/incremental), affinePCA, quadEllipsoid, quadImplicit, slabs, marching tets | tests 9–10, 17–19 |
| M5 | gain intervals + racing + priority refinement, race view, step controls | tests 13–15; report the box-count savings of racing vs brute force |
| M6 | accounting protocols, evaluation, baselines (MDL histogram, KDE), bits-vs-model-bits curve | tests 21; ablation table renders |
| M7 | bilogistic deep dive: presets, profile view, recovery card, full gallery | test 22 calibrated; screenshots/presets saved |
| M8 | RBF predicate + rbfContrast + Taylor tightening + center dropping | tests 7 (RBF), 20 |
| M9 | Tier-4 sampler + confidence sequences; overlap algebra demo (two trees / tree vs ellipsoid, Jaccard matrix) | test 12; overlap view |

---

## 11. Bilogistic presets (M7)

- **`cascade`:** `r ∈ [2.8, 4.0]`, N=60k, no noise. This preset shows the full mirrored cascades.
- **`windows`:** `r ∈ [3.82, 3.86]`. This zooms into the period-3 window, where the gaps should become splits.
- **`fixed-only`:** `r ∈ [1.5, 2.9]`. Both maps are at fixed points, so the cloud is one smooth curve. Expect two curved constraints and nothing else.
- **`sync`:** shared initial conditions. This adds the diagonal at `s = 0.5`, which should be found as a plane-law slab.
- **`noisy`:** `σ = 0.005`. This shows the profile plateau moving to the noise scale (§7.5).
- **`literal`:** the formula exactly as written in this plan's original note. It is documented as degenerate, and the tree should collapse it to a corner.

---

## 12. Performance budget

- Datasets go up to 100k points. Training runs in the worker. The UI receives typed-array snapshots (box lists and leaf ids) with transfer, not copies.
- The default per-node box budget is 50k, and the global budget is 2M. Box pools are preallocated.
- Instanced rendering is capped at about 200k boxes. Beyond that cap, only UNKNOWN boxes plus a leaf-level summary are drawn.
- The target is under 10 s to train `bilogistic/cascade` at the default settings on a laptop.

---

## 13. Open questions to settle while building

- **Threshold candidate count `m` and slab pruning.** Their bit costs depend on `m`. Choose them by an ablation, not by taste.
- **`quadImplicit` normalization.** Compare Taubin with plain least-squares. Note that `|g| < w` is a level band of `g`, not a geometric distance band, so the gradient normalization affects the shape of the band.
- **Whether the midpoint estimate or the certified upper bound should be used for test-time leaf measure.** Report both, and recommend the upper bound for "honest" numbers.
- **Whether the tight-box baseline should be offered at every node or only at the root.** The idea says every node. Measure how often it wins below the root.