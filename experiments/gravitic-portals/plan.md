# Gravitic Portals: Implementation Plan

Companion to `idea.md`. This plan turns the field-theoretic concept into a
phased build. Each phase ends with something runnable and testable.

---

## 0. Technical Foundations

### 0.1 Stack
- **Runtime:** browser, plain HTML + native ES6 modules (`<script type="module">`).
  No bundler is required. A bundler can be added later without changing module structure.
- **Rendering:** three.js, imported as an ES module through an import map in `index.html`.
- **Tests:** Node.js (>= 18), using the built-in `node:test` and `node:assert`.
  No test framework dependency.
- **Language:** modern JavaScript (ES2020+) with JSDoc type annotations.
  `// @ts-check` gives editor type checking without a build step.

### 0.2 Core Rule: Physics Never Imports three.js
The field solver and the simulation must run headless in Node. All physics code
lives in `src/core/` and uses its own small vector math module. Only
`src/render/` and `src/app/` may import three.js. This rule keeps the test
harness fast. It also keeps the simulation deterministic and independent of
any renderer.

### 0.3 Directory Layout
```
games/gravitic-portals/
  idea.md
  plan.md
  index.html                 # phase 1–3 entry point
  editor.html                # phase 4 entry point
  package.json               # "type": "module", scripts: test, serve
  src/
    core/                    # pure, headless, deterministic
      vec3.js                # immutable-style vector helpers on plain {x,y,z}
      quat.js                # rotations for portal orientation / identification map
      portal.js              # Portal: center, normal, up, radius, link id
      portalMap.js           # T: D1 -> D2 (rotation + scale λ = R2/R1)
      background.js          # Φ₀ and g₀ (uniform gravity, pluggable)
      field/
        analytic.js          # piecewise model: gap / rim / dipole + smoothstep blend
        reference.js         # slow numerical reference solver (BEM), tests only
        fieldSystem.js       # sums the CF over all portal pairs, caches per config
      sim/
        particle.js          # test particle state
        integrator.js        # fixed-timestep symplectic integrator
        crossing.js          # portal crossing detection + transform
        world.js             # owns portals, particles, step(dt)
      rng.js                 # seeded PRNG (never Math.random in core)
    render/
      fieldViz.js            # arrows / streamlines / |E_CF| shader
      portalMesh.js          # portal disk + rim fringe rendering
      portalView.js          # render-to-texture "see through" portals (phase 2)
      particlesView.js
    app/
      main.js                # wires world + renderer + UI
      controls.js            # orbit cam (ph 1–2), first-person (ph 3)
      hud.js
    editor/                  # phase 4
  levels/                    # JSON level files
  test/
    vec3.test.js
    portalMap.test.js
    field.analytic.test.js
    field.reference.test.js
    conservation.test.js
    crossing.test.js
    determinism.test.js
    run-scenario.js          # CLI: simulate a level headlessly, dump CSV/JSON
```

### 0.4 Determinism Policy
- Use a fixed simulation timestep (e.g. 1/120 s). Rendering interpolates between steps.
- Core code never calls `Math.random`. Use the seeded `rng.js` instead.
- Iterate portals and particles in a stable order (by id), never in hash or insertion order.
- **Known caveat:** JS `Math.sqrt` is IEEE-exact. `Math.sin`, `Math.cos`, `Math.exp`
  and `Math.atan2` are *not* guaranteed bit-identical across JS engines.
  - Phase 1–3 only needs same-engine determinism, which is tested.
  - Cross-engine lockstep, if it is ever needed, requires our own polynomial
    implementations of these functions. This is tracked as a phase 4+ risk.

### 0.5 Scripts
```
npm test                     # node --test test/
npm run serve                # any static server, e.g. npx http-server .
node test/run-scenario.js levels/floor-ceiling.json --steps 2000 --out out.csv
```

---

## Phase 1 — Field Solver + Test Particles

**Goal:** Given a set of portal pairs (position, orientation, radius), compute
Φ_c and E_CF. Validate the result against a reference solution. Visualize the
field and a swarm of test particles moving through it.

### 1.1 Data Model
- `Portal { id, center: Vec3, normal: Vec3, up: Vec3, radius: number, linkId }`.
  The `up` vector fixes the in-plane frame. Together with `normal`, it defines `Rot` in T.
