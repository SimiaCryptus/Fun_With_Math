# Development Plan: Momentum-Exchange Fields in the Rotating Three-Body Frame

**Target stack:** static HTML, modular ES6 (native `import`, no bundler), three.js for rendering, Web Workers for computation.
**Source spec:** `idea.md` (section numbers below, such as §6.3, refer to it).

---

## 0. Goals and Constraints

### 0.1 Goals

* Implement the full pipeline of `idea.md` §8 in the browser: CR3BP integration with STM, encounter sampling, field computation, differential structure, and adaptive refinement.
* Deliver the linked two-panel visualization of §9 with all ten layers, trajectory inspection, and a Jacobi slider.
* Reproduce the standard figure set of §9.3 and pass the validation suite of §10.
x
### 0.2 Hard constraints

* **No build step.** The app runs by serving the directory with any static server, e.g. `npx http-server experiments/slingshot-field`.
* **three.js comes in through an import map**, pinned to one version:

      <script type="importmap">
      { "imports": {
          "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
          "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
      } }
      </script>

* **All numerics are float64 on the CPU** (`Float64Array`, Workers). WebGL2 has no float64, so the GPU is used for display only, never for integration.
* **`src/core/` is pure.** It has no DOM, no three.js, and no Worker APIs. The same modules run in the browser, in Workers, and in Node (≥ 18) for tests.

### 0.3 Non-goals for v1

* The spatial CR3BP, the ER3BP, iterated maps, and the information-geometric view (§12). The data model must not block them.
* WASM acceleration. It is kept as a fallback if the performance budget in §7 is missed.

---

## 1. Spec Clarifications to Resolve in Code

`idea.md` leaves some points open or ambiguous. Each is fixed here and stated in one place: `src/core/conventions.js`.

| # | Issue | Decision |
| --- | --- | --- |
| C1 | Sign of $\beta$ ("prograde offset") | Let $\hat n = -(\cos\alpha, \sin\alpha)$ be the inward normal and $\hat t = \hat z \times \hat n$. Then $\mathbf v_R = |\mathbf v_R|(\cos\beta\,\hat n + \sin\beta\,\hat t)$. A unit test checks that $\beta>0$ gives positive angular momentum about $P_2$ in the rotating frame. |
| C2 | Meaning of "multi-pass" | Add an outer radius $\rho_{\text{far}} = k\rho$ (default $k=2$). A trajectory that crosses $r_2=\rho$ outward, re-enters before reaching $\rho_{\text{far}}$, and later exits is labelled multi-pass. The recorded exit is the final crossing of $\rho$ before reaching $\rho_{\text{far}}$. |
| C3 | $\mathbf V_P$ in the patched-conic comparison | Use the inertial velocity of $P_2$ at the entry instant: $\mathbf V_P = \hat z \times \mathbf r_{P_2}$. Document that $\Delta E = \mathbf V_P\cdot\Delta\mathbf v$ is only approximate in the CR3BP, because $\mathbf V_P$ rotates during the encounter. Report a midpoint-angle variant as well. |
| C4 | Inertial-frame bookkeeping | Inertial and rotating frames coincide at $t=0$ (entry). The exit inertial velocity is rotated back by $-\tau$, i.e. expressed in the entry-instant inertial axes, so $\Delta\mathbf v$ is a difference of vectors in one fixed basis. $E$ and $h$ are rotation-invariant, so this choice does not affect them. |
| C5 | Definition of $A$ (§6.3) | $A = \partial \mathbf v_{I,\text{out}}/\partial \mathbf v_{I,\text{in}}$ with entry position fixed and both velocity components free (off the Jacobi level). Since $d\mathbf v_I = d\mathbf v_R + \omega^\times d\mathbf r$, at fixed entry position $\partial \mathbf v_{I,\text{in}} = \partial \mathbf v_{R,\text{in}}$. Then $A = R(-\tau)\,[\,\omega^\times \;\; I\,]\,D\Phi_{\text{full}}[:, 2{:}4]$, where $D\Phi_{\text{full}}$ is the crossing-corrected 4×4 map Jacobian and $\omega^\times = \begin{pmatrix}0&-1\\1&0\end{pmatrix}$. |
| C6 | Polar decomposition when $\det A \le 0$ | Use the closed-form 2×2 polar decomposition. If $\det A \le 0$, $Q \notin SO(2)$; flag the sample (`orientationFlip` bit) and render the glyph differently. |
| C7 | Periodicity | $\alpha$ is periodic, so finite differences in $\alpha$ wrap. $\beta$ is not periodic, so it uses one-sided differences at $\pm\pi/2$. The grid uses cell-centred $\beta$ so that $\beta = \pm\pi/2$ (zero normal velocity) is never sampled. |
| C8 | Garbled formulas in `idea.md` | Several formulas lost their symbols (e.g. §3.2, §5.1, §7.3). The intended forms are written out in `conventions.js` JSDoc and in `docs/math.md` (M1 deliverable). Fix `idea.md` at the same time. |

