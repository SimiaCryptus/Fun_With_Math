# Finite-Element Quantum Sandbox

An interactive, browser-based simulator for single-electron wavefunctions.
The user shapes a potential energy landscape, and the app solves the
nonrelativistic Schrödinger equation on a finite-element mesh in real time,
rendering the wavefunction and its derived observables with three.js.

The goal is an intuitive "playground" that makes bound states, tunneling,
and free wavepackets tangible, while still being numerically honest enough
to be useful for students and hobbyists checking analytic results.

---

## 1. Physics Scope

### 1.1 Governing equation

Time-independent Schrödinger equation (TISE), used for eigenstate labs:

    -(ħ² / 2m) ∇²ψ(r) + V(r) ψ(r) = E ψ(r)

Time-dependent Schrödinger equation (TDSE), used for wavepacket labs:

    iħ ∂ψ/∂t = -(ħ² / 2m) ∇²ψ + V(r) ψ

Assumptions and limits:

- Single electron, nonrelativistic, no spin.
- Static or slowly-varying external potential (no back-reaction).
- Dimensions: 1D primary, 2D secondary. 3D radial problems (e.g. hydrogen)
  are reduced to a 1D radial equation.
- Natural / atomic units by default (ħ = m_e = e = 1, energies in Hartree,
  lengths in Bohr). A unit toggle converts to eV / nm / fs for display.

### 1.2 Boundary conditions

- Dirichlet (ψ = 0) at the domain edge — default for bound-state labs.
- Periodic — for free-particle and band-structure experiments.
- Absorbing (complex absorbing potential / perfectly matched layer) —
  for scattering and tunneling so outgoing packets don't reflect.

---

## 2. Numerical Method

### 2.1 Finite-element discretization

- Galerkin FEM with Lagrange basis functions (linear by default, quadratic
  optional) on a 1D interval or 2D triangular/quad mesh.
- Assemble the stiffness matrix `K` (kinetic term), potential matrix `Vm`,
  and mass matrix `M`:

      H = (ħ² / 2m) K + Vm
      generalized eigenproblem:  H ψ = E M ψ

- Mesh refinement: uniform by default; optional adaptive refinement where
  |∇V| or |∇ψ| is large (e.g. near barrier edges or the Coulomb singularity).

### 2.2 Eigenvalue solver (TISE)

- Sparse symmetric generalized eigenproblem.
- Solver: shift-and-invert Lanczos or LOBPCG for the lowest N eigenpairs
  (N user-selectable, default 8).
- Runs in a Web Worker so the UI stays responsive; results streamed back
  as they converge.
- Cache factorizations when only the potential's scalar parameters change
  (e.g. well depth) to allow near-real-time sliders.

### 2.3 Time propagation (TDSE)

- Crank–Nicolson (unconditionally stable, unitary):

      (M + iΔt/2ħ · H) ψⁿ⁺¹ = (M − iΔt/2ħ · H) ψⁿ

  Solved with a sparse LU factorization reused every step.

- Alternative: split-operator / expansion in the computed eigenbasis for
  fast playback when the potential is static.
- Adjustable Δt with an on-screen norm-drift indicator as a sanity check.

### 2.4 Validation

Each built-in lab ships with analytic (or high-precision reference) values
so the user can see FEM error vs. mesh resolution:

- Infinite square well: E_n = n²π²ħ² / (2mL²)
- Harmonic oscillator: E_n = ħω(n + ½)
- Hydrogen (radial): E_n = −13.6 eV / n²
- Rectangular barrier: analytic transmission coefficient T(E)

---

## 3. Main Labs

### 3.1 Proton Well (Coulomb / hydrogen-like)

- Potential: V(r) = −k e² / r, optionally softened as −k e² / √(r² + a²)
  to avoid the singularity on coarse meshes.
- Solve the radial equation for chosen ℓ; show radial probability density
  r²|R(r)|² and the effective potential including the centrifugal term.
- Compare computed E_n to the Bohr formula; display % error.
- Optional 2D mode: full 2D Coulomb problem for visual orbital-like shapes.
- Sliders: nuclear charge Z, softening a, angular momentum ℓ, domain radius.

### 3.2 Tunneling Potential

- Potentials: single rectangular barrier, double barrier (resonant
  tunneling), step, and user-drawn barriers.
- Modes:
  - **Stationary**: scattering states at fixed energy; plot T(E) and R(E)
    vs. energy and compare to the analytic formula.
  - **Wavepacket**: launch a Gaussian packet toward the barrier, watch it
    split into reflected and transmitted parts; live readout of
    ∫|ψ|² on each side.
- Sliders: barrier height V₀, width w, separation (double barrier),
  packet energy, packet width σ.

### 3.3 Harmonic Oscillator

- Potential: V(x) = ½ m ω² x², plus optional anharmonic terms (λx³, λx⁴)
  to show how degeneracies and spacing break.
- Show the equally spaced ladder of levels and Hermite-Gaussian states.
- Coherent-state demo: superpose eigenstates with Poisson weights and watch
  the packet oscillate classically without spreading.
- Sliders: ω, anharmonic coefficients, displacement of a coherent state.

### 3.4 Additional / stretch labs

- Finite square well (bound-state count vs. depth).
- Double well (tunneling splitting, symmetric/antisymmetric pair).
- Periodic lattice (Kronig–Penney) with band-structure readout.
- Free-form: draw V(x) with the mouse or type a JS/math expression.

---

## 4. Visualization

Rendered with three.js; all layers can be toggled independently.

- **Wavefunction ψ**
  - Real and imaginary parts as two curves (1D) or surfaces (2D).
  - Phase-colored |ψ| ("color wheel" phase mapping) — the default view.
  - 3D "corkscrew" view: Re ψ and Im ψ as the two transverse axes along x,
    making the phase rotation of traveling packets visible.
