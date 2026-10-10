# **Momentum-Exchange Fields in the Rotating Three-Body Frame**

## **A Mathematical and High-Level Specification**

---

## **1\. Purpose**

This project builds and visualizes a new family of fields for the circular restricted three-body problem (CR3BP). The fields describe gravity assists ("slingshots") as **velocity-dependent momentum exchange**. They live in the rotating (synodic) frame, where the two massive bodies sit fixed on one axis and the Lagrange points are easy to see.

Standard CR3BP pictures show *where* a body can go:

* the effective potential,
* zero-velocity curves,
* invariant manifolds,
* Poincaré sections.

Standard gravity-assist pictures show *how much velocity* a single flyby trades with a planet. This project puts the two together. Over the space of possible encounters, it computes:

1. the **momentum-exchange field** — the velocity change each encounter produces;
2. the **energy-exchange field** — the inertial-frame energy change each encounter produces;
3. the **local exchange operator** — the linear map from small changes in incoming velocity to changes in outgoing velocity;
4. the **differential energy structure** — the gradient, curvature form, and sensitivity metric of the energy exchange. These say how sharply the outcome responds to small changes in geometry and velocity.

These are drawn as layers on top of the familiar Jacobi/Lagrange landscape. The goal is to see the **momentum geometry** of three-body transport, not only its configuration geometry.
---

## **2\. Core Idea in One Paragraph**

Consider a negligible-mass body passing near the smaller primary. In the planet's rest frame the encounter is approximately an elastic scatter: speed is kept and direction is rotated. Changing between frames is a linear operation on velocity, so the slingshot is an **affine map** on incoming velocity, $\mathbf v_{\text{out}} = A\,\mathbf v_{\text{in}} + \mathbf b$.

The rotation $A$ depends nonlinearly on encounter geometry and on relative speed. So the full slingshot is a smooth family of affine operators spread over a low-dimensional **encounter manifold**. The energy gained or lost through that family is a scalar field on the manifold. Its derivatives give a natural differential structure: where gain is large, where it is stable, and where it is chaotic.

The rotating CR3BP frame is the right place to study this. The Galilean (linear) part of the velocity dependence is absorbed into the frame, and the Jacobi integral reduces the encounter manifold to two dimensions.
---

## **3\. Dynamical Setting**

### **3.1 Normalization**

Two primaries of masses $m_1, m_2$ move on circular orbits about their common barycenter. The units are normalized as follows:

* total mass: m1+m2=1;
* primary separation: $1$;
* gravitational constant: $G = 1$;
* mean motion: $\omega = 1$, so the orbital period is $2\pi$;
* mass parameter: $\mu = m_2/(m_1+m_2) \in (0, \tfrac12]$.

Reference systems:

| System | $\mu$ (approx.) |
| ----- | ----- |
| Earth–Moon | 1.215110-2 |
| Sun–Jupiter | 9.538810-4 |
| Sun–Earth | 3.003510-6 |

### **3.2 Rotating frame**

The rotating frame turns with angular velocity $\boldsymbol\omega = \hat{\mathbf z}$. Both primaries stay fixed on the $x$-axis:

P1=(-,0),P2=(1-,0).

The third body (mass m0) has state \$\\mathbf s \= (x, y, \\dot x, \\dot y)\$. Its distances to the primaries are

r1=(x+)2+y2,r2=(x-1+)2+y2.

The baseline specification is planar. The spatial extension adds $(z, \dot z)$ and is described in §12.

### **3.3 Effective potential and equations of motion**

The effective potential is

$$ \Omega(x,y) = \tfrac12 (x^2 + y^2) + \frac{1-\mu}{r_1} + \frac{\mu}{r_2}. $$

The equations of motion are

x-2y=x,y+2x=y.

The terms $-2\dot y, 2\dot x$ are the Coriolis acceleration $-2\boldsymbol\omega \times \mathbf v_R$. This term is **exactly linear in velocity** and does no work. It is the first appearance of the linear velocity-dependent structure the project builds on.

