# Point-CAD: Parametric 3D Point-Structure Sketcher

A reusable, embeddable HTML + modular ES6 component that lets a user sketch
**parametric point structures in 3D**: a set of labeled points in space whose
positions are governed by named variables and geometric constraints, solved
on demand.

Structures can be built interactively in a 3D viewport, or described in a
small declarative **microlanguage** that doubles as the save/load file
format. Both views of the sketch are kept in sync.

The component is a small "3D constraint sketcher" in the spirit of a CAD
sketch tool, but deliberately minimal at the core so it can be embedded in
many host applications and extended with new geometry (areas, volumes,
curves) — and eventually new *spaces* (projective, curved) — without
modifying the core.

---

## 1. Goals

- **Embeddable**: drop a single custom element (or a plain ES module API) into
  any page. No framework dependency, no global state, no build step required
  for consumers (plain `<script type="module">` works).
- **3D-native**: every point is `[x, y, z]`, every measure is computed in 3D,
  and the viewport is a real camera. There is no separate 2D mode; a planar
  sketch is simply a 3D sketch whose points happen to be constrained to a
  plane.
- **Extendable**: new entity kinds, constraint kinds, spaces, solvers,
  renderers and language statements can be registered from outside the core.
  The core should not need to know about areas, volumes, curves, or
  non-Euclidean geometry for them to work later.
- **Parametric**: positions are derived from named variables and constraints,
  not hand-placed. Editing a variable and re-solving updates the whole sketch.
- **Scriptable**: the whole world can be constructed from text. The same
  microlanguage is typed into a console panel, executed by hosts, and written
  to disk as the primary human-readable file format.
- **Predictable**: solving is explicit (user clicks *Solve* or runs `solve`),
  so the user is never fighting a live solver while sketching.
- **Serializable**: the entire sketch (variables, points, constraints,
  settings) round-trips through both plain JSON and the script format.

## 2. Non-Goals (for v1)

- Full CAD feature set (solids, booleans, fillets, meshes, dimensions with
  tolerances, etc.).
- Surface or mesh rendering. v1 draws points, segments, labels and constraint
  glyphs only.
- Live/continuous solving while dragging (may be an opt-in later).
- *Implementing* non-Euclidean or projective spaces. The architecture is
  shaped so they can be added (see §6), but v1 ships only Euclidean ℝ³.

---

## 3. Core Concepts

### 3.1 Variables

Named scalar parameters (typically lengths or angles) that constraints can
reference.

```js
{ id: "L1", name: "beamLength", value: 120, unit: "mm", locked: true }
{ id: "A1", name: "theta",      value: 30,  unit: "deg", locked: false }
```

- `locked: true`  → the solver treats the value as a fixed input.
- `locked: false` → the solver may adjust the value to satisfy constraints
  (i.e. the variable is a *free* unknown; the solved value is written back).
- Variables may be referenced by multiple constraints, which is how
  "length = another length" is expressed (both reference the same variable),
  or via an explicit equality constraint between two variables.

### 3.2 Points

Labeled points in 3D with a **seed position**. The seed is the solver's
starting guess and is also what the user sees before solving.

```js
{ id: "P1", label: "A", seed: [0,   0,  0],  fixed: true  }
{ id: "P2", label: "B", seed: [100, 0,  0],  fixed: false }
{ id: "P3", label: "C", seed: [100, 80, 40], fixed: false }
```

- `fixed: true` → the point is an anchor and is never moved by the solver.
- After solving, each point has both `seed` and `solved` positions. The UI
  can show either or both (e.g. ghosted seed + solid solved).
- Coordinates are plain arrays whose length is dictated by the active
  **space** (§6): 3 for Euclidean ℝ³. A future projective space would use 4
  homogeneous coordinates without changing the point schema.

### 3.3 Constraints

Relations between entities. Every constraint has a `type`, references to the
entities it constrains, and a `target` describing what it wants.

#### 3.3.1 Two-point distance

```js
{ id: "C1", type: "distance", points: ["P1", "P2"], target: { kind: "value",    value: 100 } }
{ id: "C2", type: "distance", points: ["P2", "P3"], target: { kind: "variable", ref: "L1" } }
{ id: "C3", type: "distance", points: ["P1", "P3"], target: { kind: "minimize" } }
{ id: "C4", type: "distance", points: ["P1", "P4"], target: { kind: "maximize" } }
```

