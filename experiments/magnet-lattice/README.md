# Magnet Lattice Toy

Browser-based design & simulation of a 3D-printed rotating-magnet toy.
See `idea.md` for the full specification.

## Running the app

No build step. Serve the folder statically and open `index.html`:

```sh
# from the repository root
cd experiments/magnet-lattice
python3 -m http.server 8000
# then open http://localhost:8000/
```

(ES modules require a server; opening `index.html` via `file://` will not work.)

## Usage

**View controls (all modes):** right/middle-drag to pan, mouse-wheel to zoom
about the cursor, two-finger pinch on touch screens, **Reset View** button or
<kbd>0</kbd> to recentre.
**⚙ Settings** opens the configuration dialog (grid pitch, grid extent,
snap, dipole strength `m`, sub-steps per frame, id labels). The arrangement,
parameters, simulation controls and camera are persisted to `localStorage`
and restored on reload ("Forget saved state" in Settings clears them).

1. **Draw** mode — click an empty cell to add a magnet, click a magnet to
   remove it. Drag a magnet to set its angle (hold <kbd>Shift</kbd> to snap
   to 15°). Placing and dragging in one gesture orients the new magnet.
2. **Simulate** mode — Play/Step/Reset the coupled-dipole dynamics
   (<kbd>Space</kbd> toggles play). Tune coupling `k`, inertia `I`,
   damping `γ`, and timestep `h`; choose the Störmer–Verlet or variational
   (Newton) integrator. Drag a magnet to grab it and re-orient it while the
   rest of the system keeps evolving; the energy-drift readout re-bases when
   you let go. Left-drag on empty space pans.
3. **Analyze** mode — relax to equilibrium, compute the coupling-matrix
    heatmap and normal-mode spectrum, and animate a selected mode. Click a
    bar in the spectrum to select that mode; hover a cell of the coupling
    matrix to highlight the two coupled magnets on the scene and read
    `C_ij` / `H_ij`. Unstable modes (negative Hessian eigenvalue) are flagged.
    **Sweep** relaxes from structured seeds plus many random initial
    conditions, keeps only Hessian-positive minima, merges states related by
    the lattice's rotation/reflection symmetries or a global dipole flip, and
    auto-tags each (ferromagnetic, checkerboard antiferromagnetic, vortex,
    zero net moment, soft). Click a catalog entry to load it.

Use **Export**/**Import** to copy/paste arrangements as JSON.

## Physics

Each magnet is a fixed-position disk with one rotational DOF `θ`.
Pairwise dipole energy:

```
U_ij = (k / r³) [ μ_i·μ_j − 3 (μ_i·n)(μ_j·n) ]
```

folded into the compact trig form (see `src/model/physics.js`):

```
U_ij = (k m² / r³) [ cos(θ_i − θ_j) − 3 cos(θ_i − φ) cos(θ_j − φ) ]
```

with `φ` the angle of the separation vector. **Distances are measured in
grid-cell units**, so nearest neighbours couple with strength exactly `k·m²`
and the pixel pitch only affects drawing. Analytic gradient and Hessian are
provided and validated against finite differences.

The variational integrator is the implicit-midpoint discrete Lagrangian
solved with Newton on the analytic Hessian. Viscous damping enters through
discrete Lagrange–d'Alembert forces, so `γ > 0` works with both integrators.

## Tests

```sh
node test/run.js
```

Covers:

- pair coefficients, analytic gradient / Hessian vs finite differences,
- bounded & non-secular energy drift for both integrators, O(h²) scaling,
- damping dissipation (both integrators) settling into the known minimum,
- LU solve & Jacobi eigen-solver on known matrices,
- 2-magnet equilibrium (to ~1e-15) and closed-form normal modes ω = 1, √3,
- lattice placement/hit-testing rules and JSON round-trip + validation.

## Module map

| Module                | Responsibility                                            |
| --------------------- | --------------------------------------------------------- |
| `model/lattice.js`    | magnet set, grid ↔ world mapping, bounds & hit-testing    |
| `model/physics.js`    | energy, gradient/torque, Hessian (analytic + FD)          |
| `model/integrator.js` | Verlet + variational (Newton, with damping) steppers      |
| `model/analysis.js`   | relaxation, eigenproblem, coupling, symmetries, minima sweep |
| `io/serialize.js`     | versioned JSON import/export + validation                 |
| `ui/canvas.js`        | grid / dipole rendering, pan-zoom camera                  |
| `ui/heatmap.js`       | coupling matrix + spectrum rendering and hit-testing      |
| `math/linalg.js`      | LU solve, symmetric Jacobi eigen                          |