### **3.4 Jacobi integral**

The Jacobi constant is

C=2(x,y)-(x2+y2).

$C$ is conserved along every trajectory. For each value of $C$:

* the **zero-velocity curves** $2\Omega(x,y) = C$ bound the allowed region;
* the **Lagrange points** $L_1, \dots, L_5$ are the critical points of $\Omega$;
* the Jacobi values $C_{L_i}$ at those points mark the topological transitions where the necks at $L_1, L_2, L_3$ open.

This landscape is the **base layer** of every visualization in the project.
---

## **4\. Frames and the Linear Velocity Structure**

### **4.1 Rotating ↔ inertial**

Let $\mathbf r = (x, y)$ be position and $\mathbf v_R = (\dot x, \dot y)$ the rotating-frame velocity. At the instant the two frames coincide, the inertial velocity is

$$ \mathbf v_I = \mathbf v_R + \boldsymbol\omega \times \mathbf r = (\dot x - y,\ \dot y + x). $$

At fixed position, this transformation is a pure translation in velocity space. At fixed velocity, it is linear in position. So the frame change is **affine**, and its velocity part is the identity.

### **4.2 The slingshot as an affine velocity map**

The **patched-conic (two-body) limit** is used for intuition and for validation. The secondary moves with inertial velocity $\mathbf V_P$. In the secondary's rest frame the incoming relative velocity is

$$ \mathbf u_{\text{in}} = \mathbf v_{\text{in}} - \mathbf V_P . $$

A hyperbolic flyby with impact parameter $b$ conserves $|\mathbf u|$ and rotates the velocity by the deflection angle $\delta$:

$$ \sin\frac{\delta}{2} = \frac{1}{\sqrt{1 + b^2 u^4/\mu^2}}, \qquad u = |\mathbf u_{\text{in}}|. $$

Here $\mu$ is the secondary's normalized gravitational parameter. The outgoing relative velocity is

$$ \mathbf u_{\text{out}} = R(\delta)\,\mathbf u_{\text{in}} . $$

The sign of $\delta$ follows the side of the pass. Transforming back to the inertial frame gives

$$ \boxed{\ \mathbf v_{\text{out}} = R(\delta)\,\mathbf v_{\text{in}} + \big(I - R(\delta)\big)\mathbf V_P\ } $$

For fixed $(b,u)$ this is an affine map $\mathbf v_{\text{in}} \mapsto A\mathbf v_{\text{in}} + \mathbf b$, with

\$\$ A \= R(\\delta), \\qquad \\mathbf b \= (I \- R)\\mathbf V\_P . \$\$

### **4.3 Where linearity ends**

Because $\delta = \delta(b, |\mathbf u_{\text{in}}|)$, the true derivative of the map is not just $R$:

$$ \frac{\partial \mathbf v_{\text{out}}}{\partial \mathbf v_{\text{in}}} = R(\delta) + R'(\delta)\,\mathbf u_{\text{in}}\; \frac{\partial\delta}{\partial u}\,\frac{\mathbf u_{\text{in}}^{\top}}{u}. $$

* The first term is the **linear (Galilean + rotation) part**.
* The second term is a rank-one correction. It is the **nonlinear part**, and all curvature of the energy field comes from it.

The project's operator field (§6.3) is the full-dynamics generalization of this Jacobian.

### **4.4 Energy exchange in the patched-conic limit**

The relative speed is unchanged by the flyby, so the inertial specific energy change is

$$ \Delta E = \tfrac12\big(|\mathbf v_{\text{out}}|^2 - |\mathbf v_{\text{in}}|^2\big) = \mathbf V_P \cdot (\mathbf u_{\text{out}} - \mathbf u_{\text{in}}) = \mathbf V_P \cdot \Delta\mathbf v . $$

Energy is gained when the velocity change has a component along the secondary's motion, as in a trailing-side pass. This closed form is the analytic reference against which the numerical fields are checked.
---