#### 3.3.2 Interior angle of a point triplet

The angle at the **middle** point of the triplet (`[A, B, C]` → angle ABC),
measured in the plane spanned by `BA` and `BC`. This is well defined for any
three non-coincident points in 3D; no projection or "up" direction is
involved.

```js
{ id: "C5", type: "angle", points: ["P1", "P2", "P3"], target: { kind: "value",    value: 90 } }
{ id: "C6", type: "angle", points: ["P2", "P3", "P4"], target: { kind: "variable", ref: "A1" } }
{ id: "C7", type: "angle", points: ["P3", "P4", "P1"], target: { kind: "minimize" } }
```

#### 3.3.3 Target kinds (shared by all constraint types)

| kind       | meaning                                                         |
|------------|-----------------------------------------------------------------|
| `value`    | equal a literal number                                          |
| `variable` | equal a named variable (locked or free)                         |
| `minimize` | objective term: make the measured quantity as small as possible |
| `maximize` | objective term: make the measured quantity as large as possible |

`value` and `variable` are **hard-ish equality constraints** (residuals that
should go to zero). `minimize`/`maximize` are **soft objective terms** with a
configurable weight. This distinction lets the solver be a single weighted
least-squares / gradient problem.

#### 3.3.4 Constraint metadata

Every constraint also carries:

```js
{ weight: 1.0, enabled: true, note: "roof pitch" }
```

### 3.4 Sketch document

The top-level serializable object (the in-memory model; both JSON and the
script format in §7 map onto it 1:1):

```js
{
  version: 1,
  space: "euclidean3",                      // see §6
  units: { length: "mm", angle: "deg" },
  variables: [...],
  points: [...],
  constraints: [...],
  entities: [...],       // reserved for extensions: areas, curves, volumes
  macros: [...],         // user-defined script macros (§7.4), kept so files round-trip
  solver: { method: "gauss-newton", maxIterations: 200, tolerance: 1e-6 },
  view: {
    camera: { position: [300, 250, 400], target: [50, 40, 20], up: [0, 0, 1],
              projection: "perspective", fov: 45 },
    grid: "xy", showSeeds: true, showLabels: true, showAxes: true
  }
}
```

---

## 4. Building Richer Relations from the Fundamentals

The core ships only two measures — `distance` and `angle` — plus shared
variables and helper points. That is enough to express most classical sketch
relations, and the microlanguage's macros (§7.4) let users package these
recipes under friendly names without the core learning any new geometry.

| relation                | construction with fundamentals                                                        |
|-------------------------|---------------------------------------------------------------------------------------|
| perpendicular `AB ⊥ BC` | `angle A B C = 90`                                                                    |
| collinear, `B` between  | `angle A B C = 180` (`= 0` for `B` outside the segment)                               |
| equal lengths           | both distances target the **same** variable (locked or free)                          |
| midpoint `M` of `AB`    | `distance A M = h`, `distance M B = h` (free var `h`), `angle A M B = 180`            |
| fixed direction         | angle against two fixed points, e.g. `angle B A Xaxis = 0` with a fixed `Xaxis` point |
| on sphere around `O`    | `distance O P = r`                                                                    |

**Parallel lines in 3D.** Parallelism is the interesting case, because the
planar trick (equal corresponding angles to a transversal) does not survive in
3D — two lines can make equal angles with a third and still be skew. The
general construction is a *translation via parallelogram*, which works in any
dimension:

1. Add a helper point `E` meant to satisfy `E − C = B − A` (translate `AB` so
   it starts at `C`). Four points `A, B, E, C` form a parallelogram exactly
   when the diagonals `AE` and `BC` bisect each other.
2. Add a helper point `M` (the common midpoint) with two free variables
   `h1`, `h2`:
   `distance A M = h1`, `distance M E = h1`, `angle A M E = 180`,
   `distance B M = h2`, `distance M C = h2`, `angle B M C = 180`.
3. Now `CE` is a copy of `AB`; require `angle E C D = 0` (same direction) or
   `angle E C D = 180` (opposite direction).

In script form the whole thing is a macro:

```
def parallel(A, B, C, D) {
  point E at C + (B - A)          # seed only; solver owns the position
  point M at (A + E) / 2
  var h1, h2
  distance A M = h1   distance M E = h1   angle A M E = 180
  distance B M = h2   distance M C = h2   angle B M C = 180
  angle E C D = 0
}
parallel P1 P2 P3 P4
```

