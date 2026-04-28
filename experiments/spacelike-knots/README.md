# Knot Topology Lab — Distance Matrix Analysis

An interactive 3D knot theory visualization tool that uses TensorFlow.js for physics-based optimization and distance
matrix analysis. Explore classical knot types through the lens of Euclidean and Minkowski spacetime metrics.

---

## Features

### Knot Types

- **Random Spline** — Catmull-Rom spline through randomly placed control points
- **Trefoil (3₁)** — Parametric trefoil knot
- **Figure-Eight (4₁)** — Parametric figure-eight knot
- **Cinquefoil (5₁)** — Parametric cinquefoil knot
- **Unknot** — Simple circle for baseline comparison

### Distance Metrics

- **Euclidean (L2)** — Standard 3D distance matrix
- **Minkowski (Z=Time)** — Spacetime metric with Z as the time axis
- **Minkowski (X=Time)** — Spacetime metric with X as the time axis
- **Minkowski (Y=Time)** — Spacetime metric with Y as the time axis

In Minkowski mode, the distance matrix is color-coded by causal structure:

- 🔴 **Red** — Timelike future separation
- 🔵 **Blue** — Timelike past separation
- 🟢 **Green** — Spacelike separation
- ⚪ **White** — Lightlike (null) separation

### Physics Optimization

Points are optimized using two competing forces:

```
L = L_edge + L_repel

L_edge  = k · Σ (|pᵢ - pᵢ₊₁| - d₀)²
L_repel = r · Σᵢ≠ⱼ±₁  1 / (|pᵢ - pⱼ|² + ε)
```

- **Edge constraint** — Keeps adjacent points at a target spacing
- **Repulsion** — Prevents non-adjacent strand crossings from collapsing

### Optimizers

- **Adam** — Adaptive moment estimation (default)
- **QQN** — Quasi-Quasi-Newton method
- **L-BFGS** — Limited-memory BFGS

### Metric Optimization (Minkowski mode)

Automatically rotates the knot in 3D to extremize its causal structure:

- **Max Timelike** — Rotate to maximize timelike point-pair separations
- **Max Spacelike** — Rotate to maximize spacelike point-pair separations
- **Max Lightlike** — Rotate to maximize null/lightlike separations
- **Align Time Axis** — Snap the camera view to look along the chosen time axis

---

## Controls

| Control          | Description                                                       |
|------------------|-------------------------------------------------------------------|
| **Start / Stop** | Toggle continuous optimization                                    |
| **Step**         | Run a single optimization step                                    |
| **Reset**        | Reinitialize the knot                                             |
| **Redistribute** | Randomly resample points along the current curve                  |
| **Copy / Paste** | Export/import knot point data as JSON                             |
| **Orbit Knot**   | Mouse drag rotates the knot geometry itself (not just the camera) |
| **Export STL**   | Download a tube mesh of the current knot for 3D printing          |
| **Mouse drag**   | Rotate camera view                                                |
| **Scroll wheel** | Zoom                                                              |

---

## Parameters

| Parameter                | Description                                               |
|--------------------------|-----------------------------------------------------------|
| **Points (N)**           | Number of points sampled along the knot curve             |
| **Control Points**       | Number of Catmull-Rom control points (random spline only) |
| **Target Edge Length**   | Rest length for the edge spring constraint                |
| **Edge Stiffness**       | Spring constant for edge length enforcement               |
| **Repulsion Strength**   | Magnitude of non-adjacent point repulsion                 |
| **Repulsion Cutoff**     | Distance beyond which repulsion is suppressed             |
| **Learning Rate**        | Optimizer step size                                       |
| **Time/Space Ratio (c)** | Speed-of-light parameter for Minkowski metric             |

---

## Distance Matrix

The right panel shows the **N×N pairwise distance matrix** D[i,j] = ‖pᵢ − pⱼ‖.

- The diagonal is always zero (self-distance)
- The matrix is symmetric
- Banding patterns near the diagonal reflect local strand geometry
- Off-diagonal structure encodes global knot topology
- Hover over any cell to highlight the corresponding point pair in the 3D view

---

## Tech Stack

- **TensorFlow.js 4.15** — GPU-accelerated tensor math and automatic differentiation
- **Canvas 2D API** — 3D projection and matrix rendering
- **Vanilla JS (ES Modules)** — No build step required
- **Google Fonts** — JetBrains Mono, Inter

---

## File Structure

```
spacelike-knots/
├── index.html              # Main application
└── js/
    ├── optimizer-adam.js   # Adam optimizer wrapper
    ├── optimizer-qqn.js    # QQN optimizer
    └── optimizer-lbfgs.js  # L-BFGS optimizer
```

---

## Running Locally

No build step required. Serve the directory with any static file server:

```bash
npx serve spacelike-knots
# or
python -m http.server 8080
```

Then open `http://localhost:8080` in a browser.