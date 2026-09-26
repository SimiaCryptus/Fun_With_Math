# Labrek Space Mining — Project Specification

**Status:** Draft v1.0 **Target platform:** games.cognotik.com (static, client-side browser game)
**Genre tags:** Physics · Simulation · Emergence · 3D · Engineering sandbox **Tech level (fiction):** ~2080, no exotic
physics

---

## 1. Summary

Labrek is a microgravity engineering sandbox. You land a small robotic seed package on a real, tumbling,
self-gravitating asteroid. You anchor, mine, process and build. Eventually you turn the rock itself into a spacecraft
and push it onto a target orbit.

The simulation is **mutual and physical**:

- Every voxel has mass.
- Every body both produces and responds to gravity.
- Every force, including thrust, recoil, drilling and a robot pushing off a surface, loads the structure.
- Bolt a large chemical engine onto a rubble pile and fire it: the rubble pile comes apart.
- Lopsided, tumbling, precessing, tethered, reconfigured bodies are a design target, not an edge case.

One-line pitch: *"The asteroid is a ship you didn't build — and it doesn't want to be one."*

---

## 2. Design Pillars

1. **Physics is the game.** No hidden rules that contradict the simulation. If it happens, it happened because of mass,
   force, bonds and heat.
2. **Local Newtonian fidelity.** Everything stays within a near-term (~2080) energy regime:
    - no reactionless drives
    - no interstellar hand-waving
    - no Kardashev-scale fantasy
3. **Emergent failure is content.** Fragmentation, avalanches, spin-up, outgassing jets and yeeted robots are the core
   drama.
4. **Hands-on engineering.** The player places, anchors, fires and fixes. Automation is local and limited. This is not a
   logistics idle game.
5. **Instant, installless play.** Pure static HTML/CSS/JS with no accounts and no server, matching the rest of the
   Cognotik catalog.

### Positioning (why this game)

The asteroid encounter is the most Kerbal-native piece of space industry: land on a body, attach things, change its
orbit. It is essentially a dynamic ship builder where the hull is a rock. Interstellar colonies require
civilization-scale energy and logistics that a local physics sandbox cannot represent without ignoring physics. Labrek
deliberately stays in the regime where full physical fidelity is possible and fun.

---

## 3. Scope

### 3.1 In scope (v1)

- A single asteroid system: one primary body plus the fragments, debris and player constructs it spawns.
- A voxel-based body representation with material properties and a bond graph.
- Rigid-cluster dynamics with dynamic splitting (fracture) and merging (accretion or welding).
- Mutual gravity between all clusters; body-frame gravity fields for large clusters.
- A structural stress solver that drives bond failure.
- Robots, equipment modules, construction and mining.
- A mass driver and other propulsion.
- Heliocentric orbit representation of the system's barycenter, with delta-v feedback into orbital elements.
- A procedural asteroid generator (seeded, deterministic).
- Mission scenarios and a free sandbox.
- Save/load (localStorage plus JSON export/import).

### 3.2 Out of scope (v1)

- Multi-asteroid logistics and interplanetary transfers. Possible v2.
- Crewed habitats and life support.
- Atmospheric flight and planetary surfaces.
- Relativistic or n-body heliocentric integration. Heliocentric motion is a two-body conic.
- Multiplayer.
- Detailed electrical or thermal networks. v1 uses aggregate budgets per cluster.

### 3.3 Non-goals

- Photoreal graphics.
- A Factorio-style full production chain.
- Scripted or narrative campaigns beyond lightweight mission briefs.

---

## 4. Physical Model

### 4.1 Units, constants and scale

| Quantity                  | Value                                                                     |
|---------------------------|---------------------------------------------------------------------------|
| Units                     | SI throughout (m, kg, s, N, W, J)                                         |
| Gravitational constant    | `G = 6.674e-11` (default; see §4.10 for the optional gameplay multiplier) |
| Voxel edge `L`            | 2.0 m (constant per world)                                                |
| Voxel face area `A_face`  | 4 m²                                                                      |
| Voxel volume `V_vox`      | 8 m³                                                                      |
| Typical asteroid diameter | 16–120 m (≈ 8–60 voxels across)                                           |
| Voxel budget              | ≤ 64k active voxels total (see §9)                                        |

**Sanity reference:** a 50 m-radius rubble pile with bulk density 1800 kg/m³ has:

- mass M ≈ 9.4e8 kg
- surface gravity g ≈ 2.5e-5 m/s²
- escape speed ≈ 5 cm/s
- spin breakup period ≈ 2.5 h

These are realistic numbers, and they are the core of the feel. A robot hopping at 10 cm/s leaves the asteroid forever.

### 4.2 Representation

**Voxel** (fine-grained mass and material element), stored in structure-of-arrays form:

- `pos` — position in its cluster's body frame (integer lattice coordinates)
- `mat` — material id (see §5)
- `mass` — computed as `density[mat] * V_vox * fill`, where `fill` ∈ (0,1] for partial voxels, porosity or damage
- `temp` — temperature (K); coarse, used for volatiles and sintering
- `volatile` — remaining volatile mass (kg)
- `damage` — accumulated fatigue, 0..1
- `cluster` — owning cluster id
- `module` — optional equipment module id occupying the voxel

**Bond** (connection between two face-adjacent voxels, or a long-range tether):

- `a`, `b` — voxel indices
- `type` — cohesion, sinter, weld, clamp, electrostatic, adhesive, cable (see §6.2)
- `strengthT` — tensile force limit (N)
- `strengthS` — shear force limit (N)
- `strengthC` — compressive force limit (N); usually large
- `restLen` — rest length (cables only)
- `load` — last computed load vector (for UI and fatigue)
- `alive` — whether the bond is intact

**Cluster** (a rigid body: a connected component of the intact bond graph, excluding cables):

- `X` — center-of-mass position (world)
- `V` — linear velocity
- `q` — orientation quaternion
- `ω` — angular velocity (world)
- `M` — total mass
- `I_body` — inertia tensor about the COM in the body frame; its inverse is cached
- `voxels[]` — index list
- `aabb` — bounding box (body frame)
- `gravGrid` — optional body-frame gravity field grid (§4.4)
- `sleeping` — quiescence flag for time warp
- `thermal` — aggregate heat budget (§8)

