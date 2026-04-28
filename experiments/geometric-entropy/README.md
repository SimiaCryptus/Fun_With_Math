# Geometric Entropy Lab

An interactive browser-based demo for optimizing point distributions on various 3D geometries using **Spherical Gram
Matrix Entropy** and **TensorFlow.js**.

## Live Demo

Open `index.html` in a modern browser — no build step required.

## What It Does

Points are placed on a chosen geometry (sphere, torus, cube, etc.) and optimized by maximizing or minimizing a Shannon
entropy derived from a Gaussian kernel density estimate over pairwise distances.

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