---

## 2. Directory Layout

      experiments/slingshot-field/
        idea.md
        plan.md
        index.html                 # app shell, import map, layout
        css/
          style.css
        docs/
          math.md                  # corrected formulas, conventions, derivations
          literature.md            # M0 review + novelty statement
        src/
          main.js                  # bootstraps store, views, UI, worker pool
          config/
            systems.js             # Earth–Moon, Sun–Jupiter, Sun–Earth presets (μ, R_body, units)
            defaults.js            # tolerances, grid sizes, T, ρ factor, K weights
          core/                    # PURE: no DOM, no three.js
            conventions.js
            linalg.js              # small fixed-size matrix ops (2x2, 4x4, 4x2), polar decomposition, eig2sym
            cr3bp.js               # Ω, ∇Ω, Hessian Ω, EOM, Jacobi C, E, h, E1
            frames.js              # rotating <-> inertial, rotation R(θ)
            lagrange.js            # L1..L5 (Newton on the collinear quintic), C_Li
            dop853.js              # Dormand–Prince 8(5,3) with dense output
            variational.js         # augmented 20-dim RHS: state + STM
            regularize.js          # Levi-Civita around P1/P2, switching logic
            events.js              # crossing detection + root polishing on dense output
            encounter.js           # seed s_in(α,β;C), ∂s_in/∂ξ, propagate → EncounterResult
            fields.js              # Δv, ΔE, Δh, ΔE1, A, b, δ_eff, stretch eigs, τ, r_peri
            differential.js        # dΔE, Hessian (FD + mask), g_Φ, FTLE, κ_E
            patchedConic.js        # δ(b,u), affine map, analytic ΔE, analytic Jacobian (§4.3)
            stt.js                 # second-order variational equations (validation, M4)
            grid.js                # EncounterGrid data structure (SoA Float64Arrays)
            quadtree.js            # adaptive refinement over M_{μ,C}
            hash.js                # stable parameter hashing for cache keys
          compute/
            workerPool.js          # N module workers, job queue, cancellation
            encounterWorker.js     # entry point: receives tile spec, returns transferables
            jobs.js                # grid → tiles, progressive passes (64²→128²→256²→512²)
            postprocess.js         # main-thread passes needing neighbours (Hessian FD, refinement marks)
            cache.js               # IndexedDB cache keyed by (μ, C, ρ, grid, tol, version)
          state/
            store.js               # tiny observable store (params, layer toggles, selection)
          render/
            renderer.js            # one WebGLRenderer, two viewports (scissor) or two canvases
            colormaps.js           # diverging (zero-centred), sequential, categorical, grayscale LUTs
            physicalView.js        # orthographic camera, pan/zoom, layers 0–2 + ring + trajectory
            manifoldView.js        # (α,β) plane, layers 3–9, picking
            layers/
              potentialLayer.js    # L0: Ω contours (fragment shader)
              zvcLayer.js          # L1: forbidden-region shading 2Ω < C
              markersLayer.js      # L2: primaries, L1..L5, Hill circle, labels (CSS2DRenderer)
              ringLayer.js         # ΔE projected onto the Hill circle (avg / max / min over β)
              trajectoryLayer.js   # selected trajectory + v_in/v_out arrows
              outcomeLayer.js      # L3: categorical texture
              scalarFieldLayer.js  # L4/L7/L8: generic DataTexture heatmap with colormap uniform
              quiverLayer.js       # L5: InstancedMesh arrows
              streamlineLayer.js   # L6: streamlines of dΔE (RK4 on the grid, LineSegments)
              signatureLayer.js    # L7: 3-class signature × |det H| intensity
              glyphLayer.js        # L9: instanced ellipses + rotation ticks
            shaders/
              potential.glsl.js
              heatmap.glsl.js
          ui/
            controls.js            # system preset, μ override, ρ, grid N, T, tolerance
            layerPanel.js          # toggles, opacity, colormap range locks
            jacobiSlider.js        # scrub C with L_i tick marks
            inspector.js           # readout of all fields at the picked ξ
            progress.js            # pass/tile progress, cancel
            export.js              # PNG snapshot, JSON/binary field export
        tests/
          run-node.js              # `node tests/run-node.js` (uses node:test)
          run-browser.html         # same tests in the browser (worker + rendering smoke tests)
          cr3bp.test.js
          lagrange.test.js
          integrator.test.js
          variational.test.js
          regularize.test.js
          encounter.test.js
          fields.test.js
          differential.test.js
          patchedConic.test.js
          symmetry.test.js
          convergence.test.js

