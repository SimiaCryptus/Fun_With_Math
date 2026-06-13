# Geometric Entropy Lab

> **A continuous analogue of the Erdős distinct-distance problem.**
> Points on a manifold are arranged to extremize the Shannon entropy of their
> pairwise-distance distribution, producing highly symmetric, extremal
> configurations on spheres, tori, cubes, and arbitrary STL meshes.

An interactive browser-based demo for optimizing point distributions on various 3D geometries using **Spherical Gram
Matrix Entropy** and **TensorFlow.js**.

## Live Demo

Open `index.html` in a modern browser — no build step required.

## What It Does

Points are placed on a chosen geometry (sphere, torus, cube, etc.) and optimized by maximizing or minimizing a Shannon
entropy derived from a Gaussian kernel density estimate over pairwise distances.

### The Erdős Connection

The classical Erdős distinct-distance problem asks: how many *distinct* pairwise
distances must $n$ points in the plane determine? It's a combinatorial counting
problem with a discrete answer.

This lab plays the *continuous* version of the same game. Instead of counting
distinct distances, we treat the multiset of pairwise distances as a probability
distribution (via a Gaussian kernel) and maximize its Shannon entropy. The
result is the most "distance-diverse" configuration the manifold admits — a
continuous extremizer in place of a discrete counting bound.

Maximizing entropy spreads points apart; minimizing concentrates them; matching
a target value lets you dial in a specific level of distance diversity.

### Core Math

```
G  = X · Xᵀ          (Gram / dot-product matrix)
ρᵢ = Σⱼ exp(−‖xᵢ−xⱼ‖² / τ)   (kernel density per point)
p  = ρ / Σρ           (probability distribution)
H  = −Σ p · log(p)   (Shannon entropy)
```

The optimizer minimizes a loss that is one of:

| Mode             | Loss                           |
|------------------|--------------------------------|
| Maximize Entropy | `−H`                           |
| Minimize Entropy | `H`                            |
| Match Target     | `(H − H*)²`                    |
| Neutral          | `0` (geometry constraint only) |

An optional pairwise **interaction force** (repulsion `1/r²` or attraction `r²`) and a fully **custom JS/TensorFlow.js
potential** can be added on top.

---

## Geometries

| Value         | Description                         |
|---------------|-------------------------------------|
| `sphere`      | Unit sphere surface                 |
| `shell`       | Spherical shell (inner–outer radii) |
| `cube`        | Cube surface                        |
| `cube-shell`  | Cube shell                          |
| `plane`       | Flat square (z = 0)                 |
| `cylinder`    | Cylinder along Y axis               |
| `torus`       | Torus surface (configurable R, r)   |
| `torus-shell` | Torus shell                         |
| `cone`        | Cone surface                        |
| `cone-shell`  | Cone shell                          |
| `saddle`      | Hyperbolic paraboloid z = x²−y²     |
| `custom-stl`  | Upload any binary or ASCII STL file |

---

## Controls

### Configuration

| Control                 | Description                                                 |
|-------------------------|-------------------------------------------------------------|
| **Geometry**            | Select the target manifold                                  |
| **Shell Inner Radius**  | Inner boundary for shell geometries (0–0.99)                |
| **Torus R / r**         | Major and minor radii for torus geometries                  |
| **Optimization Target** | Maximize / Minimize / Match / Neutral                       |
| **Target Entropy**      | Desired entropy value when using *Match* mode               |
| **Point Count (N)**     | Number of points (2–5000)                                   |
| **Calc Neighbors (k)**  | Restrict entropy kernel to k nearest neighbours; 0 = global |

### Custom Potential

Write any JavaScript expression returning a `tf.Tensor` or scalar.  
Available variables: `rho` (Nx1), `p` (Nx1x3), `q` (1xNx3), `D` (NxN dist²), `tf`.

### Hyperparameters

| Control                | Description                                      |
|------------------------|--------------------------------------------------|
| **Optimizer**          | Adam · QQN · L-BFGS                              |
| **Temperature (τ)**    | Kernel bandwidth — higher = smoother density     |
| **Learning Rate**      | Gradient step size                               |
| **Show Neighbors (k)** | Draw k nearest-neighbour edges in the viewport   |
| **Neighbor Radius**    | Draw edges within a Euclidean radius             |
| **Auto-Rotate View**   | Continuously spin the camera                     |
| **Show Triangulation** | Overlay Delaunay triangulation edges             |
| **Solid Fill**         | Fill triangulation faces with density colour     |
| **Interaction Force**  | Negative = repel (1/r²), Positive = attract (r²) |

### Actions