**Cable tethers** connect voxels in *different* clusters. They are simulated as unilateral spring-dampers (tension only)
between clusters. They are what make weird tethered, rotating aggregates possible.

### 4.3 Reference frames

- **Local frame:** a non-rotating inertial frame co-moving with the barycenter of the asteroid system. All local
  dynamics run here.
- **Heliocentric frame:** the barycenter follows a Keplerian orbit around the Sun, stored as orbital elements.
    - Net momentum that leaves the system (mass-driver pellets, exhaust) is converted into a barycenter Δv each step,
      and the orbital elements are updated.
    - Tidal terms from the Sun are neglected in v1 (≈1e-13 m/s² per meter at 1 AU). An optional flag enables them.
- **Re-centering:** when the barycenter drifts far from the local origin, the local frame is periodically shifted to
  preserve float precision. All state is Float64.

### 4.4 Gravity

Everything attracts everything. The cost is controlled with three mechanisms:

1. **Cluster–cluster (far field):**
    - Each cluster acts as a multipole source with mass, COM and a quadrupole term derived from `I_body`.
    - Pairwise when there are ≤ 32 clusters; otherwise a Barnes–Hut octree over cluster COMs with θ = 0.6.
    - Monopole plus quadrupole is used when separation exceeds 2× the cluster radius.
2. **Near field / large clusters (body-frame gravity grid):**
    - Clusters above 2,000 voxels get a coarse 3D grid in their body frame. The spacing is 2L, and the grid extends 1.5×
      the AABB.
    - Each grid cell stores the gravitational acceleration vector, computed by summing over voxels. Voxel groups more
      than 8 cells away are lumped (octree summation).
    - Small objects near or on the body (robots, debris, loose regolith) sample this grid with trilinear interpolation.
      The sample is rotated by the cluster's `q`.
    - The grid is recomputed when the cluster's mass changes by more than 0.5% or its topology changes. The work is
      spread over multiple frames in a Web Worker.
    - This produces correct lumpy gravity: gravity points "downhill" toward mass concentrations, not toward the
      geometric center, and the effective surface slope includes the centrifugal term.
3. **Self-gravity inside a cluster** does not move the cluster (internal forces cancel). It does load bonds, via the
   stress solver's per-voxel gravity term (§4.6). Self-gravity is what holds rubble piles together.

**Loose particles** (regolith fluidized by drilling, jets or impacts) are point masses in a particle pool (§4.8). They
feel gravity but do not source it individually. Their total mass is added to a "dust cloud" pseudo-source when above
0.1% of system mass.

### 4.5 Rigid-body dynamics

Each step, for each cluster:

1. **Accumulate external force F and torque τ (about the COM):**
    - gravity from other clusters, integrated per voxel group
    - module forces: thrusters, mass-driver recoil, reaction-wheel torques
    - contact impulses (converted to an equivalent force over the step)
    - cable tensions
    - outgassing jets
2. **Translate:** `V += (F/M)·dt`, then `X += V·dt`. This is semi-implicit (symplectic) Euler.
3. **Rotate:** compute the world inertia `I = R I_body Rᵀ`.
    - Update angular velocity with `ω̇ = I⁻¹(τ − ω × Iω)`.
    - The gyroscopic term uses an implicit correction to avoid energy blow-up for elongated bodies (Catto-style implicit
      gyroscopic solve).
    - Integrate the quaternion as `q += ½·[ω,0]⊗q·dt`, then normalize.
4. **Diagnostics:** track total linear momentum, angular momentum and energy for debug overlays and tests (§11).

Tumbling non-principal-axis rotation, precession and Dzhanibekov flips must emerge naturally from step 3. These are
explicit acceptance tests.

### 4.6 Structural stress solver (fracture driver)

**Goal:** compute the load carried by every bond in a rigid cluster from the forces actually acting on it, then break
bonds that exceed their limits.

**Per-voxel residual force:** in a rigid cluster, every voxel `i` must accelerate with the body. The rigid acceleration
at body offset `r_i` is:

~~~
a_i = A + α × r_i + ω × (ω × r_i)
~~~

where `A = F/M` is the COM acceleration and `α = ω̇`. The residual force voxel `i` needs from its neighbors is:

~~~
f_i = m_i·a_i − (m_i·g_i + F_ext,i)
~~~

Here `g_i` is gravity at the voxel, including self-gravity from the body grid. `F_ext,i` is any force applied directly
to that voxel, such as a thruster mount, a drill reaction or contact. The sum of `f_i` over the cluster is zero by
construction.

**Load propagation (v1: weighted spanning tree):**

1. Build a maximum spanning tree of the cluster's bond graph, weighted by bond strength, rooted at the voxel nearest the
   COM.
2. Traverse from the leaves toward the root. The load on the bond connecting a subtree is the sum of `f_i` over that
   subtree. The subtree's moment about the bond midpoint gives bending, used as additional shear.
3. **Parallel-bond sharing:** bonds that cross the same subtree cut are non-tree bonds joining the subtree to the rest
   of the cluster. They share the cut load in proportion to their stiffness. This removes most of the pessimism of a
   pure tree.
4. Cost is O (N) per evaluation.

**Load propagation (v2, optional):** a Gauss–Seidel relaxation of a linear-elastic bond network, warm-started from the
tree solution. Run 4–8 iterations per frame on clusters under active load.

**Failure rule** (per bond, with the load split into axial and shear components):

- Break if `axial > strengthT` (tension), `−axial > strengthC` (compression), or `|shear| > strengthS`.
- **Fatigue:** if load exceeds 60% of a limit, then `damage += (load/limit − 0.6)·dt·k_fatigue`. Effective strength is
  scaled by `(1 − damage)`.
- **Rate limiting:** at most N_break = 256 bonds break per step. The most over-stressed bonds break first; the solver
  re-runs the next step. This keeps cascades stable and visible over several frames instead of shattering in one tick.

**When to evaluate:**

- every step for clusters with active thrust, contact or drilling, or with `|α|` or `|ω|` changing faster than a
  threshold
- otherwise every 30 steps
- sleeping clusters: on wake only