---

## 3. Core Numerics (`src/core/`)

### 3.1 `cr3bp.js`

* `omega(x, y, mu)`, `gradOmega`, `hessOmega` (closed form; used by the variational equations).
* `rhs(t, s, mu, out)` writes into a preallocated `out`, with no per-step allocation.
* `jacobi(s, mu)`, `inertialEnergy(s, mu)`, `angMom(s)`, `keplerE1(s, mu, theta)`.
* Unit test: the identity $C = -2(E - h)$ holds to machine precision on random states.

### 3.2 `lagrange.js`

* $L_1, L_2, L_3$: Newton iteration on $\partial_x\Omega(x,0)=0$ in each interval, starting from Hill-sphere approximations.
* $L_4, L_5 = (\tfrac12 - \mu, \pm\tfrac{\sqrt3}{2})$.
* `jacobiAt(Li)` gives the default C levels, which straddle $C_{L_1} > C_{L_2} > C_{L_3}$.
* Test: Earth–Moon $C_{L_1} \approx 3.1883$, $C_{L_2} \approx 3.1722$.

### 3.3 `dop853.js`

* Port of Hairer's DOP853: 12 stages, 8th order, 5th/3rd-order error estimators, and 7th-order dense output.
* Generic over dimension n (4 without STM, 20 with STM, plus STT later).
* Step-size control: rtol = 1e-12, atol = 1e-12 by default. Configurable `hmax`. FSAL reuse.
* Error norm over the **state components only** by default. The STM can be included as an option.
* The API is a stepper (`step()` → accepted step + dense interpolant). The event layer owns the loop, which allows switching between regularized and physical coordinates mid-trajectory.
* Tests: harmonic oscillator and Kepler two-body to 1e-11 over 10 periods, order check on a smooth problem, and dense-output accuracy.

### 3.4 `variational.js`

* Augmented state $[\mathbf s; \operatorname{vec}\Phi_{\text{STM}}]$, 20 components.
* $J(\mathbf s) = \begin{pmatrix} 0 & I \\ \nabla^2\Omega & 2\omega^\times{}^\top \end{pmatrix}$, where the lower-right block is $\begin{pmatrix}0&2\\-2&0\end{pmatrix}$.
* Test: compare the STM with central finite differences of the flow ($h \sim 10^{-6}$) to about 1e-7 relative error. Check $\det\Phi_{\text{STM}} = 1$ (symplectic) and $\Phi^\top \mathbb J \Phi = \mathbb J$.

### 3.5 `regularize.js` (Levi-Civita)

