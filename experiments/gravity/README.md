# Relativistic 2-Body Gravity Simulator

## Overview
A 2D slice of 3D space that simulates a 2-body gravitational system with
relativistic adjustments and time-delayed (retarded) interactions. The goal is
to demonstrate phenomena like orbital precession, frame dragging analogues,
and exotic/chaotic orbits that do not appear in naive Newtonian models.

Users can manipulate the masses, initial positions/velocities, and the strength
of relativistic effects to watch the system evolve. This is intended as a
visually engaging, interactive way to explore concepts spanning classical
mechanics and general relativity.

## Core Physical Concepts

### 1. Newtonian Baseline
We start from the standard inverse-square law:

```
F = G * m1 * m2 / r^2
```

applied along the line connecting the two bodies. This gives us a known-good
reference (closed elliptical orbits) to validate against before layering on
complexity.

### 2. Time-Delayed (Retarded) Interactions
In reality, gravitational influence propagates at finite speed `c`. Body A does
not feel where body B *is*, but where body B *was* at the retarded time:

```
t_ret = t - |r_A(t) - r_B(t_ret)| / c
```

This is an implicit equation (the delay depends on the distance, which depends
on the delayed position) and must be solved iteratively per step.

**Consequence:** Forces are no longer symmetric (Newton's third law is broken
for the instantaneous pair). Momentum is carried by the field. Therefore we
**cannot** naively center the simulation on the center of mass or on a single
body. We must track full position/velocity histories for both bodies and
interpolate to evaluate forces at arbitrary past times.

### 3. Relativistic Corrections
We introduce a tunable "relativity strength" parameter `alpha` in `[0, 1]` that
blends from pure Newtonian (`alpha = 0`) to fully-corrected (`alpha = 1`).
Planned correction terms:

- **Velocity-dependent potential** (Gravitoelectromagnetic / EIH-style terms):
corrections of order `(v/c)^2` that cause perihelion precession.
- **Relativistic mass / energy** factor `gamma = 1 / sqrt(1 - v^2/c^2)`.
- **Retardation** (above) contributes its own precession and chaotic effects.

The precession of Mercury (~43 arcsec/century from GR) is the canonical target
behavior we want to reproduce qualitatively.

## Architecture

```
experiments/gravity/
README.md
index.html          # canvas + control panel mount point
src/
  main.js           # entry point, animation loop, wiring
  simulation.js     # core integrator + force model
  body.js           # Body class: state + history ring buffer
  history.js        # StateHistory: storage + interpolation
  physics.js        # force models (newtonian, retarded, relativistic)
  vector.js         # small 2D vector math helpers
  renderer.js       # canvas drawing (bodies, trails, vectors)
  controls.js       # UI sliders/inputs -> simulation params
  presets.js        # named initial conditions (binary, precessing, chaotic)
styles/
  main.css
test/
  vector.test.js
  history.test.js
  physics.test.js
  simulation.test.js
```

### Key Data Structures

- **Body**: holds current `position`, `velocity`, `mass`, and a reference to its
`StateHistory`.
- **StateHistory**: a ring buffer of `{ t, position, velocity }` samples with an
`interpolate(t)` method (linear first, Hermite later) to recover past states
needed for retarded force evaluation. Buffer length is bounded by the maximum
light-travel delay we expect over the visible region.
- **Simulation**: owns the bodies, the global clock, parameters (`G`, `c`,
`alpha`, `dt`), and the integrator.

## Numerical Methods

- **Integrator:** Velocity Verlet for the Newtonian baseline (good energy
behavior, symplectic). For retarded/relativistic forces—which are not simple
gradients—fall back to RK4 with a fixed small `dt`. Make the integrator
pluggable.
- **Retarded-time solver:** fixed-point / Newton iteration per body per step:
1. Guess `t_ret = t` (zero delay).
2. Compute distance to interpolated past position.
3. Update `t_ret = t - dist / c`.
4. Repeat until convergence (typically 3-5 iterations).
- **Interpolation:** start with linear interpolation in the history buffer,
upgrade to cubic Hermite (using stored velocities) for smoother forces.
- **Stability guards:** softening parameter `epsilon` in the denominator to avoid
singularities on close approach: `r^2 -> r^2 + epsilon^2`.

## Implementation Phases

### Phase 0 — Scaffolding
- Set up `index.html`, canvas, and the animation loop.
- Implement `vector.js` with full unit tests.
- Render two static circles to confirm the pipeline.

### Phase 1 — Newtonian Baseline
- Implement `Body`, instantaneous Newtonian force in `physics.js`.
- Velocity Verlet integrator in `simulation.js`.
- Verify closed elliptical orbits and conserved energy/angular momentum.
- Add trail rendering so orbits are visible.

### Phase 2 — History & Interpolation
- Implement `StateHistory` ring buffer + interpolation.
- Add tests proving interpolation accuracy against analytic curves.
- Wire the simulation to *record* state each step (not yet using it for force).

### Phase 3 — Retarded Interactions
- Implement the retarded-time fixed-point solver.
- Switch force evaluation to use interpolated past positions.
- Observe and document the resulting precession; compare against `c -> infinity`
limit recovering Phase 1 behavior.

### Phase 4 — Relativistic Corrections
- Add `alpha`-blended velocity-dependent / EIH-style terms.
- Add `gamma` factor handling.
- Validate qualitative perihelion precession.

### Phase 5 — Interactivity & Presets
- Build the control panel (`controls.js`).
- Implement drag-to-set-velocity and click-to-place bodies.
- Ship presets: stable binary, precessing orbit, chaotic fly-by.

### Phase 6 — Polish
- Vector overlays (velocity, force, retarded direction).
- Energy/momentum readouts and a precession-angle meter.
- Adaptive trail fading and pan/zoom for exotic orbits.

## User Controls (planned)

| Control            | Range / Type    | Effect                                  |
|--------------------|-----------------|-----------------------------------------|
| Mass 1 / Mass 2    | slider          | Body masses (scales gravity)            |
| Initial velocity   | drag vector     | Sets each body's starting velocity      |
| `c` (light speed)  | slider          | Strength of retardation (lower = more)  |
| `alpha` (rel.)     | slider [0,1]    | Blend Newtonian <-> relativistic        |
| `G`                | slider          | Overall coupling strength               |
| `dt`               | slider          | Integration step (accuracy vs. speed)   |
| softening eps      | slider          | Avoid close-approach singularities      |
| Play / Pause / Step| buttons         | Timeline control                        |
| Reset / Preset     | buttons / menu  | Load initial conditions                 |

## Validation & Testing Strategy

- **Unit tests** for vector math, interpolation, and each force model.
- **Conservation checks** in the Newtonian limit (energy & angular momentum
drift bounded over N orbits).
- **Limit checks**: as `c -> infinity` and `alpha -> 0`, the simulation must
converge to the Newtonian baseline.
- **Qualitative checks**: precession appears and increases with relativity
strength / decreasing `c`.

## Open Questions / Future Ideas
- Should we model the gravitational field's carried momentum explicitly to
restore a conserved total (matter + field) momentum?
- Extend to N bodies (history storage cost grows, but interpolation is reusable).
- Add gravitational-wave-style energy loss for inspiral demonstrations.
- GPU/WebGL acceleration for many-sample histories and N-body extensions.

## Non-Goals
- This is an educational/illustrative tool, **not** a physically exact GR
solver. Corrections are qualitative and tunable, prioritizing intuition and
visual clarity over numerical fidelity to the Einstein field equations.