**Worked example (the design target):** a 50 kN chemical engine is bolted onto a single regolith voxel of a 9.4e8 kg
rubble pile.

- The mount voxel's bonds have a tensile limit of about 100 Pa × 4 m² = 400 N.
- The residual force at the mount is ≈ 50 kN.
- The bonds fail on the first step, and the engine tears off with a handful of voxels.
- The same engine on a nickel-iron plate anchored by piton drills and a cable net spreads the load over hundreds of
  bonds and survives.

This contrast is the core engineering lesson of the game.

### 4.7 Topology changes: split and merge

**Split.** After any bond breaks:

- Run union-find over the affected cluster's intact non-cable bonds.
- Each component becomes a new cluster. Its `M`, `X`, `I_body` and AABB are recomputed from its voxels.
- Velocities are inherited as the rigid-body velocity at the new COM, `V_new = V + ω × (X_new − X)`, with `ω_new = ω`.
  This conserves linear and angular momentum exactly.
- The gravity grid is invalidated and marked for rebuild.

Components of ≤ 4 voxels are demoted to **debris particles** (§4.8) if they are also moving faster than the parent's
escape speed. Otherwise they stay as small clusters.

**Merge (accretion / welding).**

- When two clusters are in resting contact (relative velocity at contact < 1 mm/s for more than 2 s), the touching
  regolith faces form weak cohesion bonds. The clusters merge.
- Player bonds (weld, clamp, adhesive) merge clusters immediately.
- On merge, the new cluster's `V` and `ω` are chosen to conserve total linear and angular momentum.

**Mass change.** Mining, deposition and module placement update the mass and inertia incrementally:

- `I_body` supports O (1) add/remove per voxel using parallel-axis bookkeeping.
- The COM shift is applied by re-basing voxel coordinates lazily.

### 4.8 Particles (loose material)

A pooled particle system handles regolith dust, mass-driver pellets, ejecta and small debris.

- Each particle has position, velocity, mass, material and lifetime.
- Particles feel gravity from clusters (grid or multipole).
- Collisions with clusters use the body's voxel occupancy. Response is a restitution coefficient of 0.1–0.3 for
  regolith.
- **Re-deposition:** a slow particle (< 30% of local escape speed) that touches a surface re-attaches as partial voxel
  fill.
- **Escape:** particles beyond the system's Hill-sphere radius (or a configurable bound, default 20 km) are removed.
  Their momentum is booked into the barycenter Δv.
- **Cap:** 20k particles. Oldest and slowest particles are aggregated into coarser particles when over budget.

### 4.9 Contacts and collisions

- **Broad phase:** a sweep-and-prune over cluster AABBs, plus a spatial hash for particles.
- **Narrow phase:** voxel-vs-voxel overlap using body-frame occupancy lookups. The smaller cluster's surface voxels are
  tested against the larger cluster's occupancy grid.
- **Response:** sequential impulses with friction (μ from the materials table) and restitution.
    - Contact impulses are fed into the stress solver as `F_ext,i` for the touching voxels, so impacts can fracture
      bodies.
- **Speeds:** impacts in this regime are cm/s to m/s. Tunneling is not a concern except for mass-driver pellets. Pellets
  use swept ray tests.

### 4.10 Time integration and time warp

- Fixed physics step `dt = 1/60` s of simulated time at 1× speed.
- Time warp levels: 1×, 10×, 100×, 1,000×, 10,000×, 100,000×.
    - **1×–100×:** full simulation with substeps. The step count is capped per frame; the effective warp drops
      automatically if over budget.
    - **≥ 1,000×:** allowed only when the system is quiescent. That means:
        - no active thrust
        - no contacts changing
        - no pending fractures
        - all clusters either sleeping or on stable mutual orbits
    - At high warp, clusters coast analytically: torque-free rigid rotation plus pairwise conic or Barnes–Hut
      propagation with a large step. The heliocentric orbit advances analytically.
    - Any event (a scheduled burn, a detected approach, a module timer) drops warp back to 1×.
- **Mass drivers at warp:** the rate of fire is honored by batching shots per step with their aggregate impulse. Warp is
  capped at 100× while a mass driver is active and the stress margin is < 2×.
- **Gameplay gravity multiplier** (sandbox option): `G × {1, 10, 100}`. Default missions use 1×. The UI labels non-1×
  worlds as "unphysical."

### 4.11 Determinism

- The simulation is deterministic for a given seed, inputs and build. This requires:
    - fixed step
    - stable iteration orders (sorted ids)
    - a seeded PRNG (`mulberry32` / `sfc32`)
    - no `Math.random` in the simulation
- Replays are stored as seed plus input log. They are used for regression tests (§11) and for sharing via exported JSON.

---

## 5. Geology

### 5.1 Voxel materials

Strength values are per unit face area. Bond limits are `strength × A_face × fill`.

| ID    | Material                 | Density (kg/m³) | Tensile (Pa) | Shear (Pa) | Friction μ | Volatiles (kg/m³) | Thermal notes                                           |
|-------|--------------------------|-----------------|--------------|------------|------------|-------------------|---------------------------------------------------------|
| `REG` | Regolith (loose)         | 1300–1700       | 25–500       | 50–1,000   | 0.6        | 0–50              | Insulating; lofts easily                                |
| `SIN` | Sintered regolith        | 2000–2400       | 2e6–1e7      | 3e6–1.5e7  | 0.7        | 0                 | Brittle under shock (low fatigue limit)                 |
| `SIL` | Silicate / basalt rock   | 2800–3200       | 5e6–1.5e7    | 1e7–3e7    | 0.7        | 0–5               | Predictable fracture planes (anisotropic option)        |
| `NFE` | Nickel-iron              | 7600–8000       | 3e8–5e8      | 2e8–3.5e8  | 0.4        | 0                 | Conductive; ductile (high fatigue tolerance)            |
| `ICE` | Water/CO₂ ice            | 900–1600        | 5e5–1.5e6    | 5e5–1e6    | 0.2        | 500–900           | Sublimates above ~180 K in vacuum; jets                 |
| `CAR` | Carbonaceous             | 1500–1900       | 1e5–1e6      | 2e5–1.5e6  | 0.6        | 100–300           | Releases volatiles on heating                           |
| `CMP` | Composite frame (built)  | 1600            | 5e8          | 3e8        | 0.5        | 0                 | Engineered; the default engine mount                    |
| `SAL` | Smart-alloy beam (built) | 4500            | 8e8          | 5e8        | 0.4        | 0                 | Vibration damping (reduces fatigue in its neighborhood) |