* Coordinates about $P_k$: $x - x_k + i y = (u_1 + i u_2)^2$, with fictitious time $dt = r_k\,ds$ and energy $C$ fixed per trajectory.
* Switch in when $r_2 < \rho/10$ and back out when $r_2 > \rho/5$ (hysteresis). Do the same about $P_1$ if a trajectory approaches the large primary.
* **STM through the switch.** Carry the STM in physical coordinates throughout. In regularized mode, integrate the regularized variational equations, then map back with the chain rule at the switch-out point:
  * $\Phi_{\text{phys}} = \dfrac{\partial \mathbf s}{\partial \mathbf w}\,\Phi_{\text{reg}}\,\dfrac{\partial \mathbf w}{\partial \mathbf s}$, plus the time-reparametrization correction from §3.6.
* **Fallback plan.** If the LC STM is slow to get right, ship v1 with a **Sundman transformation only** ($dt = r_2\,ds$, same coordinates). This keeps the STM in physical coordinates and is enough at rtol 1e-12 except for near-collisions, which are labelled `collision` anyway. Full LC follows in M4.
* Tests: a near-collision trajectory ($r_{2,\text{peri}} \sim 10^{-6}$) conserves $C$ to 1e-10; results agree with the non-regularized integration where both are valid.

### 3.6 `events.js`

* Event functions on the dense output, checked after every accepted step:
  * $\sigma_{\text{out}} = r_2 - \rho$, outward ($\dot r_2 > 0$);
  * $\sigma_{\text{in}} = r_2 - \rho$, inward (re-entry, see C2);
  * $\sigma_{\text{far}} = r_2 - \rho_{\text{far}}$, outward (terminates multi-pass tracking);
  * $\sigma_{\text{coll}} = r_2 - R_{\text{body}}$, inward;
  * time limit $T$.
* Root finding: bracket with a sign change on the dense output, refine with Illinois or Brent to $|t|$ 1e-14, then re-evaluate the full state (and STM) at the root.
* Grazing tangencies: also check the interior extremum of $\sigma$ inside a step (sample the dense output at 4 points) to catch double crossings in one step.
* Ignore the initial crossing: start with a guard that requires $r_2 < \rho - \epsilon$ or $t > t_{\min}$.

### 3.7 `encounter.js`

* `seed(alpha, beta, C, mu, rho)` returns $\mathbf s_{\text{in}}$, or `null` if $2\Omega < C$.
* `seedJacobian(...)` returns the analytic $\partial \mathbf s_{\text{in}}/\partial\xi$ (4×2). It includes $\partial|\mathbf v|/\partial\alpha = \nabla\Omega\cdot\partial\mathbf r/\partial\alpha \,/\, |\mathbf v|$. Test against finite differences.
* `propagate(xi, params)` returns an `EncounterResult`: `{label, sOut, tau, rPeri, nPasses, STM, DPhi (4x2), DPhiFull (4x4), jacobiDrift, flags}`.
* Crossing-time correction (§8.2 step 5): $D\Phi = \left(I - \dfrac{\mathbf f\,\nabla\sigma^\top}{\nabla\sigma\cdot\mathbf f}\right)\Phi_{\text{STM}}$. Apply it to the full 4×4 matrix first, then multiply by $\partial\mathbf s_{\text{in}}/\partial\xi$.

### 3.8 `fields.js`

Per-sample fields, computed in the worker:

| Field | Computation |
| --- | --- |
| $\Delta\mathbf v$ (2) | C4 bookkeeping; inertial exit velocity rotated by $R(-\tau)$ |
| $\Delta\mathbf v_R$ (2) | direct difference |
| $\Delta E$, $\Delta h$ | from `cr3bp.js`; store both, plus $\lvert\Delta E-\Delta h\rvert$ as a diagnostic |
| $\Delta\mathcal E_1$ | $P_1$ position/velocity at entry and exit instants |
| $A$ (4), $\mathbf b$ (2) | C5; $\mathbf b = \mathbf v_{I,\text{out}} - A\mathbf v_{I,\text{in}}$ |
| $\delta_{\text{eff}}$, $s_1, s_2$ | closed-form 2×2 polar decomposition; eigenvalues of $S$ |
| $\tau$, $r_{2,\text{peri}}$ | track the minimum of $r_2$ via dense output |
| $\alpha_{\text{out}}, \beta_{\text{out}}$ | inverse of the seed parametrization at exit (outward normal) |
| $\nabla_{\mathbf s}\Delta E \cdot D\Phi$ | analytic gradient $d\Delta E$ (2), using $\partial E/\partial \mathbf s$ at entry and exit |

