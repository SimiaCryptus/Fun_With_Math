# Forge of the Rings — Project Specification

**Version:** 0.1 (draft)
**Target platform:** Modern desktop browsers (Chrome/Edge/Firefox/Safari, WebGL2)
**Stack:** HTML5 + native ES modules (no bundler required) + three.js (r160+)
**Source of concept:** `idea.md`

---

## 1. Vision

Forge of the Rings is an interactive sandbox for building and simulating particle rings.
Universe Sandbox is a general N-body toy. This project instead targets the regime where rings actually live:

- weak forces dominate: gravity from a central body, electrostatic charging of grains, and Lorentz forces from magnetic fields;
- collective granular dynamics matter: collisions, damping, clumping and wakes;
- small perturbations have visible, long-term consequences, such as shepherd moons, resonances and field changes.

The core design principle:

> **The simulator is a field-topology editor disguised as a physics toy.**
> Users sculpt fields (gravity, electric, magnetic). Rings *emerge* from the resulting force balance.
> Rings are never scripted.

The signature feature is the **Manifold View**. It visualizes *why* a ring exists at a given radius by showing:

- radial force balance;
- effective potential;
- stable and unstable equilibria.

---

## 2. Goals and Non-Goals

### 2.1 Goals

1. Real-time simulation of 10k–100k particles at 60 fps on a mid-range GPU laptop. Graceful degradation is required.
2. Physically grounded, tunable force models:
   - central gravity (point mass + J2 oblateness);
   - moons / perturbers;
   - grain charging;
   - radial E-fields;
   - dipole / multipole / coil B-fields;
   - collisions with restitution;
   - drag.
3. Direct-manipulation tools: field painting, particle injection, perturbation events.
4. Diagnostic visualization:
   - force-balance curves;
   - effective potential plots;
   - field lines;
   - particle traces;
   - radial density histogram.
5. Save, load and share scenes as JSON. Scenes can be encoded in URL hashes.
6. A modular ES codebase with no build step. It runs from any static file server.

### 2.2 Non-Goals (v1)

- Research-grade accuracy (e.g., full PIC plasma simulation, relativistic effects).
- Full self-gravity N-body. v1 uses local approximations only; see §4.6.
- Mobile touch-first UX. Mobile should function, but it is not optimized.
- Multiplayer or cloud storage.

---

## 3. User Experience

### 3.1 Layout

- **Viewport (center):** three.js canvas with orbit camera.
- **Left toolbar:** mode selection:
  - Select;
  - Field Paint;
  - Inject;
  - Perturb;
  - Probe.
- **Right inspector:** context-sensitive parameters for the selected entity or tool.
- **Bottom timeline:**
  - play/pause, step, time-scale slider (log scale, 1e-3× to 1e6×);
  - sim clock;
  - fps / particle count.
- **Overlay panel (toggle `M`):** Manifold View with 2D plots rendered to a separate canvas.

### 3.2 Modes

| Mode        | Purpose                                         | Primary interaction                                     |
|-------------|-------------------------------------------------|---------------------------------------------------------|
| Select      | Pick and edit bodies, sources, emitters         | Click to select; drag gizmo to move                     |
| Field Paint | Sculpt E/B/density/shear fields on a polar grid | Drag brush on the ring plane; shift = subtract          |
| Inject      | Spawn particles                                 | Click = burst; drag = stream; parameters in inspector   |
| Perturb     | Trigger events                                  | Choose event from palette; apply globally or at cursor  |
| Probe       | Inspect local physics                           | Hover shows force vectors; click pins a trace particle  |

### 3.3 Perturbation Events (v1)

- **Solar storm:** temporary change in grain charging rate and plasma potential.
- **Magnetic reversal:** B-field dipole flips over a user-set duration.
- **Charge flip:** instantly negates all grain charges.
- **Moon pass:** spawns a perturber on a chosen orbit.
- **Meteoroid stream:** high-velocity particle influx from a chosen direction.
- **Impulse:** radial or vertical velocity kick within the brush radius.

### 3.4 Visualization Toggles