- `PortalPair { a: Portal, b: Portal }`. This pair produces:
  - the boundary values ΔΦ = Φ₀(b.center) − Φ₀(a.center), split as ±ΔΦ/2 per idea.md §4.1;
  - λ = b.radius / a.radius;
  - the map T and its inverse.

### 1.2 Reference Solver (`field/reference.js`)
The piecewise model needs ground truth, so build a slow but correct solver first.
1. Discretize each disk into N concentric-ring × angular panels.
   Use graded refinement toward the rim to capture the 1/√s singularity.
2. Use free-space Green's function collocation. Solve for the panel "charge"
   densities σ so that Φ_c equals ±ΔΦ/2 on each disk. Φ_c → 0 at infinity holds
   automatically. This is a dense linear solve with N ≲ 2000; use a plain
   Gaussian elimination module.
3. Evaluate Φ_c(x) and E_CF(x) by summing the panel contributions.
4. Sanity checks:
   - A single disk at potential V should give total charge 8ε₀RV, the known isolated-disk capacitance.
   - Two close disks should approach the parallel-plate field V/h in the gap.

The reference solver is used in tests and in an optional "ground truth" debug
overlay. It never runs in the game loop.

### 1.3 Analytic Model (`field/analytic.js`)
This implements idea.md §4.2. Work in each pair's local cylindrical frame (ρ, θ, z).
- **Gap term:**
  - E ≈ uniform axial field of magnitude ΔΦ/h for ρ < R between the disks.
  - Fade it out radially with smoothstep over [R − w, R + w].
- **Rim term:**
  - |E| ≈ k_edge · ΔΦ / √s near each rim, where s is the distance to the rim circle.
  - Clamp it at s_min to avoid infinities. s_min is a tunable gameplay value; the rim
    "hazard" strength is decided here.
  - Direction: the gradient of the local 2D edge solution, which points away
    from the rim in the half-plane containing the axis.
- **Far term:**
  - The dipole potential Φ = p·cosθ / r², with p fitted from the reference solver as a function of (R, h).
  - Phase 1 includes the dipole term only. Monopole terms are zero by the ±ΔΦ/2 symmetry
    when R1 = R2. For R1 ≠ R2 they are *not* zero, so add an explicit monopole
    term in phase 3 (see §R3).
- **Blending:**
  - Region weights use smoothstep.
  - Blend **potentials** where possible, then differentiate analytically.
    Blending field vectors directly breaks curl-freeness and violates the
    conservation guarantee (see §1.5).
- **Fitting:**
  - `tools/fit.js` runs the reference solver over a grid of (R, h, angle).
  - It emits a small coefficient table (k_edge, p, w) as a JSON module that `analytic.js` imports.

### 1.4 Non-Coaxial Pairs
idea.md §4 only solves the coaxial case. Phase 1 handles arbitrary orientation in
two stages:
- **Stage A:**
  - Treat each pair as two independently oriented disks at ±ΔΦ/2.
  - Run the reference solver on the true geometry.
  - Run the analytic model as a superposition of the single-disk solutions.
    The isolated charged disk has a closed form in oblate spheroidal coordinates.
- **Stage B:**
  - Measure the error of Stage A against the reference.
  - Where the error exceeds tolerance, add the coaxial gap correction as a
    special term.
- **Multiple pairs:** superpose them linearly. This is exact for harmonic Φ_c only
  if the boundary conditions are re-solved jointly, so measure and document the
  error of the independent-pair approximation.

### 1.5 Test Particles (`sim/`)
- Particles are unit-mass test particles. Acceleration is g_eff = g₀ + E_CF.
- Use a velocity-Verlet integrator with a fixed dt. It is symplectic and has good
  long-run energy behavior.
- **Portal crossing** (`crossing.js`):
  - Detect a segment–disk intersection between steps.
  - On crossing, apply T to position and the rotation part of T to velocity.
  - Phase 1 uses λ = 1 only.
- **Energy bookkeeping:**
  - Track E = ½v² + Φ(x).
  - When crossing, Φ(x) on D1 equals Φ(T(x)) on D2 by construction. Total energy
    should therefore be continuous across the seam. This is the core claim of
    idea.md §2, and phase 1 verifies it numerically.

### 1.6 Phase 1 Visualization (`index.html`)
- Orbit camera, ground grid, and translucent portal disks with a rim ring.
- Field visualization options:
  - an arrow glyph grid colored by |E_CF|;
  - a toggleable slice plane with a heatmap of Φ or |g_eff|;
  - streamlines seeded around the rims.
