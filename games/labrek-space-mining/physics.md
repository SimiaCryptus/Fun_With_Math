# Labrek Space Mining — Physics System Specification

**Status:** Draft v1.0 · **Companion to:** `idea.md` (game spec) · **Scope:** `src/sim/` (headless, DOM-free)

This document specifies the Labrek physics system in two parts:

- **Part A** gives the mathematics.
- **Part B** gives the code plan.

The same code must:

- run headless under Node.js (`node --test`) for validation, and
- run unchanged inside a browser module Web Worker for the game.

Where this document conflicts with `idea.md` §4, **this document wins**. The deliberate changes are listed in §B.9.

---

## 0. Design Decisions at a Glance

| #  | Decision                                                                                                                                                                                            | Why                                                                                                                          |
|----|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| D1 | **One simulation frame.** It rotates at a constant angular velocity `Ω`, chosen to match the primary body's spin. `Ω` is piecewise constant and changes only by discrete *re-basing* between steps. | The primary is nearly at rest in this frame. Frame velocities are small, gravity grids stay valid, and precision stays high. |
| D2 | **Voxels are Lagrangian material cells** of edge `h`, a world parameter with default 2 m. Each voxel is carried by its cluster.                                                                     | Mass is conserved exactly. There is no numerical diffusion of rock.                                                          |
| D3 | **The mechanics is a discrete Cauchy momentum ("Navier–Stokes") equation.** The viscous law is replaced by a rigid-plastic Mohr–Coulomb friction law, evaluated on voxel faces.                     | This is the high-friction regime. Material is mostly locked (static) and yields into heat-producing slip (dynamic).          |
| D4 | **Connected sets of static faces are solved exactly as rigid clusters.** Only dynamic faces enter the contact/friction solver.                                                                      | This is mathematically exact (§A.4.5) and cheap, because most faces are static most of the time.                             |
| D5 | **Gravity uses FFT convolution** (Hockney zero-padded, isolated boundaries) on grids that share the frame's geometry. Small movers use direct terms. The far field uses multipoles.                 | O(P³ log P) per rebuild. The field is recomputed only when the mass distribution changes significantly.                      |
| D6 | **Every joule dissipated by slip or inelastic contact becomes voxel heat.**                                                                                                                         | Friction heats rock. This feeds volatiles and sintering, and it closes the energy ledger for tests.                          |
| D7 | **Determinism:**<br>- Float64 state<br>- fixed step<br>- sorted iteration<br>- no transcendental `Math.*` in state paths<br>- work slicing measured in *work units*, not milliseconds               | Enables bit-identical replays and regression tests.                                                                          |

---

# Part A — Mathematics

## A.1 Notation and Units

SI units are used throughout.

**Vector conventions:**

- Vectors are bold in prose and plain in code.
- `a×b` is the cross product.
- `[a]×` is the skew matrix of `a`.
- `|a|` is the Euclidean norm.

| Symbol     | Meaning                                                                                 | Default / typical         |
|------------|-----------------------------------------------------------------------------------------|---------------------------|
| `h`        | Voxel edge (simulation resolution)                                                      | 2.0 m                     |
| `H`        | Gravity grid spacing, `H = n_g·h`                                                       | `n_g = 1` or `2`          |
| `dt`       | Physics step                                                                            | 1/60 s                    |
| `Ω`        | Angular velocity of the simulation frame relative to inertial space                     | Primary spin, ~1e-4 rad/s |
| `x, u`     | Position and velocity *in the rotating frame*                                           | —                         |
| `m_i, φ_i` | Voxel mass and fill fraction, `m_i = ρ_mat·φ_i·h³`                                      | —                         |
| `X, U`     | Cluster COM position and frame velocity                                                 | —                         |
| `q, R`     | Cluster orientation (body → frame) as a quaternion and as a matrix                      | —                         |
| `ω_b`      | Cluster **absolute** (inertial) angular velocity, in **body** coordinates               | —                         |
| `ω_r`      | Cluster angular velocity relative to the frame, in frame coordinates: `ω_r = R·ω_b − Ω` | —                         |
| `I_b`      | Cluster inertia tensor about the COM, body coordinates                                  | —                         |
| `n_f, A_f` | Face unit normal (from voxel `a` to voxel `b`) and effective face area                  | —                         |
| `σ_n, τ`   | Face normal stress (compression positive) and shear stress magnitude                    | Pa                        |
| `c_f, T_f` | Face cohesion (shear strength at zero normal load) and tensile strength                 | Pa, from materials        |
| `μ_s, μ_d` | Static and dynamic friction coefficients, with `μ_d = κ_μ·μ_s`                          | `κ_μ = 0.8`               |
| `G`        | Gravitational constant (times the optional gameplay multiplier)                         | 6.674e-11                 |

---

## A.2 The Rotating Reference Frame

### A.2.1 Definition

The simulation uses a single frame `𝓕` with these properties:

- Its origin is at the system barycenter.
- It rotates relative to the local inertial frame `𝓘` with angular velocity `Ω`.
- `Ω` is constant between re-basing events.

Let `R_f(t)` be the orientation of `𝓕` in `𝓘`. Then:

~~~
x_I = R_f · x
v_I = R_f · (u + Ω × x)
~~~

Because `Ω` is constant between re-basings, the **Euler force** `−Ω̇ × x` is identically zero. Only two fictitious
accelerations remain:

~~~
a_cor  = −2 Ω × u              (Coriolis;   does no work)
a_cent = −Ω × (Ω × x)          (centrifugal; derivable from −∇(−½|Ω×x|²))
~~~

> **Terminology note.** A rotating frame is not inertial. "Single rotating inertial reference frame" in the brief is
> implemented as follows:
>
> - one frame, rotating at constant rate, with its fictitious forces added exactly;
> - all *constitutive* physics (stress, friction, heat) computed from frame-independent quantities.
>
> Setting `Ω = 0` recovers a true inertial frame. This is used as the reference in tests.

### A.2.2 Point-mass equation of motion

~~~
ẋ = u
u̇ = g(x) + f/m − 2 Ω × u − Ω × (Ω × x)
~~~

For a static potential `Φ` (with `g = −∇Φ`) and no applied force, the **Jacobi integral** is conserved:

~~~
C_J = ½|u|² + Φ(x) − ½|Ω × x|²
~~~

`C_J` is a primary regression quantity for the frame integrator (§B.7).

### A.2.3 Choosing and re-basing `Ω`

**Initialization:** `Ω := R_p · ω_b,p`. This is the absolute angular velocity of the primary cluster, which is the most
massive cluster.

**Re-basing trigger.** Players despin, spin up and fracture the body, so the primary drifts relative to the frame.
Re-base at the start of a step if:

~~~
|ω_r,p| · R_p > u_rebase        (u_rebase = 1 mm/s; R_p = primary bounding radius)
~~~

**Re-basing** is an instantaneous change of observer, `Ω_old → Ω_new`. No physical state changes, so it cannot inject
energy. For every cluster `k` and particle `j`:

~~~
U_k ← U_k + (Ω_old − Ω_new) × X_k
u_j ← u_j + (Ω_old − Ω_new) × x_j
ω_b,k unchanged                          (absolute, body coordinates)
~~~

Positions, orientations and gravity grids are unchanged. The next step simply uses the new `Ω`.

**Principal-axis tumbling primary.** If the primary tumbles about a non-principal axis, `ω_r,p` is never small. In
that case:

- The re-basing trigger is suppressed.
- `Ω` is set to the component of `ω_b,p` along the angular momentum `L_p` (the mean spin axis).
- Re-basing is limited to at most once per `T_rebase = 600 s`.

Correctness does not depend on how well `Ω` is chosen. The choice only affects efficiency and precision.

### A.2.4 Frame orientation bookkeeping (deterministic)

`R_f` is needed only for three things:

- heliocentric Δv booking,
- the sun direction,
- diagnostics in `𝓘`.

It is stored as a quaternion `q_f` and advanced by a constant step quaternion. The step quaternion is built without
trigonometry, using the Cayley map:

