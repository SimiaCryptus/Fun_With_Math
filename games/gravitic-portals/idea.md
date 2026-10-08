# **Gravitic Portals: A Field-Theoretic Design Concept**

## **1\. Premise**

Most portal games treat the portal as a spatial shortcut — a wormhole that stitches two locations together without asking what happens to the physics that disagrees across the seam. The moment you introduce gravity, this naive model breaks: a floor portal and a ceiling portal, connected normally, create a free energy loop. An object falls through the floor, "exits" at the ceiling still falling, falls again, and gains speed every cycle. Energy appears from nowhere. In a single-player sandbox this is merely a glitch to patch around. In a multiplayer, physically simulated world, it is fatal: it reintroduces closed causal loops, frame-dependent event ordering, and desynchronized simulation — the three things a networked physics engine cannot survive.

The resolution is to implement a teleportation portal with corrections rather than purely seamless spatial connectivity. The portal moves objects between points while enforcing a **boundary condition on a scalar potential field**. Note that edge discontinuities are explicitly out of scope for any envisioned phase of the actual game. The portal enforces equality between two patches of a field that, left alone, would disagree. That disagreement is resolved by a **Correcting Field (CF)** — ensuring the world remains self-consistent.

This document lays out that model in full: the field equations, the correcting mechanism, an analytical solution for the canonical two-circular-portal case, the resulting gameplay (0-g chambers, edge singularities, CF surfing), and an extension where the portal radius itself is a variable gameplay parameter, producing a scale-changing "Ant-Man" traversal mechanic as a direct geometric consequence rather than a bolted-on power-up.

The guiding design rule throughout: **the portal is the UI. The discontinuity is the mechanic. The correcting field is the engine that makes the discontinuity playable.**
---

## **2\. Why Gravity Must Be a Potential, Not a Vector**

Standard "gravity always points down" logic is a force-field model. It assigns a vector to every point in space and applies it directly. This is cheap, but it is *not* globally consistent once two regions of space are identified with each other by a portal, because there is no guarantee the vectors agree on either side of the seam.

Instead, define a scalar gravitational potential field:  
Φ(x)        such that     g(x) \= \-∇Φ(x)

In uninterrupted space with uniform gravity of magnitude g:  
Φ₀(x) \= g·z

where z is height along the gravity axis. This is the base potential — flat, linear, boring, and exactly what you'd expect from ordinary gravity.

A portal does not move objects between two points in this field. A portal declares that two *surfaces* in the field — call them D1 and D2, the two portal disks — must share the same potential, point for point, under some identification map T : D1 → D2:  
Φ(x) \= Φ(T(x))      for all x ∈ D1

This is a **Dirichlet boundary condition**. It is exactly the same kind of constraint used throughout electrostatics and heat-flow problems: "hold this surface at this value." Nothing about it requires exotic geometry, wormhole topology, or general relativity. It is pure potential theory, and that is precisely why it is cheap to compute and safe to run in a deterministic multiplayer simulation.

### **2.1 Why the electric-field analogy, specifically**

Gravitational potential and electrostatic potential obey structurally identical equations:  
∇²Φ\_gravity  \= 4πGρ          (Poisson, gravity)  
∇²V\_electric \= \-ρ/ε₀         (Poisson, electrostatics)

Outside of mass/charge sources, both reduce to Laplace's equation, ∇²Φ \= 0. This means every tool built over 200 years of electrostatics — image charges, disk-capacitor solutions, multipole expansions, conformal mapping — carries over directly. We are not inventing new physics; we are reusing a mature toolbox and relabeling it.

Crucially, this choice also eliminates time travel by construction. A field defined as the gradient of a single-valued scalar potential is automatically **conservative**:  
∮ g⃗ · dl⃗ \= 0        around any closed loop

No closed path through any number of portals can extract net energy or produce net work. This single property is what prevents:

* runaway acceleration loops (free energy),
* frame-dependent event ordering (because there is no "which event happened first" ambiguity — the field is instantaneously globally consistent),
* multiplayer desync (every client computes the same scalar field from the same boundary conditions and gets the same answer, independent of simulation order).

