# **Equipotential: A Gravitic Capacitor Puzzle Game**

## 0. Origin

The gravitic portal was a good math and physics toy. Tying it to portals, though, made it derivative of an existing genre. Portals also limited it: the only knobs were where you placed a disk, which way it faced, and how big it was.

This document keeps the useful core of that design:

- gravity is the gradient of one scalar potential;
- the field is conservative and deterministic;
- the field is precomputed;
- there is still a uniform ambient gravity g₀ (the station's "default down"), and the plates sit inside it.

It drops the portals. Instead, the level itself is the instrument. Designers choose which surfaces are **gravitic plates** and what **potential** each plate holds. The game then solves for the **corrective field** that, added to the ambient field, makes every active plate an equipotential surface of the *total* gravity.

Working title: **Equipotential**.

---

## 1. Premise

You are a maintenance engineer in a derelict research station. Its architecture was built around "gravitic capacitance": walls, floors and panels can be held at a gravitational potential.

"Down" is not a direction. It is wherever the potential falls fastest. Change a plate's potential, and the shape of the whole room's gravity changes with it:

- a ceiling can become a floor;
- a corridor can become a slope;
- a shaft can become a calm, weightless well.

The player rarely edits plates freely. They act through the station's own hardware:

- switches;
- pressure pads;
- potential "batteries";
- breakers;
- linking cables.

Puzzles are about predicting the field a configuration will produce, and then riding it.

Guiding design rule: **the walls are the controls. The field is the level. Every force the player feels is visible, explicable and repeatable.**

---

## 2. Physical Model

### 2.1 Potential and gravity

Gravity is defined by a scalar potential Φ(x), with g(x) = −∇Φ(x). The total potential has two parts:

Φ(x) = Φ₀(x) + Φ_c(x),  with Φ₀(x) = −g₀ · x

- **Φ₀** is the uniform ambient field. It is trivially harmonic, but it is *not* constant on the plates and it *does* push flux into the walls.
- **Φ_c** is the **corrective field**. It is the harmonic field that makes the total Φ satisfy the boundary conditions below. Without it, a "floor plate" tilted relative to g₀ would not be an equipotential, and objects would slide along it.

In the playable volume, both parts, and therefore Φ, obey Laplace's equation, ∇²Φ = 0. There are no mass sources. Players and objects are test particles and do not create gravity themselves.

### 2.2 Boundary conditions on faces

Every solid face in a level has one of the following roles. The conditions apply to the **total** field. The column on the right gives what the solver actually imposes on Φ_c.

| Face role | Condition on Φ | Condition on Φ_c | Meaning for the player |
|---|---|---|---|
| **Plate** (energised) | Dirichlet: Φ = V_i | Φ_c = V_i + g₀ · x | Active surface and a true equipotential. Objects are pulled toward low-potential plates and pushed away from high ones. |
| **Insulator** (default, or a de-energised plate) | Neumann: ∂Φ/∂n = 0 | ∂Φ_c/∂n = g₀ · n | Inert wall. Field lines run along it, never into it. |
| **Ground** | Dirichlet: Φ = 0 | Φ_c = g₀ · x | A fixed reference plate. |
| **Floating plate** | Unknown constant Φ, fixed total "charge" Q | Unknown constant minus Φ₀ | A conductor that settles to whatever potential its neighbours impose. This is an advanced mechanic (§4.5). |

Open level boundaries, such as sky or a void, use either a far-field ground or Neumann. This is a per-level choice.

**Well-posedness rule:** every connected air region must touch at least one Dirichlet face, whether a plate or ground. Without one, the potential is undefined. The editor enforces this rule.

### 2.3 Why this is safe

- **Conservative.** Gravity is the gradient of a single-valued Φ. No closed loop can gain energy while the plate potentials stay fixed.
- **Explicit energy sources.** Energy can enter the system only when a potential *changes*. That is a deliberate, visible event, such as a switch flip or a timed cycle. It is never a geometry glitch.
- **Deterministic.** Φ is a pure function of the level geometry and the plate potentials. Every client computes the same field.

### 2.4 Configurations: why the corrective field is solved per switch state

The corrective field is a property of the whole room, not of any one plate. Each plate's correction must cancel the ambient field *and* the fields produced by every other active plate and its correction. When a switch energises or isolates a plate, that face changes from Dirichlet to Neumann or back. That changes the operator itself, so every other plate's correction changes too. Corrections for separate subsystems therefore cannot be computed independently and summed.

We therefore define a **configuration** k as one assignment of boundary roles to all faces, that is, one combination of switch states. For each configuration we bake the full corrective field Φ_c^k with one linear solve.

Design assumption: **few switches.** A level with n binary switches has at most 2ⁿ configurations, which is acceptable for n ≲ 5 (32 bakes). Designers can also declare unreachable combinations to prune the set.

Within a single configuration, the boundary *types* are fixed, so linearity still applies to the boundary *values*:

Φ^k(x) = Φ₀(x) + C^k(x) + Σ_{i ∈ active(k)} V_i · B_i^k(x)

- **C^k** corrects the ambient field. It is the harmonic field with every active plate at 0 relative to Φ₀ (that is, C^k = g₀ · x on active plates) and C^k satisfying ∂C^k/∂n = g₀ · n on insulators.
- **B_i^k** is plate i's basis field *in configuration k*. Plate i is held at 1, all other Dirichlet faces at 0, and insulators are homogeneous Neumann.

Consequences:

- Switch states that change boundary types select a different baked configuration. The runtime never solves; it swaps data.
- Continuous potential changes within a configuration (dials, slewing, oscillators) are still a cheap weighted sum.
- **Switch transitions** cross-fade from Φ^k to Φ^k′ over a short slew time: Φ = (1−s) Φ^k + s Φ^k′. At any fixed s, the blend is still the gradient of one potential, so the field stays conservative. The energy change while s moves is attributed to the switch (§4.6).
- Cost scales with the number of configurations times the plates active in each, so switch count is the main budget lever.

---

## 3. Voxel Discretization

### 3.1 Grid

- Each level uses a uniform voxel grid. The default cell size is h = 0.25 m.
- Each cell is one of: **air**, **solid**, or **plate-adjacent**.
- Plate faces are stored on cell faces, not cell centres. This keeps the boundaries flush with the geometry.

### 3.2 Solver (bake time only)

- Use the 7-point finite-difference Laplacian on air cells.
- Dirichlet plate faces are applied at cell faces with a half-cell ghost value.
- Neumann insulators mirror the neighbouring air value.
- Floating plates add one unknown and one constraint each. Their effect is handled at runtime through the capacitance matrix (§4.5).

### 3.3 Runtime sampling

- Φ is trilinearly interpolated from the combined voxel potential.
- g is computed as the **analytic gradient of that same trilinear interpolant**. The gradient is not interpolated separately.
- As a result, the sampled force field is exactly the gradient of a single-valued piecewise potential. Conservation therefore holds for the discretized field too, not just in the continuum limit.
- Near plates, the cell size can be refined with a two-level nested grid. This sharpens corners, where the field concentrates, just as a portal rim did in the earlier design.

### 3.4 Storage

- Optimizations:
- Each basis field is stored as int16 over the level's air-cell bounding box, quantized in [0, 1]. Each C^k is stored as int16 with a per-field scale and offset.
- Φ₀ is analytic and is never stored.
- Example: a 40 × 20 × 40 m room at 0.25 m cells is 2 × 10⁶ cells. That is 4 MB per stored field.
- Total size is roughly Σ_k (1 + active plates in k) × 4 MB, so configurations dominate. Unvarying plates can be folded into C^k: if a plate's V never changes in configuration k, its contribution is baked into C^k instead of stored as a separate B_i^k.
  - store only the active air cells, using sparse bricks;
   - compress per chunk;
   - deduplicate bricks that are identical across configurations, which is common far from the switched plate.
- The typical budget per level is 8–24 plates and ≤ 5 boundary-changing switches.

---

## 4. Mechanics

### 4.1 Plate potentials

- A plate at low potential acts like a "floor": things fall toward it.
- A plate at high potential acts like a "ceiling": things fall away from it.
- Field strength depends on the potential *difference* between plates and their *distance* apart. Close plates with a large difference give strong gravity. Far plates with a small difference give a gentle drift.

### 4.2 Switches and potential sources

| Device | Effect |
|---|---|
| **Toggle switch** | Energises or isolates a plate, switching its face between Dirichlet and Neumann. This selects a new configuration and triggers a cross-fade (§2.4). |
| **Selector** | Sets a plate to V_a or V_b without changing its role. This stays within the current configuration. |
| **Dial** | Sets a continuous V in a range. The plate eases to it at a fixed slew rate. |
| **Pressure pad** | Sets V while weighted. Crates can hold it down. |
| **Timer / oscillator** | Cycles V. Because the field changes over time, this is the game's only energy pump (§4.6). |
| **Link cable** | Ties two plates to the same V. A designer or a player can place it. |
| **Breaker** | A latching toggle, typically for a whole wall section. It is also a configuration change. |

Toggles and breakers change the boundary *type*. Every other plate's corrective field depends on that type, so each combination needs its own bake. Levels should keep the total number of toggles and breakers small (≤ 5). Selectors, dials, pads, timers and cables are cheap, because they only change weights within a configuration.

### 4.3 Emergent configurations (the designer's vocabulary)

- **Inverted room:** raise the floor plate above the ceiling plate, and the room flips.
- **Equipotential well:** two facing plates at the same V give a near-zero field between them. This is a floating chamber, and here it is genuine, not the damped hack from the portal design.
- **Slope corridor:** a gradient of potentials along a series of wall panels makes gravity point down the corridor. The player "falls" horizontally.
- **Field lens:** an insulator obstacle bends the field lines around itself. It casts a "gravity shadow" behind it.
- **Corner spike:** a sharp convex plate corner concentrates the field. This is a hazard or a slingshot.
- **Saddle:** four plates at alternating potentials create an unstable balance point. Objects sit there briefly, then roll away in a predictable direction.

### 4.4 Player orientation

- The player's "down" smoothly tracks −ĝ while |g| is above a threshold.
- Below the threshold, the player enters float mode: push off surfaces, with a small jetpack-like nudge budget.
- Orientation changes are rate-limited to protect comfort. An option snaps the camera only when the player lands.

### 4.5 Floating plates (advanced)

A floating plate is an isolated conductor. Its potential is not set directly. It settles so that its net charge is held constant, usually zero.

- Gameplay effect: a floating plate "relays" potential. Raise a nearby plate, and the floating plate partially follows it, which reshapes the field elsewhere. This enables indirect puzzles, where you control a room you cannot reach by changing its neighbours.

### 4.6 Energy and time variation

- With fixed potentials, a closed path never gains energy. Tests verify this.
- When potentials change while an object is in the field, its potential energy shifts. Riding a plate as it rises is an elevator. Flipping a plate at the right moment is a launch.
- Every energy gain is attributable to a device. The HUD can show it as a "work done by switch" readout in debug or puzzle-hint mode.
- Oscillators allow "pumping", building speed by timing your swings. Each level sets a pump budget to prevent runaway exploits.

### 4.7 Objects

- **Crates** hold pressure pads and act as test masses for the player to read the field.
- **Bearings** are small, low-friction spheres. They trace field lines visibly, which makes them a diagnostic tool for the player.
- **Charged cores** are puzzle keys that must reach a socket. Charged cores are still pure test particles, so they do not perturb the field.

---

## 5. Player Experience

### 5.1 Core loop

1. **Read** the room: see the plate colours, the potential readouts, and the equipotential contours on the surfaces.
2. **Predict** how a change will reshape the field. Optionally, preview it with a "field probe" tool that shows the outcome without committing.
3. **Act** with switches, pads, cables and crates.
4. **Ride** the new field to the goal. Timing switch changes mid-flight is the skill ceiling.

### 5.2 Visual language

- Plate colour encodes potential on a perceptually uniform ramp, for example blue for low and orange for high.
- Equipotential contour lines are projected onto every surface and through haze in the air.
- Field-line dust particles drift along g.
- A "Down" indicator in the HUD shows −ĝ at the player.
- Every visual is sampled from the same combined voxel field that physics uses. The visuals never disagree with the physics.

### 5.3 Difficulty arc

1. **Act 1 – Floors that aren't:** single plates and toggles, inverted rooms, slope corridors.
2. **Act 2 – Superposition:** multiple plates, dials, equipotential wells, lenses, crates on pads.
3. **Act 3 – Indirection:** link cables, floating plates, breakers, controlling unreachable rooms.
4. **Act 4 – Timing:** oscillators, mid-flight switching, pumping, launch sequences.

### 5.4 Optional multiplayer

The field is deterministic and depends only on the switch state, so co-op is straightforward:

- one player works the switches while another rides;
- the shared state is just the V vector plus the bodies.

---

## 6. Implementation Plan

The project reuses the foundations from `plan.md` §0: ES modules, three.js only in render code, a headless core, `node:test`, a seeded RNG, and a fixed timestep.

### 6.1 Directory layout

- `src/core/grid/` – voxel grid, cell classification, face roles.
- `src/core/field/`:
- `src/core/solve/` – Laplacian assembly, ambient-correction boundary data, multigrid-preconditioned CG, configuration enumeration, per-configuration bake (C^k, B_i^k), capacitance matrices. Used only at bake time and in tests.
   - `configSet.js` – loads per-configuration bricks and maps switch states to configurations;
   - `combine.js` – C^k + Σ V_i B_i^k into a working grid, with incremental updates on V changes and cross-fades between configurations;
  - `sample.js` – trilinear Φ and analytic gradient.
- `src/core/devices/` – switches, dials, pads, timers, cables, breakers, floating-plate solve.
- `src/core/sim/` – particles, rigid bodies, player controller, integrator (reused from portals).
- `src/render/` – plate shader, contour projection, field dust, HUD.
- `src/editor/` – face painting, device wiring, live preview.
- `levels/` – level JSON plus baked `.field` files.

### 6.2 Phase 1 – Solver and headless field (2–3 weeks)

**Build:**
- grid classification;
- face roles;
- the CG/multigrid solver;
- combine and sample;
- the particle integrator.

**Tests:**
- Superposition: the combined field matches a direct solve for random V vectors, to solver tolerance.
- Conservation: particle loops with fixed V show no energy drift beyond integrator tolerance over 10⁵ steps.
- Curl-free: closed-loop line integrals of the sampled g are ≈ 0.
- Well-posedness: the validator rejects regions without a Dirichlet face.
- Determinism: byte-identical state dumps across runs.

**Exit:** a headless scenario runner dumps trajectories, and a debug page shows slice heatmaps.

### 6.3 Phase 2 – Devices and time variation (2 weeks)

**Build:**
- switch, dial, pad, timer and cable devices, with slew-rate easing;
- incremental combine, adding only ΔV_i · B_i for changed plates;
- a work-accounting ledger;
- the floating-plate solve via the capacitance matrix.

**Tests:**
- Energy changes equal the logged device work.
- Floating-plate potentials match a direct solve with that plate as an unknown.
- Combine is incremental and equals a full recombine.

### 6.4 Phase 3 – Rendering and the player (3 weeks)

**Build:**
- plate shader;
- surface contours;
- field dust;
- first-person controller with down-tracking and float mode;
- crates and bearings;
- comfort options.

**Exit:** a vertical slice of 6 Act 1 rooms at 60 fps on mid-range hardware.

### 6.5 Phase 4 – Editor (3 weeks)

**Build:**
- face painting for plate, insulator and ground roles;
- device placement and wiring;
- field probe preview;
- play-in-editor;
- JSON schema validation;
- export of replay tests.

**Diagnostics:**
- hazard heatmaps where |g| exceeds the injury threshold on walkable faces;
- warnings for an ill-posed region;
- a bake size, plate budget and configuration-count meter.

### 6.6 Phase 5 – Content and polish

- Acts 1–4, roughly 40 rooms.
- Hint system driven by the field probe.
- Optional co-op.
- Every level ships with a replay test in CI.

---

## 7. Risks and Open Questions

- **Memory per plate.** Many plates in large rooms inflate bake size. Mitigations:
- **Configuration explosion.** Bake count is 2ⁿ in the number of toggles and breakers. Mitigations:
   - keep switch counts low;
   - prune unreachable combinations;
   - split rooms with insulated doorways so that each room enumerates only its own switches;
   - warm-start bakes and deduplicate bricks across configurations.
  - sparse bricks;
  - lower resolution far from plates;
  - per-room solves joined by insulated doorways.
- **Moving plates.** These break precomputation. Restrict them to discrete positions, each with its own baked basis set, and treat them like breakers.
- **Corner singularities.** Re-entrant plate corners give unbounded fields in the continuum. On the grid they are naturally clamped at the cell scale. Make that clamp explicit as a tunable hazard cap.
- **Readability.** Players must be able to predict the field. Playtest early with the field probe on, then gradually withhold it.
- **Motion sickness.** Rapid changes to "down" can cause discomfort. Rate limits, snap-on-landing and a fixed-horizon option are required.
- **Cross-engine determinism.** The runtime uses only +, −, × and sqrt, which are bit-exact under IEEE. Avoid transcendental functions in the core simulation.
- Ambient-field corrections enter as boundary data. Plates take the value g₀ · x evaluated at the face centre, and insulators take a ghost value offset by h (g₀ · n), so that the *total* normal flux is zero.
- Solve with multigrid-preconditioned conjugate gradient:
   - Each configuration has its own matrix, because its Dirichlet/Neumann split differs. The hierarchy is built once per configuration.
   - Within a configuration, the solves for C^k and each B_i^k share that hierarchy.
   - Warm-start each configuration from a neighbouring one (one switch different). This usually cuts iterations substantially.
- For each configuration k, precompute from its basis fields the **capacitance matrix** C_ij^k (the charge on plate i per unit potential on plate j). Also precompute the charge induced on each plate by the ambient correction C^k.
- At runtime, the floating potentials come from a tiny linear solve using the current configuration's matrix, with size equal to the number of floating plates.
- `tools/bake.js` – CLI. Reads level JSON, enumerates reachable configurations, and writes per-configuration bricks plus capacitance matrices.
- the ambient corrective field;
- configuration enumeration and the per-configuration bake;
- Parallel-plate box: the gap field is uniform and equals ΔV/d within 1%, for plates both aligned with g₀ and tilted against it.
- Equipotential plates: the total Φ varies across each active plate by no more than solver tolerance, in every configuration.
- Insulator flux: the total normal flux, ambient plus corrective, is zero through insulator faces.
- Interaction: in a two-plate room, toggling plate A changes the correction near plate B, and matches a direct solve of the new configuration.
- background re-bake on edit, with a coarse grid first for instant preview and a fine grid later. Re-bake only the current configuration first, then the rest of the configurations in the background;