- A particle emitter spawns test particles from a seeded RNG.
- Debug panel controls:
  - drag portal centers, rotate normals, change radius;
  - presets: floor–ceiling, wall–wall, 45° tilt, unequal radii (visual only, λ = 1);
  - toggles for analytic vs reference field;
  - toggles for each region term (gap / rim / far).

### 1.7 Phase 1 Tests
| Test | Assertion |
|---|---|
| `vec3`, `quat` | basic identities, round-trips |
| `portalMap` | T(T⁻¹(y)) = y; rim maps to rim; frame handedness preserved |
| `field.reference` | isolated disk capacitance within 1%; parallel-plate limit |
| `field.analytic` | RMS error vs reference below tolerance (target 10%) inside a 3R bounding box, excluding s < s_min |
| `field.analytic` | numerical curl of E_CF ≈ 0 on random sample points |
| `field.analytic` | floor–ceiling gap: \|g_eff\| < 0.05 g at the center (idea.md §4.3) |
| `conservation` | particle loop through floor/ceiling pair for 10⁴ steps: energy drift bounded, no monotonic growth (the "free energy loop" from idea.md §1 must not appear) |
| `crossing` | energy continuous across seam within integrator tolerance |
| `determinism` | two runs with the same seed and level give byte-identical state dumps |

**Exit criteria:**
- All tests pass.
- The floor–ceiling preset visibly shows a calm gap, bright rims and dipole falloff.
- Particles dropped into the portal loop do not gain energy.

---

## Phase 2 — Portal Rendering in a 3D Environment

**Goal:** Portals look like windows into their partner location, sitting in a real
environment, with the CF visible as a diegetic effect.

### 2.1 Environment
- Simple test rooms built from box geometry: floor, walls and ceiling.
- Add a few props for parallax cues.
- Load levels from `levels/*.json` through a loader shared with the headless runner.

### 2.2 See-Through Portals (`portalView.js`)
- Use a virtual camera per portal. Its view matrix is the main camera transformed by T.
  This includes λ scaling, so a small→large portal view looks "zoomed out".
- Use an oblique near-plane clip at the destination portal plane, so geometry
  behind the exit disk is not drawn.
- Render to a texture, or use the stencil approach. Start with render targets.
  Move to stencil if performance requires it.
- Recursion depth is configurable (default 2). Beyond that depth, draw a fallback tint.
- Use a circular mask, because the portals are disks.

### 2.3 Correcting-Field Visuals (idea.md §8 "Visual language")
- Use a shader on the portal and the surrounding air volume. Fringe line density
  and intensity are driven by |E_CF| sampled from **the same** `analytic.js`
  (uploaded as uniforms or a baked 3D texture). Visuals must never disagree with physics.
- The rim glow intensity follows the clamped 1/√s term.
- Optional: a heat-haze screen-space distortion near rims.

### 2.4 Field Cache
- `fieldSystem.js` holds a version counter that changes when any portal changes.
- A baked 3D grid of g_eff covers the level bounds. It is rebuilt only on
  version change (idea.md §8 "Recompute triggers").
- Physics may query either the analytic model or the grid. Pick one per build
  and test both.

### 2.5 Phase 2 Tests
- Headless:
  - virtual camera matrix = T ∘ main camera, for λ = 1 and λ ≠ 1;
  - the clip plane lies on the destination disk.
- Headless: grid-sampled field matches the analytic field within the
  interpolation tolerance.
- Manual checklist:
  - no seams or flicker at recursion depth 2;
  - the portal edge matches the CF rim glow.

**Exit criteria:**
- Walking the orbit camera around shows convincing portal windows.
- The CF is visible and consistent with the phase 1 field overlay.
- The scene holds 60 fps with 2 pairs on mid-range hardware.

---

## Phase 3 — First-Person Movement, Basic Levels, Physics Interactions

**Goal:** Make the concept playable. A player walks, jumps and falls through
portals, experiences 0-g chambers and rim hazards, and pushes objects around.

### 3.1 Player
- Use a capsule collider, kinematic plus velocity, on the same fixed step as particles.
- Pointer-lock mouse look and WASD.
- **Gravity alignment:**
  - The player's "down" smoothly tracks −ĝ_eff when |g_eff| exceeds a threshold.
  - Below the threshold (0-g chamber), keep the last orientation and enable float controls.