Ranges are sampled per voxel from the body's seeded noise field. This gives heterogeneity, so weak seams exist.

**Bond strength between different materials** uses the harmonic mean of the two strengths, multiplied by a compatibility
factor:

| Pair            | Compatibility factor |
|-----------------|----------------------|
| `REG`–`REG`     | 1.0 (already weak)   |
| `ICE`–anything  | 0.5                  |
| `NFE`–`NFE`     | 1.0                  |
| `NFE`–`CMP`     | 1.0                  |
| Everything else | 0.8                  |

### 5.2 Asteroid classes (procedural archetypes)

| Class              | Structure                                          | Composition mix               | Porosity | Signature behavior                                          |
|--------------------|----------------------------------------------------|-------------------------------|----------|-------------------------------------------------------------|
| **Rubble pile**    | Many boulders in a regolith matrix; internal voids | `REG`, `SIL`, some `CAR`      | 30–50%   | Fragile; spins apart; mass drivers OK, rockets disastrous   |
| **Monolith**       | Single coherent body with a regolith veneer        | `SIL`, thin `REG`             | < 10%    | Supports embedded construction and larger engines           |
| **Stratified**     | Layered shells or planar strata                    | Alternating `SIL`/`REG`/`NFE` | 10–25%   | Mining one layer destabilizes others; shear planes          |
| **Cometary**       | Ice-rich core, dust mantle                         | `ICE`, `CAR`, `REG`           | 40–70%   | Sublimation jets; thermal instability                       |
| **Metal fragment** | Dense core fragment                                | `NFE` with some `SIL`         | < 5%     | High inertia; hard to mine; excellent structure             |
| **Contact binary** | Two lobes joined by a weak neck                    | Any two of the above          | Varies   | Neck fails under spin or thrust; a built-in drama generator |

### 5.3 Procedural generation (seeded)

1. **Shape:** a superellipsoid or two-lobe base, perturbed by 3D fractal noise. For rubble piles, instead sample a set
   of Poisson-disk boulders, each with its own noise, and fill the gaps with a regolith matrix up to the target
   porosity. Include a crater stamping pass.
2. **Composition:** a class-specific material field made of noise thresholds, strata planes and core/mantle radii.
3. **Initial spin:**
    - Sample the period from a class-appropriate distribution, clamped to ≥ 1.2× the body's breakup period.
    - The spin axis is random.
    - With 20% probability, give the body a non-principal-axis tumble.
4. **Settling pass:**
    - Run the stress solver once, with gravity and centrifugal loads only.
    - Delete or demote any voxels that would fail immediately (overhangs beyond cohesion).
    - Iterate up to 3 times so the body starts in equilibrium.
5. **Heliocentric orbit:** a near-Earth-object-like element distribution. Missions override it.

**Output:** voxel arrays, bonds, a seed string, and a human-readable "survey report." The report lists mass, dimensions,
spin period, breakup period, escape speed, class and dominant materials.

### 5.4 Geological events (emergent, not scripted)

| Event                 | Cause                                                                                               | Effect                                                                              |
|-----------------------|-----------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Micro-avalanche       | Mining or spin change pushes a surface slope past the angle of repose (friction μ plus centrifugal) | Surface voxels detach into particles, flow downhill and re-deposit                  |
| Sublimation jet       | `ICE`/`CAR` voxel temperature exceeds the threshold (sunlight, furnace heat, drilling)              | Directed thrust from voxel mass loss, applied to the voxel as `F_ext`; changes spin |
| Internal collapse     | Excavation removes support; roof bonds fail under self-gravity                                      | Cavity closes; mass redistributes; inertia changes                                  |
| Fragmentation cascade | Over-limit thrust or impact                                                                         | Rate-limited bond failure chain; fragments collide and re-accrete                   |
| Neck failure          | Contact-binary spin-up                                                                              | The two lobes separate into a mutual orbit (binary asteroid)                        |

---

## 6. Equipment and Construction (~2080 tech)

### 6.1 Modules

Modules occupy one or more voxels and carry mass. They apply forces through their mount voxels only. That is what makes
mounting design matter.

| Module                         | Mass     | Footprint            | Power                       | Key stats                                          | Notes                                                    |
|--------------------------------|----------|----------------------|-----------------------------|----------------------------------------------------|----------------------------------------------------------|
| **Seed lander**                | 2,000 kg | 2×2×1                | Solar 20 kW                 | Carries 4 robots and starter stock                 | Mission start package                                    |
| **Solar wing**                 | 150 kg   | 1×1 plus a 4×1 wing  | +8 kW (1 AU)                | Scales as 1/r²; fragile (breaks at 5 N·m bending)  | The wing is a separate cable-mounted light cluster       |
| **Micro-reactor**              | 3,000 kg | 2×2×2                | +200 kWe, 600 kW waste heat | Needs radiators                                    | Mid-game unlock                                          |
| **Radiator panel**             | 80 kg    | 1×1 plus a 3×1 panel | Rejects 25 kW at 400 K      | Fragile                                            | See §8                                                   |
| **Battery bank**               | 500 kg   | 1×1×1                | 500 kWh                     | —                                                  | —                                                        |
| **Cold-gas thruster**          | 20 kg    | 1                    | 0                           | 50 N, Isp 70 s                                     | Uses volatiles                                           |
| **Ion / Hall array**           | 300 kg   | 1×1×1                | 50 kW                       | 2 N, Isp 2,000 s                                   | Safe on rubble                                           |
| **Arcjet**                     | 150 kg   | 1                    | 100 kW                      | 20 N, Isp 600 s                                    | Uses water                                               |
| **Chemical engine**            | 1,500 kg | 2×2×2                | 0                           | 50 kN, Isp 350 s                                   | Tears weak bodies; needs a frame                         |
| **Mass driver**                | 4,000 kg | 1×1×6 (rail)         | 200 kW                      | 10 kg pellets at up to 300 m/s, ≤ 1 Hz             | Consumes regolith; recoil at the breech and mount voxels |
| **Reaction wheel**             | 200 kg   | 1                    | 2 kW                        | 500 N·m, 50 kN·m·s storage                         | Saturates; can overload weak bonds                       |
| **CMG cluster**                | 1,200 kg | 2×2×1                | 10 kW                       | 5 kN·m                                             | Late game                                                |
| **Micro-drill**                | 100 kg   | 1                    | 10 kW                       | 0.2 m³/min in `REG`; 0.02 in `SIL`; 0.005 in `NFE` | Reaction load on the robot and anchor                    |
| **Regolith scoop**             | 60 kg    | 1                    | 2 kW                        | 1 m³/min loose material                            | Collects particles and `REG`                             |
| **Electrostatic funnel / net** | 200 kg   | 2×2×1                | 5 kW                        | Captures particles within 10 m                     | Dust management                                          |
| **Sinter furnace**             | 800 kg   | 2×2×2                | 60 kW                       | `REG` → `SIN` voxels, 1 per 10 min                 | Heat source; may trigger local jets                      |
| **Volatile extractor**         | 600 kg   | 2×2×1                | 40 kW                       | Extracts volatiles from `ICE`/`CAR`                | Feeds thrusters                                          |
| **Metal refinery**             | 2,500 kg | 2×2×3                | 150 kW                      | Produces metal stock from `NFE`/`CAR`              | Enables `CMP`/`SAL`                                      |
| **Structure printer**          | 400 kg   | 1×1×2                | 20 kW                       | Prints `CMP`/`SAL` voxels from stock               | Mounted on a robot or on rails                           |