- **Probability density |ψ|²** — filled area / height map.
- **Potential V(x)** — drawn on the same axes; energy eigenvalues drawn as
  horizontal lines that light up when their state is selected.
- **Energy distribution** — bar chart of |cₙ|² for the current state
  projected onto the computed eigenbasis; also a momentum-space |φ(k)|²
  plot via FFT of ψ.
- **Probability current j(x)** — arrows or a signed curve, useful in
  tunneling.
- **Classical overlay** — turning points and the classical probability
  distribution for comparison with high-n states.
- Camera: orthographic 2D by default, orbit-able perspective for the 3D
  views. Smooth transitions between modes.

---

## 5. Metrics Panel

Updated every frame (TDSE) or on each solve (TISE):

| Metric        | Definition                               |
| ------------- | ---------------------------------------- |
| Norm          | ∫                                        | ψ   | ² dx (should stay ≈ 1) |
| ⟨x⟩, ⟨p⟩      | position / momentum expectation          |
| Δx, Δp, Δx·Δp | uncertainties and the product vs. ħ/2    |
| ⟨E⟩, ⟨T⟩, ⟨V⟩ | total, kinetic, potential energy         |
| Eₙ list       | eigenvalues with analytic comparison     |
| P(region)     | probability in user-defined intervals    |
| T, R          | transmission / reflection (tunneling)    |
| Nodes         | node count of the selected eigenstate    |
| Solver stats  | mesh size, iterations, residual, ms/step |

---

## 6. Interaction

- Every potential parameter is a slider or numeric field; the mesh
  reassembles and the solver reruns incrementally as the slider moves.
  Target: < 100 ms latency for 1D meshes up to ~2000 nodes.
- Drag energy-level lines to select eigenstates; shift-click to build
  superpositions with adjustable phase and amplitude per component.
- Click-and-drag on the canvas to sculpt the potential in free-form mode.
- Play / pause / step / speed controls for time evolution, with a
  scrubber over the recorded history.
- Presets and shareable URLs encoding the full lab state.
- Export: PNG snapshot, CSV of ψ and V, JSON of the full state.

---

## 7. Moving Frame of Reference

A free wavepacket with momentum p leaves the domain quickly. To follow it:

- **Galilean boost**: transform to a frame moving at velocity v = p/m.
  In that frame ψ' = ψ · exp(−i(mvx − ½mv²t)/ħ), the packet is stationary
  on average, and the user can watch it spread (dispersion) indefinitely.
- **Tracking camera**: keep the lab frame but translate the camera and the
  domain window so ⟨x⟩ stays centered; the mesh is re-centered on the
  packet each time it drifts more than a threshold, with ψ interpolated
  onto the new mesh.
- A frame toggle in the UI shows the current v and the phase gradient
  (visible as the corkscrew pitch) changing between frames, illustrating
  that |ψ|² is frame-independent while the phase is not.
- Potentials that are static in the lab frame become moving in the boosted
  frame; the renderer draws V in whichever frame is active.

---

## 8. Architecture

Stack: plain HTML + modular ES6 (no bundler required, native `import`) +
three.js. Numerical kernels in plain JS/TypedArrays, with optional WASM
acceleration later.

    /src
      core/
        mesh.js          – 1D/2D mesh generation and refinement
        fem.js           – basis functions, quadrature, matrix assembly
        sparse.js        – CSR matrix, sparse LU, mat-vec
        eigen.js         – Lanczos / LOBPCG eigen-solver
        propagate.js     – Crank–Nicolson time stepping
        observables.js   – norm, expectation values, currents, FFT
        units.js         – atomic ↔ SI conversion
      potentials/
        coulomb.js, barrier.js, harmonic.js, freeform.js, ...
      labs/
        protonWell.js, tunneling.js, harmonicOscillator.js, ...
      render/
        scene.js         – three.js scene, camera, frame-of-reference
        layers/          – wavefunction, density, potential, energy bars
        colormaps.js
      ui/
        panel.js         – sliders, toggles, metrics table
        state.js         – single source of truth, URL serialization
      workers/
        solver.worker.js – off-main-thread assembly and solves
    index.html
    /tests               – unit tests against analytic solutions

Data flow:

    UI state ──► potential ──► mesh/assembly ──► solver (worker)
                                                    │
      renderer ◄── observables ◄── ψ, Eₙ ◄──────────┘

---

## 9. Milestones

1. **Core 1D FEM**: mesh, assembly, dense eigen-solve, infinite well
   validated against analytic energies.
2. **Rendering**: three.js 1D plot of V, ψ, |ψ|², energy levels.
3. **Harmonic oscillator lab** with sliders and live re-solve.
4. **Sparse solver + worker** for interactivity on fine meshes.
5. **Crank–Nicolson TDSE**, wavepacket launcher, tunneling lab.
6. **Proton well** (radial equation, softened Coulomb).
7. **Moving frame** (boost + tracking camera), corkscrew phase view.
8. **Superposition builder, metrics panel, export/share URLs.**
9. **2D mode** and stretch labs (double well, lattice, free-form).

---

## 10. Open Questions

- Linear vs. quadratic elements as the default — trade accuracy near the
  Coulomb singularity against assembly cost on every slider move.
- Whether to persist a precomputed eigenbasis for TDSE playback (fast,
  but breaks when the potential changes mid-run) or always use CN.
- How aggressive the absorbing boundary must be to make T/R readouts
  trustworthy without visibly distorting the packet.
- Mobile / touch support and the minimum mesh size that stays interactive
  on low-end devices.