Time travel, in the "closed timelike curve" sense, is not patched out after the fact — it is structurally impossible in a model built from a single-valued potential. This is the entire justification for rejecting the wormhole/teleport model in favor of the field model.
---

## **3\. The Correcting Field**

### **3.1 Definition**

When a portal forces Φ(D1) \= Φ(T(D1)), and the unperturbed background field Φ₀ does *not* already satisfy that equality (which it won't, generically — that's the whole point), the system needs an additional field component to absorb the difference. Decompose the total potential:  
Φ(x) \= Φ₀(x) \+ Φ\_c(x)

Φ₀ is the known background (uniform gravity, in the simplest case). Φ\_c is the **correction potential** — the field generated by the portals themselves to patch the discontinuity. Outside of any mass sources, it must be harmonic:  
∇²Φ\_c \= 0          everywhere except on the portal boundary conditions

and it must vanish at infinity (the portals are a local perturbation, not a global rewrite of gravity):  
Φ\_c(x) → 0          as |x| → ∞

The **Correcting Field** proper is the gradient of this correction potential:  
E\_CF \= \-∇Φ\_c

Total effective gravity experienced by any object anywhere in the level is:  
g\_eff(x) \= g₀ \+ E\_CF(x) \= \-∇Φ₀(x) \- ∇Φ\_c(x)

### **3.2 What the CF does, mechanically**

1. **Smooths the discontinuity.** Rather than an infinite gradient spike exactly at the portal surface, the correction field spreads the potential mismatch over the surrounding geometry, with the sharpest gradients concentrated near the portal rim (see §5).

**Conserves momentum through the transition.** As an object crosses the portal boundary, its momentum is transformed consistently with the field it is leaving and entering:  
Δp⃗ \= m · E\_CF · Δt

2. applied continuously as the object traverses the boundary layer, rather than as a discontinuous "snap" at a single instant. This keeps trajectories smooth and makes the transition physically legible to the player — you can feel yourself pushed through, not teleported.
3. **Enforces the no-net-work constraint.** Because E\_CF is, by construction, the gradient of a single-valued scalar, any closed loop through any number of portals automatically satisfies ∮E\_CF · dl \= 0. This is the mechanism, not a rule bolted on top — the "paradox prevention" falls directly out of the field being conservative.

### **3.3 Why this is cheap**

Because there is no mass back-reaction in this model (portals and players do not source gravity themselves — they only sit inside a prescribed background field), Φ\_c is a pure boundary-value problem solvable once, analytically, per portal configuration, and re-evaluated only when portal position/orientation/radius changes. There is no need for iterative FEM relaxation over a tetrahedral mesh at 60 Hz. This is the key performance unlock that makes the mechanic real-time feasible.
---

## **4\. Analytical Model: Two Circular Portals in Uniform Gravity**

### **4.1 Setup**

Consider the canonical case: two circular portal disks of radius R, each embedded in otherwise uniform background gravity Φ₀ \= g·z. Let the disks be parallel, sharing a common axis (the "coaxial" case — e.g., a floor portal and a ceiling portal directly above it, or two portals facing each other on parallel walls), centered at heights z1 and z2, separation h \= |z2 \- z1|.

The portal identification is the trivial isometry in this symmetric case: a point at position (ρ, θ) on disk 1 maps to the same (ρ, θ) on disk 2\. The boundary condition becomes:  
Φ\_c(x ∈ D1) \- Φ\_c(T(x) ∈ D2) \= g·(z2 \- z1) \= ΔΦ

This is satisfied by the symmetric, gauge-fixed choice:  
Φ\_c(D1) \= \+ΔΦ/2          (constant over disk 1\)  
Φ\_c(D2) \= \-ΔΦ/2          (constant over disk 2\)

This is now **exactly** the classical electrostatics problem of two coaxial, parallel, circular conducting disks held at fixed, opposite potentials ±V₀, with V₀ \= ΔΦ/2, embedded in free space with no other sources. This is a long-solved problem.

### **4.2 Known reference solution**

