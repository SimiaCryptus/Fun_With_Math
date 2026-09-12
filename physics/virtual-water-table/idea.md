# **Chaos Garden — Project Specification**

Lab code: `CG` Medium: Static HTML \+ modular ES6 \+ three.js (WebGL2), no build step, no framework, no server Class: Interactive research instrument (executable mathematics), presented as a game

---

## **1\. Summary**

Chaos Garden is a browser-native laboratory in which the player sculpts obstructions in a *top-down, depth-invariant* plan view, then watches a fully three-dimensional incompressible flow run through the resulting channel at a configurable slab thickness `h`. The same drawing — bit-for-bit identical barrier geometry — is simulated at many depths. The player's objective is to find the geometry, and the depth band, that maximizes a measured chaos/entropy score.

The central conceit is that dimensionality is a slider, not an integer. A thin slab of genuinely 3D fluid is 3D at large scales and effectively 2D below the confinement scale. By extruding a 2D design through a variable thickness, the player is not designing a shape; they are designing a multiscale operator and then tuning where its dimensional crossover sits relative to the structures their geometry produces.

Chaos Garden deliberately ignores the question that dominates popular discussion of Navier–Stokes — finite-time blowup — and instead instruments the two quantities that actually govern the behaviour of real flows: entropy production and practical reversibility.

---

## **2\. Research Framing**

### **2.1 Why not singularities**

The Millennium framing asks whether the nonlinear term can concentrate energy into arbitrarily small scales in finite time. That is a *well-posedness* question about a continuum idealization. It is orthogonal to what makes fluids hard and interesting:

| Question | Type | Chaos Garden's stance |
| :---- | :---- | :---- |
| Does a smooth solution exist for all time? | existence | out of scope |
| How fast does the flow destroy information? | dynamics | primary metric |
| Can the state be uniquely rewound? | dynamics | primary metric |
| How does detail at one scale feed other scales? | structure | primary mechanic |

Regularity ≠ stability ≠ predictability. Chaos destroys usefulness long before singularity would destroy existence.

### **2.2 Why a thin slab**

Standard analysis assumes an unbounded continuum in every direction. Bounding one direction to a small thickness `h` does three structurally significant things at once:

1. Introduces a hard geometric scale that competes with the inertial and viscous scales.
2. Quantizes the vertical spectrum — the wall-normal direction supports only a discrete set of modes, and above some wavenumber *no further vertical structure fits*.
3. Progressively disables vortex stretching — the term `(ω·∇)u` that makes 3D turbulence forward-cascading and irreversible loses its vertical channel as `h` shrinks.

The result is a scale-dependent effective dimension: 3D above `h`, quasi-2D below. This is the regime studied in the thin-layer turbulence literature (split cascades, critical thickness `h_c`, condensate multistability — Celani/Musacchio/Vincenzi, Benavides/Alexakis, Boffetta/Ecke, and the thin-film and soap-film experimental programs). Chaos Garden is an interactive, measured instance of that regime, with the twist that the obstacle geometry is held dimensionally invariant so depth can be isolated as the sole independent variable.

### **2.3 Claim of originality**

Prior art establishes that thickness tunes the cascade direction in *forced homogeneous* thin-layer turbulence. Chaos Garden's contribution is (a) obstacle-driven, spatially inhomogeneous thin-slab flow, (b) a depth-invariant design space that makes geometry and dimensionality independently controllable, and (c) a composite reversibility/entropy score exposed as a real-time objective function. Nothing here is claimed as a physics result; the deliverable is an instrument and a reproducible measurement protocol.

---

## **3\. Goals and Non-Goals**

### **3.1 Goals**

* G1. Run a stable, divergence-controlled 3D incompressible solver on a thin slab entirely in the browser at interactive framerates (≥ 30 fps at default tier).
* G2. Make `h` a first-class, continuously swept parameter with automated multi-depth batch runs.
* G3. Report measured quantities — spectra, flux, entropy, Lyapunov exponent, mutual information, rewind divergence — not aesthetic proxies.
* G4. Bit-reproducible runs: same seed \+ same design \+ same depth ⇒ same trajectory and same score.
* G5. Complete shareability of a design and its parameters in a URL fragment.
* G6. Zero dependencies beyond three.js; zero build tooling; works from `file://` where possible and from a static host always.

### **3.2 Non-Goals**

* Not a CFD validation suite; quantitative accuracy is targeted only to the level needed for *comparative* scoring.
* No turbulence closure models (no LES/RANS). The slab is resolved, or the tier is refused.
* No free surface, no compressibility, no thermal coupling, no multiphase.
* No account system, telemetry, or server-side state.

---

## **4\. Player-Facing Concept**

### **4.1 The loop**

`PAINT  →  RUN  →  READ  →  SWEEP  →  REFINE`

`^                                       |`

`+---------------------------------------+`

&nbsp;

