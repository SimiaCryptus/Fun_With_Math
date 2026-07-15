# Visualization Plan: An Interactive Tutorial on QQN

> **Status**: Specification for a specification. No code — this document plans,
> in detail, an introductory tutorial paper that teaches optimizers from first
> principles and uses QQN as a segue into line search methods.

## 1. Purpose and Audience

We want to explain the concepts of QQN using a highly visual, semi-interactive
learning experience. QQN adds firm **geometric foundations** to optimization —
foundations that are both visually teachable and slightly alien to current
expectations for optimizers (which are usually presented as opaque update
rules). The core reframing we want the reader to *feel*, not just read, is:

> **"Which direction?" becomes "where on the curve?"**

### Target audience

- **Primary**: ML practitioners and students who know gradient descent and Adam
  as black-box `optimizer.step()` calls but have never *seen* what the update
  does geometrically.
- **Secondary**: numerical-optimization newcomers who know calculus but not the
  quasi-Newton / line-search literature.
- **Tertiary (stretch)**: experts who want an intuition pump for QQN's four-axis
  factoring (gradient / oracle / search / region).

### Learning objectives

By the end, a reader should be able to:

1. Define what an optimizer *is* as a repeated "choose a direction, choose a
   step" loop over a loss landscape.
2. Explain gradient descent, momentum/Adam, and L-BFGS geometrically, and state
   the **robustness vs. speed** trade-off between first- and second-order
   methods.
3. Describe QQN's quadratic path `d(t)`, its three key properties
   (`d(0)=0`, `d'(0)=-∇f`, `d(1)=-H∇f`), and why it *blends* rather than
   *chooses*.
4. Explain what a line search is, why it is QQN's first-class component, and how
   Armijo / Wolfe / spline searches walk the path.
5. Understand that Adam is an **oracle** inside QQN, not a competitor to it.

---

## 2. Overall Structure and Narrative Arc

The paper is a single scrolling page ("scrollytelling") with **anchored,
reusable canvases**. As the reader scrolls, prose on the left drives state
changes in a pinned visualization on the right (on wide screens); on narrow
screens, canvases stack inline above their explanatory prose.

The narrative arc deliberately mirrors [`background.md`](docs/background.md):

```
Landscape → Direction → Step → GD → Momentum/Adam → L-BFGS
        → The Trade-off → QQN's blend → The path d(t)
        → Line search (Armijo → Wolfe → Spline)
        → The four axes → Equivalences (recap)
```

### Section-by-section outline