~~~
q_step = normalize( [1, ½·Ω·dt] )          (rotation angle 2·atan(½|Ω|dt) ≈ |Ω|dt)
q_f    ← normalize( q_f ⊗ q_step )
ŝ_𝓕    ← Cayley(−Ω·dt) · ŝ_𝓕               (sun direction seen from the frame)
~~~

This defines the *effective* frame rate as `Ω_eff = 2·atan(½|Ω|dt)/dt`. The relative difference from `|Ω|` is below
1e-14 at game rates. The same Cayley map is used for Coriolis (§A.5.3), so the frame is self-consistent.

### A.2.5 Inertial invariants expressed in the frame

For tests and the ledger, the inertial momenta are written in frame coordinates. With `d_k = X_k − X_sys`:

~~~
P   = Σ_k M_k (U_k + Ω × X_k)
L   = Σ_k [ R_k I_b,k ω_b,k + M_k X_k × (U_k + Ω × X_k) ]
~~~

In an isolated system these are constant in `𝓘`. In `𝓕` they therefore precess:

~~~
dP/dt|_𝓕 = −Ω × P
dL/dt|_𝓕 = −Ω × L
~~~

Tests rotate them back with `q_f` and check them for constancy.

---

## A.3 Voxelization

### A.3.1 Voxels

A voxel `i` is a cube of edge `h`, owned by cluster `c(i)`, at integer lattice coordinates `k_i ∈ ℤ³` in that
cluster's body lattice. Its frame position is:

~~~
x_i = X_c + R_c · r_i,     r_i = h·k_i − s_c      (s_c = COM offset of the lattice origin, body coords)
m_i = ρ(mat_i) · φ_i · h³
~~~

**Resolution:**

- `h` is chosen per world.
- Every material strength in `idea.md` §5 is a stress in Pa, so face capacities scale automatically as `A_f ∝ h²`.
- Halving `h` multiplies the voxel count by 8. The 64k budget of `idea.md` §9 applies.

**Lagrangian carriage.** Voxels move with their cluster and never flux material across a fixed grid. As a result:

- The advective term `(u·∇)u` of the continuum equations is represented exactly (§A.4.3).
- Mass is conserved to the bit, except through explicit mining, deposition or ejection events.

### A.3.2 Faces

A **face** `f = (a, b)` is an interface between two voxels. It carries these fields:

| Field      | Meaning                                                                                                |
|------------|--------------------------------------------------------------------------------------------------------|
| `a, b`     | Voxel indices (with `a < b` for canonical ordering)                                                    |
| `n_f`      | Unit normal from `a` to `b`. Intra-cluster: a lattice axis in body coords. Contact: from narrow phase. |
| `A_f`      | Effective area, `h² · min(φ_a, φ_b)`                                                                   |
| `state`    | `BONDED`, `STICK`, `SLIP` or `OPEN` (§A.5)                                                             |
| `c_f, T_f` | Cohesion and tensile strength, from the material pair rule (`idea.md` §5.1)                            |
| `μ_s, μ_d` | Friction coefficients (pair mean)                                                                      |
| `D_f`      | Damage 0..1; effective strengths are scaled by `(1 − D_f)`                                             |
| `F_f`      | Last computed face force: the force on `a` from `b`                                                    |
| `t_stick`  | Timer for dynamic → static re-sticking                                                                 |

There are two families of faces:

- **Lattice faces** join 6-neighbours within one cluster. They are persistent.
- **Contact faces** join voxels of different clusters that touch or overlap. They are created each step by the narrow
  phase, with persistence keyed by the voxel pair for warm starting and timers.

### A.3.3 The gravity grid geometry

Gravity grids are Eulerian, with spacing `H = n_g·h`:

- axis-aligned with `𝓕` at deposit time;
- sized to the source AABB plus a margin of `m_g = 2` cells.

Grids are used **only** for gravity. They never store momentum. See §A.7.

---

## A.4 Continuum Model and Its Discrete High-Friction Limit

### A.4.1 Governing equations in the rotating frame

For a continuum with density `ρ`, velocity `u`, Cauchy stress `σ`, temperature `T` and material derivative
`D/Dt = ∂/∂t + u·∇`:

~~~
Mass:      Dρ/Dt + ρ ∇·u = 0
Momentum:  ρ Du/Dt = ∇·σ + ρ g − 2ρ Ω × u − ρ Ω × (Ω × x) + f_ext
Energy:    ρ c_p DT/Dt = σ : D_p + ∇·(k ∇T) + q_ext
~~~

Here `D = ½(∇u + ∇uᵀ)` is the rate of deformation and `D_p` is its plastic (irreversible) part.

### A.4.2 Replacing the Navier–Stokes constitutive law

The Navier–Stokes closure is `σ = −p·I + 2η·D`. Rock and regolith in microgravity behave very differently. Their
Reynolds number is effectively zero, they are frictional, and they are rigid until they yield. The viscous law is
replaced with a **rigid-plastic, pressure-dependent yield law** (Mohr–Coulomb with cohesion and tension cut-off). On
any material plane with normal stress `σ_n` (compression positive) and shear `τ`:

~~~
yield function    Y(σ) = τ − (c + μ σ_n)          plus tension cut-off  −σ_n ≤ T

if Y < 0 and −σ_n < T:   D = 0                    (rigid: "static friction status")
if Y = 0:                D = λ̇ ∂Y/∂σ,  λ̇ ≥ 0      (flow:  "dynamic friction status")
plastic dissipation      σ : D_p = τ_y |γ̇| ≥ 0     (all of it → heat)
~~~

This is the `η → ∞` limit below yield. It is a Bingham fluid whose yield stress grows with pressure. It is a
"Navier–Stokes" system in structure (the same balance laws) but not in closure.

### A.4.3 Finite-volume discretization on voxels

Integrate the momentum equation over a voxel cell `V_i` that moves with the material. Because the cell is Lagrangian,
the material derivative becomes an ordinary time derivative of the voxel velocity `u_i`:

~~~
m_i u̇_i = Σ_{f ∋ i} s_{i,f} F_f + m_i g_i − 2 m_i Ω × u_i − m_i Ω × (Ω × x_i) + F_ext,i
F_f = ∫_f σ·n dA ≈ A_f · t_f
s_{i,f} = +1 if i = a(f), −1 if i = b(f)
~~~

- Mass conservation is exact, because `m_i` travels with the voxel.
- The energy equation is discretized per voxel in §A.8.

### A.4.4 Deformation lives on faces

On a voxel lattice, velocity gradients are concentrated in jumps across faces. Define the **slip velocity** of face
`f` at its contact point `p_f` (the face centre):

~~~
v_f = u_b(p_f) − u_a(p_f)
u_k(p) = U_c(k) + ω_r,c(k) × (p − X_c(k))       (rigid velocity of the owning cluster at p)
v_n = v_f · n_f,     v_t = v_f − v_n n_f
~~~

The discrete yield law of §A.4.2 becomes a **face law**:

~~~
σ_n = −(F_f · n_f)/A_f            τ = |F_f − (F_f·n_f) n_f| / A_f

Admissible static set   K_f = { τ ≤ c_f + μ_s σ_n,  σ_n ≥ −T_f }

STATIC face  (BONDED / STICK):   v_f = 0,       F_f ∈ K_f        (any force inside the cone)
DYNAMIC face (SLIP):             v_n ≥ 0 ⟂ σ_n ≥ 0               (Signorini, no adhesion)
                                 F_t = −μ_d σ_n A_f · v_t/|v_t|  (Coulomb, opposes slip)
OPEN face:                       F_f = 0
~~~

This is the precise meaning of *"intervoxel faces are classified as static or dynamic friction surfaces"*:

- A face is static exactly when its slip velocity is zero **and** its force is strictly admissible.
- A face is dynamic when it slides at the friction limit.
- The transitions are governed by §A.5.

### A.4.5 Reduction to rigid clusters (why the problem is tractable)

**Claim.** Let `S` be a set of voxels connected by static faces. Then the velocity field on `S` is a rigid-body motion,
`u(x) = U + w × (x − X)`.

**Sketch of proof:**

1. A static face has zero slip. The two adjacent voxels therefore share their velocity at the shared face, and the
   face transmits no strain rate.