| Button                    | Action                                                |
|---------------------------|-------------------------------------------------------|
| **Start / Stop Training** | Toggle the optimisation loop                          |
| **Reset**                 | Re-initialise random points and clear history         |
| **Copy Coordinates**      | Copy current point array as JSON to clipboard         |
| **Export STL**            | Download the current triangulated mesh as an STL file |

---

## Metrics

| Metric                | Description                                         |
|-----------------------|-----------------------------------------------------|
| **Spherical Entropy** | Current Shannon entropy H of the point distribution |
| **Interaction**       | Weighted interaction potential value                |
| **Total Fitness**     | Raw loss value being minimised                      |
| **Step**              | Number of optimisation steps taken                  |

---

## Optimizers

| Name       | Notes                                                    |
|------------|----------------------------------------------------------|
| **Adam**   | Adaptive moment estimation — robust default              |
| **QQN**    | Quasi-Quasi-Newton — faster convergence on smooth losses |
| **L-BFGS** | Limited-memory BFGS — best for small N, high precision   |

### The ln(N) Bound and Optimizer Fingerprinting
For a kernel-density entropy of the form $H = -\sum p_i \log p_i$ over $N$
points, the maximum possible value is $\log N$, attained when the induced
distribution $p$ is uniform ($p_i = 1/N$ for all $i$). Equivalently, when every
point has identical local kernel density $\rho_i$, the entropy saturates its
information-theoretic ceiling:

```
H_max = ln(N)
```

This is just the standard Shannon bound applied to the per-point density
distribution, and it grows **proportionally to $\ln N$** as the point count
increases. Empirically, runs of the maximizer asymptote at this value for every
geometry we have tried — sphere, torus, cube, saddle, or arbitrary STL.

#### A Sparse Fitness Landscape

What makes this problem interesting (and a little strange) is that the
condition for achieving $H = \ln N$ is **highly underdetermined**. The
objective only requires that all $\rho_i$ be equal; it says nothing about
*where* the points sit, only that each one must see the same total kernel mass
from its neighbours. On a curved or non-trivial manifold there are typically a
continuous family — sometimes a high-dimensional manifold — of configurations
satisfying this constraint.

In optimization terms, the fitness function is **sparse**: a vast set of
distinct geometric arrangements all sit at the same global optimum. The loss
surface has a large, flat, connected (or near-connected) optimal set rather
than a single isolated minimum.

#### Optimizer Fingerprinting

Because the optimum is degenerate, the *path* an optimizer takes through
configuration space determines *which* extremal configuration it lands on.
Running the same problem with **Adam**, **QQN**, and **L-BFGS** — or even the
same optimizer at different learning rates or temperatures $\tau$ — reliably
produces visibly different point arrangements, each of which achieves the same
$H \approx \ln N$ value.

- **Adam** tends to produce slightly noisy, isotropic, lattice-like packings.
- **QQN** carves out smoother, more symmetric arrangements with visible
   curvature-aligned structure.
- **L-BFGS** snaps quickly into crystalline, near-perfectly-regular
   configurations, often with sharp symmetry groups.

The resulting geometry is, in effect, a **fingerprint** of the optimizer's
internal dynamics — its preconditioner, momentum, and step-selection rules
projected onto the manifold of entropy-maximal configurations. This is a
previously unremarked-upon (and admittedly **useless**) property: the entropy
value tells you nothing about which optimizer produced it, but the *shape* of
the resulting point cloud does. You can identify the optimizer by looking at
the picture.

This is a small, charming consequence of optimizing a sparse objective on a
continuous manifold, and the lab is a convenient place to play with it.

---

## Visualisation

- **3D viewport** — orthographic projection with mouse drag to rotate and scroll to zoom.  
  Points are coloured **cyan → magenta** by local density (cyan = isolated, magenta = clustered).
- **Density histogram** — real-time distribution of per-point kernel densities.
- **STL wireframe** — when a custom STL is loaded its mesh is drawn as a faint overlay.

---

## File Structure

```
geometric-entropy/
├── index.html            # Single-file app entry point
├── js/
│   ├── optimizer-adam.js
│   ├── optimizer-qqn.js
│   └── optimizer-lbfgs.js
└── README.md
```

---

## Dependencies (CDN)

| Library                   | Purpose                                          |
|---------------------------|--------------------------------------------------|
| `@tensorflow/tfjs` 4.15   | Automatic differentiation & GPU tensors          |
| `d3-geo-voronoi` 2        | Spherical Delaunay triangulation                 |
| `d3-delaunay` 6           | Planar Delaunay (used internally by geo-voronoi) |
| `d3-geo` 3 / `d3-array` 3 | Geographic projections & utilities               |

No npm install needed — all loaded from jsDelivr.

---

## License

MIT