- Particle color by: species, charge, speed, radial velocity, or collision rate.
- Field lines: B-field (streamlines from seed points) and E-field (arrow glyphs).
- Trace particles: trails of the last N positions.
- Radial density histogram (overlay).
- Roche limit ring, resonance markers (2:1, 3:2 … with moons), and the corotation radius.

---

## 4. Physics Model

### 4.1 Units

The simulation runs in **scaled units** to keep floats well-conditioned.

- Length unit L0 = central body radius (default 60,000 km, Saturn-like).
- Mass unit M0 = central body mass.
- Time unit T0 = sqrt(L0³ / (G·M0)), so that G·M = 1.
- Charge and field strengths are expressed through dimensionless coupling constants. This means users tune *effect size*, not SI values.
- The inspector shows SI equivalents for reference.

### 4.2 State per Particle

| Field      | Type     | Notes                                 |
|------------|----------|---------------------------------------|
| position   | vec3 f32 |                                       |
| velocity   | vec3 f32 |                                       |
| mass       | f32      | scaled                                |
| radius     | f32      | for collisions and rendering          |
| charge     | f32      | dynamic                               |
| species    | u8       | index into species table (ice, dust…) |
| flags      | u8       | alive, traced, pinned                 |

Storage is Structure-of-Arrays in `Float32Array`s, so that data can be transferred or shared with workers and uploaded to GPU buffers.

### 4.3 Forces

The total acceleration on particle *i* is:

    a = a_grav + a_J2 + a_moons + a_E + a_L + a_drag + a_paint

1. **Central gravity:** `a_grav = -GM · r / |r|³`
2. **Oblateness (J2):** the standard J2 perturbation term. It drives nodal precession and flattens rings into the equatorial plane over time.
3. **Moons / perturbers:** point masses on analytic Keplerian orbits in v1. They are not integrated. This keeps resonances stable and cheap.
4. **Electric field:** `a_E = (q/m) · E(r)`
   - E is the sum of: a radial planetary / plasma profile (user-editable curve), painted E-field grid samples, and optional point charges.
5. **Lorentz force:** `a_L = (q/m) · (v − Ω_B × r) × B(r)`
   - B is a dipole aligned with the rotation axis by default. A tilt is optional.
   - The field corotates with the planet at angular speed Ω_B.
   - Additional sources: quadrupole term and user-placed circular coils (Biot–Savart, precomputed to a grid).
   - The relative-velocity form produces the physically meaningful corotation / synchronous-orbit behavior.
6. **Drag:** a linear damping toward the local plasma velocity, with coefficient γ. It is optional.
7. **Painted forces:** sampled from the painted shear / density grids (see §4.5).

### 4.4 Grain Charging

Charge relaxes toward an equilibrium potential:

    dq/dt = (q_eq(r, env) − q) / τ_charge

- `q_eq` depends on species, grain radius, and environment: sunlit vs. shadow, and storm multiplier.
- `τ_charge` is user-tunable.
- This allows spokes-like phenomena when charging varies with azimuth, e.g. the planet's shadow.

### 4.5 Painted Field Grids

- Polar grids in the ring plane: default 256 radial × 512 azimuthal bins, with an optional vertical extent.
- Channels:
  - `E_r`, `E_φ`, `E_z`;
  - `B_z` addition;
  - target density;
  - shear (Δv_φ).
- Brushes apply a Gaussian kernel with strength, radius and falloff.
- Sampling uses bilinear interpolation in (r, φ).
- Grids are stored as `Float32Array` and uploaded to `DataTexture`s for visualization.

### 4.6 Collisions and Granular Dynamics

- Broad phase: uniform spatial hash in a rotating local frame, rebuilt each step. Cell size ≈ 2 × max radius.
- Narrow phase: sphere–sphere, with inelastic impulse response.
  - Normal restitution ε_n: default 0.5, optionally velocity-dependent (Bridges law).
  - Tangential friction μ.
- Aggregation: if relative speed is below v_stick and the pair lies outside the Roche limit, particles merge. Mass and momentum are conserved; radius comes from volume.
- Fragmentation: if impact speed exceeds v_frag, the particle splits into k fragments, subject to the particle budget.
- Local self-gravity (optional, costly): pairwise gravity within the hash neighborhood only. This enables wake-like clumping without O(N²) cost.

