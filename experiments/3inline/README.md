# No-Three-in-Line Lab

An interactive, browser-based solver for the classic **no-three-in-line
problem** using **continuous relaxation** driven by gradient descent in
[TensorFlow.js](https://www.tensorflow.org/js). Works in both **2D** (n×n
grid) and **3D** (n×n×n cubic lattice).

> Place as many points as possible on a lattice so that **no three are
> collinear**.

## Quick Start

Open `index.html` in a modern browser (no build step required — TensorFlow.js
is loaded from a CDN). Then:

1. Press **▶ Play** to start the optimization.
2. Adjust sliders live to reshape the energy landscape.
3. **Drag points** directly on the canvas to nudge them (auto-pauses).
4. Watch the **best valid** metric for the largest collinearity-free
   configuration found so far.

Toggle **3D mode** to switch to a cubic lattice. In 3D, drag to **orbit** the
camera and scroll to **zoom**.

## The Idea in One Paragraph

Instead of searching the discrete lattice combinatorially, points move freely
in continuous space. Collinearity is penalized directly through an
**angle-based fitness**: for every triplet of points forming a triangle, each
interior angle θ contributes a penalty that **diverges as θ → 0 or θ → π**
(i.e. as the triplet becomes collinear). Using the triangle identity

```
sin(angle at A) = 2·area / (|AB|·|AC|)
```

the solver computes each angle's sine from edge lengths and triangle area
(the cross-product magnitude), then runs it through a chosen fitness function.
A grid-snapping potential pulls points toward integer coordinates, an optional
repulsion term keeps points from overlapping, and auto-rescaling keeps the
configuration spread across the whole lattice. The same math works in 3D,
where the cross product becomes a vector and area is its norm.

## Energy Function

```
E = λ_line  · Σ_triplets Σ_angles  g(sin θ)        # collinearity (angle fitness)
+ λ_grid  · Σ_points  Σ_axes [1 − cos(2π·xₐ)]    # lattice snapping
+ λ_repel · Σ_pairs   max(0, r − d) / (d² + ε)   # point spacing / anti-overlap
```

where `g` is the selected **angle fitness** and `d` is the Euclidean distance
between a pair of points.

### Angle Fitness Functions

All variants share the limit `g → ∞` as `sin θ → 0` (collinear), but differ in
shape near it. `sharp` scales steepness; `eps` softens `sin θ` at exact
collinearity.

| Option    | Form                     | Character                   |
| --------- | ------------------------ | --------------------------- |
| `invsin`  | `1/sin θ`                | classic, mild tail          |
| `invsin2` | `1/sin² θ`               | sharper, area-like          |
| `logsin`  | `−log(sin θ)`            | gentle, log divergence      |
| `cotsq`   | `cot² θ = 1/sin² − 1`    | cotangent-squared           |
| `exp`     | `exp(sharp·(1/sin − 1))` | very steep barrier          |
| `cossq`   | `cos² θ = 1 − sin² θ`    | bounded, peaks at collinear |
| `cos2x`   | `cos 2θ = 1 − 2sin² θ`   | bounded, peaks at collinear |

## Files

| File                     | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `index.html`             | UI, 2D/3D canvas rendering, controls, animation loop. |
| `js/no-three-in-line.js` | The solver: energy, optimizers, validation.           |
| `js/optimizer-lbfgs.js`  | Custom L-BFGS optimizer.                              |
| `js/optimizer-qqn.js`    | Custom QQN (quasi-Newton + quadratic) optimizer.      |
| `idea.md`                | Detailed write-up of the problem and the method.      |

## Controls

| Control                     | Effect                                                       |
| --------------------------- | ------------------------------------------------------------ |
| **3D mode (cubic lattice)** | Switch between planar n² and cubic n³ search (restart).      |
| **Grid size n**             | Side length of the lattice (restart).                        |
| **Points to place**         | Number of points _k_ to optimize (restart).                  |
| **Optimizer**               | Adam, SGD + Momentum, L-BFGS, or QQN.                        |
| **Learning rate**           | Optimizer step size.                                         |
| **Angle fitness**           | Functional form of the collinearity penalty (see table).     |
| **Angle sharpness**         | How aggressively the penalty climbs near collinearity.       |
| **Angle ε (softening)**     | Softens `sin θ` to avoid infinite gradients at collinearity. |
| **λ grid (snap)**           | Strength of integer-lattice snapping.                        |
| **λ line (collinear)**      | Weight on the angle-fitness collinearity term.               |
| **λ repel (point spacing)** | Weight on the pairwise anti-overlap force.                   |
| **repel radius r**          | Distance below which repulsion phases in.                    |
| **Entropic noise**          | Gaussian noise injected each step to escape local minima.    |
| **Auto-anneal σ & λ grid**  | Grow sharpness and λ grid ~3× over ~600 steps.               |