Two observations that shape the roadmap:

- The construction costs two helper points (6 unknowns) and two free
  variables. The solver does not care, but the sketch gets noisier and a
  direction-agnostic "parallel either way" cannot be stated at all, since the
  interior-angle measure has no `mod 180`.
- Targets of exactly `0` or `180` sit at a kink of the interior angle measure
  (near collinearity the angle behaves like `|δ|/r`). Damped Gauss-Newton
  with numerical Jacobians tolerates this for small problems, but smoother
  measures such as `|BA × BC|` or `1 − cos` converge better.

Both are arguments for eventually **registering native kinds** (`parallel`,
`coplanar`, `onPlane`, `equal`) through the registry (§5.2) once the recipes
prove useful — a few lines each, with the macro version serving as the
reference definition. Some relations (coplanarity of four points, point on a
plane) are genuinely awkward with distance/angle alone and are the first
candidates.

---

## 5. Solving

### 5.1 Model

Solving is formulated as minimizing a weighted sum of squared residuals over
the unknown vector `x`, where `x` = all coordinates of non-fixed points (3
per point in ℝ³) plus all non-locked variable values.

- Equality constraint (`value` / `variable`):
  `r = measure(points) - target` with weight `w`.
- Objective constraint (`minimize`): `r = sqrt(w_soft) * measure(points)`.
- Objective constraint (`maximize`): `r = sqrt(w_soft) / (measure(points) + ε)`
  (or a negated term in a gradient-descent formulation; implementation detail
  chosen by the solver plugin).

`measure()` for the built-in types, expressed through the active space's
primitives (§6) — in Euclidean ℝ³:

- `distance(A, B) = |B - A|`
- `angle(A, B, C) = atan2(|BA × BC|, BA · BC)` in degrees, always in
  `[0, 180]` as an interior angle.

### 5.2 Algorithm (default plugin)

Damped Gauss-Newton / Levenberg-Marquardt with numerically computed
Jacobians. Small problems (tens of points, tens of constraints) solve in
milliseconds; no external dependencies.

- Start from seed positions and current variable values.
- Iterate until residual norm < tolerance or `maxIterations` reached.
- Report result: `{ converged, iterations, residualNorm, perConstraint: [...] }`.

### 5.3 Diagnostics

The solver returns per-constraint residuals so the UI can:

- Color constraints red/amber/green by how well they are satisfied.
- Flag **over-constrained** sketches (conflicting equalities that cannot all
  reach zero).
- Flag **under-constrained** sketches (degrees of freedom remain; solution is
  one of many). Detected via Jacobian rank. In 3D a sketch with no fixed
  points always has 6 rigid-body degrees of freedom (3 translation, 3
  rotation); these are reported separately from "real" slack so the user
  knows whether to anchor points or add constraints.

### 5.4 Solver interface (pluggable)

```js
export interface Solver {
  id: string;
  solve(problem: Problem, options): SolveResult;
}
```

Alternative solvers (e.g. simple gradient descent, or a WASM-backed one) can
be registered without touching the core.

---

## 6. Spaces: Keeping the Door Open for Projective and Curved Geometry

Nothing in the core does arithmetic on coordinates directly. All geometry goes
through a registered **space**, and v1 registers exactly one:

```js
registry.registerSpace({
  id: "euclidean3",
  dim: 3,                                  // length of a coordinate array
  distance(p, q) => number,                // geodesic distance
  angle(p, q, r) => number,                // angle at q between geodesics q→p, q→r
  interpolate(p, q, t) => coords,          // point along the geodesic (for glyphs)
  normalize(coords) => coords,             // identity here; gauge fixing elsewhere
  toDisplay(coords) => [x, y, z],          // chart into the renderer's ℝ³
  fromDisplay([x, y, z]) => coords,        // inverse, for dragging
});
```

Rules the core follows so that other spaces can slot in later:

- **Never assume `dim === 3`**; unknown vectors are built from `space.dim`.
- **"Straight" means geodesic.** Constraint measures are written in terms of
  `space.distance` / `space.angle` / `space.interpolate`, not vector
  subtraction. The built-in `distance` and `angle` kinds therefore transfer
  to any space that supplies those primitives.