### 3.9 `differential.js`

* **Gradient.** Analytic per sample (above). The FD gradient is also computed in post-processing as a cross-check.
* **Hessian, method (a).** Centred differences of the analytic gradient on the grid. Symmetrize $H \leftarrow \tfrac12(H+H^\top)$ and store the asymmetry as a diagnostic. **Mask:** a stencil that touches a neighbour with a different label, or with `orientationFlip`, gives `NaN`.
* **Hessian, method (b).** `stt.js` adds second-order variational equations ($4\times4\times4$, symmetric reduction to 40 components). It is run only on selected points and on validation grids.
* **Sensitivity metric.** $g_\Phi = D\Phi^\top K\, D\Phi$ with $K = \operatorname{diag}(1/\rho^2, 1/\rho^2, 1/v_c^2, 1/v_c^2)$ and $v_c = \sqrt{\mu/\rho}$.
* **FTLE.** $\sigma = \frac{1}{|\tau|}\ln\sqrt{\lambda_{\max}(g_\Phi)}$, using the closed-form symmetric 2×2 eigenvalues.
* **$\kappa_E$.** $|d\Delta E|^2_{g_0} / \operatorname{tr} g_\Phi$, where $g_0$ is the flat metric on $(\alpha,\beta)$.
* **Signature.** Classes `+ +`, `− −`, `+ −`, and `degenerate` (when $|\det H|$ is below a tolerance scaled by $\|H\|^2$).

### 3.10 `patchedConic.js`

* $\delta(b,u)$, $R(\delta)$, the affine map, $\Delta E = \mathbf V_P\cdot\Delta\mathbf v$, and the analytic Jacobian of §4.3.
* A `fromXi` adapter maps $(\alpha,\beta)$ to $(b, \mathbf u_{\text{in}})$ with the same seed, so that figure 5 compares like with like.
* The sign of $\delta$ follows $\operatorname{sign}(\beta)$ by convention C1. A test checks it against the CR3BP at Sun–Earth $\mu$.

### 3.11 `grid.js` and `quadtree.js`

* **`EncounterGrid`** (structure of arrays):
  * `meta {mu, C, rho, rhoFar, N, alphaRange, betaRange, tol, T, version, hash}`;
  * `label: Uint8Array(N*N)`;
  * `fields: { [name]: Float64Array(N*N*k) }`, driven by a field registry: `{name, components, units, colormap: 'diverging'|'sequential'|'categorical'|'gray', symmetricRange}`.
  * Everything is transferable to and from workers without copying.
* **`Quadtree`** has leaves holding the same per-sample record.
  * Refinement criteria: a label change across a cell, $\sigma > \sigma_{\text{thr}}$, or $|\Delta E|$ jump > threshold.
  * Max depth is configurable (default 3 on top of 256², i.e. effectively 2048² near structure).
  * Rendering resamples the leaves onto a texture of the finest needed resolution in the visible window.

---

## 4. Compute Layer (`src/compute/`)

* **`workerPool.js`.** `navigator.hardwareConcurrency - 1` module workers (`new Worker(url, {type:'module'})`).
  * Each job carries a generation id. Changing parameters bumps the generation, and stale results are dropped. A cancel message makes workers abandon the current tile at the next sample boundary.
* **`jobs.js`.** Progressive passes 64² → 128² → 256² → 512².
  * Each pass reuses the samples of the previous one, since every other point coincides when the grid is nested. Use nested node grids in $\alpha$ and cell-centred refinement in $\beta$ (3:1 subdivision keeps the centres nested).
  * Tiles are row bands of about 2k samples, ordered from the centre outward so the interesting region appears first.
* **`encounterWorker.js`.** Imports `core/`, preallocates integrator buffers once, and loops over the samples in a tile. It posts back `{tileId, gen, label, fields...}` with transfer lists.
* **`postprocess.js`.** Runs once each pass completes:
  * Hessian finite differences, signature, streamline seeds, and refinement marks.
  * Runs in a worker for N ≥ 256 so the UI stays responsive.
