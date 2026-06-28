# No-Three-in-Line Lab

An interactive, browser-based solver for the classic **no-three-in-line
problem** using a continuous **potential-well relaxation** driven by
gradient descent in [TensorFlow.js](https://www.tensorflow.org/js).

> Place as many points as possible on an n×n grid so that **no three are
> collinear**.

## Quick Start

Open `index.html` in a modern browser (no build step required — TensorFlow.js
is loaded from a CDN). Then:

1. Press **▶ Play** to start the optimization.
2. Adjust sliders live to reshape the energy landscape.
3. Watch the **best valid** metric for the largest collinearity-free
   configuration found so far.

## The Idea in One Paragraph

Instead of searching the discrete lattice combinatorially, points are allowed
to move freely in ℝ². Every tracked line ℓ is given a soft population

```
p(ℓ) = Σᵢ exp(-dᵢ² / 2σ²)
```

where `dᵢ` is the signed distance from point _i_ to the line. A
population-fitness response `f(p) = (p − 2)²` makes the force change sign at
`p = 2`:

| population | behavior   |
| ---------- | ---------- |
| `p < 2`    | attractive |
| `p = 2`    | neutral    |
| `p > 2`    | repulsive  |

so lines naturally settle at exactly two points each — the configuration that
achieves the conjectured 2n density. A grid-snapping potential pulls points
toward integer coordinates and a box penalty keeps them inside `[0, n−1]²`.

For the full mathematical background, motivation, and experimental questions,
see [`idea.md`](./idea.md).

## Energy Function

```
E = λ_line · Σ_lines (p − 2)²                      # collinearity / population
  + λ_grid · Σ_points [1 − cos(2πx)] + [1 − cos(2πy)]   # lattice snapping
  + λ_box  · Σ_points boundary(x, y)               # keep inside the grid
```

## Files

| File                     | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `index.html`             | UI, canvas rendering, controls, and animation loop.  |
| `js/no-three-in-line.js` | The solver: line set, energy, optimizer, validation. |
| `idea.md`                | Detailed write-up of the problem and the method.     |

## Controls

| Control                    | Effect                                                    |
| -------------------------- | --------------------------------------------------------- |
| **Grid size n**            | Side length of the lattice (triggers restart).            |
| **Points to place**        | Number of points _k_ to optimize (triggers restart).      |
| **Optimizer**              | Adam or SGD + Momentum.                                   |
| **Learning rate**          | Optimizer step size.                                      |
| **σ (well width)**         | How close a point must be to "count" on a line.           |
| **λ grid (snap)**          | Strength of integer-lattice snapping.                     |
| **λ line (collinear)**     | Strength of the population term.                          |
| **Entropic noise**         | Gaussian noise injected each step to escape local minima. |
| **Auto-anneal σ & λ grid** | Decay σ toward 0.12 and grow λ grid ~3× over 600 steps.   |

## Visualization Legend

Tracked lines are colored by their soft population:

- 🔵 **blue** — under-populated, attractive well (`p < 2`)
- 🟢 **green** — neutral, satisfied (`p ≈ 2`)
- 🔴 **red** — over-populated, repulsive well (`p > 2`)

White dots are the continuous point positions; line opacity grows with the
distance of `p` from 2.

## How It Works (Solver Internals)

1. **Initialization** — _k_ points are seeded at random positions in
   `[0, n−1]²` as a trainable `tf.variable`.
2. **Line set** — rows, columns, ±1 diagonals, plus a **dynamic** set of lines
   through every pair of currently-active points (capturing the rational slopes
   that matter right now). Rebuilt every `lineRebuildEvery` (25) steps.
3. **Step** — `optimizer.minimize` flows points downhill on the energy `E`;
   optional entropic noise is added afterward.
4. **Annealing** — σ shrinks and λ grid grows over ~600 steps to sharpen wells
   and crystallize points onto the lattice.
5. **Validation** — points are rounded, de-duplicated, and **every triple** is
   checked for exact integer collinearity (cross product `== 0`). The number of
   points in a triple-free configuration is reported as **valid points**.

## Metrics

| Metric                     | Meaning                              |
| -------------------------- | ------------------------------------ |
| **step**                   | Optimization steps taken.            |
| **energy**                 | Current total energy `E`.            |
| **tracked lines**          | Size of the current line set.        |
| **violating lines**        | Lines with soft population `> 2.5`.  |
| **valid points (rounded)** | Non-collinear points after rounding. |
| **best valid**             | Largest valid count seen this run.   |

## Tips

- Start with a **wide σ** to explore, then enable **auto-anneal** to crystallize.
- For larger `n`, give the optimizer more time — the dynamic line set grows
  quadratically with _k_.
- A small amount of **entropic noise** can help escape shallow local minima
  near the 2n frontier.
- Run multiple **Restart**s; the landscape is non-convex, so the best
  configuration varies between random seeds.

## License

Part of the experiments collection. See the repository root for license details.