- Constraint kinds that are inherently Euclidean (a future `area` computed
  with cross products, say) declare `spaces: ["euclidean3"]` and the registry
  refuses to attach them elsewhere.
- The renderer only ever sees `toDisplay()` output, so a curved space can be
  drawn as its own model (Poincaré ball, stereographic projection, …).
- `normalize()` exists for **gauge redundancy**: in projective space ℝP³ with
  homogeneous coordinates `[x, y, z, w]` the unknowns have a scale freedom the
  solver must not wander along; the space fixes it after each step.

Spaces we expect to add without core changes: spherical `S³` and hyperbolic
`H³` (constant curvature, closed-form geodesics), projective `RP³`
(homogeneous coordinates, incidence-style constraints), and a generic
Riemannian chart supplying a metric tensor `g(p)` (angles via the metric,
distances by geodesic integration). The sketch document records
`space: "euclidean3"` so a file always says what geometry it means.

---

## 7. Microlanguage (PCS – Point-CAD Script)

The microlanguage is both a **UI facet** (a script/console panel where
statements take effect as you type them) and the **file format** (`.pcad`).
It is line-oriented, declarative and deliberately tiny: a file is a *set of
facts* about a world, not a program. JSON remains the canonical in-memory
model and machine interchange format; the two are lossless in both
directions.

### 7.1 Example

```
# roof truss, all lengths mm, angles degrees
space euclidean3
units mm deg

var beamLength = 120 locked
var theta = 30                       # free: the solver may adjust it

point A at (0, 0, 0) fixed
point B at (100, 0, 0)
point C at (100, 80, 0)
point D at (0, 0, 50)  label "ridge"

distance A B = 100
distance B C = beamLength
distance A C -> min
distance A D -> max weight 0.5
angle A B C = 90
angle B C D = theta weight 2 note "roof pitch"

solver gauss-newton iterations 200 tolerance 1e-6
view camera (300, 250, 400) target (50, 40, 20) up (0, 0, 1) perspective
```

### 7.2 Grammar sketch

```
file        := (statement | comment | blank)*
statement   := space | units | var | point | constraint | def | macroCall
             | solver | view | command
space       := "space" IDENT
units       := "units" LENGTHUNIT ANGLEUNIT
var         := "var" IDENT ("=" NUMBER)? ("locked")?  ("," IDENT ...)?
point       := "point" IDENT "at" vec3 ("fixed")? ("label" STRING)?
vec3        := "(" expr "," expr "," expr ")" | IDENT | vec3 ("+"|"-") vec3
             | vec3 ("*"|"/") expr             # seed expressions only
constraint  := KIND IDENT+ target meta*
target      := "=" (NUMBER | IDENT) | "->" ("min" | "max")
meta        := "weight" NUMBER | "note" STRING | "disabled" | "id" IDENT
def         := "def" IDENT "(" params ")" "{" statement* "}"
macroCall   := IDENT arg+
command     := "solve" | "reset" | "adopt" | "delete" IDENT
             | "set" IDENT "=" NUMBER | "move" IDENT "to" vec3
```

- `KIND` is looked up in the registry, so extensions extend the grammar by
  registering a constraint kind with a `syntax` hint (§8.2). Arity comes from
  the kind; the parser prompts on mismatch exactly like the canvas does.
- Identifiers are the user-facing labels; the emitter generates stable `id`s
  and only writes an explicit `id …` when a label is duplicated or renamed.
- Vector expressions are allowed **only for seeds**; they are evaluated once
  at parse time. Constraint targets are numbers or variables (variable
  expressions such as `beamLength * 2` are a v1.1 item).
- `command` statements are for the console; the emitter never writes them.

### 7.3 Two-way sync

- Every model edit (panel, canvas drag, host API) re-emits the script into
  the panel, preserving comments and statement order where possible (the
  emitter keeps a source map from entity → line).
- Editing the script re-parses incrementally; a syntax error marks the line
  and leaves the model untouched. Applying a valid script performs a
  structural diff against the current sketch, so re-running a file does not
  duplicate points.
- Hosts can drive the same path: `el.exec("point E at (10, 20, 30)")`.

### 7.4 Macros