* **`cache.js`.** IndexedDB store `grids`, keyed by `hash(meta)`.
  * Stores raw `ArrayBuffer`s.
  * The `version` in the key invalidates the cache whenever `core/` numerics change (bump on every numerics PR).
* **Jacobi-slider prefetch.** After the main grid finishes, compute a stack of K = 24 levels at 128² across $[C_{L_3} - \epsilon,\ C_{L_1} + \epsilon]$, in the background at low priority.

---

## 5. Rendering (`src/render/`)

### 5.1 General

* One `WebGLRenderer`, two `OrthographicCamera`s, drawn into two viewports with `setScissor`. This avoids two GL contexts and lets layers share textures.
* Pan and zoom per view via `MapControls` with rotation disabled.
* Lagrange-point labels and axis ticks use `CSS2DRenderer`.
* Render on demand only: request a frame on store change, pointer interaction, or new data. Never run a continuous loop.

### 5.2 Physical view (layers 0–2, ring, trajectory)

* **L0, potential.** Full-screen quad with a fragment shader evaluating $\Omega$ in float32. Contours use log-spaced levels and `fwidth`-based anti-aliased lines. Clamp near the primaries.
* **L1, zero-velocity curves.** The same shader with a `uC` uniform. Shade where $2\Omega < C$ and draw the boundary line. The slider updates only the uniform, at no cost.
* **L2, markers.** Primaries are sized discs (with the true radius when zoomed). $L_1$–$L_5$ are crosses. The Hill circle and the $\rho_{\text{far}}$ circle are drawn as `LineLoop`s.
* **Ring.** An annulus mesh just outside $\rho$. A 1D `DataTexture` holds $\Delta E$ reduced over $\beta$ (mean, max, or min, selectable).
* **Trajectory.** `Line2` (fat lines from addons), coloured by time. Inertial $\mathbf v_{\text{in}}$ and $\mathbf v_{\text{out}}$ are arrows at entry and exit. An optional ghost shows the patched-conic hyperbola.

### 5.3 Manifold view (layers 3–9)

* Plane mapped to $\alpha\in[0,2\pi)$ (horizontal) and $\beta\in(-\pi/2,\pi/2)$ (vertical). Axis ticks are in degrees.
* **L3, L4, L7, L8.** Each is a float32 `DataTexture` (`RedFormat`/`FloatType`, nearest filtering by default, linear as an option) on a quad. A shared heatmap shader takes uniforms `{range, colormapLUT, nanColor, opacity}`.
  * The diverging map is always zero-centred, with a symmetric range and an optional lock.
  * Labels are drawn with the categorical palette. Masked and NaN cells use a hatch pattern.
* **L5, quiver.** `InstancedMesh` arrows subsampled to about 40×40 in screen space, re-subsampled on zoom. Coloured by $|\Delta\mathbf v|$.
* **L6, streamlines.** CPU RK4 through the bilinearly interpolated $d\Delta E$ field, seeded on a jittered grid with a separation-distance rule (Jobard–Lefer). Rendered as `LineSegments` with an arrowhead every n segments. Recomputed only when data changes.
* **L9, glyphs.** `InstancedMesh` of a unit-circle line loop. The per-instance matrix is $A$ (scaled to a cell size), and a tick shows $\delta_{\text{eff}}$. `orientationFlip` instances use a distinct colour.
* **Picking.** Map pointer → $(\alpha,\beta)$ through the camera inverse (no raycasting needed). Look up the nearest sample, then:
  * re-integrate that single trajectory on the main thread with dense output for drawing;
  * fill the inspector with all fields;
  * mark the point with a crosshair.

### 5.4 `colormaps.js`

* 256-entry LUTs as small `DataTexture`s: a diverging map (e.g. a balanced blue–white–red), viridis for sequential data, a gray ramp for FTLE, and an 8-colour categorical palette.
* The legend component renders the same LUT into a DOM canvas.

---

## 6. UI and State