### 4.7 Integrator

- Default: **Boris pusher** combined with a leapfrog kick-drift-kick.
  - Boris handles the v×B rotation exactly and remains stable with strong B-fields.
  - Leapfrog is symplectic for the gravitational part.
- Fixed internal timestep `dt`, with sub-stepping to reach the requested time scale.
  - Max substeps per frame: default 32.
  - If exceeded, the sim clock slows and the UI shows a "time-limited" indicator.
- Adaptive guard: `dt ≤ 0.1 × min(orbital period, gyro period)` over sampled particles.

### 4.8 Stability Analysis (Manifold View)

Evaluated at the current state, for a test particle of the selected species:

- Radial force balance:
  - F_net(r) = F_grav + F_E + F_L(v_circ) − centrifugal, sampled along a user-chosen azimuth.
- Effective potential:
  - U_eff(r) = Φ_grav(r) + (q/m)·Φ_E(r) + L²/(2r²).
  - It includes the magnetic contribution via the canonical momentum.
- Equilibria are marked where F_net = 0.
  - **Stable** points satisfy dF_net/dr < 0 (restoring). They are shown in green.
  - Unstable points are shown in red.
- Also computed: epicyclic frequency κ(r) and vertical frequency ν(r). Positive κ² and ν² indicate radial and vertical stability.
- Overlays: Roche limit, moon resonances, synchronous orbit.

---

## 5. Architecture