2. Consider the piecewise-linear velocity field on `S`. On every face it has `D = 0`, meaning zero symmetric gradient.
3. A connected domain with `D ≡ 0` admits only Killing fields. In ℝ³ those are exactly the rigid motions.

**Consequence.** Take the connected components of the graph of `BONDED ∪ STICK` faces. These are **clusters**, and
they are exact rigid bodies. The full discrete system splits into three coupled pieces:

1. **Rigid-body dynamics of clusters** (§A.6). This carries the momentum equation summed over each cluster.
2. **A unilateral frictional contact problem on dynamic faces** between clusters (§A.7.1).
3. **An admissibility check on static faces** (§A.7.2). This recovers the internal forces `F_f` and tests them
   against `K_f`.

Because the regime is "mostly static friction", the number of clusters is much smaller than the number of voxels.
Only the (few) dynamic faces need an iterative velocity solve.

### A.4.6 Discrete energy balance

Sum `u_i · (momentum equation)` over all voxels. Coriolis does no work. The static faces do no work, because `v_f = 0`.
This gives:

~~~
d/dt (K + W_grav + W_cent) = P_ext − Σ_{f ∈ SLIP} μ_d σ_n A_f |v_t| − P_inelastic,n
W_cent = −½ Σ m_i |Ω × x_i|²
~~~

The two dissipation terms on the right are deposited as heat (§A.8). The **total ledger**
`K + W_grav + W_cent + E_heat − ∫P_ext dt` must therefore be constant. This is the key regression check.

---

## A.5 Face State Machine

### A.5.1 States

| State    | Static? | In cluster graph? | Carries                                           |
|----------|---------|-------------------|---------------------------------------------------|
| `BONDED` | yes     | yes               | Cohesion `c_f`, tension `T_f`, friction `μ_s σ_n` |
| `STICK`  | yes     | yes               | Friction only: `c = 0`, `T = 0`, `τ ≤ μ_s σ_n`    |
| `SLIP`   | no      | no                | Coulomb `μ_d σ_n`, compression only               |
| `OPEN`   | no      | no                | Nothing                                           |

**Where each state comes from:**

- `BONDED` is natural cohesion, sinter, or a player bond (`idea.md` §6.2). Player bonds map to `c_f`/`T_f` by
  dividing their force limits by `A_f`.
- `STICK` is what holds cohesionless rubble together under self-gravity and spin.

### A.5.2 Transitions

**Static → dynamic transitions are force-driven** and evaluated by the stress solver (§A.7.2):

| From     | To     | Condition                                           | Side effects                                 |
|----------|--------|-----------------------------------------------------|----------------------------------------------|
| `BONDED` | `OPEN` | `−σ_n > T_f (1 − D_f)`                              | Cohesion destroyed; event `FRACTURE_TENSION` |
| `BONDED` | `SLIP` | `τ > c_f (1 − D_f) + μ_s max(σ_n, 0)` and `σ_n ≥ 0` | Cohesion destroyed; event `FRACTURE_SHEAR`   |
| `STICK`  | `OPEN` | `σ_n < 0` (after the unilateral re-solve, §A.7.2.4) | —                                            |
| `STICK`  | `SLIP` | `τ > μ_s σ_n`                                       | —                                            |

**Dynamic → static transitions are velocity-driven** and evaluated after the contact solve:

| From    | To       | Condition                                                                                            | Side effects                                               |
|---------|----------|------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| `SLIP`  | `STICK`  | `                                                                                                    | v_f                                                        | < v_stick` and `σ_n > 0` continuously for `t_stick`                                         | Clusters merge (§A.6.5)                        |
| `SLIP`  | `OPEN`   | Contact lost (`δ < −δ_sep`)                                                                          | Face record retired                                        |
| `OPEN`  | `SLIP`   | Narrow phase reports overlap                                                                         | New contact face                                           |
| `STICK` | `BONDED` | `T_face > T_sinter` for `t_sinter`, or a player bond, or slow cold-welding (`t_heal`, regolith only) | `c_f`, `T_f` set from the bond or healed fraction `κ_heal` |

**Hysteresis** comes from two sources. It prevents chatter.

- `μ_d < μ_s`.
- Re-sticking requires `t_stick > 0`, while unsticking is immediate.

**Fatigue** (from `idea.md` §4.6) applies to `BONDED` faces:

~~~
r_f = max( τ / (c_f + μ_s σ_n⁺),  −σ_n / T_f )
if r_f > 0.6:   D_f += (r_f − 0.6) · k_fatigue(mat) · dt_eval
~~~

**Rate limit:**

- At most `N_break = 256` static → dynamic transitions per step.
- Candidates are sorted by `r_f` descending, with ties broken by face id.
- The remaining candidates are re-evaluated next step. This makes cascades visible and stable.

---

## A.6 Rigid-Cluster Dynamics in the Rotating Frame

### A.6.1 State and equations

Per cluster:

- `X`, `U` — frame COM position and velocity
- `q` — body → frame orientation
- `ω_b` — absolute angular velocity, body coordinates
- `M`, `I_b`

**Translation.** The fictitious forces on a rigid cluster reduce exactly to forces on the COM:

- `Σ m_i Ω×(Ω×x_i) = M Ω×(Ω×X)`, by linearity.
- `Σ m_i 2Ω×u_i = 2M Ω×U`, because `Σ m_i ω_r×r_i = 0`.

~~~
Ẋ = U
M U̇ = F − 2 M Ω × U − M Ω × (Ω × X)          F = Σ real external forces
~~~

**Rotation.** The fictitious torques are not added explicitly. Instead, the *absolute* angular velocity is integrated
in *body* coordinates. Euler's equations there are the same whatever frame observes the body:

~~~
I_b ω̇_b + ω_b × (I_b ω_b) = τ_b              τ_b = Rᵀ τ,  τ = Σ real external torques about X
q̇ = ½ · q ⊗ [0, ω_b − Rᵀ Ω]                  (orientation relative to the rotating frame)
~~~

This is exactly equivalent to adding the centrifugal torque `−Ω×(IΩ)` and the Coriolis torque. It avoids both, and it
makes the `Ω = 0` vs `Ω ≠ 0` equivalence test (§B.7) exact up to roundoff.

### A.6.2 Mass properties

Per voxel, with body offset `r` from the COM:

~~~
I_b = Σ_i [ m_i (|r_i|² 𝟙 − r_i r_iᵀ) + (m_i h²/6) 𝟙 ]         (the second term is a cube's own inertia)
~~~

**Incremental add/remove** (mining, deposition, placement) is O (1):

1. Update `M` and `Σ m r` (the first moment) and `Σ m r rᵀ` (the second moment) about the fixed lattice origin.
2. Recover the COM and `I_b` via the parallel-axis theorem when needed.
3. `s_c` is re-based lazily. `X` is shifted by `R·Δs` to keep world positions fixed.
4. `U` is shifted by `ω_r × (R·Δs)` to keep velocities fixed.

### A.6.3 Time integration

Each step, given `F` and `τ` (with contact impulses already applied, §A.7.1):

**1. Translation (observer-rotation step).** The real forces are integrated with symplectic Euler on the inertial
velocity, expressed in the current frame axes. The result is then re-expressed in the next frame orientation with
the same Cayley map that advances `q_f` (§A.2.4). Coriolis and centrifugal terms never appear explicitly; they are
exactly the effect of the observer rotation. No trigonometry is needed.

~~~


W   = U + Ω × X                    (inertial velocity, frame-n axes)
W  += dt · F/M
X'  = X + dt · W
X⁺  = C(b) X',   W⁺ = C(b) W,      C(b) = (𝟙 + [b]×)⁻¹(𝟙 − [b]×),  b = ½ dt Ω   (= R_stepᵀ)
U⁺  = W⁺ − Ω × X⁺
~~~
Properties:
- A free body in `𝓕` maps through `q_f` to an exact straight line in `𝓘` (to roundoff).
- `Ω = 0` and `Ω ≠ 0` runs are the same inertial scheme, so re-basing changes only roundoff.
- The Jacobi integral is conserved with the bounded O(dt) oscillation of symplectic Euler.
An earlier draft integrated Coriolis by an implicit-midpoint Cayley solve with explicit centrifugal force. That
scheme carries an O(Ω dt) phase error and is superseded. Particles (§A.9 step 6) use the same step.


**2. Rotation.** Explicit torque, then an implicit gyroscopic step (Catto 2015). This is one Newton iteration in body
coordinates:

~~~
ω₀ = ω_b + dt · I_b⁻¹ τ_b
f(ω) = I_b (ω − ω₀) + dt · ω × (I_b ω)
J    = I_b + dt ( [ω₀]× I_b − [I_b ω₀]× )
ω_b⁺ = ω₀ − J⁻¹ f(ω₀)
~~~

**3. Orientation.** The body increment is a Cayley quaternion of the absolute spin. The frame increment is undone on
the left:

~~~
q⁺ = normalize( q_step⁻¹ ⊗ q ⊗ normalize([1, ½ dt ω_b⁺]) )
~~~
As a result, `q_f⁺ ⊗ q⁺ = q_f ⊗ q ⊗ Δq_body` exactly, independent of `Ω`.


The conservation properties are summarized below. Non-principal tumbling, precession and Dzhanibekov flips emerge
from step 2. They are acceptance tests.

| Property                                | Status                             |
|-----------------------------------------|------------------------------------|
| Linear momentum (in `𝓘`)                | Symplectic, bounded error          |
| Angular momentum magnitude, torque-free | Bounded drift                      |
| Rotational kinetic energy               | Implicit scheme damps, never grows |

### A.6.4 Split

After breaks, run union-find over the `BONDED ∪ STICK` lattice faces of the affected cluster. For each component `C`:

1. Recompute `M_C`, the COM `X_C` and `I_b,C` from its voxels.
2. Keep the parent's body axes, so `q_C = q`.
3. Set the rigid velocity at the new COM, and keep the same absolute spin:

~~~
U_C   = U + ω_r × (X_C − X)          (frame velocity of the parent's rigid field at X_C)
ω_b,C = ω_b
~~~

This conserves `P` and `L` exactly, because the velocity field is unchanged pointwise. Gravity grids sourced by the
parent are invalidated (§A.7.3.6).

### A.6.5 Merge

Clusters merge when a `SLIP → STICK` transition joins them, or when a player bond is applied. Let
`d_k = X_k − X` be each part's offset from the new COM. Then:

~~~
M = Σ M_k,   X = Σ M_k X_k / M,   U = Σ M_k U_k / M
L = Σ_k [ R_k I_b,k ω_b,k + M_k d_k × ( (U_k − U) + Ω × d_k ) ]     (absolute, about the new COM)
ω_b = I_b⁻¹ Rᵀ L                                                     (new body axes = frame axes at merge time)
~~~

The kinetic energy lost in a merge (always ≥ 0) is booked as heat, split over the joining faces in proportion to
their area.

---

## A.7 Faces in Detail

### A.7.1 Dynamic faces: contact and friction solve

**Detection:**

- **Broad phase:** sweep-and-prune over frame-space cluster AABBs, sorted on x.
- **Narrow phase:** the surface voxels of the smaller cluster are tested against the occupancy hash of the larger
  cluster. For each overlapping voxel pair, the narrow phase reports:
    - normal `n_f` (the face direction of minimum penetration),
    - depth `δ_f`,
    - point `p_f`,
    - area `A_f`.

**Velocity-level solve.** This is projected Gauss–Seidel (sequential impulses) with warm start and `K_c = 8`
iterations, over faces in canonical order. Offsets are `r_a = p_f − X_a` and `r_b = p_f − X_b`. The world inverse
inertia is `I⁻¹ = R I_b⁻¹ Rᵀ`.

~~~
effective mass    k_n = 1/M_a + 1/M_b + (r_a×n)·I_a⁻¹(r_a×n) + (r_b×n)·I_b⁻¹(r_b×n)
normal target     v_n* = max( −e·v_n⁻ · [|v_n⁻| > v_bounce],  β·max(δ − δ_slop, 0)/dt )   (capped at v_push)
normal update     Δλ_n = k_n⁻¹ (v_n* − v_n);   λ_n ← max(λ_n + Δλ_n, 0)
friction μ_f      μ_s if |v_t| < v_stick, else μ_d
tangent update    Δλ_t = K_t⁻¹(−v_t);   λ_t ← clampDisk(λ_t + Δλ_t, μ_f λ_n)       (isotropic Coulomb disk)
apply             U_a −= λ/M_a,  ω_a,abs −= I_a⁻¹(r_a×λ);   U_b += λ/M_b,  ω_b,abs += I_b⁻¹(r_b×λ)
~~~

- Impulses change the absolute angular velocity. Convert with `ω_b += Rᵀ Δω`.
- Face velocities use frame-relative spin `ω_r`.
- Split-impulse position correction keeps `β` from injecting energy. The bias impulses go to a separate pseudo-velocity
  that is used only for position.

**Face bookkeeping after the solve:**

- `F_f = λ_f / dt`. This feeds the stress solver as `F_ext` on the touching voxels, so impacts can fracture bodies.
- The slip dissipation is accumulated for heat (§A.8):

~~~
Q_f = −λ_t · v_t,final  +  ½ k_n⁻¹ (v_n,before² − v_n,after²)⁺
~~~

- The global step dissipation is `ΔK_contact = K_before − K_after`, computed exactly from cluster velocities. The
  per-face `Q_f` values are rescaled so that `Σ Q_f = ΔK_contact` to the bit. This closes the ledger.

### A.7.2 Static faces: stress solve and failure

#### A.7.2.1 Residual forces

Stress is frame-independent, so it is computed from **inertial** accelerations and **real** forces only. Fictitious
forces cancel identically.

~~~
A_I   = F / M                                   (inertial COM acceleration from real forces)
α     = R I_b⁻¹ ( τ_b − ω_b × I_b ω_b )          (absolute angular acceleration, frame coords)
ω     = R ω_b
a_i   = A_I + α × r_i + ω × (ω × r_i)            (r_i = x_i − X)
f_i   = m_i a_i − m_i g_i − F_ext,i               (force voxel i must receive from its neighbours)
~~~

Here `g_i` includes the cluster's **own** gravity. Self-gravity loads the faces even though it cannot move the COM.

**Rigid-mode projection.** Grid interpolation error means `Σ f_i` and `Σ r_i × f_i` are not exactly zero. Project
them out:

~~~
f_i ← f_i − m_i ( ε_F / M + (I⁻¹ ε_τ) × r_i ),     ε_F = Σ f_i,   ε_τ = Σ r_i × f_i
~~~

After projection, `Σ f = 0` and `Σ r × f = 0` to roundoff. This is required for solvability.

#### A.7.2.2 Minimum-compliance face forces

The face forces must satisfy equilibrium at every voxel. With `B` the signed incidence matrix (voxels × static
faces), the problem is underdetermined. Choose the distribution of least complementary energy:

~~~
minimize   ½ Σ_f |F_f|² / k_f
subject to Σ_{f ∋ i} s_{i,f} F_f = f_i     for all voxels i        (i.e.  B F = f)
~~~

**Stationarity** gives `F_f = k_f (Ψ_a − Ψ_b)` for a vector potential `Ψ` on voxels. Substituting:

~~~
L Ψ = f,        L = B K Bᵀ     (weighted graph Laplacian; three decoupled scalar systems sharing L)
~~~

| Aspect             | Specification                                                                                                                                               |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Face stiffness     | `k_f = A_f · E_pair / h`. `E` is a per-material modulus-like weight. The harmonic mean is used for pairs.                                                   |
| Solvability        | `L` is singular only on constants per component. `Σ f_i = 0` guarantees solvability. The gauge is fixed by projecting `Ψ` to zero mean.                     |
| Solver             | Jacobi-preconditioned conjugate gradient, warm-started from the previous `Ψ`, capped at `K_s` iterations.                                                   |
| Stopping criterion | Relative residual `‖LΨ − f‖/‖f‖ < 1e-3`.                                                                                                                    |
| Cold-start guess   | O(N) spanning-tree solution (`idea.md` §4.6 v1): subtree sums of `f` over a max-strength spanning tree.                                                     |
| Interpretation     | The quasi-static limit of an isotropic spring network. Parallel faces share load by stiffness automatically.                                                |
| Limitation         | Single-voxel-wide chains carry no bending moment. Wider members carry bending through tension/compression couples, which is correct in the continuum limit. |

#### A.7.2.3 Failure test

For each static face, decompose `F_f` into `σ_n` and `τ` (§A.4.4), then apply §A.5.2.

#### A.7.2.4 Unilateral correction for `STICK`

A `STICK` face cannot carry tension, but the linear solution may assign it some. If any `STICK` face has
`σ_n < −ε_σ`:

1. Set `k_f → 0` for those faces.
2. Re-solve, warm-started.
3. Repeat up to `K_u = 2` times.

Faces still in tension after that become `OPEN`.

#### A.7.2.5 Evaluation schedule

Following `idea.md` §4.6, the stress solve runs:

- every step on clusters with active thrust, drilling, new contacts, or `|α|` above threshold;
- every 30 steps otherwise;
- on wake for sleeping clusters.

### A.7.3 Gravity

#### A.7.3.1 Model

~~~
Φ(x) = −G Σ_j m_j / |x − x_j|,     g = −∇Φ
~~~

Sources are partitioned into three kinds:

| Source kind            | Who                                                                                                 | Field evaluation                                                                              |
|------------------------|-----------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| **Grid source**        | Clusters with `N_vox ≥ N_grid` (default 2,000) — the primary and big fragments; at most `S_max = 4` | Its own FFT potential grid (below) inside its domain; monopole + quadrupole outside           |
| **Direct source**      | All other clusters                                                                                  | Monopole + quadrupole about its COM. When within 2 radii, per-voxel sum (small clusters only) |
| **Dust pseudo-source** | Particle pool, when its total mass exceeds 0.1% of the system mass                                  | Monopole at the particle COM                                                                  |

The field on cluster `c` is the sum over all sources `s ≠ c`, so self-force is excluded exactly. The *stress* solve
also adds `c`'s own grid, when it has one, to get self-gravity loading.

#### A.7.3.2 Body-attached sampling of a frame-geometry grid

A grid for source `s` is built on a frame-aligned lattice using `s`'s pose at deposit time, `(X_s⁰, R_s⁰)`. When the
field is sampled at time `t`, the sample point is mapped back to the deposit pose and the result is rotated forward:

~~~
x' = X_s⁰ + R_s⁰ R_sᵀ (x − X_s)
g_s(x) = R_s R_s⁰ᵀ · g_grid,s(x')
~~~

Rigid motion of the source (spin, drift, tumble) therefore **never** makes its grid stale. Grids are rebuilt only when
the source's **mass distribution** changes.

#### A.7.3.3 Rebuild trigger

Rebuild `s`'s grid when any of these holds:

- The mass change since the last deposit exceeds `ε_M = 0.5%`:
  ~~~
  ΔM_rel = Σ_voxels |m_i − m_i⁰| / M_s > ε_M        (tracked incrementally: every add/remove/fill change adds |Δm|)
  ~~~
- A topology event occurs: split, merge, or voxels moved between clusters.
- The COM has shifted by more than `H/4` in body coordinates.

The old grid remains in use until the new one is committed (§A.7.3.6).

#### A.7.3.4 FFT convolution (Hockney–Eastwood, isolated boundaries)

**Setup:**

- The domain is `N_x × N_y × N_z` cells of spacing `H`, covering `s`'s AABB (at deposit pose) plus `m_g` margin cells.
- Each padded dimension is `P_α = nextPow2(2·N_α)`.
- Zero-padding to at least `2N` turns circular convolution into the exact isolated (open-space) convolution.

**Steps:**

1. **Mass assignment (CIC).** Deposit each voxel mass `m_i`, as a point at its centre, trilinearly onto the 8
   surrounding nodes. This gives `ρ̃[n]`, the mass per node.
2. **Green's function on the padded lattice.** For signed offsets `Δ = n` with `n_α ≥ P_α/2 → n_α − P_α`:
   ~~~
   𝒢[Δ] = −G / (H·|Δ|)           Δ ≠ 0
   𝒢[0] = −G · C_cube / H         C_cube = 2.3800772…  (∫ over the unit cube, centred, of 1/r dV)
   ~~~
   `𝒢[0]` is the potential at the centre of a uniform cube of unit mass and side `H`. It regularizes the self-cell.
   `𝒢̂ = FFT(𝒢)` is real and even. It is computed once per padded geometry and cached, keyed by `(P_x, P_y, P_z, H)`.
3. **Convolution:**
   ~~~
   Φ[n] = IFFT( FFT(ρ̃) · 𝒢̂ )[n]       (only n inside the unpadded domain are kept)
   ~~~
4. **Field.** Take second-order central differences at nodes:
   ~~~
   g_α[n] = −(Φ[n + e_α] − Φ[n − e_α]) / (2H)
   ~~~
   One-sided differences are used on the domain boundary.
5. **Interpolation.** Sample `g` with the *same* CIC weights used for deposition. Same-kernel assignment and
   interpolation, a symmetric `𝒢` and an antisymmetric gradient together make pairwise PM forces antisymmetric. Total
   self-force of a deposit is then zero to roundoff. This is tested.
6. **Outside the domain.** Use the moments computed directly from voxels at deposit time. With
   `r = x' − X_s⁰` expressed in the deposit pose:
   ~~~
   Q_ab = Σ m_i (3 r_i,a r_i,b − |r_i|² δ_ab)
   Φ(r) = −G M / |r|  −  G (rᵀ Q r) / (2|r|⁵)
   g(r) = −G M r/|r|³ + G [ Q r / |r|⁵ − (5/2)(rᵀ Q r) r / |r|⁷ ]
   ~~~
   A linear blend over the outermost margin cell keeps `g` continuous at the domain boundary.

**Accuracy targets:**

- Outside a uniform sphere: `|g − GM/r²| / (GM/r²) ≤ 1%` beyond 2 cells from the surface.
- Interior: the linear profile holds to 1% of the surface value.

If the surface error proves too large for slope overlays, a 4th-order gradient and an integrated Green's function are
drop-in upgrades.

#### A.7.3.5 FFT algorithm

- Iterative radix-2 Cooley–Tukey, in place, on split `Float64Array` re/im buffers.
- 3D transforms are done by line passes along x, then y, then z.
- The real input `ρ̃` is packed two lines at a time into one complex transform, then unpacked by conjugate symmetry.
  This saves 2× on the forward pass.
- The product with real `𝒢̂` preserves Hermitian symmetry, so the inverse is packed the same way.
- **Deterministic twiddles:** there are no `Math.sin`/`Math.cos` calls. The principal roots `w_{2^k}` are built by
  half-angle recursion using only `sqrt`, which IEEE-754 rounds correctly:
  ~~~
  c_{k+1} = sqrt((1 + c_k)/2),   s_{k+1} = s_k / (2 c_{k+1}),   starting at (c, s) = (−1, 0) for k = 1
  ~~~
  The full twiddle table is filled by complex multiplication, re-seeded from the recursion every 64 entries to bound
  error growth. The results are bit-identical across engines.

**Cost:**

| Grid  | Padded | FFT work                                       | Estimated JS time |
|-------|--------|------------------------------------------------|-------------------|
| `32³` | `64³`  | Forward + inverse, ≈ 2 × 5 N log₂ N ≈ 4e7 flop | ≈ 30 ms           |
| `48³` | `128³` | ≈ 4.4e8 flop                                   | ≈ 300 ms          |

With `H = 2h`, a 120 m body (≈ 60 voxels, ≈ 30 grid cells plus margin) fits the `64³` case. Rebuilds are time-sliced
(§A.7.3.6).

#### A.7.3.6 Time slicing and determinism

A rebuild is a resumable job with these phases:

~~~
DEPOSIT → FWD_X → FWD_Y → FWD_Z → MULTIPLY → INV_Z → INV_Y → INV_X → GRADIENT → MOMENTS
~~~

- Each step, the job advances by a fixed quantum of **work units** (default 4,096 FFT lines or equivalent), never by
  elapsed milliseconds.
- The commit tick (the swap of the new grid for the old one) is therefore a pure function of the start tick and the
  grid size. Replays stay bit-identical.
- The job snapshots voxel masses and poses at the start tick (the deposit pose). Topology events during a job restart
  it.

#### A.7.3.7 Effective gravity for gameplay

The quasi-static surface force per unit mass, used for slope and avalanche logic and for UI overlays, is:

~~~
g_eff(x) = g(x) − Ω × (Ω × x)          (in the frame; exact for material co-rotating with Ω)
~~~

---

## A.8 Thermal Coupling

Per-voxel temperature `T_i` has heat capacity `C_i = m_i c_p(mat)`. The update runs every `N_th = 4` steps, with
`Δt_th = N_th·dt`:

~~~
C_i ΔT_i = Σ_f Q_f,i                                      (friction / inelastic, §A.7.1; split ½ to each side)
         + Δt_th Σ_{f static} k_th,f A_f (T_j − T_i)/h    (conduction across BONDED/STICK faces only)
         + Δt_th A_exp,i [ α S₀ (r₀/r)² max(0, n_i·ŝ) − ε σ_SB T_i⁴ ]   (sun + radiation, exposed faces)
         + Δt_th Q_mod,i                                   (module heat)
~~~

**Stability.** Explicit conduction is stable when `Δt_th ≤ h² ρ c_p / (6 k_th)`. For rock at `h = 2 m` this is hours,
so it is always satisfied at game rates. Under warp, `N_th` is clamped to the stability bound.

**Activity.** Only voxels with a non-zero source or a gradient above `ΔT_min` are processed. This is tracked with an
active list.

**Feedback into the mechanics:**

- `T > T_sinter` on a `STICK` face over `t_sinter` → `BONDED` with `SIN` strengths.
- `ICE`/`CAR` above `T_sub` → sublimation mass loss and jet force `F_ext,i` (`idea.md` §5.4).
- Optional thermal softening, `c_f ← c_f · s(T)`.

**Ledger.** `E_heat = Σ C_i (T_i − T_ref)`. Radiated and absorbed energy are booked separately, so they can be
excluded from the conservation check.

---

## A.9 The Step

~~~
step(world, inputs):
   0. maybe re-base Ω (§A.2.3); advance q_f, ŝ (§A.2.4)
   1. apply inputs for this tick (sorted by input id)
   2. modules/robots → F_ext,i per voxel, mining/deposit edits
   3. apply topology edits: mass properties (§A.6.2), ΔM_rel counters, grid invalidation
   4. gravity: advance rebuild jobs (§A.7.3.6); per-cluster external F, τ from grid/direct/dust sources
   5. contacts: broad → narrow → build contact faces → PGS solve (§A.7.1) → apply impulses, record Q_f, F_f
   6. integrate clusters (§A.6.3) and particles (frame point-mass eq., same Cayley Coriolis)
   7. stress on scheduled clusters (§A.7.2) → candidate static→dynamic transitions (rate-limited, sorted)
   8. dynamic→static timers (§A.5.2) → merge candidates
   9. split (union-find) and merge (§A.6.4–5); momentum-exact; invalidate grids
  10. thermal update if tick % N_th == 0 (§A.8)
  11. book escaped momentum (particles beyond bound) into barycenter Δv via R_f
  12. ledger & diagnostics (debug/test builds); emit events; warp eligibility
~~~

---

## A.10 Diagnostics Ledger

All ledger quantities are computed in `𝓘`-equivalent form from frame state.

~~~
K        = Σ_c ½ M_c |U_c + Ω×X_c|² + ½ ω_b,cᵀ I_b,c ω_b,c + Σ_particles ½ m |u + Ω×x|²
W_grav   = ½ Σ_i m_i Φ(x_i)                (Φ from grids + direct sources; self terms included once)
E_total  = K + W_grav + E_heat + E_escaped − W_ext
P, L     as in §A.2.5, rotated to 𝓘 by q_f
~~~

`K` here is the inertial kinetic energy. It is conserved in isolated systems. `C_J` (§A.2.2) is the frame-side
counterpart.

Tests assert bounded drift of `E_total`, `P` and `L`. The game's debug overlay shows the same quantities.

---

## A.11 Parameters

| Parameter           | Default              | Notes                                       |
|---------------------|----------------------|---------------------------------------------|
| `h`                 | 2.0 m                | World parameter; 4.0 m for bodies > 120 m   |
| `n_g`               | 2                    | Gravity grid spacing `H = n_g·h`            |
| `dt`                | 1/60 s               | Fixed                                       |
| `u_rebase`          | 1e-3 m/s             | Frame re-basing trigger                     |
| `κ_μ`               | 0.8                  | `μ_d = κ_μ μ_s`                             |
| `v_stick`           | 1e-3 m/s             | Re-stick speed                              |
| `t_stick`           | 2 s                  | Re-stick dwell                              |
| `κ_heal, t_heal`    | 0.1, 3600 s          | Regolith cold-welding (optional)            |
| `N_break`           | 256                  | Static→dynamic transitions per step         |
| `K_c`               | 8                    | Contact PGS iterations                      |
| `e, v_bounce`       | 0.2, 5e-3 m/s        | Restitution and bounce threshold            |
| `β, δ_slop, v_push` | 0.2, 0.01h, 5e-3 m/s | Position correction                         |
| `K_s, K_u`          | 40, 2                | Stress CG iterations; unilateral re-solves  |
| `N_grid, S_max`     | 2000, 4              | Grid source threshold; maximum grid sources |
| `ε_M`               | 0.005                | Gravity rebuild threshold                   |
| `N_th`              | 4                    | Thermal sub-rate                            |

---

# Part B — Code Plan

## B.1 Principles

1. **Pure ES modules, no DOM.** `src/sim/**` imports only other `src/sim/**` modules and the vendored
   `simplex-noise` (used by the generator only). It must not reference `window`, `document`, `self` or `performance`.
   Enforced by `tests/purity.test.js`, which greps imports and globals.
2. **Relative imports with explicit `.js` extensions.** These resolve identically in Node (`"type": "module"` in
   `games/labrek-space-mining/package.json`) and in module Workers, where import maps do not apply.
3. **Deterministic by construction:**
    - Float64 for all state that feeds back into dynamics. Float32 only for render snapshots and load/UI fields.
    - No `Math.random`, `Date`, or `Math.sin`/`cos`/`exp`/`pow`/`atan2` in state paths. Use `sim/math.js`
      (`sqrt`-only helpers, Cayley rotations) and `sim/rng.js`.
    - Iterate in id order. Hash maps are used for lookup only, never for iteration order.
4. **Allocation-free hot loops.** SoA typed arrays and preallocated scratch buffers. Vector math writes into output
   arrays at offsets (`vadd(out, o, a, ia, b, ib)`), with object-style wrappers for tests and cold code.
5. **Injectable time slicing.** Long jobs (gravity rebuild, large stress solves) expose `advance(workUnits)`. The
   worker and the tests drive them identically.

## B.2 Module Map (`src/sim/`)

| File                 | Responsibility                                                                                                                                               | Key exports                                                                   |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| `math.js`            | Float64 vec3/mat3/quat on arrays; Cayley solve; 3×3 symmetric inverse; deterministic `sqrtSafe`, `hypot3`                                                    | `v3.*`, `m3.*`, `quat.*`, `cayleySolve(out, b, v)`, `invSym3`                 |
| `rng.js`             | `sfc32`, `mulberry32`; seed from string (FNV-1a)                                                                                                             | `createRng(seed)`                                                             |
| `hash.js`            | FNV-1a/xxhash32 over typed-array bytes (state hashes, no crypto dependency in sim)                                                                           | `hashState(world)`                                                            |
| `params.js`          | Defaults (§A.11) plus validation                                                                                                                             | `DEFAULTS`, `makeParams(overrides)`                                           |
| `materials.js`       | Material table (from `data/materials.json`, injected as an object); pair rules for `c, T, μ, E, k_th`                                                        | `pairProps(matA, matB, out)`                                                  |
| `frame.js`           | `Ω`, `q_f`, sun vector; re-basing; inertial ↔ frame conversions                                                                                              | `createFrame`, `advanceFrame`, `rebase(world, ΩNew)`, `toInertialP/L`         |
| `voxels.js`          | SoA voxel pool (free list, capacity 65,536): `cluster, kx, ky, kz, mat, fill, mass, temp, volatile, damage, module`                                          | `allocVoxel`, `freeVoxel`                                                     |
| `faces.js`           | SoA face pool (capacity 262,144): endpoints, normal code / vector, `state`, strengths, `D`, `F`, timers; lattice-face creation; contact-face persistence map | `addLatticeFaces(v)`, `faceKey`, `transition(f, to, reason)`                  |
| `clusters.js`        | Cluster SoA (Float64): `X, U, q, ω_b, M, I_b, I_b⁻¹`, moments, AABB, occupancy hash, voxel list; incremental mass properties                                 | `createCluster`, `addVoxelMass`, `removeVoxelMass`, `recomputeMassProps`      |
| `rigid.js`           | Integrator §A.6.3; external force accumulators                                                                                                               | `integrateClusters(world, dt)`                                                |
| `topology.js`        | Union-find split, momentum-exact split/merge (§A.6.4–5)                                                                                                      | `splitCluster`, `mergeClusters`                                               |
| `contacts.js`        | Broad phase (SAP), narrow phase (occupancy), PGS solver, dissipation                                                                                         | `detect(world)`, `solveContacts(world, dt)`                                   |
| `stress.js`          | Residuals, rigid-mode projection, spanning-tree guess, PCG Laplacian, unilateral loop, failure candidates                                                    | `evaluateStress(world, clusterId, out)`                                       |
| `gravity/fft.js`     | Radix-2 complex FFT, deterministic twiddles, 3D line passes, two-real packing                                                                                | `createFFT(n)`, `fft3d(plan, re, im, dir, cursor)`                            |
| `gravity/pmGrid.js`  | Grid geometry, CIC deposit/interpolate, Green's function cache, gradient, moments; resumable rebuild job                                                     | `createGridJob(world, src)`, `job.advance(units)`, `sampleGrid(grid, x, out)` |
| `gravity/gravity.js` | Source partitioning, body-attached sampling (§A.7.3.2), multipole, direct sums, per-cluster F/τ, per-voxel `g_i`                                             | `computeGravity(world)`, `gAt(world, x, excludeCluster, out)`                 |
| `particles.js`       | Point-mass pool (Coriolis Cayley step), re-deposition, escape booking                                                                                        | `stepParticles`                                                               |
| `thermal.js`         | §A.8                                                                                                                                                         | `stepThermal(world, dtTh)`                                                    |
| `ledger.js`          | §A.10 diagnostics                                                                                                                                            | `measure(world, out)`                                                         |
| `world.js`           | World state, step pipeline §A.9, events queue                                                                                                                | `createWorld(params, gen)`, `step(world, inputs)`                             |
| `worker.js`          | Browser-only shell: message loop, snapshots, transferables                                                                                                   | (no exports)                                                                  |

## B.3 Core Data Layout

~~~js
// faces.js — structure of arrays, capacity FCAP = 262144
faces = {
    a: new Int32Array(FCAP), b: new Int32Array(FCAP),
    kind: new Uint8Array(FCAP),          // 0 lattice, 1 contact
    axis: new Uint8Array(FCAP),          // lattice: 0..5 (±x,±y,±z in body frame of a's cluster)
    n: new Float64Array(3 * FCAP),       // contact normal (frame); lattice normal derived from axis
    state: new Uint8Array(FCAP),         // BONDED=0 STICK=1 SLIP=2 OPEN=3
    area: new Float64Array(FCAP),
    coh: new Float32Array(FCAP), ten: new Float32Array(FCAP),
    mus: new Float32Array(FCAP), mud: new Float32Array(FCAP),
    dmg: new Float32Array(FCAP), k: new Float64Array(FCAP),
    F: new Float64Array(3 * FCAP),       // last force on a from b
    lam: new Float64Array(3 * FCAP),     // contact warm start impulse
    tStick: new Float32Array(FCAP),
    alive: new Uint8Array(FCAP),
};
// per-voxel adjacency: fixed 6 slots for lattice faces
voxelFace = new Int32Array(6 * VCAP).fill(-1);
~~~

- Cluster state is `Float64Array` blocks of stride 32 per cluster: `X(3) U(3) q(4) ω_b(3) M(1) I_b(6 sym) Iinv(6 sym)`
  plus moments.
- The occupancy hash maps packed `(kx, ky, kz)` (10 bits signed each) to a voxel index. It uses open addressing with
  `Int32Array` keys and values, one table per cluster, and resizes at a load factor of 0.5.
- The stress solver keeps per-cluster `Ψ` warm-start buffers (Float64, 3 per voxel) in a pooled arena, released on
  split.

## B.4 Key Algorithms as Code Sketches

~~~js
// math.js — Cayley solve  (𝟙 + [b]×) w = v   → used for Coriolis and sun rotation
export function cayleySolve(out, o, b, v) {
    const bx = b[0], by = b[1], bz = b[2], vx = v[0], vy = v[1], vz = v[2];
    const cx = by * vz - bz * vy, cy = bz * vx - bx * vz, cz = bx * vy - by * vx;   // b × v
    const d = bx * vx + by * vy + bz * vz, s = 1 / (1 + bx * bx + by * by + bz * bz);
    out[o] = (vx - cx + bx * d) * s;
    out[o + 1] = (vy - cy + by * d) * s;
    out[o + 2] = (vz - cz + bz * d) * s;
}
~~~

~~~js
// rigid.js — translation step for cluster c (§A.6.3)
//  rhs = (𝟙 − dt[Ω]×)U + dt·(F/M − Ω×(Ω×X));  U⁺ = cayleySolve(dt·Ω, rhs);  X += dt·U⁺
~~~

~~~js
// stress.js — outline
export function evaluateStress(world, cid, out) {
    buildStaticFaceList(world, cid, scratch);   // BONDED ∪ STICK lattice faces, sorted by face id
    computeResiduals(world, cid, scratch);      // §A.7.2.1 with inertial accelerations
    projectRigidModes(world, cid, scratch);     // Σf = 0, Σ r×f = 0
    for (let pass = 0; pass <= K_u; pass++) {
        pcgLaplacian(scratch, warmPsi(cid), K_s); // three RHS, shared L (k_f weights)
        facesFromPsi(scratch);                    // F_f = k_f (Ψ_a − Ψ_b)
        if (!zeroTensileStick(scratch)) break;    // unilateral correction
    }
    collectCandidates(scratch, out);            // ratio r_f, fatigue, sorted (r desc, id asc)
}
~~~

~~~js
// gravity/pmGrid.js — resumable job
const job = createGridJob(world, sourceClusterId);  // snapshots deposit pose + masses
while (!job.done) job.advance(params.gravityWorkQuantum);  // tests: loop; world.step: one call per tick
commitGrid(world, sourceClusterId, job.result);      // at a deterministic tick
~~~

## B.5 Public API (used by Node tests and by the worker)

~~~js
import {createWorld, step} from './src/sim/world.js';
import {generateAsteroid} from './src/sim/gen/asteroid.js';
import {measure} from './src/sim/ledger.js';
import {hashState} from './src/sim/hash.js';

const world = createWorld({h: 2, G: 6.674e-11}, generateAsteroid({seed: 'labrek-001', cls: 'rubble'}));
for (let t = 0; t < 600; t++) step(world, inputsForTick(t));
const L = measure(world);        // { K, W, Eheat, P:[3], L:[3], CJ? }
const h = hashState(world);      // 32-bit hex, deterministic
~~~

**Test builders.** `tests/helpers/scenes.js` constructs worlds directly from voxel lists, without the generator. It
provides:

- `sphere(R, ρ)`
- `box(nx, ny, nz, mat)`
- `column(n)`
- `blockOnPlate()`
- `contactBinary()`
- `twoBodyOrbit()`

## B.6 Browser Integration

**`worker.js`:**

- Imports `world.js`.
- Owns the fixed-step loop.
- Receives `{ type: 'input', tick, cmd }` messages.
- Posts snapshots:
    - cluster transforms (Float32, *inertial-display* or *frame-display* selectable; the frame view keeps the primary
      still),
    - voxel diffs,
    - particle positions (transferable),
    - face-stress samples for overlay `2`,
    - ledger scalars,
    - events.

**Rendering in the frame.** The renderer can show the scene either:

- in `𝓕` — the asteroid is stationary and the sky rotates; this is the natural mining view — or
- in `𝓘` — the asteroid spins.

Switching views is a pure display transform using `q_f`.

**Budgets.** Budgets from `idea.md` §9.7 apply. The gravity quantum and the stress schedule are the tuning knobs.

## B.7 Test Plan (`tests/`, `node --test`)

| File                   | Test                                                                                        | Pass criterion            |
|------------------------|---------------------------------------------------------------------------------------------|---------------------------|
| `math.test.js`         | Quaternion ops; `cayleySolve` inverse identity; Cayley preserves norm                       | 1e-15 relative            |
| `purity.test.js`       | No DOM globals and no forbidden `Math.*` in `src/sim/**` (static scan; allowlist `math.js`) | 0 violations              |
| `frame.test.js`        | Free particle integrated in `𝓕`, mapped to `𝓘` via `q_f`, is a straight line                | 1e-9 m over 1e5 steps     |
|                        | Jacobi constant in a static point-mass potential                                            | bounded < 2e-3, no drift  |
|                        | Re-basing mid-run does not change `𝓘` trajectories                                          | 1e-12                     |
| `rigid.test.js`        | Same torque-free body with `Ω = 0` vs `Ω ≠ 0`; compare in `𝓘`                               | 1e-9                      |
|                        | Dzhanibekov flip period vs analytic (elliptic integral, reference value precomputed)        | ±5%                       |
|                        | Off-axis constant torque precession rate                                                    | ±2%                       |
|                        | `                                                                                           | L                         |` conserved, rotational KE non-increasing                                                          | 1e-6 |
| `fft.test.js`          | 1D/3D vs naive DFT (sizes 8…64); round trip; Parseval; two-real packing                     | 1e-12                     |
|                        | Twiddles bit-identical to stored golden values                                              | exact                     |
| `gravity.test.js`      | Uniform sphere: outside `GM/r²`, inside linear                                              | ≤ 1%                      |
|                        | Single cube: centre potential equals the `C_cube` term                                      | 1e-12                     |
|                        | Zero net self-force of a deposit; pairwise antisymmetry of two deposits                     | 1e-10 relative            |
|                        | Multipole/grid continuity at the domain edge                                                | ≤ 1%                      |
|                        | Body-attached sampling: rotate the source 90° without a rebuild; field rotates exactly      | 1e-12                     |
|                        | Contact binary: `g` points toward the lobes                                                 | qualitative + angle check |
|                        | Rebuild commit tick is independent of machine speed                                         | exact                     |
| `faces.test.js`        | Table-driven state machine (§A.5.2), including hysteresis and rate limit ordering           | exact                     |
| `stress.test.js`       | Column of `n` voxels under uniform `g`: face `k` carries `(n−k)·m·g`                        | 1e-6 relative             |
|                        | Two parallel columns with equal stiffness share load equally                                | 1e-6                      |
|                        | Equilibrium residual `‖BF − f‖/‖f‖`                                                         | < 1e-3                    |
|                        | `STICK` faces never end in tension                                                          | exact                     |
| `friction.test.js`     | Block on plate under uniform body force tilted by `θ`: static for `tanθ < μ_s`              | `                         |v| < 1e-9` |
|                        | Sliding for `tanθ > μ_s` with `a = g(sinθ − μ_d cosθ)`                                      | ±1%                       |
|                        | Heat equals `μ_d N · distance`                                                              | ±1%                       |
|                        | Re-sticks and merges after `t_stick` once the force is removed                              | exact event               |
| `conservation.test.js` | Split and merge: `P`, `L` exact                                                             | 1e-12 relative            |
|                        | Two-body orbit: energy drift over 1e5 steps                                                 | < 1e-4                    |
|                        | Inelastic collision: `E_total` ledger closes                                                | 1e-9 relative             |
|                        | Isolated system `P`, `L`                                                                    | 1e-9 / 1e-6               |
| `structure.test.js`    | Big Rocket (`idea.md` §11): regolith mount fails < 1 s; `CMP` frame holds 60 s              | as stated                 |
|                        | Rubble pile at 0.9× breakup spin stays intact; at 1.1× it sheds from the equator            | as stated                 |
|                        | Settling pass → no failures on the first step                                               | 0                         |
| `thermal.test.js`      | Conduction between two blocks relaxes to the analytic mean                                  | 1e-6                      |
|                        | Friction heat raises `T` by `Q/C`                                                           | exact                     |
| `determinism.test.js`  | Two runs, same seed and inputs → same `hashState` at tick 1e4                               | exact                     |
| `bench/step.bench.js`  | ms/step on the standard scene (not a test; CI compares against baseline)                    | regression > 20% flags    |

## B.8 Implementation Order

This maps onto the `idea.md` §12 milestones.

1. **M1a** — `math`, `rng`, `hash`, `params`, `frame` + tests. The rotating-frame point mass must pass first.
2. **M1b** — `voxels`, `clusters`, `rigid` + tests, including the `Ω = 0` ↔ `Ω ≠ 0` equivalence and Dzhanibekov.
3. **M1c** — `gravity/fft`, `pmGrid`, `gravity` + tests. Then two-body orbits and conservation.
4. **M1d** — `contacts` (SLIP/OPEN faces only), ledger closure with heat accumulation.
5. **M2a** — `faces` state machine, `stress` (tree guess, then PCG), `topology` split/merge.
6. **M2b** — friction tests, re-sticking/merge, Big Rocket, spin breakup, settling pass.
7. **M3** — `particles`, dust pseudo-source, avalanches driven by `g_eff` and the `STICK → SLIP` transition.
8. **M5** — `thermal` coupling (sintering, sublimation), time slicing tuned against the budgets.

## B.9 Deliberate Deviations from `idea.md` §4

| `idea.md`                                           | This spec                                                                                                                      | Reason                                                                       |
|-----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| §4.3: local frame is non-rotating                   | Single frame rotating at `Ω` (re-based), with exact fictitious forces                                                          | Primary stays near-static; smaller velocities; simpler surface work          |
| §4.2: bonds as a separate concept                   | Faces with states; player bonds are `BONDED` faces with specific `c`/`T`. Cables remain separate inter-cluster spring-dampers. | One mechanism covers cohesion, friction and contact                          |
| §4.4: gravity grid built by direct/octree summation | FFT (Hockney) convolution with body-attached sampling                                                                          | O(P³ log P) rebuilds; never stale under rigid motion                         |
| §4.6: spanning tree v1, relaxation v2               | Tree as a warm start; minimum-compliance PCG as the standard                                                                   | Better load sharing at a similar amortized cost                              |
| §4.9: friction via contact μ only                   | Explicit `μ_s`/`μ_d` hysteresis, `STICK` faces inside clusters, heat from slip                                                 | Needed for the static/dynamic face classification and heat-yielding friction |

## B.10 Open Questions

1. Should voxels get rotational degrees of freedom (a Cosserat extension) so single-voxel chains carry bending? The
   cost is about 2× in stress solve size. leave a note but leave it out
2. Should the 4th-order gradient and integrated Green's function become the default, if surface-slope overlays show
   CIC artefacts? this should be configurable
3. What regime should fluidized regolith use?
    - Stay with small-cluster granular dynamics and particles, or
    - add an optional Eulerian μ (I)-rheology layer on the gravity grid for large avalanches (v2)? leave a note but
      leave it out
4. Should re-basing of `Ω` be player-visible (camera jump in the frame view), or smoothed purely in the renderer? it
   should be invisible to the player