* **`store.js`.** A minimal observable: `get`, `set(patch)`, `subscribe(selector, cb)`. State slices:
  * `params` (system, μ, C, ρ factor, $k_{\text{far}}$, N, T, tol, mode: `local` | `longRange`);
  * `layers` (visible, opacity, range lock per layer);
  * `selection` (ξ or null);
  * `compute` (generation, progress);
  * `ringReduce`.
* **`controls.js`.** A system preset sets μ and $R_{\text{body}}$; μ can also be entered directly. A "C presets" button row offers {L1 closed, L1 open, L2 open, L3 open}.
* **`jacobiSlider.js`.** Shows tick marks at $C_{L_i}$.
  * During scrubbing, show the nearest prefetched 128² level, cross-fading between two levels, and update the L1 uniform continuously.
  * On release, enqueue a full-resolution computation.
* **`inspector.js`.** Table of every field at the selection, plus diagnostics ($|\Delta E - \Delta h|$, Jacobi drift, Hessian asymmetry) and a "run STT Hessian here" button for method (b).
* **`export.js`.** PNG of either panel or both, at a chosen resolution (offscreen render). Binary export of the `EncounterGrid` (header JSON + raw buffers) for the paper figures.
* **URL state.** Encode `params` and visible layers in the hash so every figure is reproducible from a link.

---

## 7. Performance Plan

* **Estimate.** One 20-dimensional DOP853 trajectory at rtol 1e-12 through a Hill-sphere passage costs roughly 200–2,000 steps × 12 stages. That is about 0.5–5 ms in V8 with zero allocation. A 512² grid (262k samples) on 8 workers then takes about 0.3–3 min, which meets the §8.5 target.
* **Rules for the hot path.**
  * No allocation in `rhs`, `step`, or event code: preallocated `Float64Array`s and manual loops.
  * Unroll 2×2 and 4×4 operations.
  * Integrate only the 4-dimensional system for samples where only the label is needed (e.g. refinement probes).
* **Early termination.** Stop at $T$. Use lower T for the progressive preview passes.
* **Benchmark harness.** `tests/bench.html` reports samples/s per worker and a step-count histogram. Record results in `docs/perf.md` at each milestone.
* **Fallback if the budget is missed by more than 3×.** Compile `dop853` + `variational` to WASM (AssemblyScript or hand-written Rust). The `core/` API stays the same.

---

## 8. Testing and Validation

Tests use `node:test` with no dependencies. The browser runner imports the same files.

| §10 test | Implementation | Milestone |
| --- | --- | --- |
| 1 Jacobi conservation | assert $\max_t |C(t)-C(0)| < 10^{-10}$ on 1,000 random encounters, including near-collisions | M1 |
| 2 $\Delta E = \Delta h$ | same set, $< 10^{-9}$; also a live diagnostic layer in the app | M1 |
| 3 Patched-conic limit | Sun–Earth μ, small ρ: compare $\delta_{\text{eff}}$ and $\Delta E$ with `patchedConic.js`; error trend → 0 as μ→0 | M4 |
| 4 Symmetry | map $(x,y,\dot x,\dot y)\mapsto(x,-y,-\dot x,\dot y)$ and reverse time: entry ξ ↔ exit ξ correspondence on the grid, to tolerance | M4 |
| 5 Derivative accuracy | $D\Phi$ (STM + crossing correction) vs central FD at $h$ and $h/2$; observed order ≈ 2 | M4 |
| 6 Manifold correspondence | compute Lyapunov orbits at $L_1/L_2$ (differential correction), globalize manifolds, intersect with $\Sigma_{\text{in}}$, compare with FTLE ridge positions | M1 (tooling), M4 (comparison) |
| 7 Convergence | ΔE and σ on 128²/256²/512², and at rtol 1e-10/1e-11/1e-12; report norms away from label boundaries | M4 |

Additional unit tests: seed Jacobian vs FD, polar decomposition round-trip, the C1 sign convention, the C2 multi-pass state machine on hand-built trajectories, and cache round-trip.

Note on test 6: Lyapunov-orbit computation is a self-contained module, `core/lyapunov.js` (single shooting with the half-period symmetry), added in M1 because test 6 depends on it.

---

## 9. Milestones