`def` bundles statements under a name with positional parameters (§4 shows
`parallel`). Macros are stored in the document so files stay self-contained,
and helper entities they create are tagged with their macro instance so the
UI can fold them away and the emitter can write the *call* rather than the
expansion. Macro bodies expand only to fundamental statements — the core
never learns what "parallel" means.

---

## 8. Architecture

```
point-cad/
  core/
    model.js          // Sketch document, entity/constraint schemas, validation
    registry.js       // Register spaces, entity kinds, constraint kinds, solvers, syntax
    space-euclid3.js  // Default Space: Euclidean ℝ³ (distance, angle, geodesic, display)
    measures.js       // distance, angle, written against the Space interface
    problem.js        // Builds unknown vector + residual functions from a Sketch
    solver-gn.js      // Default Gauss-Newton / LM solver
    events.js         // Tiny typed event emitter
    serialize.js      // JSON import/export, versioning/migrations
  lang/
    lexer.js          // Tokens, comments, source positions
    parser.js         // Statements -> model operations; registry-driven constraint kinds
    emitter.js        // Sketch -> script (stable ordering, comment preservation)
    macros.js         // def/expand, helper-entity tagging
    commands.js       // Console-only verbs: solve, reset, adopt, delete, set, move
  ui/
    point-cad.js      // <point-cad> custom element (shadow DOM)
    viewport.js       // 3D renderer (WebGL or projected SVG): camera, grid, axes, glyphs
    panels/
      variables.js    // Variable list editor
      points.js       // Point list editor
      constraints.js  // Constraint list editor + "add constraint" forms
      script.js       // Script editor + console (the microlanguage panel)
      solve.js        // Solve button, solver settings, diagnostics
    styles.css
  extensions/
    area.js           // (future) polygon entity + area constraint
    curve.js          // (future) Bézier/arc entities + tangency/length constraints
    volume.js         // (future) tetra/polyhedron entity + volume constraint
    space-sphere3.js  // (future) example non-Euclidean Space
    space-proj3.js    // (future) projective ℝP³ with homogeneous coordinates
  index.js            // Public API barrel
  demo/index.html     // Standalone example page
```

### 8.1 Layering rules

- `core/` and `lang/` have **zero DOM dependencies** and can run in Node for
  tests and server-side validation.
- `ui/` depends on `core/` and `lang/` only through the public
  model/registry/events API.
- `extensions/` depend on `core/` (and optionally `ui/` for custom glyphs)
  and register themselves via `registry.js`.
- Only `space-*.js` files may touch raw coordinates.

### 8.2 Registry (extensibility contract)

```js
registry.registerSpace(euclidean3);        // see §6

registry.registerEntityKind({
  id: "point",
  schema,                        // validation
  unknowns(entity, space) => [...],  // which numbers the solver may move
  render(entity, ctx) => ...     // optional viewport glyph
});

registry.registerConstraintKind({
  id: "distance",
  arity: { points: 2 },
  spaces: "*",                   // or ["euclidean3"] for Euclidean-only kinds
  measure(entities, space) => number,   // scalar the constraint acts on
  syntax: "distance <A> <B>",    // how it appears in PCS; parser derives arity
  form: DistanceForm,            // optional UI editor component
  glyph: DistanceGlyph           // optional viewport glyph
});

registry.registerSolver(gaussNewtonSolver);
```

Future kinds (`area`, `curveLength`, `tangent`, `volume`, `parallel`,
`coplanar`) plug in through the same hooks: **schema**, **unknowns**,
**measure**, **syntax**.

### 8.3 Events

The component emits DOM `CustomEvent`s (bubbling, composed) so hosts can
react without touching internals:

- `pointcad:change`   – any model edit (detail: `{ sketch, script }`)
- `pointcad:solve`    – solve completed (detail: `{ result, sketch }`)
- `pointcad:select`   – selection changed (detail: `{ ids }`)
- `pointcad:exec`     – script statement(s) applied (detail: `{ source, ops }`)
- `pointcad:error`    – validation, parse or solver failure

---

## 9. Embedding API

### 9.1 Custom element

```html
<script type="module" src="./point-cad/index.js"></script>

<point-cad
  src="./truss.pcad"
  readonly="false"
  panels="variables,points,constraints,script,solve"
  theme="light">
</point-cad>
```

`src` accepts either a `.pcad` script or a `.json` document; the format is
detected by extension, then by sniffing.

### 9.2 Programmatic