1. Paint. Top-down view of the channel. Inflow on the left face, outflow on the right. Brush, line, polygon, and stamp tools deposit solid cells. An ink budget caps total solid area so designs are comparable.
2. Run. The 2D mask is extruded through the full depth. The solver runs at the current `h`. Live overlays show vorticity, tracer dye, streamlines, and a scrolling metric strip.
3. Read. The Score panel decomposes the composite score into its components with a radar chart and per-scale bar chart.
4. Sweep. One command runs the identical design across a ladder of depths and plots each metric versus `h` — the design's dimensional fingerprint.
5. Refine. Edit and repeat, or hand the design to Evolve mode and let a mutation search push it up the score gradient.

### **4.2 Why it reads as a game**

The scoring surface is genuinely non-monotonic and geometry-dependent. Naïve strategies (maximum clutter) plateau; high scores require *matching a geometric scale ladder to a confinement scale*. Players converge on real intuitions — that thin slabs reward long shear-generating jets and staggered wake ladders, that thick slabs reward bluff bodies and separation, and that some geometries have a sharp dimensional cliff where the score collapses.

### **4.3 Modes**

| Mode | Purpose |
| :---- | :---- |
| Paint | Author barrier geometry; simulation paused or previewing |
| Run | Free simulation with live metrics |
| Sweep | Batch the design across a depth ladder; produce fingerprint charts |
| Rewind | Reversibility probe: forward N steps, time-reverse, measure divergence |
| Evolve | Server-free hill-climb / (1+λ) evolution strategy over the barrier mask |
| Scope | Scale-band inspector: isolate and replay a wavenumber band of the flow |

---

## **5\. Physical Model**

### **5.1 Domain and boundaries**

A rectangular slab, axis convention `x` \= streamwise, `y` \= spanwise (in plan), `z` \= wall-normal (depth).

* Extent: `Lx : Ly : Lz = 2 : 1 : h`, with `h` expressed as the dimensionless aspect `H = Lz / Ly ∈ [0.01, 1.0]`.
* x− inflow: Dirichlet `u = (U₀ · p(z), 0, 0)` where `p(z)` is either plug or parabolic, selectable. Optional low-amplitude seeded perturbation (deterministic, from the run seed).
* x+ outflow: convective outflow `∂u/∂t + U₀ ∂u/∂x = 0`, plus a pressure reference cell.
* y± spanwise: periodic (default) or free-slip.
* z± walls: no-slip. These walls are the mechanism of dimensional reduction. Free-slip is available as a comparison control — it suppresses the wall-driven baroclinic modes and should push the crossover to smaller `h`.
* Barriers: solid cells from the extruded 2D mask, no-slip on all exposed faces.

The barrier mask is invariant in `z` by construction. This is a hard constraint of the design, not a simplification: it is what makes `h` a clean independent variable.

### **5.2 Governing equations**

Incompressible Navier–Stokes, non-dimensionalized on `U₀` and `Ly`:

`∂u/∂t + (u·∇)u = −∇p + (1/Re) ∇²u + f`

`∇·u = 0`

&nbsp;

`Re = U₀ Ly / ν` is a user parameter. Two derived numbers are displayed continuously because they, not `Re` alone, determine the regime:

* Slab Reynolds number `Re_h = U₀ Lz / ν = Re · H`
* Confinement wavenumber `k_h = π / Lz` — the smallest wavenumber with vertical structure.

### **5.3 Effective dimension**

Decompose the velocity field into vertical modes on `[0, Lz]`:

`u(x, y, z, t) = Σₙ ûₙ(x, y, t) φₙ(z),   φ₀ = 1 (barotropic), φₙ≥₁ baroclinic`

&nbsp;

For each horizontal wavenumber `k`, define the baroclinic energy fraction

`β(k) = E_{n≥1}(k) / E_total(k)`

&nbsp;

and the reported effective dimension

`d_eff(k) = 2 + β(k)`

&nbsp;

This is a *diagnostic definition*, stated explicitly in-app, not a claim of fractal dimension. It is monotone in the right direction, cheap to compute from the same spectra used elsewhere, and it makes the crossover visible as a curve that falls from ≈3 to ≈2 as `k` passes `k_h`.

### **5.4 Discretization**

* Grid. Uniform staggered MAC grid. `Nx × Ny × Nz`, `Nz ∈ [4, 48]`, sized so that `Nz ≈ H · Ny` clamped to tier limits. The solver always resolves the slab with at least 4 cells; below that, the app switches to an explicitly labelled 2D mode rather than silently lying.
* Time integration. Fixed `Δt`, chosen from a CFL target `C = 0.5` computed at tier setup and then held constant for determinism. Substepping if `C` is exceeded (deterministic, count logged).
* Advection. MacCormack / BFECC on top of semi-Lagrangian with clamped extrema. Semi-Lagrangian alone is too dissipative to measure cascades; BFECC restores second-order accuracy at \~3× cost.
* Viscosity. Explicit for `Re_h` below threshold; implicit (Jacobi on the Helmholtz operator) otherwise.
* Projection. Divergence → Poisson solve → gradient subtraction. Solver is red-black Gauss–Seidel with a 3-level V-cycle multigrid on the horizontal axes only (the vertical direction is already short). Termination on `‖∇·u‖∞ < ε_div` or iteration cap; both surfaced in the HUD.
* Vorticity confinement is NOT used. It is a visual cheat that fabricates enstrophy and would corrupt every metric in this app. Explicitly forbidden.