- **Crossing:**
  - Apply T to position, orientation and velocity.
  - Use a "straddling" state that renders the player body clipped on both sides.
    Collision checks run against the geometry on both sides.

### 3.2 Rigid Objects
- Phase 3 supports spheres and boxes only, using a small in-house solver.
  Full determinism control matters more than features here. Revisit later,
  possibly with a deterministic third-party engine.
- Objects use the same crossing logic as particles.
- Throwing and picking up objects is enabled.

### 3.3 Variable Radius / Scale Change (idea.md §6)
- Enable λ ≠ 1.
- Object scale, collider size and render scale are multiplied by λ on exit.
- Momentum and mass scaling are configurable rules, *not* hard-coded (see §R2).
- The unequal-disk field uses a re-fitted coefficient table over (R1, R2, h)
  and includes the monopole term (§R3).

### 3.4 Basic Levels (`levels/`)
1. `tutorial-window.json` — a wall–wall pair, flat, with no CF effect to notice.
2. `floor-ceiling.json` — the 0-g chamber.
3. `rim-hazard.json` — redirect a thrown ball using a rim.
4. `tilted-launch.json` — a non-coaxial pair used as a launcher.
5. `shrink-vent.json` — a large→small portal to reach a vent.

Each level has a scripted headless test. It replays a recorded input sequence
and asserts that the goal trigger fires.

### 3.5 Phase 3 Tests
- Player/object crossing:
  - position, velocity and orientation are mapped correctly for 8 orientation combinations × 3 λ values.
- Conservation:
  - with λ = 1 and the damping rule off, no energy gain over long loops.
- Replay determinism:
  - the same input recording gives the same final state hash on repeated runs.
- Level completion replays pass.

**Exit criteria:**
- All five levels can be completed by hand and by replay.
- Infinite-fall and free-energy exploits are absent with default rules.

---

## Phase 4 — Level Designer

**Goal:** An in-browser editor that produces the same JSON levels used by game
and tests.

### 4.1 Features
- Place, move and rotate box geometry with grid snapping.
- Place portal pairs with gizmos for center, normal, up and radius.
- Live CF overlay while editing. It reuses the phase 1 visualizations.
- Place spawn points, goal triggers, props and hazards.
- Play-in-editor using the phase 3 runtime, then return to the editor.
- Save and load JSON. A JSON schema lives in `levels/schema.json`, and the loader validates against it.
- Undo/redo through a command stack.

### 4.2 Designer Diagnostics
- Heatmap warnings where rim |E| exceeds the player-injury threshold
  on a walkable surface.
- Report the error of the independent-pair approximation when portal pairs overlap
  in influence (§1.4). The designer should know when the cheap model is lying.
- A one-click "export replay test" records play-in-editor inputs into `test/levels/`.

### 4.3 Phase 4 Tests
- Schema round-trip: load → save → load gives identical data.
- Undo/redo invariants.
- Every level in `levels/` passes validation in CI.

---

## Risks and Open Design Questions

These are inconsistencies or gaps in `idea.md` that affect implementation. Each
needs a decision before or during the noted phase.

**R1. Damped jumps vs. conservative field (phase 3).**
idea.md §5.1 says the 0-g chamber "actively damps" jumps. A static
gradient field cannot do that, because it does no velocity-dependent work.
Damping requires a separate dissipative term, which breaks the "no net work"
claim inside the chamber.
- **Plan:** implement it as an optional, explicitly *dissipative* drag in CF
  regions. It is allowed because it only ever removes energy.
- **Default:** off.

**R2. Momentum scaling p_out = λ·p_in (phase 3).**
- With unchanged mass, kinetic energy scales by λ². A small→large→small loop
  returns to the start, but a small→large path with return by a different route
  (walking back) creates energy.
- This directly contradicts the conservation guarantee.
- **Options:**
  - (a) scale mass by λ³ and velocity by 1/λ² so that KE is preserved;
  - (b) preserve velocity and scale mass only;
  - (c) accept energy injection and charge it against the emitter's
    "aperture energy budget" (idea.md §6.4), making the budget the conservation law.
- **Plan:** implement all three as rule presets and pick one through playtests.
  The conservation tests run against whichever preset is the default.

**R3. Unequal disks are not antisymmetric (phase 3).**
With R1 ≠ R2, the ±ΔΦ/2 split leaves a net monopole, so far-field falloff is
1/r and not 1/r³. Gauge-fix ΔΦ split by capacitance to cancel the monopole,
or include the 1/r term. This must be decided with the reference solver.