### 5.1 Directory Layout

    forge-of-the-rings/
      index.html
      styles/
        main.css
      src/
        main.js                 # bootstrap, wires modules together
        config.js               # defaults, constants, feature flags
        core/
          EventBus.js           # tiny pub/sub
          Clock.js              # sim time, time scale, substep scheduling
          Store.js              # observable app state (tools, selection, settings)
          Scene.js              # serializable world description
        physics/
          ParticleBuffer.js     # SoA storage, alloc/free, compaction
          Species.js            # material table
          Integrator.js         # Boris + leapfrog step
          forces/
            Gravity.js          # central + J2
            Moons.js            # Keplerian perturbers
            ElectricField.js    # radial profile + grid + point charges
            MagneticField.js    # dipole, quadrupole, coils
            Drag.js
            PaintedForces.js
          Charging.js
          Collisions.js         # spatial hash, impulse, merge, fragment
          SpatialHash.js
          Diagnostics.js        # force balance, U_eff, κ, ν, histograms
          PhysicsWorld.js       # orchestrates one step
        fields/
          PolarGrid.js          # Float32 polar grid + sampling
          Brush.js              # kernels, stroke application
          BiotSavart.js         # coil field precomputation
        workers/
          physics.worker.js     # runs PhysicsWorld off main thread
          WorkerBridge.js       # main-thread proxy, message protocol
        render/
          Renderer.js           # WebGLRenderer, resize, render loop
          CameraRig.js          # OrbitControls + focus/zoom helpers
          ParticleLayer.js      # Points / InstancedMesh + custom shader
          BodyLayer.js          # planet, moons, coils
          FieldLineLayer.js     # B streamlines, E glyphs
          GridOverlayLayer.js   # painted grid visualization (DataTexture)
          TraceLayer.js         # particle trails
          Markers.js            # Roche, resonances, synchronous orbit
          shaders/
            particle.vert.js
            particle.frag.js
        tools/
          ToolManager.js
          SelectTool.js
          PaintTool.js
          InjectTool.js
          PerturbTool.js
          ProbeTool.js
          PlanePicker.js        # ray → ring-plane intersection
        ui/
          Toolbar.js
          Inspector.js          # schema-driven parameter panels
          Timeline.js
          ManifoldPanel.js      # 2D canvas plots
          Hud.js
          widgets/              # slider, curve editor, color map, etc.
        io/
          Serializer.js         # scene <-> JSON
          UrlShare.js           # compressed hash (CompressionStream)
          Presets.js
      presets/
        saturn-lite.json
        dusty-lab-trap.json
        shepherded-f-ring.json
        charge-spokes.json
      tests/
        index.html              # browser test runner
        physics/*.test.js
        fields/*.test.js
      vendor/
        three/                  # pinned three.js build (or import map to CDN)

### 5.2 Module Loading

An import map in `index.html` pins the three.js version:

    <script type="importmap">
    {
      "imports": {
        "three": "./vendor/three/build/three.module.js",
        "three/addons/": "./vendor/three/examples/jsm/"
      }
    }
    </script>
    <script type="module" src="./src/main.js"></script>

- There is no bundler. All source is native ESM.
- Modules export classes or pure functions. There are no globals, except a debug handle `window.__forge` in dev mode.

### 5.3 Data Flow

    UI / Tools ──► Store ──► EventBus ──► WorkerBridge ──postMessage──► physics.worker
                                              ▲                               │
                                              └──── state snapshot ◄──────────┘
                                                           │
                                                       Render layers

- **Physics runs in a Web Worker.** It owns `PhysicsWorld`.
- Snapshot transfer uses one of two paths:
  - **Preferred:** `SharedArrayBuffer` double-buffering. This requires COOP/COEP headers, which are documented for the dev server.
  - **Fallback:** transferable `ArrayBuffer`s, ping-ponged each frame.
- The render thread reads positions, colors and scalars into `BufferAttribute`s and marks them `needsUpdate`.
- Diagnostics (Manifold View) are computed in the worker on request, at a maximum of 4 Hz.

### 5.4 Worker Message Protocol

| Direction       | Type               | Payload                                                     |
|-----------------|--------------------|-------------------------------------------------------------|
| main → worker   | `init`             | scene JSON, buffer capacity, shared buffers (optional)      |
| main → worker   | `setParams`        | partial param object (path → value)                         |
| main → worker   | `paintStroke`      | grid channel, samples [{r, φ, strength, radius}]            |
| main → worker   | `inject`           | emitter spec (position, velocity dist, species, count)      |
| main → worker   | `event`            | perturbation event spec                                     |
| main → worker   | `step`             | { realDt, timeScale }                                       |
| main → worker   | `requestDiagnostics` | { species, azimuth, rMin, rMax, samples }                |
| main → worker   | `serialize`        | —                                                           |
| worker → main   | `frame`            | { simTime, count, buffers? , stats }                        |
| worker → main   | `diagnostics`      | { r[], Fnet[], Ueff[], kappa2[], nu2[], equilibria[] }      |
| worker → main   | `scene`            | scene JSON                                                  |
| worker → main   | `error`            | message, stack                                              |

### 5.5 Key Interfaces (sketch)

    // physics/forces/*.js — every force module implements:
    export class ForceModule {
      constructor(params) {}
      setParams(partial) {}
      /** accumulate accelerations into ax, ay, az for particles [start, end) */
      accumulate(buf, ax, ay, az, t, start, end) {}
      /** optional: contribution to diagnostics at radius r */
      radialForce(r, phi, testParticle, t) { return 0; }
      potential(r, phi, testParticle, t) { return 0; }
      toJSON() {}
    }

    // physics/PhysicsWorld.js
    export class PhysicsWorld {
      constructor(scene, capacity)
      step(dt)                      // one internal substep
      advance(realDt, timeScale)    // substep scheduling
      inject(spec)
      applyEvent(spec)
      paint(stroke)
      diagnostics(req)
      toScene()
    }

    // render layers
    export class Layer {
      constructor(renderer, scene3d)
      update(snapshot, store)       // called each frame
      setVisible(v)
      dispose()
    }

    // tools
    export class Tool {
      activate(ctx) {}
      deactivate() {}
      onPointerDown(e, hit) {}
      onPointerMove(e, hit) {}
      onPointerUp(e, hit) {}
      inspectorSchema() { return []; }
    }

### 5.6 Inspector Schema

Parameters are declared as data. The inspector UI is generated from the schema, which keeps UI and physics in sync:

    { path: 'magnetic.dipole.strength', label: 'Dipole strength',
      type: 'range', min: 0, max: 10, step: 0.01, scale: 'log', unit: 'B0' }

Supported types:

- `range`;
- `number`;
- `toggle`;
- `select`;
- `color`;
- `vec3`;
- `curve` (radial profile editor);
- `button`.

---

## 6. Rendering (three.js)

### 6.1 Particles