This configuration is the **coaxial circular disk capacitor problem**, treated classically by Love (1949) via a dual integral equation formulation, with closed-form series solutions available in terms of oblate-spheroidal / toroidal coordinate expansions, and tabulated extensively in Smythe's *Static and Dynamic Electricity*. The qualitative structure of the solution — all that's needed for a game-time approximation — is:

* **Between the disks**: field lines run almost perfectly axial (parallel to the portal axis) and nearly uniform in magnitude, falling off only near the rim. This produces a *counter-field* that nearly cancels the background gravity gradient in the gap region.
* **At the rims**: the field diverges, approaching a 1/√s type singularity as the distance s from the disk edge shrinks — the classic sharp-edge conductor behavior (same phenomenon that makes lightning rods work).
* **Far from the pair**: the configuration looks like a simple dipole, and the correction field falls off as 1/r³, so the background gravity is only weakly perturbed outside the immediate portal neighborhood.

For an engine-usable approximation, we don't need the full Bessel/elliptic-integral machinery — we need a three-piece closed-form model matching this qualitative shape:  
Region 1 (between disks, |ρ| \< R, z1 \< z \< z2):  
E\_CF ≈ \-(ΔΦ / h) · ẑ          (uniform counter-field cancelling the gap gradient)

Region 2 (near rim, within edge thickness ε of radius R):  
|E\_CF| ≈ k\_edge · ΔΦ / √(s)   (s \= distance to nearest rim point, k\_edge fit to the reference solution)

Region 3 (far field, r ≫ R, h):  
Φ\_c(x) ≈ p·cosθ / r²          (dipole falloff; p ∝ ΔΦ·R², set by matching region 1/2 flux)

This piecewise model is directly implementable: evaluate which region a query point falls into, apply the matching analytical form, and blend across region boundaries with a smoothstep to avoid simulation-visible seams. It reproduces every qualitative feature the exact solution predicts, at a cost of a few branches and a square root — not a linear solve.

### **4.3 Resulting effective gravity**

g\_eff(x) \= g₀ẑ \+ E\_CF(x)

In the gap between coaxial disks, this becomes (approximately):  
g\_eff ≈ g·ẑ \- (ΔΦ/h)·ẑ \= g·ẑ \- g·ẑ \= 0        (when the disks sit exactly at z1, z2 along the gravity axis)

The counter-field generated by the portal pair, in the degenerate vertical/coaxial case, exactly cancels the background gradient in the gap. This is not a coincidence or a tuned parameter — it is forced by the boundary condition, because the correction field's entire job is to make Φ(D1) \= Φ(D2) consistent with a gap that the background field says should differ by exactly ΔΦ \= gh. The simplest way to resolve that is to flatten the gradient across the whole gap, which is precisely what the uniform-field approximation gives.
---

## **5\. The Floor–Ceiling Case: 0-g Chambers and Edge Behavior**

### **5.1 Why it becomes a neutral-buoyancy zone, not a gimmick**

When portal A is on the floor and portal B is on the ceiling directly above it, §4.3 shows the gap collapses to g\_eff ≈ 0. This is *not* "gravity turned off." It is the correcting field actively cancelling the background gradient, moment to moment, as a continuous consequence of the portal boundary condition. Mechanically this distinction matters:

* A true zero-gravity volume would simply let objects drift at whatever velocity they entered with.
* A **CF-cancelled** zone actively damps *any* attempt to build a potential difference inside it. If a player jumps, the push against the floor tries to create exactly the kind of local potential gradient the CF exists to eliminate — so the CF's natural response is to resist it, producing a "mushy," damped jump rather than a normal one. Jumping inside the chamber feels like jumping in a thick fluid or neutral-buoyancy tank: effortful but under-rewarded.
* Lateral motion is unaffected — the CF only acts along the portal axis, since that's the only direction with a forced discontinuity. Players can push off walls, glide, and drift sideways normally.

### **5.2 Edge singularities as a feature**