```js
import { PointCad, createSketch } from "./point-cad/index.js";

const el = document.querySelector("point-cad");
el.sketch = createSketch({ variables: [...], points: [...], constraints: [...] });

el.addEventListener("pointcad:solve", e => console.log(e.detail.result));

el.exec(`
  point E at (50, 40, 120)
  distance A E = 130
`);                                 // construct the world from text
const result = el.solve();          // imperative solve
const json   = el.toJSON();         // export (canonical model)
const script = el.toScript();       // export (human-readable .pcad)
el.fromJSON(json);                  // import
el.fromScript(script);              // import
```

### 9.3 Headless

```js
import { buildProblem, solvers } from "./point-cad/core/index.js";
import { parse, emit } from "./point-cad/lang/index.js";

const sketch = parse(await fs.readFile("truss.pcad", "utf8"));
const result = solvers.gaussNewton.solve(buildProblem(sketch));
await fs.writeFile("truss.solved.pcad", emit(sketch, { adoptSolution: true }));
```

Useful for server-side validation, tests, or hosts with their own renderer.

---

## 10. UI Behaviour

1. **Variables panel** – add/rename/delete variables, edit value, toggle lock.
2. **Points panel** – add/rename/delete points, edit seed `x, y, z`, toggle
   fixed. Clicking a point in the list highlights it in the viewport and vice
   versa.
3. **Constraints panel** – pick a constraint type, pick points by clicking in
   the viewport (arity-driven prompt: "select 2 points", "select 3 points"),
   choose target kind (value / variable / minimize / maximize), set weight.
4. **Script panel** – full script on top, one-line console at the bottom.
   Statements execute on Enter; the script re-renders after any edit made
   elsewhere. Parse errors are inline; nothing is applied until a line is
   valid.
5. **Solve panel** – *Solve* button, solver options, result summary
   (converged, iterations, residual, rigid-body vs. real DOF), per-constraint
   status list. *Reset to seeds* and *Adopt solution as seeds* buttons.
6. **Viewport** – orbit / pan / zoom camera, perspective or orthographic,
   ground grid on a chosen plane, axis triad, point picking. Dragging a point
   edits its *seed*: free-drag moves it in the camera-facing plane, and axis
   handles constrain the drag to X, Y or Z. Shows seed ghost + solved
   position, labels, and distance/angle glyphs colored by residual.

---

## 11. Extension Roadmap

| phase | additions                                                                                                                           |
|-------|-------------------------------------------------------------------------------------------------------------------------------------|
| v1    | 3D points, variables, distance & angle constraints, GN solver, Euclidean space, JSON + PCS I/O, macros                              |
| v1.1  | equality-between-variables, variable expressions (`L1 * 2`), native `parallel` / `coplanar` / `onPlane` kinds graduated from macros |
| v2    | `area` entity (polygon of points) + area constraints; `volume` entity (tetra / polyhedron) + volume constraints                     |
| v2    | `curve` entities (arc, cubic Bézier) with length / tangency / on-curve constraints                                                  |
| v3    | non-Euclidean spaces: `S³`, `H³`, projective `RP³`; alternate viewport models                                                       |
| any   | alternative solvers, undo/redo, live solving toggle, 2D "plane lock" helper                                                         |

---

## 12. Open Questions

- Should `minimize`/`maximize` share one weight scale with equality
  constraints, or have a separate global "objective strength" slider?
- How to present under-constrained sketches: pick the least-squares
  solution nearest the seeds (current plan), or warn and refuse? Should the
  6 rigid-body DOF be auto-removed by pinning the first point and axes?
- Angle representation for extensions: keep degrees at the API boundary and
  radians internally.
- Script vs. JSON as the *default* save format for the demo — script is
  friendlier, JSON is stricter. Current plan: script by default, JSON via
  export menu.
- Macro hygiene: should helper points created inside a macro be addressable
  from outside (e.g. `parallel1.E`), or fully hidden?
- Direction-agnostic parallelism cannot be expressed with the interior angle
  measure; is that the trigger for adding native kinds in v1.1, or should
  `angle` grow an optional `mod 180` target?
- Projective spaces have no metric, so `distance` is meaningless there; the
  registry's `spaces` filter handles this, but should incidence kinds
  (`onLine`, `onPlane`) be designed now so they read naturally in both
  Euclidean and projective sketches?