- Default: `THREE.Points` with a custom `ShaderMaterial`.
  - Attributes: `position`, `aScalar` (the color-by value), `aSize`, `aSpecies`.
  - Point size is attenuated by distance and scaled by physical radius, with a minimum pixel size.
  - Color comes from a 1D colormap texture (viridis, magma, ice). The range is auto-fit or manual.
  - Soft circular sprites use additive blending in "glow" style, or alpha-tested discs in "solid" style.
- Close-up mode: switches to `InstancedMesh` (low-poly icospheres) for particles inside a camera-distance threshold, capped at 5k instances.

### 6.2 Bodies and Sources

- Planet: sphere with procedural banding shader. Optional oblateness is shown by scaling y.
- Moons: small spheres, with orbit lines drawn as `Line` geometry from Kepler elements.
- Coils: `TorusGeometry` with a current-direction arrow.
- Shadow cone: optional translucent cylinder, used when charging depends on illumination.

### 6.3 Field Visualization

- B-field lines: RK4 streamline integration from seed points on a sphere or plane.
  - Computed in the worker when fields change.
  - Rendered as `LineSegments` with color by |B|.
- E-field glyphs: an instanced arrow grid in the ring plane, updated at a throttled rate.
- Painted grid overlay: an annulus mesh with a `DataTexture` in polar UV mapping, blended over the ring plane.

### 6.4 Performance Budget (target: 50k particles, mid-range laptop)

| Stage                        | Budget   |
|------------------------------|----------|
| Physics substeps (worker)    | ≤ 12 ms  |
| Buffer upload                | ≤ 1.5 ms |
| Render                       | ≤ 4 ms   |
| UI / diagnostics (main)      | ≤ 1 ms   |

- Auto-quality: if frame time exceeds budget for 2 s, the system in turn:
  1. reduces the substep cap;
  2. then disables collisions for distant particles;
  3. then suggests a particle cap.

---

## 7. Scene Format

    {
      "version": 1,
      "units": { "L0_km": 60000, "M0_kg": 5.68e26 },
      "central": { "mass": 1, "radius": 1, "J2": 0.0163, "spin": 1.0 },
      "moons": [
        { "name": "Prometheus", "mass": 2.7e-10, "a": 2.31, "e": 0.002, "i": 0, "phase": 0 }
      ],
      "electric": {
        "radialProfile": [[1, 0], [2, 0.1], [4, 0]],
        "pointCharges": []
      },
      "magnetic": {
        "dipole": { "strength": 1, "tilt": 0 },
        "quadrupole": 0,
        "coils": [],
        "corotation": 1.0
      },
      "charging": { "tau": 0.5, "storm": 1.0, "shadow": true },
      "collisions": { "enabled": true, "restitution": 0.5, "friction": 0.1,
                       "stickSpeed": 0.001, "fragSpeed": 0.05, "selfGravity": false },
      "drag": { "gamma": 0 },
      "grids": { "resolution": [256, 512], "channels": { "E_r": "<base64 f32>" } },
      "species": [
        { "id": "ice",  "density": 0.9, "qm": 0.001, "color": "#cfe8ff" },
        { "id": "dust", "density": 2.5, "qm": 0.05,  "color": "#b08a5a" }
      ],
      "emitters": [],
      "particles": { "count": 20000, "encoding": "base64-soa", "data": "..." },
      "camera": { "position": [0, 4, 8], "target": [0, 0, 0] },
      "sim": { "dt": 0.002, "timeScale": 1, "time": 0 }
    }

- The particle payload is optional. If it is omitted, the scene regenerates from emitters and seed.
- URL sharing omits particles and grids larger than a threshold. It is compressed with `CompressionStream('deflate')` and base64url-encoded.

---

## 8. Presets (v1)

1. **Saturn-lite:** J2 planet, broad ice ring, two shepherd moons, weak dipole.
2. **Shepherded F-ring:** narrow ring confined between two small moons, showing gap and edge waves.
3. **Charge Spokes:** dusty ring with a planetary shadow and a strong corotating B. Azimuthal charging produces spoke-like features.
4. **Dusty Lab Trap:** no central mass. A radial E-field plus an axial coil B-field yields a levitated ring, as in the lab-style trap from `idea.md`.
5. **Chaos Sandbox:** empty scene with an emitter, for free-form play.