### **5.5 Per-step pipeline**

`1. applyBoundaries(u)            // inflow profile, walls, barrier no-slip`

`2. advect(u → u*)                // BFECC, barrier-aware trilinear sampling`

`3. advect(tracers, dye)          // passive scalars, same scheme`

`4. diffuse(u* → u**)             // explicit or Jacobi-implicit`

`5. addForces(u**)                // optional deterministic forcing`

`6. divergence(u**) → b`

`7. pressureSolve(b) → p          // RBGS + multigrid V-cycles`

`8. project(u** − ∇p) → u^{n+1}`

`9. applyBoundaries(u^{n+1})`

`10. curl(u^{n+1}) → ω            // for render + metrics`

`11. metrics.tick(state)          // strided; see §6.7`

&nbsp;

### **5.6 Determinism**

Mandatory, because reversibility is a measured quantity and sweeps must be comparable:

* Fixed `Δt`, fixed iteration counts (no "iterate until wall-clock budget").
* Seeded `xorshift128+` RNG in `core/Rng.js`; no `Math.random` anywhere in `sim/` or `metrics/`.
* All GPU passes use `highp float`; reductions use a fixed-order tree, never atomics.
* Frame-rate independence: simulation steps are decoupled from `requestAnimationFrame`; a frame may run 0..N steps but the *sequence* of steps is identical for a given step budget.
* A run is identified by `runHash = H(designHash ‖ params ‖ seed ‖ solverVersion)`. Scores are only comparable within a `solverVersion`.

---

## **6\. Measurement Suite**

All metrics are computed on GPU where possible, reduced to small CPU arrays, and time-averaged over a measurement window that begins only after a transient rejection period `t₀` (default: 4 domain flow-through times). The HUD shows a "settling" badge until `t₀` elapses.

### **6.1 Bulk invariants**

* Kinetic energy `E = ½⟨|u|²⟩`
* Enstrophy `Z = ½⟨|ω|²⟩`
* Palinstrophy `P = ½⟨|∇ω|²⟩` (resolution health indicator)
* Dissipation `ε = (2/Re)⟨SᵢⱼSᵢⱼ⟩`
* Max divergence `‖∇·u‖∞` (solver trust indicator, always visible)

### **6.2 Spectra and flux**

Per `z`\-slice horizontal 2D FFT (radix-2, in `workers/fft.worker.js`; sizes forced to powers of two in the analysis subdomain, which excludes inlet/outlet buffer strips).

* Horizontal energy spectrum `E(k)`, split into barotropic `E₀(k)` and baroclinic `E_{n≥1}(k)`.
* Nonlinear flux `Π(k)` by the standard filtered-field method. Its sign is the headline quantity: `Π > 0` forward (3D-like), `Π < 0` inverse (2D-like). A design that produces *both* simultaneously in different bands is a split cascade and scores highly on multiscale breadth.
* `d_eff(k)` per §5.3.

### **6.3 Field entropy**

Shannon entropy of the normalized histogram of `log(|ω| + δ)` over the analysis subdomain, `H_ω ∈ [0, log B]` with `B = 256` bins, normalized to `[0,1]`. Reported alongside the entropy of the velocity-direction distribution (angular histogram) so that "fast but laminar" cannot fake it.

### **6.4 Lyapunov exponent**

A twin solver (`sim/TwinSolver.js`) shares barriers and parameters, starts from `u_twin = u + δ₀ ζ` with `δ₀ = 1e−6` and `ζ` a seeded, divergence-free perturbation field.

`λ ≈ (1 / (M · T_r)) Σ_{m=1..M} ln( ‖Δ_m‖ / δ₀ )`

&nbsp;

with renormalization to `δ₀` every `T_r`. The twin runs at reduced cadence (default every 2 steps with matched `Δt`) on the same tier. Cost is \~1.8× a single solve; the twin can be disabled, in which case `λ` is reported as unavailable and the composite score renormalizes its weights.

### **6.5 Mutual information, inflow → outflow**

The inlet face is partitioned into `K = 16` spanwise bands, each injecting a distinctly tagged passive tracer channel (packed 4 channels per RGBA texture, 4 textures). At the outlet plane the arrival distribution over `K` output bands is accumulated into a `K × K` joint histogram.

`I(in ; out) = Σ p(i,o) log₂ [ p(i,o) / (p(i) p(o)) ]   bits, normalized by log₂ K`

&nbsp;

Low `I` means the flow has destroyed the correspondence between where fluid entered and where it left — a direct, physical measure of information destruction by the geometry. The score uses `1 − Î`.

### **6.6 Reversibility (rewind divergence)**

Protocol, run on demand in Rewind mode:

1. Snapshot state `S₀` after settling.
2. Advance `N` steps forward to `S_N` (default `N = 200`).
3. Negate velocity, set `1/Re → 0`, advance `N` steps (viscosity omitted because it is irreversible by construction; the point is to test whether *advective* information survives).
4. Restore sign; compare to `S₀`.

`D_rev = ‖u_rewound − u₀‖₂ / ‖u₀‖₂`

&nbsp;

`D_rev → 0` means the design is practically reversible over that horizon; `D_rev → O(1)` means the chaotic amplification of round-off has already eaten the state. The rewind horizon `N*` at which `D_rev` crosses 0.5 is reported as the headline reversibility number, in flow-through times.

### **6.7 Scheduling**

| Metric | Cadence |
| :---- | :---- |
| bulk invariants, divergence | every step (single reduction pass) |
| vorticity entropy | every 4 steps |
| spectra, flux, `d_eff` | every 16 steps (worker, async) |
| mutual information | continuous accumulation, reported every 32 steps |
| Lyapunov | every `T_r` \= 32 steps |
| rewind | on demand only |

### **6.8 Composite score**

`S = 100 · Σ wᵢ · mᵢ        with Σ wᵢ = 1`

&nbsp;

| Component `mᵢ` | Meaning | Default `wᵢ` |
| :---- | :---- | :---- |
| `λ̂` | normalized Lyapunov exponent (chaotic amplification) | 0.25 |
| `Ĥ_ω` | vorticity-field entropy | 0.15 |
| `1 − Î` | information destroyed inlet→outlet | 0.20 |
| `D̂_rev` | rewind divergence at fixed horizon | 0.20 |
| `B̂` | multiscale breadth: decades of `k` with \` | Π(k) |

Each `mᵢ` is normalized by a published reference constant, not by the current session's range, so scores are comparable across designs, sessions, and machines. Normalization constants and weights live in a single versioned file, `metrics/Score.js`, and the score string embeds the weight-set id: `S=73.2 (w:v2, solver:1.4.0, tier:B)`.

Anti-cheese rules.

* Ink budget caps solid fraction (default 22%).
* Divergence residual above `ε_div` invalidates the run (score shown struck through).
* Palinstrophy above a resolution threshold raises an under-resolved flag; scores from under-resolved runs are marked and excluded from leaderboards.
* Blocking the channel to near-zero throughput drives `1 − Î` up spuriously; therefore the score is gated by a throughput factor `min(1, Q/Q_min)` applied multiplicatively.

---

## **7\. Architecture**

### **7.1 Principles**

* ES modules only. No bundler. `<script type="module">` plus an import map for three.js.
* Layered, one-directional dependencies: `core ← sim ← metrics ← modes ← ui/render`. Nothing in `sim/` may import from `ui/` or `render/`.
* State is owned by `core/Params.js` and `sim/Solver.js`. UI is a projection; modes are orchestration.
* Workers for anything that would jitter the frame: FFT, evolution search, CSV export.
* Pure functions in `metrics/` — given arrays in, numbers out; trivially unit-testable.

### **7.2 File tree**

`/cg/`

`index.html`

`main.js`

`style.css`

`assets/`

    `brushes/            stamp masks (PNG, 1-bit)`

    `presets/*.json      curated designs with expected scores`

`src/`

    `core/`

      `App.js            lifecycle, mode switching, main loop`

      `Clock.js          fixed-step accumulator, step budget, pause/scrub`

      `EventBus.js       tiny typed pub/sub`

      `Rng.js            xorshift128+, seedable, serializable state`

      `Params.js         schema, defaults, validation, change notification`

      `HashCodec.js      URL-fragment encode/decode (design + params)`

      `Storage.js        localStorage slots, import/export JSON`

      `Tiers.js          device capability probe → grid/quality tier`

      `Log.js            ring-buffer diagnostics, exportable`

    `sim/`

      `Grid.js           dimensions, index math, staggered offsets`

      `GpuContext.js     three.js RT allocation, float support probe, ping-pong`

      `FieldAtlas.js     3D↔2D tiled-atlas packing, slice addressing`

      `BarrierField.js   2D mask → extruded solid texture + SDF for rendering`

      `Solver.js         the step pipeline of §5.5`

      `TwinSolver.js     perturbed twin for Lyapunov`

      `Rewinder.js       snapshot / time-reverse / compare`

      `Tracers.js        multi-channel passive dye, inlet band tagging`

      `passes/`

        `common.glsl.js  shared GLSL preamble (atlas sampling, boundary macros)`

        `advect.glsl.js`

        `diffuse.glsl.js`

        `divergence.glsl.js`

        `pressure.glsl.js     RBGS + restriction/prolongation`

        `project.glsl.js`

        `curl.glsl.js`

        `boundary.glsl.js`

        `tracer.glsl.js`

        `reduce.glsl.js       parallel reduction (sum, max, histogram)`

      `CpuSolver.js      reference implementation, tiny grids, used by tests`

    `metrics/`

      `Reducer.js        GPU reduce → typed arrays`

      `Spectra.js        spectrum, flux Π(k), vertical-mode split`

      `Entropy.js        histogram entropy helpers`

      `Lyapunov.js`

      `MutualInfo.js`

      `EffectiveDimension.js`

      `Score.js          weights, normalization constants, versioning`

      `Recorder.js       time series buffers, CSV/JSON export`

    `render/`

      `Renderer.js       three.js WebGLRenderer setup, resize, colorspace`

      `Scene.js          camera rigs (plan ortho / slab perspective)`

      `TopDownView.js    plan-view compositing: mask, dye, vorticity, ink budget`

      `SlabVolume.js     ray-marched slab (Data3DTexture or atlas march)`

      `StreamlineLayer.js GPU particle advection, additive trails`

      `IsoVorticity.js   optional λ₂ / |ω| isosurface via marching-cubes worker`

      `Palette.js        perceptually-uniform colormaps, colorblind-safe set`

      `Overlay.js        grid, probes, analysis-subdomain outline`

    `ui/`

      `Toolbar.js`

      `BrushTool.js      brush/line/poly/stamp, undo stack, ink accounting`

      `DepthSlider.js    H control with crossover markers (k_h vs geometry scales)`

      `Panels/`

        `MetricsPanel.js`

        `ScorePanel.js       radar + component breakdown`

        `SweepPanel.js       metric-vs-H fingerprint plots`

        `SolverPanel.js      Re, tier, residuals, step budget`

        `AboutPanel.js       methodology, definitions, caveats`

      `Charts/`

        `LineChart.js`

        `RadarChart.js`

        `SpectrumChart.js    log-log with Π(k) sign shading`

        `Sparkline.js`

      `Hotkeys.js`

      `Notify.js`

    `modes/`

      `PaintMode.js`

      `RunMode.js`

      `SweepMode.js`

      `RewindMode.js`

      `EvolveMode.js`

      `ScopeMode.js`

    `workers/`

      `fft.worker.js`

      `evolve.worker.js`

      `export.worker.js`

`test/`

    `run.html            headless-ish test page, no framework`

    `cases/*.js          §11 validation cases`

&nbsp;

### **7.3 Bootstrap**

`<!-- index.html -->`

`<script type="importmap">`

`{`

`"imports": {`

    `"three": "https://unpkg.com/three@0.169.0/build/three.module.js",`

    `"three/addons/": "https://unpkg.com/three@0.169.0/examples/jsm/"`

`}`

`}`

`</script>`

`<script type="module" src="./main.js"></script>`

&nbsp;

A `vendor/` copy of the same three.js build is committed so the lab keeps working offline and after CDN churn; `main.js` selects vendor when `location.protocol === 'file:'`.

### **7.4 Module contracts**

`// core/Params.js`

`/**`

`* @typedef {Object} CgParams`

`* @property {number} H        slab aspect Lz/Ly, [0.01, 1.0]`

`* @property {number} Re       Reynolds number on Ly, [200, 20000]`

`* @property {'plug'|'parabolic'} inflow`

`* @property {'periodic'|'freeslip'} spanwise`

`* @property {'noslip'|'freeslip'} walls`

`* @property {number} seed     uint32`

`* @property {'A'|'B'|'C'} tier`

`* @property {boolean} twin    enable Lyapunov twin`

`*/`

`export const SCHEMA = { /* field -> {type, min, max, default, step, label} */ };`

`export function validate(p) { /* → {ok, errors, normalized} */ }`

&nbsp;

`// sim/Solver.js`

