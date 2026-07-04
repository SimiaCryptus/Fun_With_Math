# Dihedral Attractors: Optimizing Functionals over Triangulation Dihedral Angles

## The Unified Vision

This experiment sits inside a broader research program: discovering
**geometric attractor sets** that emerge when you optimize (minimize or
maximize) some scalar _metric_ defined over a configuration of points. Across
the collection, the same recipe recurs — place points on a manifold, define a
differentiable energy, and let gradient descent (Adam / L-BFGS / QQN in
TensorFlow.js) flow the points into extremal, often highly symmetric,
configurations.

What changes from lab to lab is the **order of geometric primitive** the
metric is built on. Each rung up this ladder couples more points together and
captures richer geometric structure:

| #   | Primitive             | Metric acts on                                     | Example lab                  |
| --- | --------------------- | -------------------------------------------------- | ---------------------------- |
| 1   | **Point pairs**       | distance / repulsion / attraction forces           | interaction-force potentials |
| 2   | **Pair distribution** | Shannon entropy of the pairwise-distance set       | `geometric-entropy`          |
| 3   | **Point triplets**    | per-triangle vertex-angle functionals              | `3inline` (no-three-in-line) |
| 4   | **Dihedral angles**   | functional summed over a triangulation's dihedrals | **this lab** (new)           |

Rungs 1–3 are explored elsewhere; the **unified framing** and **rung 4** are
the new contributions here.

### The Progression

- **(1) Point-pair metrics.** The simplest coupling: every pair contributes a
  force depending only on their distance `d`. Repulsion (`1/d²`) spreads
  points; attraction (`d²`) clusters them. Purely _local, pairwise_.

- **(2) Point-pair distribution metrics.** Instead of summing per-pair forces,
  treat the _multiset_ of pairwise distances as a probability distribution and
  optimize a functional of the whole distribution — e.g. the Shannon entropy
  of a Gaussian kernel density. This is the continuous analogue of the Erdős
  distinct-distance problem: maximizing distance _diversity_ rather than any
  individual distance. The `geometric-entropy` lab lives here.

- **(3) Triplet-angle metrics.** Move from pairs to triplets. Each triplet of
  points defines a triangle; sum a functional over the three interior angles.
  The `3inline` lab uses angle fitnesses that diverge as any angle → 0 or π
  (collinearity), directly penalizing three-in-a-line arrangements. The metric
  now sees _shape_, not just _scale_.

- **(4) Dihedral-angle metrics.** The natural next rung. Build a
  **triangulation** of the point set, then define the energy as a sum of a
  functional over all **dihedral angles** — the angles _between adjacent
  faces_ (in 3D) or _between adjacent triangles across a shared edge_ (in 2D,
  the "hinge" angle). This couples points through the connectivity of the
  mesh, not just raw geometry, and reaches genuinely higher-order structure.

## What Is New Here

Rung **#4** — optimizing a functional over **dihedral angles of a
triangulation** — is the novel piece, together with the unifying ladder that
situates all four labs as instances of one idea: _extremize a metric on a
geometric primitive and watch attractor sets crystallize._

## The Method (Rung 4)

1. **Points.** Seed `k` trainable points as a `tf.variable`, either free in
   space or constrained to a manifold (sphere, torus, plane, cube, …), exactly
   as in the sibling labs.

2. **Triangulation.** Compute a triangulation of the current point set
   (Delaunay in 2D; a surface/tetrahedral triangulation in 3D). Each interior
   edge is shared by two triangles/faces and thus defines one **dihedral
   angle** φ.

3. **Dihedral angle from geometry.** For a shared edge with the two adjacent
   face normals `n₁`, `n₂`, the dihedral angle is

```
cos φ = (n₁ · n₂) / (|n₁| · |n₂|)
```

Each face normal is a cross product of two edge vectors of that face, so φ
is fully differentiable in the point coordinates. (In 2D, the "dihedral"
is the fold/hinge angle between two triangles sharing an edge, computed the
same way from the triangle plane normals lifted into 3D, or directly from
the turning angle.)

4. **Energy.** Sum a chosen functional `g(φ)` over every dihedral in the
   triangulation:

```
E_dihedral = λ_dih · Σ_edges  g(φ_edge)
```

Optional companion terms carried over from the other labs — grid snapping,
pairwise repulsion, manifold constraints, entropic noise — can be added on
top.

5. **Optimize.** Flow points downhill on `E` with Adam / SGD+momentum /
   L-BFGS / QQN. Clip gradients by global norm, since angle functionals can
   spike near degenerate (flat or folded) configurations. Because the
   triangulation depends on point positions, it is **recomputed periodically**
   as points move.

### Candidate Dihedral Functionals `g(φ)`

Different functionals target different attractors. Some natural choices:

| Functional            | Form                     | Encourages                          |
| --------------------- | ------------------------ | ----------------------------------- |
| **flatness**          | `(φ − π)²`               | flat / developable meshes           |
| **uniform-dihedral**  | `(φ − φ̄)²` summed        | equal dihedrals (regular polytopes) |
| **max-fold**          | `−cos φ`                 | crease / fold formation             |
| **smoothness (bend)** | `1 − cos φ`              | minimal bending energy              |
| **entropy**           | Shannon entropy of `{φ}` | dihedral-diverse configurations     |

The **entropy** variant closes the loop with rung #2: instead of the _distance_
distribution, we extremize the entropy of the _dihedral-angle_ distribution —
the most dihedral-diverse triangulation the manifold admits.

## Why Dihedrals?

Dihedral angles are the discrete-differential-geometry carriers of
**curvature**. The angle deficit at a vertex encodes Gaussian curvature; the
dihedral angle along an edge encodes the mesh's **mean curvature / bending**.
Optimizing functionals over dihedrals therefore reaches directly for
curvature-defined attractors:

- Minimizing bending energy (`Σ (1 − cos φ)`) tends toward **developable** or
  **minimal-surface-like** meshes.
- Equalizing dihedrals drives toward the **regular and semi-regular
  polytopes** (the Platonic/Archimedean solids are exactly the configurations
  with all dihedrals equal).
- Maximizing dihedral entropy produces maximally _irregular-yet-balanced_
  folded structures — a curvature analogue of the distinct-distance extremizer.

## Relationship to the Sibling Labs

- Shares the **solver core**: TensorFlow.js autodiff, the same optimizer
  stable (Adam, L-BFGS, QQN), gradient clipping, annealing, entropic noise,
  and auto-rescaling.
- Shares the **manifold constraints** from `geometric-entropy` (sphere, torus,
  cube, saddle, custom STL).
- Shares the **angle-functional philosophy** from `3inline`, but lifts it from
  _triangle interior angles_ (rung 3) to _dihedral angles between faces_
  (rung 4).
- Shares the **distribution-extremization** idea from `geometric-entropy`,
  reapplied to the dihedral-angle distribution.

Together the four labs form a coherent study of how the _order_ of the
geometric metric — pair, distribution, triplet, dihedral — shapes the
attractor set that gradient descent discovers.