### 6.2 Bond types (player-applied)

| Bond               | Tensile                          | Shear        | Compressive | Notes                                                       |
|--------------------|----------------------------------|--------------|-------------|-------------------------------------------------------------|
| Cohesion (natural) | per material                     | per material | high        | Regolith self-bonding and accretion                         |
| Sinter             | per `SIN`                        | per `SIN`    | high        | Created by the furnace on adjacent `REG`                    |
| Micro-weld         | 5e5 N                            | 4e5 N        | very high   | Metal/composite only; brittle (low fatigue tolerance)       |
| Mechanical clamp   | 1e5 N                            | 2e4 N        | very high   | Works on any voxel; weak in shear                           |
| Electrostatic      | 2e3 N                            | 5e2 N        | 1e4 N       | Reversible; draws 0.5 kW each                               |
| Smart adhesive     | 5e4 N                            | 3e4 N        | high        | Reversible by robot; slow to cure (60 s)                    |
| Cable / tether     | 2e5 N (tension only)             | —            | —           | Inter-cluster; length 1–500 m; spring-damper model          |
| Piton anchor       | 2e4 N pull-out × material factor | same         | —           | Driven into `SIL`/`NFE` (×1.0), `REG` (×0.02), `ICE` (×0.3) |
| Harpoon            | 5e3 N pull-out × material factor | —            | —           | Fired from range; used for first contact                    |

### 6.3 Construction modes

- **Surface:** place modules on surface voxels and bond them. Cheap, weak.
- **Embedded:** drill a cavity and seat modules inside rock. Strong in competent rock; risks internal collapse in
  rubble.
- **Exoskeleton:** print a `CMP`/`SAL` frame or cable net around the body. This distributes thrust loads globally and is
  the canonical way to "make a rubble pile into a ship."
- **Distributed / tethered:** separate modules or clusters connected by cables. Deliberately creates rotating
  aggregates, bolas and counterweights. Spin-gravity experiments are possible.

### 6.4 Robots

Robots are small clusters (1–4 voxels) with their own dynamics. They obey all the same physics: mass, gravity, contact,
and reaction forces from their tools.

- **Chassis:** 150 kg; 1 voxel; 2 kWh battery; recharges at power modules.
- **Locomotion** (choose one):
    - *Wheeled-finger grippers:* surface crawl at 5 cm/s. Needs grip, which comes from contact normal force plus gripper
      preload, 200 N.
    - *Cord limbs:* anchor to up to 3 voxels. Can climb overhangs. Each limb is a short cable bond.
    - *Micro-thruster pod:* 2 N cold-gas; hop/fly; limited propellant.
- **Tool slot:** one of drill, scoop, printer head, bond applicator, harpoon launcher, or sensor array.
- **Autonomy (2080-plausible):**
    - Local pathfinding over the voxel surface graph.
    - A stress-aware tool governor: the robot throttles the drill if its anchor load exceeds 70%.
    - Execution of queued build orders.
    - It does **not** plan base layouts. The player does.
- **Failure modes:**
    - Detaching when the reaction force exceeds grip.
    - Being flung off by spin changes.
    - Exceeding escape speed. The robot is lost unless recovered by a thruster robot or a tether.

### 6.5 Resources and inventory

Inventory is tracked per cluster and is physical: stored stock has mass at the storage module's location.

| Resource    | Source                                     |
|-------------|--------------------------------------------|
| Regolith    | Scoop/drill of `REG`                       |
| Silicate    | Drill of `SIL`                             |
| Metal stock | Refinery                                   |
| Volatiles   | Extractor / `ICE` mining                   |
| Carbon      | `CAR` processing                           |
| Energy      | Batteries                                  |
| Pellets     | Mass-driver magazine; formed from regolith |

Transferring stock between clusters requires a robot carry, a cable-linked conveyor (v2), or a pellet toss. Toss pellets
are simulated particles and can be caught by a funnel.

---

## 7. Gameplay

### 7.1 Core loop

1. **Survey:** read the survey report; inspect the body with material and stress overlays.
2. **Approach and land:** the seed lander does a soft touchdown. First contact is by harpoon.
3. **Anchor:** pitons, nets and electrostatic pads.
4. **Power:** deploy solar; later a reactor with radiators.
5. **Extract:** drill and scoop; manage dust.
6. **Process:** sinter, extract volatiles, refine metal.
7. **Build:** frames, mounts, modules, more robots.
8. **Propel:** apply Δv with mass drivers, ion arrays or engines. Stay within structural margins.
9. **Steer:** meet the mission's orbital target, spin target or structural target.