`export class Solver {`

`/** @param {GpuContext} gpu @param {Grid} grid @param {CgParams} params */`

`constructor(gpu, grid, params) {}`

`setBarriers(barrierField) {}          // hot-swappable; triggers reprojection`

`reset(seed) {}                        // deterministic initial condition`

`step() {}                             // exactly one Δt; returns StepReport`

`snapshot() {}                         // → transferable typed-array bundle`

`restore(snap) {}`

`get state() {}                        // read-only texture handles for render/metrics`

`dispose() {}`

`}`

`/** @typedef {{t:number, substeps:number, divMax:number, pIters:number}} StepReport */`

&nbsp;

`// metrics/Score.js`

`export const WEIGHTS_VERSION = 'v2';`

`export const WEIGHTS = { lyapunov:0.25, entropy:0.15, infoLoss:0.20, rewind:0.20, breadth:0.20 };`

`export const NORMALIZERS = { /* published constants */ };`

`/** @returns {{score:number, parts:Record<string,number>, flags:string[]}} */`

`export function composite(raw, opts) {}`

&nbsp;

`// modes/SweepMode.js`

`/**`

`* Runs the current design across a depth ladder, settling and measuring each.`

`* Emits 'sweep:progress' and 'sweep:done' on the bus.`

`* @param {number[]} ladder  e.g. logspace(0.02, 0.6, 12)`

`*/`

`export async function runSweep(ladder, ctx) {}`

&nbsp;

### **7.5 GPU data layout**