Region 2 of the analytical model (§4.2) predicts a 1/√s field spike at the rim of each disk. In gameplay terms, this means the boundary ring of every portal is a zone of locally extreme gravity — strong enough to redirect projectiles, fling loose objects, or (if left unmitigated) injure a player who lingers exactly on the edge. This is directly analogous to the sharp-edge field concentration on a charged conductor, and it gives level designers a built-in hazard/tool for free: portal rims are dangerous, portal interiors are calm, and the transition between the two is a legible, visually renderable gradient.

### **5.3 Scaling with portal geometry**

Because ΔΦ \= g·h depends only on the vertical separation between portal centers, the chamber's neutrality is tunable purely through placement:

* Portals close together (small h) → shallow potential mismatch → weak correcting field → gravity is only partially cancelled, producing a "heavy" low-g feel.
* Portals far apart (large h) → the gap-uniform approximation breaks down (region 1 no longer spans the whole separation) and the chamber transitions from a cancelled-gradient 0-g bubble into two separate near-portal zones connected by a region where background gravity reasserts itself.
* Portal radius R controls the lateral extent of the cancellation region and the strength of the rim singularity (k\_edge scales with R), giving designers a second independent knob.

---

## **6\. Variable-Radius Portals: The Scale-Change Mechanic**

### **6.1 The geometric inevitability of scaling**

Everything above assumed D1 and D2 share a radius R. If the portal emitter allows variable radius — R1 ≠ R2 — the identification map T : D1 → D2 can no longer be a plain isometry; it **must** include a scale factor, or the boundary of one disk would fail to map onto the boundary of the other:  
λ \= R2 / R1

y⃗ \= T(x⃗) \= λ · Rot(x⃗)        for x⃗ ∈ D1, y⃗ ∈ D2

This is not an added rule — it is the unique consistent way to identify two circular boundaries of different size. Anything passing through the portal is subject to this map, and therefore to the scale factor λ, as a direct geometric consequence rather than a special-cased power-up.

### **6.2 Consequences for position, momentum, and mass**

* **Position**: an object's local coordinates relative to the portal center are scaled by λ on exit. A player entering near the left edge of a small portal exits near the left edge of the (larger or smaller) target portal, proportionally.

**Momentum**: consistent transformation of the field under the mapping requires momentum to scale as well:  
p⃗\_out \= λ · p⃗\_in

* Passing from a small portal into a large one (λ \> 1) amplifies momentum — a walking pace becomes a sprint, a thrown rock becomes a boulder with proportionally scaled momentum. Passing from large to small (λ \< 1) compresses momentum — fast becomes slow, large force becomes gentle.
* **Effective mass**: if gameplay ties size to mass (reasonable, since this is meant to evoke an Ant-Man-style size-change), shrinking reduces effective mass and therefore reduces the gravitational force the player experiences per the same field, producing characteristically floaty, low-inertia movement; growing does the reverse, producing heavy, high-inertia movement with harder impacts.

### **6.3 Interaction with the correcting field**

The boundary condition driving Φ\_c is unaffected in form — Φ\_c(D1) \- Φ\_c(T(D1)) \= ΔΦ — but the *domain* of the Dirichlet condition now differs in size between the two disks, meaning the disk-capacitor analogy becomes a solution for **two unequal coaxial disks** rather than two equal ones. Qualitatively:

* The 0-g/neutral chamber between unequal portals is no longer symmetric: it bulges toward the larger disk and narrows toward the smaller one, since the field has to spread its flux over a bigger boundary on one side.
* The edge singularity strength differs between the two rims — the smaller portal has a tighter radius of curvature and therefore a sharper, more concentrated rim field; the larger portal's rim field is comparatively gentler.
* None of this requires new solving machinery — it's the same two-disk analytical framework from §4, parameterized by two independent radii instead of one shared radius.

### **6.4 Gameplay surface**

* **Traversal**: shrink to slip through vents, grates, or tight tunnels; grow to break through obstacles or reach high ledges.
* **Momentum tools**: route a slow heavy object through small→large portals for a "super-jump" launch; route a fast object through large→small portals for precision, low-speed placement.
* **Puzzle design**: size-change interacts with the 0-g chamber — entering a neutral chamber at reduced scale means a proportionally reduced "jump budget," changing which jumps are survivable.
* **Combat**: a thrown projectile gains or loses effective momentum passing through asymmetric portals, turning portal placement into a targeting/damage-scaling decision.
* **Resource economy**: if the emitter has a radius budget (e.g., total aperture area is capped, or larger apertures cost more energy to sustain), radius choice becomes a strategic trade-off between traversal capability and sustain cost.