**R4. Boundary condition semantics.**
idea.md §4.1 holds each disk at a constant Φ_c. Only the *total* Φ needs to match
across T. A disk tilted relative to gravity has Φ₀ varying across its face, so
constant Φ_c is insufficient for tilted portals.
- **Plan:** the reference solver imposes the pointwise condition Φ(x) = Φ(T(x)).
  This can be a jump condition with a single-layer-plus-double-layer
  formulation, if constant-per-disk proves inadequate.
- The analytic model approximates this result. Validate it in phase 1 §1.4.

**R5. Rims: hazard or out of scope?**
idea.md §1 says edge discontinuities are out of scope, while §5.2 makes the
rim singularity a core feature. This plan treats the rim as an in-scope,
*clamped* hazard (s_min). idea.md should be updated to match.

**R6. "Teleporter" framing.**
idea.md §1 calls the design "a teleportation portal with corrections". §9 says
"refusing to let the portal be a teleporter". The implementation is
teleport-on-crossing (T applied to state) plus the CF. Reword idea.md for
consistency.

**R7. Gap field for large h (phase 1).**
The uniform ΔΦ/h approximation fails once h ≫ R (idea.md §5.3). The reference
solver will define where the transition happens. Bake it into the analytic gap
term's weight as a function of h/R.
**R8. The 0-g gap is not what the Dirichlet problem gives (found in phase 1).**
The reference solver shows that two disks at ±ΔΦ/2 produce a gap field of ΔΦ/h
only in the parallel-plate limit h ≪ R. At h ~ 2R it cancels only part of g.
idea.md §4.3's "exact cancellation" is therefore an approximation.
- **Decision:** the analytic model is split into a *physical* part and a *design* part.
   - The physical part is a jointly solved superposition of exact single-disk solutions.
     It is validated against the reference.
   - The design part is an explicit gap term that blends the potential toward the ideal ramp.
   - Both are single scalar potentials, so conservation is unaffected.
- The exact disk solution already contains the 1/√s rim and the far-field behaviour.
   The separate rim/dipole terms from §1.3 are therefore subsumed. `s_min` is applied as softening.
- Seam safety net: crossing can enforce ½v² + Φ continuity (`energyCorrection`).
   The approximate model then can never create energy at a seam. The raw mismatch is
   recorded as `seamError` for diagnostics.
**R9. Analytic model replaced by a tabulated field (supersedes §1.3 and parts of R8).**
Testing showed the analytic superposition was inaccurate for many configurations.
The new approach tabulates the field in a batch job and interpolates it at runtime.
- **Normalization.**
   - The larger disk becomes the unit disk at the origin.
   - The frame is rotated about that disk's normal and mirrored as needed.
   - What remains is (d, ψ, θ, φ, λ ≤ 1).
- **Gravity removed by linearity.**
   - Boundary data is affine on each disk, so Φ_c is a combination of 7 shape-only modes.
   - The mixing coefficients come from gravity, T and λ at runtime.
- **Batch job.**
   - `npm run tabulate` (worker threads) solves each configuration once: one LU, seven right-hand sides.
   - It stores σ per panel on a fixed disk layout, quantized to int16 per mode.
   - The default table is 6720 configurations, about 15 MB.
- **Runtime.**
   - On a portal change: 32-corner multilinear interpolation of σ, giving world-space softened sources.
   - Per query: exact Φ and ∇Φ, blended to a multipole expansion far from the pair.
   - Out-of-range configurations, or no table file, fall back to a direct solve of the same discretization (a few ms).
- **Kernel.** Solve and evaluation share one softened kernel.
   - The boundary condition is therefore exact at every collocation point, including the disk centres.
   - The softening (`epsRel`) is the rim clamp.
- **Unchanged.** The gap design term stays as an optional overlay. Multiple pairs superpose independently, without pair–pair interaction.

---

## Milestone Summary

| Phase | Deliverable | Key proof |
|---|---|---|
| 1 | Headless field solver + reference BEM + particle viz | No free-energy loop; analytic ≈ reference |
| 2 | See-through portals + CF shader in rooms | Visuals driven by the same field as physics |
| 3 | FPS player, objects, λ-scaling, 5 levels | Replayable, deterministic, completable |
| 4 | Browser level editor | Levels round-trip and auto-generate tests |