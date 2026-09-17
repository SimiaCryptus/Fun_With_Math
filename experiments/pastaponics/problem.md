# PTRS Lattice Generator — Problem Statement & Solution Space

This document restates the geometry-generation problem for the Programmable Tubular
Rhizosphere Substrate (see `idea.md`), pins down the constraints, and explores the
solution space widely before we commit to an implementation.

---

## 1. Problem statement (one paragraph)

We need to procedurally generate a **3D lattice of distinct, non-intersecting, porous
tubes** that fills a bounded volume (a "cartridge"). Each tube belongs to exactly one
**channel** (N, P, K, micro, bio, hormone, stress, water, …). Every channel has its
own parameters — flow rate, total internal volume, wall porosity, tube diameter,
cross-section shape, share of the volume — and every channel must start and end at a
**manifold face** so it can be plumbed to a pump. The result must obey **clearance**
(tubes never touch, roots can fit between them), **printability** (min wall, overhang,
no trapped unsupported material, single connected solid), and be delivered both as an
**interactive model in the UI** and as an **STL for printing**.

Informally: *"draw a bowl of noodles where every noodle is a labelled pipe, nothing
touches, everything is printable, and the plant can reach all of it."*

---

## 2. What we are actually building — the pipeline

It helps to separate the problem into stages. Most of the brainstorming below is
about stage 2; the others are comparatively well-understood engineering.

```
  [1] Spec        channel list + per-channel params + cartridge shape + constraints
       │
  [2] Routing     produce a centreline path (polyline / graph) for every channel
       │           ← the hard, creative part
  [3] Validation  clearance, curvature, printability, reachability, volume targets
       │
  [4] Solidify    sweep cross-sections along centrelines, add walls & pores,
       │           add manifold ports, union into one solid
       │
  [5] Deliver     mesh → three.js viewer (UI)   and   mesh → binary STL (print)
```

Key design decision: **stage 2 produces abstract centrelines**, not meshes. Everything
downstream (viewer, STL, analysis) consumes the same centreline data. This lets us swap
routing algorithms freely and evaluate them with the same validator.

---

## 3. Requirements & constraints

### 3.1 Functional
- **Multiple channels** (2–8 typical, up to ~16). Each is topologically a single tube
  (or a small tree with one inlet/one outlet) — no unintended cross-connections.
- **Two ports per channel** on the manifold face(s): inlet and outlet (drain-to-waste
  or recirculation). Some channels may be dead-end (inlet only) — configurable.
- **Spatial differentiation**: channels should interleave so a root exploring any
  region encounters several channel types nearby (high-contrast nutrient landscape).
- **Tunable spatial bias**: optionally concentrate a channel near the top, bottom,
  core, or periphery (e.g. water channel near the crown, stress channel far away).
- **Per-channel parameters**:
  | Parameter          | Range / notes                                    |
  |--------------------|--------------------------------------------------|
  | tube outer Ø       | 2–10 mm                                          |
  | wall thickness     | 0.8–2 mm (printer/material dependent)            |
  | cross-section      | circle, ellipse, rounded square, star (root grip) |
  | pore size          | 50–500 µm sterile; ≥ 500 µm for organic slurries |
  | pore density       | pores / cm² of wall                              |
  | volume fraction    | fraction of cartridge volume this channel fills  |
  | target internal V  | mL — derived or specified                        |
  | path tortuosity    | straight-ish vs highly convoluted                |
  | flow rate          | µL/min – mL/s (informs Ø and length via pressure drop) |