## **5\. The Encounter Manifold**

### **5.1 Encounter sections**

Fix a sphere of influence around the secondary with radius $\rho$. The default is the Hill radius:

\=rH=(/3)1/3.

Define two sections:

in={r2=, r2\<0},out={r2=, r2\>0}.

### **5.2 Reduction by the Jacobi integral**

On a fixed Jacobi level $C$, a point of $\Sigma_{\text{in}}$ is fixed by two angles:

* \[0,2) — the position angle on the circle r2=, measured from the \+x axis;
* $\beta \in (-\pi/2, \pi/2)$ — the angle between the rotating-frame velocity and the inward normal. Positive $\beta$ means a prograde offset.

The speed is fixed by the Jacobi integral:

$$ |\mathbf v_R| = \sqrt{2\Omega(\mathbf r) - C}. $$

So for each $(\mu, C)$ the **encounter manifold** is the two-dimensional domain

$$ \mathcal M_{\mu,C} = \{(\alpha, \beta) : 2\Omega(\mathbf r(\alpha)) > C\}. $$

The local impact parameter is b=||.

This reduction is the formal version of "renormalize into the rotating frame". Without it, the full phase space is four-dimensional and the encounter set is three-dimensional. In the rotating frame, the Jacobi level and the section bring it down to a **plottable 2D sheet** for each energy.

### **5.3 The encounter map**

For each $\xi = (\alpha, \beta) \in \mathcal M_{\mu,C}$:

1. build the initial state $\mathbf s_{\text{in}}(\xi)$;
2. integrate forward until the first crossing of $\Sigma_{\text{out}}$, or until time $T$.

This defines

$$ \Phi_{\mu,C} : \mathcal M_{\mu,C} \to \Sigma_{\text{out}}, \qquad \xi \mapsto \mathbf s_{\text{out}}(\xi), $$

along with a **time of flight** $\tau(\xi)$ and an **outcome label** $\ell(\xi)$:

| Label | Meaning |
| ----- | ----- |
| exit | crosses out normally |
| collision | $r_2 < R_{\text{body}}$ (physical radius of the secondary) |
| captured | no exit before $T$ (temporary or permanent capture) |
| multi-pass | exits only after re-entering through $\Sigma_{\text{in}} \ge 1$ time |

Fields are defined on the exit subset. The other labels are drawn as a domain partition, since the boundaries between them are themselves important structure.

An optional **long-range mode** uses distant sections instead, for example $x = \text{const}$ near $L_1$ or $L_2$. This measures exchange across a full Lagrange-neck transit rather than a single close approach.
---

## **6\. Fields on the Encounter Manifold**

All fields are given per unit mass of the third body. Multiply by $m$ for momentum and energy.

### **6.1 Momentum-exchange field**

The primary field is the inertial velocity change:

$$ \Delta\mathbf v(\xi) = \mathbf v_I\big(\mathbf s_{\text{out}}(\xi)\big) - \mathbf v_I\big(\mathbf s_{\text{in}}(\xi)\big). $$

The momentum-exchange field is $\Delta\mathbf p = m\,\Delta\mathbf v$.

The rotating-frame change $\Delta\mathbf v_R$ is also recorded, for comparison with the Coriolis structure.

### **6.2 Energy and angular-momentum exchange**

The inertial specific energy and angular momentum about the barycenter are

$$ E = \tfrac12|\mathbf v_I|^2 - \frac{1-\mu}{r_1} - \frac{\mu}{r_2}, \qquad h = x\dot y - y\dot x + x^2 + y^2 . $$

A direct calculation gives the identity

C=-2(E-h).

This follows from $|\mathbf v_I|^2 = |\mathbf v_R|^2 + 2(x\dot y - y\dot x) + x^2 + y^2$.

Since $C$ is conserved, **every encounter in the CR3BP satisfies**

$$ \boxed{\ \Delta E = \Delta h\ } $$

Energy exchange and angular-momentum exchange are the same scalar field. The project uses this in two ways:

* it computes E cheaply;
* it uses $|\Delta E - \Delta h|$ as a built-in numerical error diagnostic.

A second energy is also computed: the Keplerian energy relative to the large primary,

$$ \mathcal E_1 = \tfrac12|\mathbf v_I - \mathbf v_{P_1}|^2 - \frac{1-\mu}{r_1}. $$

Its change $\Delta\mathcal E_1$ measures how the encounter changes the heliocentric (or geocentric) orbit. This is the quantity mission designers care about. For $\mu \to 0$, the Tisserand parameter is approximately conserved, and its link to $C$ gives a further consistency check.

### **6.3 Exchange-operator field**

The local linear response of outgoing velocity to incoming velocity is

$$ A(\xi) = \frac{\partial \mathbf v_{I,\text{out}}}{\partial \mathbf v_{I,\text{in}}}\Big|_{\text{position held on } \Sigma_{\text{in}}}. $$

It is extracted from the state-transition matrix (§8.2), with a correction for the change in crossing time.

In the patched-conic limit, $A$ reduces to the expression in §4.3. It splits into:

* a **rotation part**: polar decomposition A=QS, with QSO(2) and the angle of Q acting as an *effective deflection angle* eff();
* a **stretch part**: the symmetric factor $S$, whose eigenvalues measure anisotropic amplification.

Together with the offset $\mathbf b(\xi) = \mathbf v_{I,\text{out}} - A\,\mathbf v_{I,\text{in}}$, this gives the **affine operator field** $(A, \mathbf b)$ over $\mathcal M_{\mu,C}$. It is the direct generalization of the slingshot formula to full three-body dynamics.

### **6.4 Auxiliary scalar fields**

| Field | Definition |
| ----- | ----- |
| time of flight | () |
| periapsis distance | r2,() |
| effective deflection | eff() |
| exit location | (out,out) — closes the map onto itself for repeated encounters |

---

## **7\. Differential Energy Structure**

The "differential energy metric" is split into three objects with distinct mathematical status. A raw Hessian is not a metric in general, because it can have negative eigenvalues.

### **7.1 Energy 1-form (gradient)**

dE=Ed+Ed.

It is visualized as a gradient vector field on $\mathcal M_{\mu,C}$, using the flat metric on $(\alpha, \beta)$ or the induced metric of §7.3. It points toward encounter geometries with larger energy gain. Its zeros are the **extremal encounters**: maximal boost, maximal braking, and saddles between basins.

### **7.2 Energy curvature form (Hessian)**

Hij()=2Eij.

* $H$ is a symmetric bilinear form, but it is **indefinite** in general.
* It is coordinate-invariant only at critical points of $\Delta E$. Away from them it is reported in the canonical $(\alpha, \beta)$ coordinates, or covariantly using the Levi-Civita connection of $g_\Phi$ (§7.3).

It is visualized through:

* H and \$\\operatorname{tr} H\$;
* a **signature map** with three regions: $(+,+)$ for an energy well, $(-,-)$ for an energy ridge or peak, and $(+,-)$ for an exchange saddle;
* the principal curvature directions, drawn as line fields.

### **7.3 Sensitivity metric (true metric)**

Choose a positive-definite metric K on out. The default is a Euclidean metric on (position, velocity), with weights set by the characteristic length  and speed /. Pull it back through the encounter map:

g()=D()KD().

$g_\Phi$ is positive semi-definite, and positive definite wherever $\Phi$ is an immersion. It measures **how far apart nearby encounters end up**.

Two derived quantities are produced:

* **FTLE.** The largest eigenvalue  gives a finite-time Lyapunov exponent
*
* ()=1()().
* Its ridges approximate the stable and unstable manifolds of the Lyapunov orbits at L1 and L2. These manifolds are the transport tubes.
* **Energy-restricted metric.** This is the component of g along dE:
* \$\$\\kappa\_E(\\xi) \= \\frac{|d\\Delta E|^2\_{g\_0}}{\\operatorname{tr} g\_\\Phi}.\$\$
* It measures whether sensitivity is concentrated in the energy outcome or in the trajectory geometry.