---

## 9. Milestones

| #  | Milestone              | Deliverables                                                                                      |
|----|------------------------|---------------------------------------------------------------------------------------------------|
| M0 | Skeleton               | index.html, import map, renderer, camera, planet, EventBus/Store, empty panels                    |
| M1 | Orbital core           | ParticleBuffer, gravity + J2, leapfrog, Points renderer, Inject tool, timeline                    |
| M2 | Worker                 | physics.worker + bridge, SAB/transfer paths, perf HUD                                             |
| M3 | Electromagnetics       | Charging, E radial profile, dipole B, Boris integrator, color-by-charge                           |
| M4 | Moons & markers        | Kepler moons, resonance/Roche/sync markers, Perturb tool (moon pass, impulse)                     |
| M5 | Collisions             | Spatial hash, restitution/friction, merge/fragment, perf auto-quality                             |
| M6 | Field painting         | PolarGrid, brushes, grid overlay, painted forces                                                  |
| M7 | Manifold View          | Diagnostics in worker, ManifoldPanel plots, equilibrium markers, Probe tool                       |
| M8 | Field viz & coils      | B streamlines, E glyphs, coils via Biot–Savart grid, quadrupole                                   |
| M9 | Persistence            | Serializer, presets, URL sharing                                                                  |
| M10| Polish                 | Events palette complete, colormaps, trails, keyboard shortcuts, onboarding tooltips               |

---

## 10. Testing and Validation

- **Unit tests:** a browser runner at `tests/index.html` using a minimal assert library. There are no deps.
- **Physics validation cases:**
  - Circular Kepler orbit: energy drift < 1e-6 per orbit at default dt.
  - J2 nodal precession rate matches the analytic value within 2%.
  - Uniform B, no gravity: gyroradius and gyrofrequency match `m v / (q B)` and `qB/m` within 0.5%.
  - E×B drift velocity matches `E×B / B²`.
  - Head-on collision with ε = 1 conserves kinetic energy. With ε = 0, the pair moves at the momentum-weighted velocity.
  - The Manifold View equilibrium radius for pure gravity plus circular speed matches the particle's actual orbit.
- **Determinism:** seeded PRNG (mulberry32). The same scene and seed reproduce identical results on the same browser.
- **Performance regression:** a benchmark scene reports the mean step time to the console.

---

## 11. Controls (default)

| Key / input      | Action                          |
|------------------|---------------------------------|
| Space            | Play / pause                    |
| `.`              | Single step                     |
| `[` / `]`        | Time scale down / up            |
| 1–5              | Select / Paint / Inject / Perturb / Probe |
| M                | Toggle Manifold View            |
| F                | Focus selection                 |
| Shift + drag     | Subtractive paint               |
| Ctrl+S / Ctrl+O  | Save / load scene               |
| Mouse            | LMB tool, RMB orbit, wheel zoom, MMB pan |

---

## 12. Risks and Mitigations

| Risk                                              | Mitigation                                                           |
|---------------------------------------------------|----------------------------------------------------------------------|
| SharedArrayBuffer unavailable (no COOP/COEP)      | Transferable fallback; document headers for dev server               |
| Stiff dynamics with strong B → instability        | Boris pusher, gyro-period dt guard, substep cap                      |
| Collision cost explodes in dense clumps           | Per-cell pair cap, auto-quality, optional collision LOD              |
| Float32 precision far from origin                 | Scaled units; keep scene within ~100 L0                              |
| Physics "looks wrong" to informed users           | Validation suite, inspector shows SI equivalents, docs on approximations |
| Scope creep (full self-gravity, plasma PIC)       | Explicit non-goals; plugin-style ForceModule interface for later     |

---

## 13. Future Extensions

- WebGPU compute path for the integrator and collisions, targeting 1M particles.
- Full tree-code self-gravity (Barnes–Hut) in the worker.
- Time-reversible "rewind" using snapshot keyframes.
- Guided "experiments" mode with objectives, e.g. "confine a ring at r = 2.5 using only fields."
- Export to video (MediaRecorder) and to CSV for analysis.