Each milestone ends with green tests, a short entry in `docs/`, and a tagged commit.

### M0 — Literature review (parallel with M1)

* Survey: CR3BP FTLE/LCS (Gawlik et al.; Short & Howell), Keplerian and flyby maps (Ross & Scheeres), Tisserand graphs (Strange & Longuski), periapsis Poincaré maps (Haapala & Howell; Villac), and the energy/angular-momentum relations in the CR3BP.
* Deliverable: `docs/literature.md` and a revised novelty statement in `idea.md` §11.

### M1 — Integrator core

* `linalg`, `cr3bp`, `frames`, `lagrange`, `dop853`, `variational`, `events`, `lyapunov`, and `regularize` (at least the Sundman fallback).
* Tests 1, 2, and the tooling for 6. Integrator unit tests. Benchmark harness.
* **Exit criterion:** 1,000 random encounters pass tests 1 and 2; throughput is measured.

### M2 — Encounter sampler and outcome partition

* `conventions`, `encounter`, `grid`, `workerPool`, `encounterWorker`, `jobs`, `cache`.
* Minimal app shell: `index.html`, `store`, `renderer`, physical view layers 0–2, manifold view layer 3, and basic controls.
* **Exit criterion:** the Earth–Moon outcome partition at 256² for three C levels renders progressively and is cached.

### M3 — Field computation

* `fields.js` complete. Layers 4 and 5, the ring layer, picking, the trajectory layer, and the inspector.
* **Exit criterion:** figure 1 (ΔE at three Jacobi levels) can be produced; the $|\Delta E - \Delta h|$ diagnostic is below 1e-9 everywhere on exit samples.

### M4 — Differential structure

* `differential.js`, `postprocess.js`, `stt.js`, `patchedConic.js`, `quadtree.js`, and full Levi-Civita regularization if M1 shipped Sundman only.
* Layers 6–9.
* Tests 3, 4, 5, 7, and the test 6 comparison.
* **Exit criterion:** all of §10 passes; FD and STT Hessians agree at sample points.

### M5 — Linked views and the Jacobi slider

* Prefetch stack, slider cross-fade, layer panel with range locks, URL state, export, legends, and long-range mode (sections $x=\text{const}$ near $L_1/L_2$ via a pluggable section interface in `events.js`).
* **Exit criterion:** scrubbing C through $C_{L_1}$, $C_{L_2}$, $C_{L_3}$ is interactive (≥ 30 fps), with full-resolution refinement on release.

### M6 — Figures and write-up

* The §9.3 figure set, exported at publication resolution from URL presets stored in `docs/figures.md`.
* Technical write-up that includes the validation tables and initial answers to the open questions of §13.

---

## 10. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| DOP853 port errors (coefficient typos) | Generate the coefficient table from the reference Fortran/C source by script; test the order of convergence |
| LC regularization + STM complexity | Sundman fallback (§3.5); the near-collision band is a small, labelled region |
| Event misses at grazing exits produce label noise | Interior-extremum check (§3.6); adaptive refinement highlights residual noise for inspection |
| Hessian FD noise near fractal label boundaries | Masking (§3.9), STT spot-checks, display of $|\det H|$ only where the stencil is clean |
| JS too slow for 512² in minutes | Progressive passes keep the UI useful; WASM fallback (§7) |
| Float32 textures lose dynamic range for ΔE near the primaries | Normalize on the CPU before upload; optional symmetric-log colour scaling |
| Novelty claim fails (M0) | The tool remains valuable as an integrated visualization; adjust the write-up framing |
| Spec drift between `idea.md` and code | `conventions.js` + `docs/math.md` are the single source of truth; update `idea.md` in the same PR |

---

## 11. Coding Conventions

* ES2022 modules, `.js` extension in every import path, no default exports from `core/`.
* JSDoc types on all public functions (enables editor checking via `// @ts-check` without a build).
* Units are always normalized CR3BP units inside `core/`. Conversion to km and km/s happens only in the UI.
* Every numerics change bumps `CORE_VERSION` in `conventions.js`, which invalidates the cache.
* Formatting with Prettier defaults (an editor setting, not a build dependency).