### **7.4 Interpretation**

| Object | Question it answers |
| ----- | ----- |
| $\Delta E$ | How much energy does this encounter trade? |
| $d\Delta E$ | Which way should the encounter be nudged for more? |
| $H$ | Is this a stable optimum, a saddle, or a ridge? |
| $g_\Phi$ | How chaotic / sensitive is this encounter? |
| $A, \mathbf b$ | What linear operator does this encounter apply to velocity? |

---

## **8\. Computational Pipeline**

### **8.1 Inputs**

* mass parameter $\mu$;
* a set of Jacobi levels $\{C_k\}$. Defaults straddle $C_{L_1}, C_{L_2}, C_{L_3}$ so that each neck topology is sampled;
* section radius  and body radius Rbody;
* grid resolution $N \times N$, plus optional adaptive refinement;
* integration limit $T$ and tolerances.

### **8.2 Per-sample procedure**

1. **Seed.** Build $\mathbf s_{\text{in}}(\alpha, \beta; C)$. Reject the sample if $2\Omega(\mathbf r(\alpha)) < C$, which means the point is in the forbidden region.
2. **Integrate.** Propagate the equations of motion together with the $4 \times 4$ variational equations:
3. \$\$\\dot\\Phi\_{\\text{STM}} \= J(\\mathbf s)\\,\\Phi\_{\\text{STM}}, \\qquad \\Phi\_{\\text{STM}}(0) \= I.\$\$
4. Use an adaptive high-order integrator (Dormand–Prince 8(5,3) or equivalent) with relative tolerance 10-12.
5. **Regularize.** When r2\</10, switch to Levi-Civita regularization about P2. Do the same about P1 if needed.
6. **Detect events.** Detect crossings of out, collisions, and re-entry through in by root finding on r2- with direction filtering.
7. **Differentiate the map.** Compute D from the STM, corrected for the variable crossing time:
8. \$\$D\\Phi \= \\left(I \- \\frac{\\mathbf f\\,\\nabla\\sigma^{\\top}}{\\nabla\\sigma\\cdot\\mathbf f}\\right)\\Phi\_{\\text{STM}}\\,\\frac{\\partial \\mathbf s\_{\\text{in}}}{\\partial\\xi}.\$\$
9. Here \=r2- and \$\\mathbf f\$ is the vector field at exit.
10. **Compute fields.** Evaluate \$\\Delta\\mathbf v\$, E, h, \$\\Delta\\mathcal E\_1\$, A, \$\\mathbf b\$, , r2,, g, .
7. **Store the outcome label.**

### **8.3 Second derivatives**

The Hessian $H$ is computed in one of two ways:

* **(a)** finite differences of the analytic gradient $d\Delta E = \nabla_{\mathbf s}\Delta E \cdot D\Phi$ on the grid, using centered differences masked at label boundaries; or
* **(b)** second-order variational equations (state-transition tensors), for high-accuracy runs.

Method (a) is the default. Method (b) is used for validation.

### **8.4 Adaptive refinement**

The fields have sharp structure near manifold intersections and label boundaries. Refinement proceeds as follows:

* Subdivide cells where $|\Delta\ell| \ne 0$ across a cell, or where the FTLE $\sigma$ exceeds a threshold.
* Repeat up to a configurable depth.
* Store results in a quadtree over $\mathcal M_{\mu,C}$.

### **8.5 Performance**

* Samples are independent, so the pipeline parallelizes trivially across CPU cores or GPU batches.
* Target: a $512^2$ base grid per $(\mu, C)$ in minutes on a workstation.
* Intermediate results are cached by (,C,,grid).

---

## **9\. Visualization Specification**

### **9.1 Layer stack**

Every view supports layers that can be toggled independently:

| \# | Layer | Space | Encoding |
| ----- | ----- | ----- | ----- |
| 0 | Effective potential $\Omega$ | physical $(x,y)$ | contour lines |
| 1 | Zero-velocity curves at $C$ | physical | shaded forbidden region ($2\Omega < C$) |
| 2 | Lagrange points, primaries, Hill circle | physical | markers |
| 3 | Outcome partition $\ell$ | $\mathcal M_{\mu,C}$ | categorical color |
| 4 | E (= h) | \$\\mathcal M\_{\\mu,C}\$ | diverging heatmap, zero-centered |
| 5 | $\Delta\mathbf v$ | $\mathcal M_{\mu,C}$ and physical | quiver, colored by $|\Delta\mathbf v|$ |
| 6 | $d\Delta E$ | $\mathcal M_{\mu,C}$ | streamlines |
| 7 | Hessian signature, $\det H$ | $\mathcal M_{\mu,C}$ | 3-class map + intensity |
| 8 | FTLE $\sigma$ | $\mathcal M_{\mu,C}$ | grayscale ridges |
| 9 | Operator glyphs $(A, \mathbf b)$ | $\mathcal M_{\mu,C}$ | ellipses: image of the unit circle under $A$, rotation tick for $\delta_{\text{eff}}$ |

### **9.2 Linked views**

* **Left panel:** the physical rotating-frame plane, with layers 0–2 and the Hill circle. Encounter-manifold data are drawn back onto the circle at each sample's entry point $\alpha$, as a ring heatmap of $\Delta E$ averaged or extremized over $\beta$.
* **Right panel:** the $(\alpha, \beta)$ encounter manifold with layers 3–9.
* **Interaction:** clicking a point on the right draws its full trajectory on the left, together with incoming and outgoing inertial velocity vectors.
* **Jacobi slider:** scrubbing $C$ animates the fields through the $L_1, L_2, L_3$ neck openings.

### **9.3 Standard figure set**

1. $\Delta E$ on $\mathcal M_{\mu,C}$ for Earth–Moon at three Jacobi levels: $L_1$ closed, $L_1$ open, $L_2$ open.
2. FTLE overlaid on $\Delta E$, showing whether energy-exchange extremes line up with the transport tubes.
3. Hessian signature map, showing exchange saddles.
4. Operator-glyph field, showing the affine slingshot operator varying over encounter geometry.
5. Patched-conic vs. CR3BP comparison of $\Delta E$ at small $\mu$ (Sun–Earth).

---

## **10\. Validation**

| Test | Criterion |
| ----- | ----- |
| Jacobi conservation | $|C(t) - C(0)| < 10^{-10}$ along every trajectory |
| Energy–angular-momentum identity | $|\Delta E - \Delta h| < 10^{-9}$ |
| Patched-conic limit | as 0 with 0 appropriately, \$\\Delta E \\to \\mathbf V\_P\\cdot\\Delta\\mathbf v\$ and eff(b,u) from §4.2 |
| Symmetry | the CR3BP is invariant under $(x, y, t) \mapsto (x, -y, -t)$; the fields must show the matching reflection–time-reversal symmetry between entry and exit |
| Derivative accuracy | STM-based $D\Phi$ agrees with finite differences to $\mathcal O(h^2)$ |
| Manifold correspondence | FTLE ridges coincide with numerically computed $L_1/L_2$ Lyapunov-orbit manifolds intersected with $\Sigma_{\text{in}}$ |
| Convergence | fields converge under grid refinement and tolerance tightening |

---

## **11\. Relation to Existing Work**

The project draws on, and must be positioned against, several established tools:

* **Jacobi/zero-velocity analysis and invariant-manifold transport.** The base layer and the tube dynamics through $L_1$ and $L_2$.
* **Lagrangian coherent structures / FTLE maps for the CR3BP.** Our sensitivity metric $g_\Phi$ contains this as its largest eigenvalue.
* **Keplerian maps and flyby maps.** Energy-kick maps for repeated encounters, especially in the small-$\mu$ limit.
* **Tisserand graphs.** Gravity-assist design in terms of the Tisserand parameter, a near-invariant related to $C$.
* **Periapsis Poincaré maps.** Sections at close approach in the rotating frame.