| #  | Section                        | Key visual                         | Interaction                             |
|----|--------------------------------|------------------------------------|-----------------------------------------|
| 0  | Hook / teaser                  | animated QQN path on a valley      | autoplay loop, "poke" to perturb        |
| 1  | What is a loss landscape?      | 3D surface + 2D contour, linked    | orbit 3D, hover contour                 |
| 2  | What is an optimizer?          | a marble on the surface            | drag start point, step-through button   |
| 3  | Gradient descent               | arrows = `-∇f`; learning-rate knob | slider `η`; watch zig-zag / divergence  |
| 4  | Momentum & Adam                | velocity trail; per-axis scaling   | sliders `β1,β2,ε`; toggle GD vs Adam    |
| 5  | L-BFGS (quasi-Newton)          | curvature ellipses; big steps      | history-size slider; show fragility     |
| 6  | The trade-off (robust vs fast) | side-by-side race on ill-cond bowl | one "run" button, synchronized          |
| 7  | QQN: blend, don't choose       | the parabola `d(t)` from `x`       | drag oracle endpoint; scrub `t`         |
| 8  | The path's three properties    | annotated `d(0),d'(0),d(1)`        | toggle annotations; verify tangent      |
| 9  | Line search: walking `t`       | 1D slice `f(d(t))` under the path  | Armijo/Wolfe/backtracking animation     |
| 10 | Spline search                  | control points + Hermite spline    | add/drag control points; reflect toggle |
| 11 | The four axes                  | slotted config panel               | swap oracle/region/search, re-run       |
| 12 | Equivalences (recap)           | config presets → classical names   | click preset → morph trajectory         |

---

## 3. Rendering Technology (ES6, no code here)

### Stack

- **Pure ES6 modules**, no framework dependency for the core; a thin optional
  reactive layer is acceptable but must degrade gracefully.
- **2D**: HTML5 Canvas 2D for contour plots, path overlays, and 1D slices.
  (SVG is the fallback for print/export where crisp vector output matters.)
- **3D**: WebGL via a small wrapper (e.g. a Three.js-style scene graph) for the
  loss surface, orbit controls, and the lifted path.
- **Math**: a tiny self-contained linear-algebra helper (dot, norm, 2×2 solve,
  quadratic roots) — deliberately minimal so readers can inspect it.

### Cross-cutting rendering requirements

- **Linked views**: the 2D contour and 3D surface share one landscape model and
  one iterate state; interacting with either updates both.
- **Deterministic replay**: every animation is a pure function of
  `(landscape, start, config, tick)` so a "reset" perfectly reproduces a run.
- **DPI-aware** canvases; responsive resize; `prefers-reduced-motion` respected
  (animations become step-through).
- **Colorblind-safe palette**; gradient = one hue, oracle = a second, path = a
  third, accepted step = a fourth, consistently across *all* sections.
- **Export**: each canvas can dump its current frame to PNG and its config to a
  shareable URL hash (so figures are citable and reproducible in the paper).

---

## 4. Shared Playground Model

All sections operate on a common, swappable **landscape library** so intuitions
transfer between sections.

### Landscape library (2D → scalar)

| Name            | Why it's here                                      |
|-----------------|----------------------------------------------------|
| Quadratic bowl  | baseline; exact for second-order intuition         |
| Ill-conditioned | long narrow valley; shows GD zig-zag, L-BFGS win   |
| Rosenbrock      | the classic curved valley; the paper's mascot      |
| Saddle          | shows why "descent direction" matters              |
| Multi-modal     | phantom minima; motivates spline reflection caveat |
| Noisy convex    | motivates Adam / momentum smoothing                |

Each landscape exposes `f(x,y)`, `∇f(x,y)`, and (for the second-order sections)
`∇²f(x,y)` in closed form, so gradients and curvature are exact and the visuals
are trustworthy rather than finite-differenced.

### Global control panel (persistent, collapsible)

- Landscape selector (thumbnails).
- Start-point coordinates (also drag-set on the contour).
- Master "step / play / reset" transport.
- "Show gradient / oracle / path / bracket" layer toggles.
- Seed (for the noisy landscape).

State from the global panel is shared; per-section panels add only the knobs
relevant to that section (learning rate, `β`, history size, `c1/c2`, etc.).

---

## 5. Detailed Section Specifications

### Section 0 — Hook

- **Visual**: a Rosenbrock contour with a QQN trajectory drawing itself, the
  `d(t)` parabola flashing at each iterate before the step is taken.
- **Copy tone**: "Most optimizers pick a direction and hope. This one draws a
  little curve and *searches* it." One sentence, one canvas, autoplay loop.
- **Interaction**: click/drag anywhere to move the start point; the run
  re-solves and re-draws. Deliberately no knobs — pure intrigue.

### Section 1 — What is a loss landscape?

- **Visuals**: a 3D surface (orbitable) beside a 2D contour of the *same*
  function. A crosshair hovered on the contour lights up the matching point on
  the 3D surface and reads out `f(x)`.
- **Teaching point**: "height = loss; we want to get low." Establish the
  contour-vs-surface duality used everywhere after.
- **Interaction**: orbit/zoom 3D; hover contour; landscape selector introduced.

### Section 2 — What is an optimizer?

- **Visual**: a marble placed on the surface; a discrete `x₀, x₁, x₂, …`
  polyline on the contour.
- **Teaching point**: an optimizer is a **loop**: (1) look around (gradient),
  (2) pick a direction, (3) pick how far (step), (4) move, repeat. Foreshadow
  that QQN reorganizes steps (2) and (3).
- **Interaction**: "single step" button reveals the loop one stage at a time
  with labelled overlays.

### Section 3 — Gradient descent

- **Visual**: negative-gradient arrow field faintly in the background; the
  active `-∇f` arrow bold at the current iterate; trajectory polyline.
- **Teaching point**: `x ← x - η∇f`. Show the three regimes with the `η` slider:
  too small (crawl), just right (smooth), too big (zig-zag → divergence) on the
  ill-conditioned bowl.
- **Interaction**: `η` slider (log scale); landscape swap to feel conditioning.
- **Callout**: link to [`background.md`](docs/background.md) — "robust but slow."

### Section 4 — Momentum & Adam

- **Visuals**: (a) a velocity vector accumulating into a trail; (b) an
  axis-aligned ellipse showing Adam's per-coordinate rescaling of the step.
- **Teaching point**: momentum = heavy ball rolling through the valley; Adam =
  momentum + per-axis adaptive step from second-moment estimates. Toggle
  GD ↔ Momentum ↔ Adam on the same start to compare trails.
- **Interaction**: `β1`, `β2`, `ε` sliders; the noisy-convex landscape to show
  Adam smoothing jitter.
- **Forward reference (important)**: a boxed aside — *"Hold onto Adam. In QQN,
  Adam isn't a rival optimizer; it's an **oracle** — a direction supplier we'll
  plug in at Section 11."* This sets up the reframing from
  [`oracles.md`](docs/oracles.md).

### Section 5 — L-BFGS (quasi-Newton)

- **Visuals**: a local curvature ellipse (from the approximate inverse Hessian
  `H`) at the iterate; the L-BFGS step `-H∇f` drawn as a long, well-aimed arrow
  that "knows" about the valley walls.
- **Teaching points**:
- Second-order methods reshape the space so the valley looks round.
- The step is bigger and better-aimed → superlinear near the minimum.
- **Fragility**: on the saddle / non-convex spot, show `-H∇f` pointing *uphill*
  (an ascent direction). This is the visual seed for why QQN needs a fallback.
- **Interaction**: history-size slider (watch the ellipse tighten as history
  grows); a "break it" button that jumps to a non-convex region to expose the
  ascent-direction failure.
- **Callout**: link the two-loop recursion prose in
  [`algorithm.md`](docs/algorithm.md) but keep it optional/expandable.

### Section 6 — The trade-off

- **Visual**: split-screen race on the ill-conditioned valley — GD (left),
  L-BFGS (right) — both stepping in lockstep on one transport control.
- **Teaching point**: crystallize *robust-but-slow* vs. *fast-but-fragile*. On a
  benign bowl L-BFGS wins cleanly; jump to the non-convex landscape and L-BFGS
  stumbles while GD plods safely on. **The tension is the whole motivation.**
- **Interaction**: shared step/run; landscape swap; a "why did L-BFGS fail?"
  hotspot that replays the ascent step from Section 5 in slow motion.

### Section 7 — QQN: blend, don't choose

- **The centerpiece.** Draw, from the current iterate `x`:
- the gradient endpoint direction `-∇f` (hue 1),
- the oracle endpoint `-H∇f` (hue 2, **draggable**),
- and the **quadratic path** `d(t)=t(1-t)(-∇f)+t²(-H∇f)` connecting the
  curved blend between them (hue 3).
- **Teaching point**: QQN refuses the binary choice. The path *starts* along the
  gradient and *ends* at the oracle; the search will find the best point on it.
- **Interactions**:
- **Drag the oracle endpoint** and watch the parabola deform live — the reader
  literally reshapes `d(1)`.
- **Scrub `t`** with a slider; a marker rides the path and a readout shows
  `f(x+d(t))`.
- Toggle to show the path lifted onto the 3D surface.
- **Callout**: this is the "slightly alien" moment promised in the plan — the
  optimizer's move is a *curve*, not an arrow.

### Section 8 — The path's three properties

- **Visual**: the same parabola, now annotated:
- `d(0)=0` — "we start where we are,"
- `d'(0)=-∇f` — a tangent arrow at `t=0` provably parallel to `-∇f`,
- `d(1)=-H∇f` — the endpoint snapping to the oracle.
- **Teaching point**: because the path *begins* tangent to steepest descent, a
  small step always decreases `f` — **this is the globalization guarantee**
  (see [`algorithm.md`](docs/algorithm.md), "Global Convergence").