---

## **7\. Core Gameplay Loop**

Putting the whole stack together, the player-facing loop is:

1. **Place a portal pair.** This declares a Dirichlet boundary condition between two disks, at chosen positions, orientations, and radii.
2. **The Correcting Field activates**, computed analytically and in real time from the disk geometry per §4–§6, rendered as a visible distortion (shimmering fringe lines, density proportional to local field strength, strongest at rims).
3. **The player manipulates the CF geometry** — by moving the portals, rotating them, or changing their radii — to solve traversal puzzles, redirect projectiles, build 0-g chambers, or scale themselves/objects up or down.
4. **The CF collapses when the portal closes**, releasing or dissipating any stored field energy (a natural hook for an "overload" burst mechanic if a portal is closed while heavily loaded).

This loop produces, without any additional special-casing: physics-based traversal puzzles, a built-in combat tool (rim hazards, momentum-scaling throws), a resource-management layer (aperture/energy budget), and genuinely emergent behavior from portal geometry — all while remaining provably safe for deterministic multiplayer simulation, since every quantity in the system is derived from a single-valued, conservative scalar potential field.
---

## **8\. Implementation Notes**

* **No FEM required.** Because matter does not back-react on the gravitational field in this model (players and objects are test particles, not sources), the correction potential for any portal configuration is a pure boundary-value problem with a known closed-form qualitative solution (§4.2). This should be implemented as a small analytical function family (uniform-gap term, rim-singularity term, far-field dipole term, blended with smoothstep transitions) rather than a numerical solver.
* **Recompute triggers.** Φ\_c only needs to be recomputed when a portal's position, orientation, or radius changes — not every frame regardless of state. Between changes, the field is static and can be cached/precomputed on a grid or evaluated analytically on demand per query point (player position, projectile position, etc.).
* **Determinism.** Since Φ\_c is a pure function of portal parameters (position, radius, orientation) and the fixed background field, every client computes bit-identical results given the same portal state, which is the property that makes this safe for lockstep or state-synchronized multiplayer.
* **Visual language.** Render the CF as visible field lines or a shader-based distortion whose density/intensity is driven directly by |E\_CF(x)| from the same analytical model used for physics — this guarantees the visual feedback never lies about the actual force a player is about to feel, which is essential for a mechanic this unusual to be learnable.

---

## **9\. Summary**

The central move in this design is refusing to let the portal be a teleporter. Instead, the portal is a boundary condition forcing equality between two patches of a scalar gravitational potential, modeled identically to electrostatic potential for both mathematical convenience and, more importantly, physical safety: a single-valued conservative field cannot support closed timelike loops, free energy, or multiplayer-breaking nondeterminism.

The discontinuity this boundary condition creates is resolved by a Correcting Field — the harmonic patch potential that makes the two disk boundaries consistent — and for the canonical two-circular-portal case, this is exactly the century-old coaxial disk capacitor problem from classical electrostatics, reusable here without modification. Its known qualitative structure (uniform gap field, rim singularity, dipole far-field) is cheap enough to approximate analytically and drive in real time.

The floor-ceiling configuration of this model naturally and necessarily produces a damped, neutral-buoyancy 0-g chamber — not a special case, but a direct consequence of the correcting field cancelling the background gradient across the gap. Allowing variable portal radii extends the same geometry to force a scale transformation on anything passing through, giving a physically-motivated "Ant-Man" size/momentum-scaling mechanic for free, governed by the same disk-pair analytical framework.

The result is a single coherent field model that simultaneously explains why the mechanic is safe for multiplayer, why it is cheap to compute, and why it produces rich, legible, exploitable gameplay — traversal, combat, puzzle design, and resource management all falling out of one set of boundary-value equations rather than being designed in as separate systems.  
Status  