Buttons: **▶ Play / ⏸ Pause**, **Step** (single iteration), **Restart**.

## Interaction

- **2D** — hover a point to get a grab cursor, then drag to reposition it.
  Optimization auto-pauses during a drag and resumes afterward.
- **3D** — drag anywhere to **orbit** the camera; scroll to **zoom**. The
  bounding cube and a sparse floor grid provide spatial reference; points are
  drawn back-to-front with depth-scaled radii.

## Visualization Legend (2D)

Tracked lines (rows, columns, ±1 diagonals, and lines through every active
pair) are colored by a **soft population** `p(ℓ) = Σ exp(−d²/2σ²)`, used purely
for display — the optimizer itself is driven by the angle fitness above:

- 🔵 **blue** — under-populated (`p < 2`)
- 🟢 **green** — neutral (`p ≈ 2`)
- 🔴 **red** — over-populated (`p > 2`)

White dots are the continuous point positions; line opacity grows with the
distance of `p` from 2.

## How It Works (Solver Internals)

1. **Initialization** — _k_ points are seeded at random positions in
   `[0, n−1]^dim` as a trainable `tf.variable` (dim = 2 or 3).
2. **Collinearity energy** — every distinct triplet `(i<j<l)` is enumerated;
   edge lengths and twice the triangle area (cross-product magnitude) give the
   sine of each interior angle, which is fed through the chosen angle fitness.
3. **Grid snap & repulsion** — a `1 − cos(2π·x)` term per axis pulls points
   onto integers, and an optional hinged `1/d²` term pushes overlapping points
   apart.
4. **Step** — Adam, SGD+momentum, L-BFGS, or QQN flows points downhill on `E`.
   Gradients are **clipped by global norm** for the custom optimizers, since
   `1/sin θ` can spike near collinearity. Optional entropic noise is added.
5. **Auto-rescale** — every ~25 steps the bounding box is linearly remapped to
   fill `[0, n−1]^dim`; teleporting points resets stateful optimizer history to
   keep search directions sane.
6. **Annealing** — sharpness and λ grid grow over ~600 steps to crystallize
   points onto the lattice.
7. **Validation** — points are rounded, de-duplicated, and **every triple** is
   checked for exact integer collinearity (2D: scalar cross product `== 0`;
   3D: cross-product vector is zero). The largest triple-free subset is
   reported as **valid points**.

## Metrics

| Metric                     | Meaning                                             |
| -------------------------- | --------------------------------------------------- |
| **step**                   | Optimization steps taken.                           |
| **energy**                 | Current total energy `E`.                           |
| **tracked lines**          | Size of the current 2D line set (0 in 3D).          |
| **violating lines**        | Lines with soft population `> 2.5` (2D); in 3D this |
|                            | reports violating triplets directly.                |
| **valid points (rounded)** | Non-collinear points after rounding/dedup.          |
| **best valid**             | Largest valid count seen this run.                  |

## Tips

- Start with **lower sharpness** to explore, then enable **auto-anneal** to
  crystallize onto the lattice.
- If points pile up, raise **λ repel** and the **repel radius** to spread them.
- Try the steeper fitness functions (`invsin2`, `exp`) once points are roughly
  placed — they punish near-collinearity hard but can be numerically stiff, so
  keep **angle ε** non-trivial and rely on gradient clipping.
- **L-BFGS / QQN** converge fast on smooth regions but are sensitive to the
  teleports from rescale/drag; the solver resets their state automatically.
- A small amount of **entropic noise** can help escape shallow local minima
  near the frontier.
- Run multiple **Restart**s; the landscape is non-convex, so the best
  configuration varies between random seeds.

## License

Part of the experiments collection. See the repository root for license details.