**What this project adds** is the combination of four things in a single framework:

* the explicit affine operator field $(A, \mathbf b)$;
* the identity E=h as the organizing scalar;
* the separation of the energy gradient, the indefinite energy curvature form, and the positive sensitivity metric;
* a layered display of all of these over the Jacobi-reduced encounter manifold, together with the Lagrange-point geometry.

The conversation that started this project suggested that no such combined plot exists. That claim is **plausible but not yet verified**. A structured literature review is a required early milestone, and the novelty statement in any write-up must reflect what it finds.
---

## **12\. Extensions**

* **Spatial CR3BP.** Add $(z, \dot z)$. The encounter manifold becomes four-dimensional per Jacobi level, so it is shown as 2D slices or with dimensionality reduction.
* **Elliptic restricted problem (ER3BP).** The Jacobi integral is lost. $\Delta E \ne \Delta h$ in general, and the gap becomes a new field.
* **Iterated exchange.** Compose $\Phi$ with the return map to study cumulative energy diffusion: multiple flybys, resonance hopping.
* **Information-geometric view.** Treat the encounter as a noisy channel with Gaussian uncertainty on $\xi$. The pulled-back covariance gives a Fisher-type metric that measures how much an outcome reveals about its initial conditions.

---

## **13\. Open Questions**

1. Do the maxima of $\Delta E$ on $\mathcal M_{\mu,C}$ lie on, inside, or between the transport tubes at $L_1$ and $L_2$?
2. How does the Hessian signature map reorganize as $C$ crosses $C_{L_1}$ and $C_{L_2}$? Are there bifurcations of exchange saddles?
3. How do $\delta_{\text{eff}}$ and the stretch eigenvalues of $A$ scale with $\mu$? Where does the patched-conic picture fail quantitatively?
4. Is there a natural choice of $K$ that makes $g_\Phi$ independent of the section radius $\rho$ in some asymptotic sense?

---

## **14\. Deliverables and Milestones**

| Milestone | Deliverable |
| ----- | ----- |
| M0 | Literature review; finalize novelty statement |
| M1 | CR3BP integrator with STM, regularization, event detection; validation tests 1, 2, 6 |
| M2 | Encounter-manifold sampler and outcome partition |
| M3 | Field computation: \$\\Delta\\mathbf v\$, E, \$\\Delta\\mathcal E\_1\$, A, \$\\mathbf b\$,  |
| M4 | Differential structure: dE, H, g, FTLE; validation tests 3–5, 7 |
| M5 | Linked-view visualization with layer stack and Jacobi slider |
| M6 | Standard figure set (§9.3) and technical write-up |

---

## **Appendix: Symbol Table**

| Symbol | Meaning |
| ----- | ----- |
|  | mass parameter m2/(m1+m2) |
|  | effective potential in the rotating frame |
| C | Jacobi constant |
| \$\\mathbf v\_R, \\mathbf v\_I\$ | rotating-frame and inertial velocity |
|  | encounter-section radius (default: Hill radius) |
| \=(,) | coordinates on the encounter manifold \$\\mathcal M\_{\\mu,C}\$ |
|  | encounter map inout |
| \$\\Delta\\mathbf v, \\Delta\\mathbf p\$ | momentum-exchange field (per unit mass / total) |
| E,h | inertial energy and angular-momentum exchange (E=h) |
| \$\\Delta\\mathcal E\_1\$ | Keplerian energy change about the large primary |
| \$A, \\mathbf b\$ | affine exchange-operator field |
| eff | effective deflection angle (rotation part of A) |
| H | energy curvature form (Hessian of E) |
| g | sensitivity metric (pullback of K through ) |
|  | finite-time Lyapunov exponent |
| \$\\ell\$ | outcome label |