### 7.2 Mission set (v1)

| # | Name               | Body                      | Objective                                                                              | Teaches                           |
|---|--------------------|---------------------------|----------------------------------------------------------------------------------------|-----------------------------------|
| 1 | **First Touch**    | Small monolith, slow spin | Land, anchor 3 pitons, survive a 10 cm/s hop test                                      | Microgravity, escape speed        |
| 2 | **Dust Bowl**      | Rubble pile               | Mine 50 m³ without losing a robot                                                      | Reaction forces, avalanches       |
| 3 | **Big Rocket**     | Rubble pile               | Achieve 5 mm/s Δv with a chemical engine *and* keep ≥ 90% of the mass attached         | Load distribution, exoskeletons   |
| 4 | **Slow Push**      | Rubble pile               | Change perihelion by X km with a mass driver in ≤ 1 year of game time                  | Mass drivers, time warp           |
| 5 | **Despin**         | Tumbling stratified body  | Reduce the angular rate below a threshold and null the tumble                          | Inertia tensors, torque placement |
| 6 | **Wake the Comet** | Cometary body             | Harvest 20 t of volatiles without jets spinning the body past breakup                  | Thermal management                |
| 7 | **Split Decision** | Contact binary            | Separate the lobes into a stable mutual orbit, or weld them together (player's choice) | Fracture as a tool                |
| 8 | **Iron Ship**      | Metal fragment            | Build a 50 kN-capable ship core and reach a target Δv of 1 m/s                         | Full construction stack           |
| — | **Sandbox**        | Any class, any seed       | Free play; custom G multiplier; unlimited stock toggle                                 | —                                 |

**Scoring:** optional medals for mass retained, propellant used, time taken, and robots lost.

### 7.3 Progression

- Missions unlock modules in roughly the order shown in §6.1.
- Sandbox has everything unlocked.
- There is no grind economy. Unlocks are there to teach concepts in order.

---

## 8. Thermal and Power (v1 aggregate model)

- **Per-cluster budgets:**
    - generation (solar scaled by 1/r² and a sun-facing factor, plus reactors)
    - consumption (sum of active modules)
    - storage (batteries)
- When demand exceeds supply, modules brown out by priority.
- **Heat per cluster:**
    - `Q_in` = module waste heat plus absorbed sunlight on modules
    - `Q_out` = radiator capacity × efficiency (T)
    - Net heat changes a cluster heat reservoir.
    - Over-temperature derates modules, and eventually damages them.
- **Voxel temperature:**
    - Updated only near heat sources (furnaces, drills, engine plumes) and for sunlit surface `ICE`/`CAR` voxels.
    - Uses a coarse diurnal model: surface temperature is driven by the spin phase relative to the sun direction.
    - This drives sublimation jets.
- Radiators and solar wings are physical, fragile sub-clusters. Losing them to acceleration is a real failure mode.

---

## 9. Technical Architecture

### 9.1 Constraints

- Static hosting only: plain HTML/CSS/JS ES modules with no build step, consistent with the site.
- Works in current Chrome, Firefox, Safari and Edge. Requires WebGL2 and module Web Workers.
- No network calls after load.

### 9.2 Prescribed Libraries

All libraries are ES modules, and all are MIT-licensed. They are vendored into `vendor/` at a pinned version and
never loaded from a CDN at runtime.

**Loading and version tracking:**

- Bare specifiers are resolved with an `<script type="importmap">` in `index.html`. Example: `import * as THREE from
   'three'`.
- The worker imports its (few) dependencies by relative path, because import maps do not apply inside workers in all
   target browsers.
- Exact versions, source URLs and SHA-256 hashes are recorded in `vendor/VERSIONS.md`.
- Upgrades are deliberate, one library at a time, and must pass the determinism and performance tests (§11).

**Runtime (required):**

| Library                     | Version (pin)    | Used by                | Purpose                                                                                              |
|-----------------------------|------------------|------------------------|------------------------------------------------------------------------------------------------------|
| **three.js** (`three.module.js`) | r170 (`0.170.0`) | `render/` (main thread only) | WebGL2 renderer, scene graph, cameras, `InstancedMesh`, `Points`, `BufferGeometry`, materials |
| three.js addon: `OrbitControls`  | same as three    | `render/renderer.js`   | Orbit/pan/zoom camera around the selected cluster                                                    |
| three.js addon: `BufferGeometryUtils` | same as three | `render/clusterMesh.js` | Merging chunk geometries; vertex welding for greedy-meshed voxels                                 |
| three.js addon: `CSS2DRenderer`  | same as three    | `render/overlays.js`   | Screen-space labels (cluster names, stress readouts, sun marker)                                     |
| **simplex-noise**           | `4.0.3`          | `sim/gen/asteroid.js`  | 3D/4D noise for shape and composition fields. Always constructed with the seeded PRNG from `sim/rng.js` (`createNoise3D(rng)`), never with `Math.random` |
| **fflate**                  | `0.8.2`          | `ui/` save/load, replays | Deflate compression for localStorage saves, JSON export and replay input logs (URL-fragment sharing, §14) |

**Development / debug (loaded only when `?debug` is in the URL):**

| Library                     | Version (pin)    | Purpose                                                              |
|-----------------------------|------------------|----------------------------------------------------------------------|
| **lil-gui**                 | `0.20.0`         | Tuning panel for solver constants, G multiplier, overlay parameters  |
| **stats.js** (three addon `libs/stats.module.js`) | same as three | FPS / ms-per-frame overlay                                 |

**Platform built-ins (no library needed):**

- Web Workers (`type: 'module'`) and transferable `ArrayBuffer`s for sim ↔ render messaging. This is plain
   `postMessage` with a small typed protocol in `sim/worker.js`.
- `node:test` and `node:assert` for the headless test suite. There is no test framework dependency.
- `crypto.subtle.digest('SHA-256', …)` (browser) and `node:crypto` (Node) for determinism state hashes.

**Explicitly not used:**

- **Physics engines:** cannon-es, ammo.js, Rapier, oimo.js, and all others. See §9.1.
- **UI frameworks:** React, Vue, Svelte, and anything requiring a build step or bundler. UI is plain DOM with small
   helper modules in `ui/`.
- **General utility libraries:** lodash, gl-matrix, and similar. The sim needs Float64 math with controlled operation
   order for determinism, so it owns its math. The renderer uses three.js math.
- **PRNG libraries:** seedrandom and similar. `sim/rng.js` implements `mulberry32`/`sfc32` directly (§4.11).
- **Any library fetched from a CDN at runtime.**

**Determinism note:**

- Only `simplex-noise` runs inside the simulation, and it uses only basic arithmetic and `Math.floor`. This keeps
   cross-browser bit-identical results feasible.
- Simulation code must avoid transcendental `Math` functions (`sin`, `cos`, `exp`, `pow`) in any path that affects
   state hashes, unless the value comes from a deterministic implementation in `sim/math.js`. Engines are not required
   to produce identical results for these functions.

### 9.3 File layout

~~~
games/labrek-space-mining/
  index.html            entry, UI shell
  style.css
  idea.md               this spec
   vendor/               pinned third-party ES modules (see §9.2)
     VERSIONS.md         versions, source URLs, SHA-256 hashes
     three/              three.module.js + addons/ (OrbitControls, BufferGeometryUtils, CSS2DRenderer, libs/stats)
     simplex-noise/      simplex-noise.js
     fflate/             fflate.js
     lil-gui/            lil-gui.esm.js (debug only)
  src/
    main.js             bootstrap, game state machine, input
    ui/                 panels, HUD, overlays, build palette
    render/
      renderer.js       three.js scene, camera, lighting
      clusterMesh.js    greedy-meshed voxel geometry per cluster (+ dirty rebuild)
      particles.js      instanced points
      overlays.js       stress/material/gravity/velocity visualizations
    sim/                (runs in Worker; pure, DOM-free, testable in Node)
      worker.js         message loop, step scheduling
      world.js          top-level state, step()
       math.js           Float64 vec3/quat/mat3, deterministic helpers
      voxels.js         SoA storage, material table
      bonds.js          bond storage, union-find
      clusters.js       rigid body state, inertia bookkeeping
      gravity.js        multipole, Barnes–Hut, body-frame grids
      stress.js         spanning-tree load solver, failure
      contacts.js       broad/narrow phase, impulses
      particles.js      particle pool
      modules.js        equipment behaviors
      robots.js         robot controllers
      thermal.js
      orbit.js          heliocentric elements, Δv booking
      warp.js           quiescence detection, analytic coasting
      gen/asteroid.js   procedural generator
      rng.js
    data/
      materials.json
      modules.json
      missions.json
  tests/                Node test runner (node --test), headless sim tests
~~~

### 9.4 Data layout

- Voxels are stored as structure-of-arrays typed arrays (`Int16Array` coordinates, `Uint8Array` material, `Float32Array`
  mass/temp/damage, `Int32Array` cluster). They sit in a free-list-backed pool with a capacity of 65,536.
- Bonds are stored as structure-of-arrays in the same way (`Int32Array` endpoints, `Float32Array` strengths and loads),
  with a capacity of 262,144.
- Per-cluster occupancy uses a hash map from packed coordinates to voxel index, for O (1) neighbor and contact lookups.
- All rigid-body state is `Float64Array`.

### 9.5 Threading and messaging

- The simulation runs in a dedicated Web Worker.
- The main thread sends input commands (place, drill, fire, warp) tagged with the target sim tick.
- Each frame, the worker posts a snapshot containing:
    - cluster transforms
    - dirty-cluster voxel diffs (added/removed voxel lists)
    - particle positions (transferable `Float32Array`)
    - HUD scalars
    - events (fracture, jet, robot lost)
- The renderer interpolates between the last two snapshots for smooth display.
- The gravity grid rebuild is time-sliced inside the worker. A second worker is optional if profiling shows a need.

### 9.6 Per-step pipeline

1. Apply queued inputs for this tick.
2. Update modules and robots, producing forces, mining and building.
3. Apply topology edits from mining/building: update mass and inertia; invalidate grids.
4. Compute gravity (cluster–cluster, plus grid samples for small bodies and particles).
5. Broad and narrow phase contacts; solve impulses.
6. Integrate clusters and particles.
7. Run the stress solver on active clusters and break bonds (rate-limited).
8. Split/merge clusters; conserve momentum.
9. Update thermal and power state.
10. Book escaping momentum into the barycenter Δv; update orbital elements.
11. Emit events; check warp eligibility.

### 9.7 Performance budgets (mid-range laptop, 60 fps at 1×)

| Item                                                         | Budget                                       |
|--------------------------------------------------------------|----------------------------------------------|
| Sim step (typical: 1 large body, ~20 clusters, 5k particles) | ≤ 4 ms                                       |
| Stress solve (40k-voxel cluster under load)                  | ≤ 3 ms, amortized                            |
| Gravity grid rebuild (40k voxels, 30³ grid)                  | ≤ 150 ms total, time-sliced over ≥ 10 frames |
| Render (40k voxels meshed, 5k particles)                     | ≤ 8 ms                                       |
| Memory                                                       | ≤ 300 MB                                     |

**Fallbacks:**

- reduce particle cap
- evaluate stress every Nth step
- lower the gravity grid resolution
- auto-reduce warp

---

## 10. UI / UX

Layout follows the Cognotik house style: clean, minimal, keyboard-friendly.

- **Center:** 3D view.
    - Orbit camera around the selected cluster; follow mode; free mode.
    - The sun direction is always indicated.
- **Left panel:** build palette (modules, bonds, robots) with mass, power and stress-limit tooltips.
- **Right panel:** selected-object inspector:
    - mass, COM, inertia principal axes, ω, spin period vs. breakup period
    - escape speed, stock, power/heat
- **Top bar:**
    - mission objective and progress
    - heliocentric orbit mini-diagram (current vs. target conic) and Δv booked
    - time and warp level
- **Bottom bar:** event log (fractures, jets, robots lost) with click-to-focus.
- **Overlays** (hotkeys):
    - `1` material
    - `2` bond stress (green → red by load/limit)
    - `3` gravity-plus-centrifugal effective slope
    - `4` velocity field
    - `5` temperature
    - `6` principal axes and angular momentum vector
- **Build-preview stress check:** before an engine or burn is committed, run a dry stress evaluation at full thrust and
  show the predicted failing bonds. This is the "will it hold?" button.
- **Burn planner:** set thrust level, duration and direction. It shows predicted Δv, torque and margin. Burns can be
  scheduled and executed under warp.
- **Controls:**
    - mouse: orbit/pan/zoom
    - `WASD`: robot direct control when a robot is selected
    - `Space`: pause
    - `,` / `.`: warp down/up
    - `F`: focus selection
    - `B`: build mode
    - `Ctrl+Z`: undo placement (sandbox only, before any sim tick)
- **Accessibility:**
    - colorblind-safe stress palette
    - UI scale setting
    - reduced-motion option (no camera shake on fracture)

---

## 11. Testing and Validation

Headless simulation tests run in Node (`node --test`), since `sim/` is DOM-free.

**Conservation**

- An isolated two-cluster system with no thrust conserves:
    - linear momentum to 1e-9 relative over 10⁵ steps
    - angular momentum to 1e-6 relative
- Energy drift stays < 1e-4 over 10⁵ steps for a two-body mutual orbit.
- Split and merge conserve linear and angular momentum exactly (to float tolerance).

**Rigid-body correctness**

- Torque-free rotation about the intermediate axis exhibits a Dzhanibekov flip at the analytically predicted period
  (±5%).
- An asymmetric body with an off-axis thruster reproduces the analytic precession rate.

**Gravity**

- The body-frame grid for a uniform sphere matches `GM/r²` outside and a linear interior field to ≤ 1% error.
- A contact-binary grid points toward the lobes, not the geometric center.

**Structure**

- **"Big Rocket" regression:**
    - A 50 kN engine on bare regolith detaches within 1 s.
    - The same engine on a `CMP` frame with a net holds for 60 s with a margin > 1.
- A rubble pile spun to 0.9× its breakup period stays intact. At 1.1× it sheds mass from the equator.
- The settling pass produces zero failures on the first real step.

**Determinism**

- The same seed and input log produce bit-identical state hashes at tick 10⁴ across two runs and across Chrome/Firefox.

**Performance**

- A benchmark scenario reports ms per step. CI flags regressions > 20%.

**Playtest checklist per milestone**

- Can a new player understand why their rock broke? Check the stress overlay and the event log.
- Is the warp flow comfortable for multi-month mass-driver campaigns?

---

## 12. Milestones

| Milestone                           | Deliverable                                                                          | Exit criteria                                                          |
|-------------------------------------|--------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| **M0 — Skeleton**                   | Page shell, vendored libraries + import map (§9.2), three.js scene, worker messaging, RNG, material table | Renders a static generated asteroid; `vendor/VERSIONS.md` complete     |
| **M1 — Rigid core**                 | Clusters, inertia, integration, cluster–cluster gravity, contacts                    | Conservation and Dzhanibekov tests pass; two rocks orbit and collide   |
| **M2 — Structure**                  | Bonds, stress solver, fracture, split/merge, settling pass                           | "Big Rocket" and spin-breakup tests pass; stress overlay               |
| **M3 — Body gravity and particles** | Body-frame grids, particle pool, re-deposition, avalanches                           | Contact-binary gravity test; dust behaves plausibly                    |
| **M4 — Equipment and robots**       | Modules (thrusters, mass driver, drill, scoop, anchors), robots, power               | Missions 1–3 playable                                                  |
| **M5 — Industry and orbit**         | Furnace, extractor, refinery, printer, thermal, heliocentric orbit, warp             | Missions 4–6 playable; year-long campaigns run under warp              |
| **M6 — Polish and launch**          | Missions 7–8, sandbox options, save/load, burn planner, stress preview, catalog card | All tests green; performance budgets met; listed on games.cognotik.com |

---

## 13. Risks and Mitigations

| Risk                                                           | Mitigation                                                                                                                   |
|----------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| The stress solver is too pessimistic or noisy (tree artifacts) | Parallel-bond cut sharing in v1; v2 relaxation solver; tune against the regression scenarios                                 |
| Fracture cascades freeze the frame                             | Rate-limit bond breaks per step; defer split recomputation to the end of the step                                            |
| Real-scale gravity feels "nothing happens"                     | Time warp, visible slope/escape overlays, and the sandbox G multiplier; missions sized so outcomes arrive in minutes of play |
| Precision loss far from the origin                             | Float64 state; periodic local-frame re-centering                                                                             |
| Voxel count blows the budget on large bodies                   | Cap body size per class; coarser voxels (L = 4 m) for bodies > 120 m                                                         |
| Mesh rebuild stutter on heavy mining                           | Chunked meshing per cluster (8³ chunks); rebuild only dirty chunks                                                           |
| Scope creep toward logistics or colonies                       | Out-of-scope list (§3.2) is binding for v1                                                                                   |

---

## 14. Open Questions

1. Anisotropic fracture planes for `SIL` in v1, or defer?
2. Should robots be fully simulated clusters at all times, or on rails when idle and anchored (perf vs. purity)?
3. Should the sandbox allow spinning a tethered habitat for artificial-gravity experiments with visual crew stand-ins?
   That would be flavor only, not life support.
4. Should missions support a replay share link (seed plus input log compressed into the URL fragment)?
5. Should a v2 multi-asteroid mode reuse the same local-frame engine with heliocentric hand-offs, or use a separate map
   layer?

---

## 15. Catalog Card Copy (draft)

> **Labrek Space Mining** — Land on a tumbling rubble pile with a handful of robots and turn it into a spacecraft. Every
> voxel has mass, every body pulls on every other, and every push pushes back. Strap a big rocket to loose gravel and
> watch it come apart; build a frame, net the rock, and try again. Real microgravity, real inertia, real fracture — in
> your browser.
- Vendored, pinned, small libraries only. The prescribed list is in §9.2; nothing else may be added without amending
   this spec.
- No physics library. The engine is custom, because no off-the-shelf engine does mutual gravity, bond-graph fracture
   and dynamic cluster splitting.
- `sim/` must not import three.js or any DOM-dependent library. This keeps the simulation runnable in Node for tests
   (§11). The simulation uses its own small Float64 vector/quaternion/matrix module (`sim/math.js`).