WebGL2 cannot render into a layer of a 3D texture without extensions, so all evolving 3D fields are stored as tiled 2D atlases: `Nz` slices laid out in a `⌈√Nz⌉ × ⌈√Nz⌉` grid, each slice padded by one cell for clamped neighbor fetches.

| Target | Format | Contents |
| :---- | :---- | :---- |
| `velocity` (ping/pong) | `RGBA16F` | `u, v, w, —` at cell centers (MAC values interpolated on write) |
| `pressure` (ping/pong) | `R32F` | `p` |
| `divergence` | `R32F` | `b` |
| `curl` | `RGBA16F` | \`ωx, ωy, ωz, |
| `solid` | `R8` | extruded barrier mask (2D, broadcast in z) |
| `tracer0..3` | `RGBA16F` | 16 tagged inlet channels |
| `reduce` | `RGBA32F` | reduction pyramid scratch |

`FieldAtlas.js` owns all index arithmetic. Shaders receive `uAtlas = (Nx, Ny, Nz, tilesX)` and use `sampleSlice(tex, ivec3 p)` / `sample3D(tex, vec3 pos)` from `common.glsl.js`. Half-float is the default for velocity; a "precision: high" toggle promotes to `RGBA32F` at \~2× bandwidth, and the app reports which was used alongside every score.

Fallback: if `EXT_color_buffer_float` is unavailable, the app drops to `CpuSolver` at tier C with a prominent banner and disables leaderboard-eligible scoring.

### **7.6 Data flow**

`BrushTool ──mask──▶ BarrierField ──solid tex──▶ Solver`

                                                 `│`

`Params ──────────────────────────────────────────┤`

                                                 `▼`

                                         `[ step pipeline ]`

                                                 `│`

                        `┌────────────────────────┼─────────────────────┐`

                        `▼                        ▼                     ▼`

                   `render/*               metrics/Reducer        TwinSolver`

                        `│                        │                     │`

                        `│                 fft.worker ◀──────────────────┘`

                        `▼                        ▼`

                  `three.js canvas          metrics/Score ──▶ ScorePanel / Recorder`

&nbsp;

---

## **8\. Rendering**

### **8.1 Views**

* Plan view (default, ortho top-down). Depth-integrated or depth-sliced composite of vorticity magnitude and dye, with the barrier mask drawn as crisp SDF-antialiased silhouettes. This is the view the player paints in, so the visual language must not move between paint and run.
* Slab view (perspective). A ray-marched box, exaggerated in `z` by a user-controlled `zExaggeration` factor (clearly labelled, default 1.0 — the truth is that these slabs *are* thin, and hiding that would defeat the lesson). `OrbitControls` from `three/addons/`.
* Scope view. Band-pass filtered field for a selected wavenumber band, side by side with the full field.

### **8.2 Techniques**

* Ray-march (`SlabVolume.js`): fixed-step march through the atlas with early-out on accumulated alpha; transfer function from `Palette.js`. Step count is tier-dependent.
* Streamlines / dye particles (`StreamlineLayer.js`): GPU-advected point sprites in a ping-pong position texture, additive blending, deterministic seeding from `Rng`.
* Isosurface (`IsoVorticity.js`): optional marching cubes in a worker on a downsampled `|ω|` or λ₂ field; produces a `BufferGeometry` transferred back and rendered as a standard mesh.
* Post: none by default. No bloom, no tonemap tricks that would misrepresent magnitude. A single optional `ACESFilmic` toggle exists for screenshots and is disabled during measurement.

### **8.3 Color**

`Palette.js` ships perceptually-uniform maps (viridis, magma, cividis) plus a signed diverging map (cool–warm) for `ω_z` and for `Π(k)`. A colorblind-safe default is on. Colorbars are always shown with numeric limits; auto-ranging is off during measurement windows and shown as a lock icon.

---

## **9\. UI/UX Specification**

### **9.1 Layout**

`┌──────────────────────────────────────────────────────────────────────┐`

`│ Toolbar: [Paint][Run][Sweep][Rewind][Evolve][Scope]     Score 73.2  │`

`├───────────────┬──────────────────────────────────────┬───────────────┤`

`│ Tools         │                                      │ Metrics       │`

`│  brush size   │            CANVAS (three.js)         │  E, Z, ε      │`

`│  line/poly    │                                      │  λ, H_ω, I    │`

`│  stamps       │                                      │  Π(k) chart   │`

`│  ink 14 / 22% │                                      │  d_eff(k)     │`

`├───────────────┴──────────────────────────────────────┴───────────────┤`

`│ Depth H ▏━━━━━●━━━━━━━━━━━▏ 0.085   Re 4000   k_h ↔ wake scale ⚠︎     │`

`└──────────────────────────────────────────────────────────────────────┘`

&nbsp;

### **9.2 Depth slider — the centerpiece control**

`DepthSlider.js` is not a plain range input. It renders, underneath the track:

* the confinement wavenumber `k_h` position,
* markers for the dominant geometric scales extracted from the barrier mask (gap widths, obstacle diameters, spacing — computed by distance transform of the mask),
* a shaded crossover band where `k_h` overlaps those geometric scales, which is where the most interesting behaviour lives.

Dragging updates a live preview; releasing triggers a re-settle with a visible transient badge.

### **9.3 Sweep panel**

Small multiples: `λ(H)`, `Ĥ_ω(H)`, `1−Î(H)`, `D̂_rev(H)`, `B̂(H)`, and `S(H)`, plus a `Π(k)` heatmap with `H` on one axis and `k` on the other — the clearest single image of a design's dimensional structure. Sign changes in `Π` appear as a visible boundary curve.

### **9.4 Persistence and sharing**

* Design encoding: barrier mask run-length encoded, then Base64url. Typical 256×128 design compresses to 200–900 characters.
* URL fragment: `#cg1.<params-b64>.<design-b64>` — self-contained, no server.
* Local slots via `Storage.js`, with JSON import/export.
* Score strings always carry `solverVersion`, `weightsVersion`, `tier`, and `precision`.

### **9.5 Keyboard**

| Key | Action |
| :---- | :---- |
| `1`–`6` | mode switch |
| `Space` | play/pause |
| `.` | single step |
| `[` / `]` | depth down / up (fine with `Shift`) |
| `B`/`L`/`P` | brush / line / polygon |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| `R` | reset flow (keeps design) |
| `S` | run sweep |
| `W` | run rewind probe |
| `G` | toggle grid/overlays |
| `?` | shortcuts and methodology |

### **9.6 Onboarding**

Three short, skippable scenarios rather than a tutorial wall:

1. One cylinder. Sweep `H`. Watch the Kármán street go from 3D-modulated to crisply 2D.
2. Two cylinders. Discover that spacing interacts with `H`; find the depth where the wakes lock.
3. Your garden. Free paint with the ink budget on, score enabled.

---

## **10\. Performance**

### **10.1 Tiers**

| Tier | Grid `Nx×Ny×Nz` | Pressure iters | Twin | Target |
| :---- | :---- | :---- | :---- | :---- |
| A (desktop dGPU) | 512×256×32 | 4 V-cycles | on | 60 fps |
| B (default) | 256×128×16 | 3 V-cycles | on | 45 fps |
| C (integrated/mobile) | 128×64×8 | 2 V-cycles | off | 30 fps |
| D (no float RT) | 64×32×6 CPU | 20 RBGS | off | 10 fps, unscored |

`Tiers.js` probes `EXT_color_buffer_float`, `OES_texture_float_linear`, max texture size, and a 120 ms micro-benchmark of a Jacobi pass, then selects a tier. The user may override; overrides are recorded in the score string.

### **10.2 Budget (tier B, per simulation step)**

| Stage | Passes | Budget |
| :---- | :---- | :---- |
| boundaries | 1 | 0.3 ms |
| advection (BFECC, velocity \+ tracers) | 6 | 3.2 ms |
| diffusion | 1–8 | 1.0 ms |
| divergence \+ multigrid projection | \~24 | 6.5 ms |
| curl | 1 | 0.4 ms |
| reductions | 3 | 0.6 ms |
| total |  | \~12 ms |

Rendering gets the remaining budget. Metrics that exceed budget are deferred, never dropped silently; the HUD shows a metric-lag indicator.

### **10.3 Frame governance**

`Clock.js` runs a fixed-step accumulator with a maximum of `N_max` steps per frame (default 4\) and a spiral-of-death guard that *slows simulated time* rather than changing `Δt`. Simulated time, not wall time, drives all measurement windows.

---

## **11\. Validation**

The app ships a test page (`test/run.html`) with no framework — a list of cases, each returning `{name, pass, detail}`.

| Case | Assertion |
| :---- | :---- |
| Divergence | `‖∇·u‖∞ < 1e−3` after projection on random fields |
| Poiseuille | Empty channel, `Re_h < 100` ⇒ parabolic `z`\-profile, `L2` error \< 2% |
| Kármán | Single cylinder, `Re_D = 100`, `H = 1` ⇒ Strouhal `St = 0.16 ± 0.02` |
| 2D limit | `Nz = 4`, free-slip walls, forced ⇒ `Π(k) < 0` at large scales (inverse cascade) |
| 3D limit | `H = 1`, forced ⇒ `Π(k) > 0` across inertial band |
| Crossover | Sweep an empty forced box; `Π` sign flip occurs at a single, repeatable `H_c` |
| Determinism | Same seed/design/depth ⇒ identical `runHash` and identical score to 1e−6 |
| Rewind sanity | Stokes regime (`Re ≪ 1`) ⇒ `D_rev < 1e−3` over the standard horizon |
| Energy | Unforced, no-slip, decaying ⇒ `dE/dt ≈ −ε` within 5% |
| Atlas | `sample3D` round-trip on a known analytic field, error \< 1e−5 |

The crossover and 2D/3D limit cases are the ones that actually protect the scientific claim; they run on every solver change and their results are committed as a regression table.

---

## **12\. Accessibility, Compatibility, Ethics of Presentation**

* Contrast & color: colorblind-safe default palettes; never color-only encoding — magnitudes are always also available as numbers and as a hover probe readout.
* Motion: `prefers-reduced-motion` disables auto-rotate, trail decay animations, and the transient "settling" shimmer.
* Keyboard-complete: every action reachable without a pointer, including painting (arrow keys move a caret; `Enter` stamps).
* Screen readers: metric panel values are in a `role="status"` live region, throttled to 1 Hz.
* Honesty constraints (non-negotiable):
    * No vorticity confinement, no artificial curl injection, no "prettiness" forces.
    * `zExaggeration ≠ 1` is displayed as a watermark on the slab view.
    * Under-resolved or non-converged runs are visibly flagged, and their scores are struck through.
    * Every metric has a one-click definition popover stating exactly what is computed, including its normalization and its known limitations.
* Browsers: current Chrome/Edge/Firefox/Safari with WebGL2. Safari's half-float render target quirks are handled by the `Tiers.js` probe rather than by user-agent sniffing.

---

## **13\. Roadmap**

| Milestone | Contents | Exit criterion |
| :---- | :---- | :---- |
| M0 — Skeleton | `index.html`, module layout, three.js bootstrap, tier probe, empty scene | renders a box, reports tier |
| M1 — Solver | Atlas, advection, projection, boundaries, CPU reference | divergence \+ Poiseuille tests pass |
| M2 — Paint | Brush tools, ink budget, mask→solid, undo, hash codec | design round-trips through URL |
| M3 — See | Plan view, slab ray-march, dye, streamlines, palettes | Kármán test passes and is visible |
| M4 — Measure | Reductions, FFT worker, spectra, `Π(k)`, entropy | 2D/3D limit tests pass |
| M5 — Score | Twin solver, Lyapunov, MI tracers, rewind, composite | determinism test passes |
| M6 — Sweep | Depth ladder batching, fingerprint charts, `Π(k,H)` heatmap | crossover test passes |
| M7 — Play | Scenarios, presets, ink tuning, onboarding, share cards | three scenarios completable by a naïve user |
| M8 — Evolve | Mutation search worker, lineage view, novelty pressure | search improves seeded presets ≥ 15% |
| M9 — Publish | Methodology page, CSV export, regression table, essay linkage | reproducible from URL on a clean machine |

---

## **14\. Open Questions the Instrument Is Built to Ask**

1. Where does the crossover sit when geometry, not forcing, sets the injection scale? Homogeneous thin-layer results give `H_c` for a forced box; obstacle wakes inject at a scale the player controls, so `H_c` should become a function of the geometry's distance-transform spectrum. The `Π(k,H)` heatmap is designed to show exactly this.
2. Can a single design hold a split cascade stably? Forward flux at wake scales, inverse flux in the barotropic mode, simultaneously and persistently. The multiscale-breadth term rewards it.
3. Does reversibility horizon `N*` collapse continuously or sharply across the crossover? A sharp collapse would be the cleanest possible demonstration that irreversibility is dimensional, not merely viscous.
4. Is mutual-information loss a better predictor of `λ` than enstrophy? Two cheap metrics, one expensive one; if `1−Î` tracks `λ` well, the twin solver becomes optional on weak hardware.
5. What do evolved barriers look like? The prediction is scale-laddered, staggered arrays whose spacing spectrum straddles `k_h`. If evolution instead converges on something unexpected, that is a result worth writing up.

---

## **15\. Glossary**

* Aspect `H` — slab thickness over spanwise width; the dimensionality knob.
* `k_h` — confinement wavenumber, `π/Lz`; above it, no vertical structure fits.
* Barotropic / baroclinic — depth-independent (`n=0`) versus depth-varying (`n≥1`) vertical modes.
* `Π(k)` — nonlinear energy flux through wavenumber `k`; positive \= forward, negative \= inverse.
* `d_eff(k)` — diagnostic effective dimension, `2 + baroclinic energy fraction at k`.
* Split cascade — forward and inverse fluxes coexisting in different wavenumber bands.
* Rewind horizon `N*` — time-reversed steps until relative error reaches 0.5.
* Ink budget — cap on solid area fraction, enforced to keep designs comparable.
* Tier — device capability class selecting grid size, iteration counts, and twin availability.

---

## **16\. One-Paragraph Pitch**

*Chaos Garden* hands you a top-down plan of a channel, a brush, and a slider that controls how thick the world is. You paint obstacles; they are extruded through the whole depth, so your drawing never changes — only the dimension it lives in does. Then you watch real three-dimensional fluid pour through, and the instrument tells you, in measured bits and exponents, how thoroughly your garden shreds the information that enters it. Thin, and the flow organizes itself into long-lived structures that remember where they came from. Thick, and the vortices stretch, the cascade runs down to the grid, and the past becomes unrecoverable. Somewhere in between is a crossover, and it moves depending on what you drew. Finding it is the game.