### 3.2 Geometric
- **Clearance** `c_min` between any two tube outer surfaces (default 1.5–3 mm — roots
  need to squeeze between tubes; also ensures walls don't fuse in print).
- **Root access**: every point of the void space should be reachable from the top
  face without passing through a gap narrower than `c_min`. No sealed voids.
- **Minimum bend radius** ≥ ~1.5 × tube Ø to keep the interior open and avoid
  kinks that trap slurry.
- **No pinch points** in the lumen (interior stays fully open along the path).

### 3.3 Printability (FDM baseline; SLA/SLS relax some of these)
- Minimum wall ≥ 2 × nozzle width (≈ 0.8 mm at 0.4 mm nozzle).
- Overhangs: unsupported tube segments limited to ~45° from vertical, or the design
  must be self-supporting (tubes lean on neighbours — but clearance forbids contact!).
  Options: print in a "drainable support" mode, use a lattice frame, or bias paths
  upward-diagonal.
- Internal channels must be **drainable** (no support material trapped inside):
  lumens are continuous from inlet to outlet with no local minima below the outlet,
  or every local minimum has a drain pore.
- Result must be a **single manifold, watertight, connected solid** (tubes + frame +
  manifold plate). Disconnected tubes fall over.
- Bounding volume must fit the print bed (or be split into stackable modules).
- Pores: for FDM, pores below ~0.5 mm are unreliable → treat "porosity" as either
  modelled holes (≥ 0.5 mm) or as a *post-process* (laser perforation) or as a
  *material property* (porous filament / ceramic). Spec must allow all three.

### 3.4 Biological / hydraulic
- Flow: for a given pump rate, pressure drop ∝ length / Ø⁴ (Hagen–Poiseuille) —
  long thin tubes may exceed pump head. Validator should estimate ΔP per channel.
- Slurry channels need larger Ø, gentler bends, and an oxygenation route.
- Avoid perfectly horizontal runs in slurry channels (sedimentation).
- Transparent inspection windows: reserve one face as flat for imaging.

### 3.5 Software
- Deterministic from a seed (reproducible experiments).
- Fast enough for interactive parameter tweaking (< ~2 s for a preview-quality result,
  minutes acceptable for final export).
- Output: JSON spec + centreline graph + mesh (glTF for UI, STL for print).
- Implementation-language agnostic; likely TypeScript (browser UI) with an optional
  Python/Rust backend for heavy meshing.

---

## 4. Solution space — routing strategies

Each strategy below is evaluated against: multi-channel separation, clearance
guarantee, volume control, printability, root-access, aesthetic/"soil-likeness",
implementation cost.

### 4.1 Space-filling curves (the original idea)

**Concept.** Use a 3D Hilbert/Moore/Peano curve to visit every cell of an
`n × n × n` grid exactly once; the curve is the centreline. Guaranteed
self-avoiding, uniform density, deterministic.

**Extending to multiple channels — options:**
1. **Segmenting** one Hilbert curve into `k` contiguous arcs → each channel gets a
   compact blob. Bad interleaving (channels are spatially segregated), good simplicity.
2. **Striping** — assign grid cell `i` along the curve to channel `i mod k`. Perfect
   interleaving but each channel becomes disconnected fragments. ✗ unless we then
   connect fragments (see 4.8).
3. **Multi-resolution nesting** — coarse Hilbert curve (level L) defines "lanes";
   each lane is filled by a finer curve of a single channel. Channels interleave at
   the coarse scale, are contiguous at the fine scale.
4. **k interleaved Hilbert curves** on a `k`-coloured sublattice: split the grid into
   k interpenetrating sublattices (e.g. for k = 2, the two colours of a 3D
   checkerboard at 2× spacing; for k = 8, the 8 parity classes of `2×2×2` blocks) and
   run an independent Hilbert curve on each. This is the most elegant option: every
   channel is a single curve, all channels are uniformly interleaved, clearance is
   exactly the sublattice offset.
5. **Adaptive / weighted curves** — vary the recursion depth per region to get
   denser tubing (finer curve) in some zones and coarser in others; implement via
   octree-driven Hilbert ordering.

**Cross-section along the curve.** Grid cell pitch `p` must satisfy
`p ≥ Ø_max + c_min`. Corners are 90°; round them with arcs of radius `r ≥ 1.5 Ø`
(fits if `p ≥ 2r`), or pick a smoother curve family (see below).

**Smoothness.** Hilbert curves are all right angles. Alternatives that are still
space-filling but smoother: **Gosper / flowsnake** (hexagonal, 2D only → extrude in
layers), **Lebesgue Z-curve** (jumps, no good), **Sierpiński** (diagonals), or simply
post-process with Chaikin / Catmull-Rom smoothing then re-check clearance.

**Volume control.** Each channel's length is fixed by grid size; volume is tuned by
Ø. To give channels *different* volume fractions, either assign more sublattice
parity classes to one channel, or use the multi-resolution scheme.

**Printability.** Hilbert curves have long horizontal runs (bad for overhangs and
slurry sedimentation) but every run is short (one cell pitch) so bridging is fine.
Drainability: the curve has many local minima → needs drain pores or an SLA process.

**Verdict.** Excellent MVP: deterministic, provably clearance-safe, trivially
multi-channel via sublattices. Weakness: looks like a circuit board, not soil; limited
organic irregularity; hard to bias spatially.

### 4.2 Maze / spanning-tree algorithms, generalised to 3D and k channels

**Concept.** A maze is a spanning tree of a grid graph. A *perfect* maze on a 3D
grid touches every cell; a *Hamiltonian path* through the maze's dual is a single
self-avoiding tube. For multiple channels: **multi-source competitive growth**.

**Multi-channel growth ("k-colour flood"):**
- Seed `k` growth fronts at the manifold face, one per channel.
- Repeatedly pick a front (weighted by that channel's remaining volume budget) and
  grow into an unclaimed neighbouring cell (randomised Prim / recursive backtracker
  style). Cells claimed by channel `c` are forbidden to all others plus a 1-cell
  buffer if `c_min > p − Ø`.
- Growth produces a **tree** per channel. To make each a single **path**
  (inlet→outlet), either (a) only allow growth from the tip (self-avoiding walk with
  backtracking = "snake" growth), or (b) accept a tree and give it one inlet and
  multiple dead-ends / multiple outlets — actually attractive biologically (more
  surface, more branching) but harder to flush.
- **Braiding**: after trees are built, add loops to reduce dead ends (so slurry can
  circulate).

**Algorithms worth trying:**

| Algorithm                          | Character                                    | 3D-ready |
|------------------------------------|----------------------------------------------|----------|
| Recursive backtracker              | long winding corridors, few branches         | yes      |
| Randomised Prim                    | short bushy branches, high surface area      | yes      |
| Kruskal                            | uniform texture, many short dead ends        | yes      |
| Wilson's (loop-erased random walk) | unbiased, beautiful, slow                    | yes      |
| Growing tree (weighted)            | tunable between backtracker and Prim         | yes      |
| Eller's / sidewinder               | layer-by-layer — natural for stacking prints | partial  |

**Volume control.** Natural: stop growing a channel when its cell count hits its
budget. **Spatial bias.** Natural: weight neighbour choice by a scalar field
(e.g. `water` prefers low z).

**Guarantees.** Full coverage needs a repair step (unclaimed cells → assign to
nearest channel or leave as void for roots — voids are *good*). Every cell reachable
by roots? Cells that are void form the root space; check connectivity to top face.

**Verdict.** Most flexible and "soil-like" of the grid methods. Randomness gives
organic variety; budgets and bias fields give control. Slightly more work than 4.1;
still clearance-safe by construction on a grid.

### 4.3 "Bowl of noodles" — continuous, physics/agent based

**Concept.** Forget the grid. Each channel is an agent performing a **self-avoiding
random walk in ℝ³** with a persistence/curvature prior (like a worm). Maintain a
spatial hash of all tube segments; reject or deflect steps that violate clearance.
Optionally follow with a **relaxation** pass (treat tubes as elastic rods with
repulsive contacts; simulate until clearances are satisfied — like packing spaghetti).

**Variants:**
- **Correlated random walk** with turning-angle distribution → tunable tortuosity.
- **Potential-field steering**: attract toward unexplored space (coverage), repel from
  other tubes and walls, bias toward channel's preferred zone.
- **Rope dropping simulation**: literally simulate flexible rods falling into a box
  (Bullet/PhysX/Rapier) then thicken. Very organic; hard to control; may not converge.
- **Curl-noise advection**: advect particles through a divergence-free noise field →
  smooth non-crossing streamlines by construction (streamlines of a smooth field don't
  cross). Clearance between *different* streamlines still needs checking.

**Pros.** Smooth, curvy, natural-looking; cross-section can vary along the path;
no grid artefacts. **Cons.** Coverage and volume fractions only approximately
controlled; may get trapped (dead ends with no legal move → backtrack); clearance is
checked, not guaranteed; slow-ish. Root access is emergent, must be verified.

**Verdict.** Best aesthetics and most "proto-soil". Good as a *second* generator once
the pipeline is stable, or as a **smoothing/relaxation stage** applied to grid output
from 4.1/4.2 (best of both: guaranteed topology, organic geometry).

### 4.4 Periodic lattices & TPMS (gyroid, Schwarz-P, diamond)

**Concept.** Triply-periodic minimal surfaces divide space into two (or more)
interpenetrating labyrinths that never touch. A gyroid sheet with thickness gives
**two** built-in channels with perfect clearance and enormous surface area. This is
how many 3D-printed heat exchangers and bone scaffolds already work.

**Multi-channel extension.** Some TPMS variants and 3D periodic tilings partition
space into 3+ labyrinths; alternatively, nest a gyroid inside each labyrinth of a
coarser gyroid (hierarchical) to multiply channels. Or use a **cubic strut lattice**
and route k channels along disjoint edge subsets (edge-colouring of the lattice graph).

**Pros.** Implicit-surface representation → trivial to mesh (marching cubes), pore
size = a scalar, printability excellent (self-supporting), roots love the topology.
**Cons.** Periodic/regular (not "fractal-structural"), k > 2 is awkward, per-channel
volume differentiation is limited to thickness offsets, and it's not really "tubes".

**Verdict.** Strong alternative for the *water/bio* baseline substrate, and a useful
benchmark. Probably not the primary generator but should be offered as a mode.

### 4.5 Biologically inspired growth

- **L-systems / recursive branching**: each channel is a tree grown from its inlet
  with rules (branch angle, length ratio, radius by Murray's law `r₀³ = Σ rᵢ³`).
  Multi-channel via repulsion between trees. Produces vasculature-like, genuinely
  fractal structures — matches "fractal-structural lattice" literally.
- **Space colonisation algorithm** (Runions et al., used for tree/leaf venation):
  scatter attraction points in the volume, grow k competing trees toward them,
  each point is consumed by the nearest tree. Gives excellent coverage, natural
  branching, and straightforward per-channel volume budgets (number of attraction
  points seeded per channel). *Very* promising for interleaving.
- **Diffusion-limited aggregation / dielectric breakdown**: dendritic, too spiky,
  poor for hollow tubes.
- **Physarum / slime-mould transport networks**: agents lay down trails, network
  self-optimises for flow. Yields loops (good for recirculation). Heavier to implement.

**Trees vs paths.** Trees mean one inlet, many tips. Flushing/draining is harder
(each tip is a dead end) but biologically closer to roots. Could cap tips with
drain pores, or connect tips pairwise into a return manifold.

**Verdict.** Space colonisation is the standout: it directly answers "k channels
interleaved through a volume with controllable share". Needs a post-pass for
clearance (Murray-law radii near junctions can collide) and printability.

### 4.6 Partition-first (Voronoi / foam / k-means)

**Concept.** First partition the volume into k interpenetrating regions (e.g.
scatter seed points labelled by channel, compute 3D Voronoi; or use a blue-noise
point set and assign labels with a spatial pattern). Then fill each region with a
tube via any single-channel method (Hilbert inside each cell, or a path through
cell centroids). Clearance across region boundaries is guaranteed by construction if
tubes stay ≥ `c_min/2` inside their cells.

**Verdict.** Good decomposition strategy — makes multi-channel a solved sub-problem.
Weakness: region boundaries are visible as gaps; tubes must be routed between
disconnected cells of the same channel.

### 4.7 Optimisation-based

Pose it as an objective: maximise interleaving entropy + coverage − clearance
violations − curvature − overhang penalty − |volume − target|, and optimise over
control points (simulated annealing, CMA-ES, gradient descent on a smooth SDF
formulation). Or full **topology optimisation** with multi-physics (flow + diffusion).

**Verdict.** Research-grade; overkill now. But defining the **objective/validator
explicitly is valuable regardless** — it is our scoring function for all other methods.

### 4.8 Hybrid / staged approaches (probably the answer)

1. **Coarse allocation** — decide *where* each channel lives (bias fields, Voronoi
   labels, or sublattice parity).
2. **Grid routing** — Hilbert or maze growth on a grid whose pitch guarantees
   clearance. Produces a clean, valid graph.
3. **Organic relaxation** — jitter nodes with noise, smooth with splines, run a few
   iterations of repulsion to restore clearance. Produces the noodle look.
4. **Repair** — reconnect fragments, add drain pores at local minima, fix overhangs
   by tilting segments toward vertical, add a frame where tubes are unsupported.

This keeps guarantees where they matter (topology, clearance) and buys aesthetics /
biology where it's cheap (geometry).

---

## 5. Comparison matrix

| Method              | Multi-channel | Clearance | Volume ctrl | Interleave | Organic look | Print | Effort |
|---------------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 4.1 Hilbert/sublattice | ★★★ | ★★★ (proof) | ★★ | ★★★ | ★ | ★★ | low |
| 4.2 k-colour maze   | ★★★ | ★★★ (grid) | ★★★ | ★★★ | ★★ | ★★ | low–med |
| 4.3 Noodle/agents   | ★★ | ★★ (checked) | ★★ | ★★ | ★★★ | ★ | med |
| 4.4 TPMS            | ★ (k≤2 easy) | ★★★ | ★ | ★★★ | ★★ | ★★★ | low |
| 4.5 Space colonisation | ★★★ | ★★ | ★★★ | ★★★ | ★★★ | ★★ | med |
| 4.6 Partition-first | ★★★ | ★★★ | ★★ | ★★ | ★★ | ★★ | med |
| 4.7 Optimisation    | ★★★ | ★★★ | ★★★ | ★★★ | ★★ | ★★★ | high |
| 4.8 Hybrid          | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ | ★★ | med |

---

## 6. Shared machinery (needed regardless of routing method)

### 6.1 Data model
```
  Spec {
    seed, cartridge: { shape: box|cylinder|custom, dims, manifoldFaces[] },
    grid: { pitch, resolution } | null,
    clearanceMin, printer: { nozzle, minWall, maxOverhangDeg, process: FDM|SLA|SLS },
    channels: [{ id, name, colour, diameter, wall, section, poreSize, poreDensity,
                 volumeFraction, tortuosity, biasField, inlet, outlet, deadEndOk }]
  }
  Routing { channels: [{ id, centreline: Vec3[] | Graph, radiusProfile }] }
  Report  { clearanceOK, minClearance, overhangViolations[], drainMinima[],
            volumes{}, lengths{}, deltaP{}, rootAccessibleFraction }
```

### 6.2 Validator (the scoring function)
- **Clearance**: segment–segment distance over all pairs via spatial hash / BVH;
  report min and violations.
- **Curvature**: discrete turning angle vs bend-radius limit.
- **Overhang**: segment angle vs vertical; flag > `maxOverhangDeg`.
- **Drainability**: find local z-minima of each lumen relative to outlet; flag.
- **Volume / length / ΔP** per channel (Hagen–Poiseuille with slurry viscosity).
- **Root access**: voxelise void space, erode by `c_min/2`, flood-fill from top face,
  report unreachable fraction.
- **Watertightness / manifoldness** of final mesh.

### 6.3 Solidification (centreline → solid)
Two candidate approaches:
- **Sweep meshing**: generate a frame (RMF / parallel transport) along the spline,
  extrude the cross-section polygon, cap ends, then boolean-union with pores and
  frame. Fast; booleans are fragile (use manifold-3d / OpenCascade / CGAL).
- **Implicit (SDF) + marching cubes / dual contouring**: define
  `f(x) = min over tubes of |dist(x, centreline) − r_outer|`, subtract inner tube,
  subtract pore spheres/cylinders, union frame. Robust, resolution-limited, large
  meshes; pores and porosity noise fall out for free (`f += noise`). **Preferred**
  for prototyping; sweep for final high-fidelity export if needed.

### 6.4 Porosity
Three interchangeable modes: (a) **explicit pores** (SDF subtraction, ≥ 0.5 mm),
(b) **slotted / mesh wall** (patterned wall, print-friendly), (c) **material
porosity** (no geometry; annotate for post-processing). Pore placement: Poisson-disk
sampling on the tube surface with per-channel density; skip pores near junctions and
the manifold.

### 6.5 Manifold & frame
- Manifold plate on one face with labelled ports (embossed channel letter), barb or
  push-fit geometry, per-channel spacing ≥ tubing OD.
- Optional structural frame (outer shell with large windows, or vertical posts) to
  which tubes attach via thin bridges at a few points — the only allowed "contact",
  so tubes are supported in print and in use.
- Optional flat transparent inspection face.

### 6.6 UI / viewer
- three.js scene, one material per channel (colour-coded), toggle channels, x-ray
  mode, clipping plane slider, click a tube → show its report row.
- Live regenerate on parameter change (debounced; preview at low grid resolution).
- Show validator overlays: clearance violations red, overhangs orange, drain minima
  blue, root-unreachable voxels as fog.
- Export panel: STL (binary), 3MF (colour + per-channel objects), glTF, JSON spec.

### 6.7 STL export
- Binary STL, mm units, Z-up, one solid (or one file per channel + frame for
  multi-material printing).
- Pre-flight: manifold check, minimum feature size check, bounding box vs bed.
- Consider **3MF** as the primary print format (supports colour/material per object,
  metadata with channel names); STL as the lowest-common-denominator fallback.

---

## 7. Recommended path

1. **Week 1 — skeleton**: spec JSON, centreline data model, SDF solidifier +
   marching cubes, three.js viewer, STL export. Use a trivial generator (k parallel
   helices) to prove the pipeline end to end.
2. **Week 2 — Hilbert sublattice generator (4.1)** + validator. First real prints.
3. **Week 3 — k-colour maze growth (4.2)** with volume budgets and bias fields.
   Compare with Hilbert using the validator.
4. **Week 4 — relaxation/smoothing stage (4.8 step 3)** + drain/overhang repair.
5. **Later** — space colonisation (4.5), TPMS mode (4.4), hydraulic ΔP model, 3MF.

Rationale: the pipeline and validator are needed by every approach, Hilbert gives a
guaranteed-correct result with almost no code, and maze growth is the smallest step
that unlocks volume control and spatial bias. The organic look is layered on last,
where it can't break correctness.

---

## 8. Open questions

- Paths vs trees per channel? (Flushability vs biological realism.)
- Should void (root) space be explicitly designed — e.g. reserve a dedicated
  "root highway" network — or purely emergent?
- What's the realistic minimum pore size for our printer/material? Determines
  whether porosity is geometry or post-process.
- FDM vs SLA vs SLS: SLA/SLS remove the overhang constraint entirely but change
  material/biocompatibility. Decide before tuning overhang repair.
- Cartridge modularity: stackable slabs (each a 2.5D layer — Eller's algorithm fits)
  vs monolithic block?
- How much irregularity is *actually* wanted? Hypothesis testing (Objective A in
  `idea.md`) may prefer regular, comparable geometry across cartridges; ecological
  realism prefers messy. Make it a slider.
- Do we want channels to *approach* each other deliberately (e.g. N and P tubes
  running side-by-side at exactly `c_min`) to create sharp gradient interfaces?

---

## 9. Glossary

- **Channel** — a nutrient stream; one or more tubes with a shared inlet.
- **Centreline** — polyline/spline the tube is swept along.
- **Clearance** — minimum outer-surface-to-outer-surface distance between tubes.
- **Pitch** — grid cell size in grid-based routers; `pitch ≥ Ø_max + c_min`.
- **Manifold face** — cartridge face where all inlets/outlets emerge.
- **Lumen** — the interior of a tube.
- **TPMS** — triply periodic minimal surface (gyroid, etc.).
- **SDF** — signed distance field; implicit representation used for solidification.