- **Interaction**: a "verify tangent" toggle overlays `-∇f` on `d'(0)` so they
  visibly coincide regardless of where the oracle endpoint is dragged; a small
  `⟨∇f, d'(0)⟩ = -‖∇f‖²` readout updates live.

### Section 9 — Line search: walking `t`

- **Visual**: a **1D slice panel** plotting `φ(t)=f(x+d(t))` for `t∈[0,1]`
  beneath the 2D path view. The line search's probes appear as dots on `φ`.
- **Teaching points**:
- The search space is one-dimensional: the curve itself.
- **Armijo / sufficient decrease**: draw the Armijo line
  `φ(0)+c1·t·φ'(0)`; accepted `t` must fall below it.
- **Strong Wolfe**: add the curvature condition band on `|φ'(t)|`.
- **Backtracking**: animate shrinking `t` until Armijo holds.
- **Interactions**:
- Choose strategy: `backtracking` / `armijo` / `strong_wolfe` / `fixed`
  (mirrors [`algorithm.md`](docs/algorithm.md)'s table).
- `c1`, `c2` sliders reshape the acceptance lines; watch which `t` is accepted.
- Step through probes one at a time.
- **Callout**: reinforce that the line search is a **first-class component**, not
  a detail — quote the "quality bounded by the line search" insight.

### Section 10 — Spline search

- **Visual**: on the `φ(t)` panel, each probe becomes a **control point**
  `(tᵢ, fᵢ, mᵢ)` carrying both a value dot and a **tangent stub** (the measured
  slope `mᵢ`). A piecewise **cubic Hermite spline** is fit through them; its
  stationary points (closed-form quadratic roots) are marked as candidate steps.
- **Teaching points** (from [`spline_search.md`](docs/spline_search.md)):
- Every probe gives value *and* slope; the naive search throws the slope away.
- The Hermite spline honors both → a richer model → fewer evaluations.
- **Upstream/downstream symmetry**: a toggle shows a tangent that opposes the
  secant slope creating a *phantom minimum*; enabling reflection flips its sign
  and the spurious wiggle vanishes.
- **Interactions**:
- Add / drag control points and their tangent stubs; the spline updates live.
- "Reflect tangents" toggle (the correction rule) — the single most important
  interaction for conveying the symmetry idea.
- Show the flat-secant caveat: when `Δ=0` near a minimum, reflection is
  *disabled* and raw tangents locate the minimum (annotate this explicitly).
- **Honesty callout**: reproduce the **soundness caveat** — reflection is a
  heuristic; safety comes from the outer `improves = cf < bv` gate, not the
  reflection itself. Do not oversell.

### Section 11 — The four axes

- **Visual**: a "config rack" with four labelled slots — **Gradient**,
  **Oracle**, **Search**, **Region** — each a dropdown of cards.
- **Teaching point**: QQN factors an optimizer into orthogonal, swappable parts
  (from [`algorithm.md`](docs/algorithm.md) / [`background.md`](docs/background.md)).
- **Interactions**:
- **Oracle** slot: `lbfgs` / `momentum` / `secant` / `anderson` / `shampoo`.
  **Crucially, drop Adam-as-momentum in here** to pay off Section 4's promise:
  the reader *sees* Adam become the `t=1` endpoint of the path.
- **Search** slot: the strategies from Section 9, plus the `spline` toggle
  from Section 10.
- **Region** slot: `none` / `box` / `orthant` / `trust-region`, each redrawing
  the *projected* path `d_R(t)` (clip to a box, radial clip to a sphere, etc.).
- Re-run on the current landscape after any swap; overlay the previous
  trajectory ghosted for comparison.

### Section 12 — Equivalences (recap)

- **Visual**: preset buttons named after **classical methods** (Gradient
  Descent, L-BFGS, Newton, Momentum/Heavy-Ball, Barzilai-Borwein, Trust Region,
  OWL-QN, Projected Gradient), each wired to a specific axis configuration.
- **Teaching point**: from [`equivalences.md`](docs/equivalences.md) — classical
  methods are just points in QQN's configuration space where one or two axes are
  fixed to a canonical choice.
- **Interaction**: click a preset → the config rack (Section 11) morphs its cards
  into place and the trajectory animates from the previous method to the new one,
  literally showing GD "become" L-BFGS by moving `t` from `0` toward `1`.
- **Table**: render the summary table from `equivalences.md` inline, with each
  row clickable to load its preset.

---

## 6. Interaction Design Principles

- **One idea per canvas.** Every visualization isolates a single teaching point;
  complexity is added only via optional toggles, never by default.
- **Direct manipulation over sliders where geometry is the point.** Dragging the
  oracle endpoint (§7) or a control-point tangent (§10) teaches more than a
  slider ever could; reserve sliders for scalar hyperparameters.
- **Always show the math it computes.** Live numeric readouts (`f`, `‖∇f‖`,
  `⟨∇f, d'(0)⟩`, selected `t`, `α`) anchor the geometry to the equations in
  [`notation.md`](docs/notation.md).
- **Consistent color semantics** across all sections (gradient / oracle / path /
  accepted step / bracket) so visual literacy compounds.
- **Ghosted comparisons.** When re-running after a config change, keep the prior
  trajectory faint so improvement/regression is visible, not remembered.
- **Reduced-motion path.** Every autoplay animation has a step-through
  equivalent; nothing essential is conveyed by motion alone.

---

## 7. Accuracy, Honesty, and Scope Guards

- **Exact gradients/Hessians** from the closed-form landscapes; never present
  finite-differenced artifacts as truth.
- **Reproduce caveats faithfully**, not just the wins:
- the spline **reflection soundness caveat** (§10),
- the trust-region **chord/arc over-shrink** issue from
  [`regions.md`](docs/regions.md) (surface it as a warning banner if the reader
  selects the trust-region + deep-memory combo in §11),
- `strong_wolfe` **over-restricting** the path step (annotate in §9's strategy
  picker, per [`algorithm.md`](docs/algorithm.md)).
- **No overclaiming benchmarks.** Where `oracles.md` cites single-benchmark
  observations (e.g. Anderson's low final loss), label them as such — an
  observation, not a proven ordering.
- **Terminology discipline.** Use the disambiguated symbols from
  [`notation.md`](docs/notation.md): the spline slope always as `mᵢ`, the spline
  secant always as `Δ=(f₁−f₀)/h`, distinct from the trust radius.

---

## 8. Deliverables of the *Actual* Spec (next document)

This plan should give rise to a concrete specification that pins down:

1. **Module boundaries**: `landscape`, `scene2d`, `scene3d`, `optimizers`
   (GD/Adam/L-BFGS reference impls for the demos), `qqn-path`, `line-search`,
   `spline`, `controls`, `story` (scroll driver).
2. **The shared state schema**: `{landscape, start, config, iterateHistory,
probeHistory, tick}` and the pure `advance(state) → state` reducer.
3. **The config-rack schema** mapping cards → axis choices → preset names
   (aligning 1:1 with `equivalences.md`'s table).
4. **Canvas contracts**: what each of the 13 section canvases renders, its
   inputs, and its interaction handlers.
5. **Asset/palette tokens** for the colorblind-safe, consistent color semantics.
6. **Performance budget**: target 60 fps for 2D, graceful 3D degradation, and a
   per-section teardown so only the pinned canvas is live.

> The implementation itself (ES6 modules, WebGL/Canvas code) is deferred to that
> follow-on specification. This document defines *what to teach, in what order,
> with which visuals and interactions* — the pedagogical and geometric contract.