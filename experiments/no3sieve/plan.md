# No-Three-in-Line Sieve — Technical Specification & Development Plan

  Status: **DRAFT / PRE-IMPLEMENTATION**
  Owner: TBD
  Companion doc: `idea.md` (motivation, background, literature)

  This document fixes the semantics, data structures, interfaces, complexity budget,
  test strategy, and delivery milestones for the `no3sieve` engine. It contains **no
  implementation**; every code block is illustrative pseudocode or an interface sketch.

  > **Erratum (metric).** Earlier drafts of this plan and `idea.md` write "L0 metric",
  > "L0 index" and "L0 radius". That is a typo for **L∞** — the Chebyshev norm
  > `||v||_∞ = max(|v.x|, |v.y|)`. The counting pseudo-norm `L0` plays no role
  > anywhere in this project. Every ring, radius, band, window and ball below is
  > measured in **L∞** unless a section says otherwise, and the consequences of that
  > choice (§2.2, §3.3, §3.4, §3.7, §4.3, §5.4) are stated as derivations, not as
  > incidental defaults.

  > **Platform (normative).** The entire project is **web-native JavaScript**:
  > ES2022 modules, typed arrays, WebCrypto, WebGL2/WebGPU, Web Workers,
  > `SharedArrayBuffer`. One source tree (`src/core/`) is loaded *unmodified* by both
  > the headless runtime (Node ≥ 20, native ESM) and the browser. There is **no build
  > step, no bundler, no transpiler, no second language runtime, and no package
  > install**: `package.json` carries `"type": "module"`, metadata and script aliases,
  > and declares zero runtime dependencies. A "compiled hotspot" (M9) means
  > **WebAssembly**, checked in as a binary artifact with a reproducible build script
  > and a hash gate — never a host-specific native extension. Anything that cannot be
  > served from a static directory over plain HTTP and executed by `node --test` is
  > out of scope by construction (§0.2, R15).

  ---

  ## 0. Scope

  ### 0.1 In scope

  1. A deterministic, reproducible **sieve engine** that incrementally places lattice
  points in `Z^2` in spiral order such that the placed set `P` is *cap-free in the
  collinear sense*: no three points of `P` are collinear.
  2. An **unbounded (growing-window) mode** — the primary research artifact — plus a
  **bounded `n x n` mode** for comparison against the classical literature.
  3. **Summed-area-table (SAT) analytics** for extracting the densest `s x s` window
  of a generated set, for every `s` of interest.
  4. An **independent verifier** (different algorithm, different author-path) that
  certifies output sets, plus export formats suitable for external checking.
  5. Benchmarks and a measured density curve `k(R)` / `c(s) = max_points(s) / s`.
  6. An **interactive browser explorer**: zero-build HTML + native modular ES6
  (`<script type="module">`, no bundler), an **infinite canvas** with smooth pan/zoom
  over the unbounded lattice, a **centered-window density overlay**, live streaming
  from the engine, and one-click **export of the top solutions** in standard formats.
  7. A **GPU compute backend** (WebGL2 baseline, WebGPU opt-in) plus Web Workers /
  `SharedArrayBuffer` for the marking phase — an *execution strategy only*: output
  must stay bit-identical to the single-threaded scalar engine (§4.6, `S6`).

  ### 0.2 Out of scope (v1)

  - Exact/optimal search (SAT solvers, ILP, exhaustive backtracking). We may *compare*
  against published optima but will not compute them.
  - Local search / repair heuristics (simulated annealing, tabu). Reserved for v2 as a
  post-processing stage on sieve output.
  - Higher dimensions, non-square lattices, torus variants.
  - Any build toolchain, bundler, transpiler, framework, package-install step, or
  second language runtime. Two runtimes are supported and they are the same
  language: headless Node and the browser.

  ### 0.3 Success criteria (v1)

  - `S1` Engine produces a certified-valid set for radius `R >= 512` in `< 10 min`
  on one commodity core, with the verifier agreeing on 100% of runs.
  - `S2` The density curve `c(s)` is produced, plotted, and compared against the
  trivial upper bound `c(s) <= 2` and the constructive lower bounds from the
  literature (Erdős ~`1.0 n` for prime `n`; Hall–Jackson–Sudbery–Wild `1.5 n`).
  - `S3` Reproducibility: identical config + version ⇒ bit-identical output hash,
  in **both** runtimes (headless and browser) from the same `src/core/` modules.
  - `S4` The parallel backend produces output **identical** to the single-threaded
  backend (see §4.5 — parallelism is an execution strategy, not a semantic change).
  - `S5` The explorer loads a certified artifact and sustains `>= 30 fps` at 1080p
  while panning/zooming a set of radius `R >= 4096`, with the density overlay on.
  - `S6` The WebGL2 marking backend yields a point list whose SHA-256 equals the
  scalar backend's for `R <= 512`, on `>= 2` GPU vendors + a software rasterizer.
  - `S7` Every artifact the UI exports validates against its published JSON Schema and
  re-verifies PASS with `verify.js` after a round trip.
  - `S8` The repository contains no build step: a clean checkout runs
  `./no3sieve run …`, `./no3sieve serve` and `node --test` with **zero** installs.

  ---

  ## 1. Formal problem statement (as implemented)

  Let `L = Z^2`. A point set `P ⊂ L` is **valid** iff no three distinct points of `P`
  are collinear. Equivalently: for every `p ∈ P`, the map
  `q ↦ primdir(q - p)` is injective on `P \ {p}`, where

  ```
  primdir(v) = v / gcd(|v.x|, |v.y|)   with sign normalized so that
               (v.x > 0) or (v.x == 0 and v.y > 0)
  ```

  We build `P` incrementally as `P_0 = {} ⊂ P_1 ⊂ P_2 ⊂ ...`, adding one point at a
  time in a fixed traversal order, always adding a point iff it keeps the set valid
  (greedy, no backtracking). The engine's job is to answer "does adding `c` keep `P`
  valid?" as cheaply as possible, at scale.

  All coordinates and line parameters are **exact integers** held in `Int32Array` /
  `BigInt64Array`-free `Number` arithmetic bounded by `2^31`, with intermediate
  products checked against the `2^53` safe-integer limit (§3.4, R5). No floating
  point participates in any placement decision, in either runtime.

  **Metric convention (normative).** Validity itself is metric-free — collinearity is
  an affine notion — but *every scheduling decision* in the engine is indexed by the
  **L∞ (Chebyshev) norm** `||v||_∞ = max(|v.x|, |v.y|)`. Write `R(p) = ||p||_∞` for
  the **L∞ index** (= ring) of a point, `S_∞(R) = { p : ||p||_∞ = R }` for the L∞
  sphere (a square shell of exactly `8R` cells, `R >= 1`) and
  `B_∞(R) = [-R, R]^2` for the L∞ ball. "Radius", "ring", "band" and "window",
  unqualified, always mean L∞. Two facts used repeatedly: `||·||_∞` is a convex
  gauge, and it satisfies the triangle inequality with `||t·d||_∞ = |t|·||d||_∞`.

  **Invariants** (asserted in debug builds, checked by the verifier):

  - `I1` No three points collinear (the definition).
  - `I2` Corollary: at most 2 points per row, per column, and per diagonal ⇒ for the
  L∞ ball `B_∞(R) = [-R, R]^2`, `|P ∩ B_∞(R)| <= 2(2R+1)`. Note this bound is stated
  in the *same* gauge the traversal uses, so it is checkable incrementally at each
  ring rather than only at the end.
  - `I3` Traversal monotonicity: points are emitted in nondecreasing ring index.
  - `I4` Greedy maximality w.r.t. order: a candidate is skipped **iff** it was
  genuinely blocked at the moment it was visited.
  - `I5` **Segment closure** (§3.7): before candidate `c` is tested, the ring mask
  reflects *every* line determined by two points already placed earlier in `≺`,
  **including pairs where both points lie in the current ring / arc segment**.

  ---

  ## 2. Traversal architecture

  ### 2.1 Ring index and order

  The traversal is **ring-major**. The ring index is the **L∞ (Chebyshev) norm**;
  this is normative, not merely a default, because §3.3 (hit-count lemma), §3.4
  (closed-form ring intersection), §3.7 (side degeneracy) and §4.3/§5.4 (window
  alignment) are all *derived from* L∞ specifically. Alternative gauges are
  configurable but must be *convex and monotone*, and they invalidate the closed
  forms above.

  | `ringMetric`  | gauge | ring index `R(p)`        | sphere shape          | default |
  |---------------|-------|--------------------------|-----------------------|---------|
  | `chebyshev`   | `L∞`  | `max(|x|, |y|)`          | square, **flat faces**| **yes** |
  | `euclidean`   | `L2`  | `floor(sqrt(x^2 + y^2))` | circle, strictly convex | no    |

  Within a ring, `intraRingOrder` selects the total order:

  | value            | ordering key                                                     |
  |------------------|------------------------------------------------------------------|
  | `clockwise`      | angle from `+y` axis, clockwise; start cell `(0, R)` (**default**) |
  | `nearestFirst`   | `(x^2 + y^2, clockwise angle)` — the literal "nearest-to-origin"  |

  Ties are always broken by `(x, y)` lexicographic order so the traversal is a
  **total, deterministic** order `≺`. The origin `(0,0)` is ring 0 and is always the
  first point placed (configurable via `seedPoints`).

  - `rMax` is the hard stop, and is an **L∞ radius**: a completed run covers exactly
  the ball `B_∞(rMax) = [-rMax, rMax]^2` (unbounded mode runs until `rMax`, a
  wall-clock budget, or an abort signal — `SIGINT` headless, `AbortController` in
  the browser — whichever fires first). The bounded `n x n` mode is therefore the
  same loop with `rMax = (n-1)/2` plus an L∞ clip, not a separate code path.

  ### 2.2 Why L∞ (Chebyshev) is normative

  Three independent reasons, in decreasing order of weight:

  1. **Closed-form ring intersection.** `S_∞(R)` is the boundary of a square, so
  intersecting an arbitrary line with a ring reduces to `x = ±R` or `y = ±R`:
  4 integer divisions and a min-reduction (§3.4). The L2 sphere requires solving a
  quadratic per ring and yields non-monotone lattice enumeration in edge cases.
  2. **Gauge alignment with the literature.** The classical no-three-in-line problem
  is posed on axis-aligned `n x n` windows, and an `n x n` window *is* an L∞ ball
  (§4.3). So the traversal metric, the analysis metric (SAT window scan) and the
  target metric are the *same* metric: `max_pop(2R+1)` is literally `|P ∩ B_∞(R)|`,
  which the engine has already enumerated on reaching ring `R`. No resampling, no
  conversion, no aliasing between "what we build" and "what we report".
  3. **An exact work bound.** The L∞ triangle inequality gives Lemma 3.3.1 — a hard
  cap on the number of marks a line contributes inside `B_∞(R)`. Under L2 the same
  bound holds up to a `sqrt(2)` factor, but the per-ring schedule is no longer
  obtainable in closed form, which is what actually matters for the calendar.

  **The price** is that flat faces admit a degenerate chord case: a line can contain
  an entire face of `S_∞(R)`, not just 1–2 points of it (§3.7(2)). A strictly convex
  gauge would not have this case. We accept it, and pay for it with a three-way
  ring-intersection result and exhaustive side/corner tests (§7).

  ### 2.3 Windowing / dynamic scaling

  - No dense allocation is proportional to `rMax^2` (see §3.2). "Dynamic window
  scaling" is therefore trivial: growing the window is just continuing the loop.
  This is a deliberate departure from the array-doubling design implied in
  `idea.md`; it removes the "re-projection on growth" cost entirely.
  - Dense rasters are only materialized on demand for analytics/export (§6) and as
  bounded, LRU-evicted **tiles** for the explorer (§5.3) — never for placement.

  ---

  ## 3. The sieve mechanism

  ### 3.1 The L∞ metric constraint, made precise

  *(This section is the one the "L0" typo came from. Two orthogonal notions were
  conflated there; separating them is exactly what makes the sieve exact.)*

  1. **The line parameter `t` — metric-free.** For an ordered pair of placed points
  `(p, q)`, let `d = primdir(q - p)`. The line through them meets the lattice
  exactly at `{ p + t·d : t ∈ Z }`. The sieve marks a lattice point ineligible
  **iff** it equals `p + t·d` for an *integer* `t`: exactly the lattice points of
  the line, no rounding, no thickening, no floating point anywhere. A non-integer
  `t` is not "nearly blocked" — it is not a lattice point of that line at all, and
  the engine never represents it. This is an integrality condition, and it involves
  **no metric whatsoever**.
  2. **The L∞ index — the metric.** The **L∞ index** of a lattice point is
  `R(·) = ||·||_∞`, i.e. which ring it lives on. All *bookkeeping* is indexed by
  it: the traversal order (§2.1), the calendar buckets (§3.3), the mark-visibility
  rule below, the band batching of §4.6 and the segment-closure fixpoint (§3.7).

  So a mark is **identified** by `(base, d, t)` and **scheduled** by
  `R(base + t·d) = ||base + t·d||_∞`. Identity is exact integer algebra; scheduling
  is exact integer L∞. Nothing in either step is approximate.

  `markMode` config:

  | value           | semantics                                                        |
  |-----------------|------------------------------------------------------------------|
  | `outwardOnly`   | mark only points with `||point||_∞ >= R_current` (**default**)   |
  | `fullLine`      | mark every lattice point of the line inside `B_∞(rMax)`          |

  `outwardOnly` is **not** an approximation: by `I3` the traversal never revisits a
  cell with a smaller L∞ index, so marks there are unobservable. `fullLine` exists
  only for producing debug rasters and for differential testing against the reference
  engine.

  **Caveat that the L∞ reading makes explicit:** "outward" is a property of the
  *ray*, not of the parameter `t`. `t ↦ ||p + t·d||_∞` is convex but **not** monotone
  — a ray may move inward before it turns outward. Dropping marks with
  `||·||_∞ < R_current` is only sound once each ray has been split at its convexity
  vertex `t*` (§3.3); doing it on the unsplit line would silently discard *future*
  marks and produce invalid sets. The split is therefore a correctness requirement of
  `outwardOnly`, not an optimization.

  ### 3.2 State representation

  Three components, none of which is `O(rMax^2)`:

  1. `points` — an append-only `Int32Array` of length `2k` (growable by doubling,
  never a per-point object; R10), in insertion order, plus an integer-keyed
  `Set`/open-addressed hash of packed `(x, y)` for membership.
  2. `ringMask` — a `Uint32Array` bitset over the *current* L∞ sphere only.
  `|S_∞(R)| = 8R` for `R >= 1` (and `1` for `R = 0`), indexed by clockwise
  perimeter offset; the indexing must be a bijection (§3.7(3)) so the 4 corners —
  the only cells lying on two faces — are represented once. Two buffers, current
  and next, recycled; allocated once per band, never per ring.
  3. `calendar` — the line-event structure of §3.3, the heart of the engine, held as
  a **struct-of-arrays** over typed arrays (`Int32Array` for `baseX, baseY, dX, dY,
  t`, `Int32Array` for `nextRing`), so it is transferable to a worker and
  `SharedArrayBuffer`-backable without serialization.

  Memory is therefore `O(|P|^2)` (calendar) `+ O(R)` (ring masks), not `O(R^2)`.

  ### 3.3 Line-event calendar (core data structure)

  Naive marking rasterizes each of the `C(k,2)` lines across the whole window: too
  slow and too big. Under L∞ this is not just an observation but a bound:

  > **Lemma 3.3.1 (hit count).** Let `d` be primitive and let the line
  > `{ p + t·d }` meet `B_∞(R)` with `||p||_∞ <= R`. Then the line has at most
  > `4R / ||d||_∞ + 1` lattice points inside `B_∞(R)`.
  >
  > *Proof.* If `p + t·d ∈ B_∞(R)` then
  > `|t|·||d||_∞ = ||t·d||_∞ <= ||p + t·d||_∞ + ||p||_∞ <= 2R`, so `t` ranges over
  > an interval of length `<= 4R / ||d||_∞`. ∎

  Equivalently: consecutive lattice points of the line differ in L∞ index by at most
  `||d||_∞`, and by *exactly* `||d||_∞` outside the convexity vertex, so a "steep"
  direction *skips* `~||d||_∞` rings between hits. Since typical primitive directions
  between two points of `B_∞(R)` have `||d||_∞ = Θ(R)`, most lines produce **O(1)
  marks over the whole run**, not one per ring. We exploit this with an event
  calendar:

  - An **event** is a ray: `(base p, direction ±d, next parameter t, next ring r)`.
  - Events live in a **bucket queue** indexed by `r` (buckets for `r ∈ [R, R + B)`,
  plus an overflow binary heap over typed arrays for `r >= R + B`; `B` default 64).
  - Processing ring `R`: drain bucket `R`, mark each event's cell in `ringMask`,
  advance the event to its next lattice point with `||·||_∞ > R`, reschedule.
  - `g(t) = ||p + t·d||_∞ = max(|p.x + t·d.x|, |p.y + t·d.y|)` is a **maximum of
  four affine functions of `t`**, hence convex and piecewise linear with at most
  three breakpoints. It attains its minimum at a single `t*` (or on an interval),
  is non-increasing for `t <= t*`, non-decreasing for `t >= t*`, and its outer
  slope is exactly `||d||_∞`. Each line is therefore split into **two monotone
  rays at `t*`**, computed in closed form from the four affine pieces. Monotonicity
  is what guarantees the bucket queue never schedules an event into the past — and,
  per §3.1, what makes `outwardOnly` sound.

  Total marking work `<= Σ_lines (4·rMax / ||d||_∞ + 1)` by Lemma 3.3.1, plus
  `O(|P|^2)` scheduling, which we budget at `O(|P|^2 · polylog)` overall rather than
  `O(|P|^2 · R)`. The lemma is also an assertable runtime invariant: a ray that emits
  more marks than the bound has a broken split or a non-primitive `d`.

  ### 3.4 Ring intersection primitive

  For the L∞ sphere `S_∞(R)` and a (already split, hence monotone) ray `p + t·d`,
  `t >= t0`: because the sphere is the boundary of a square, the candidate parameters
  are the integer solutions of `x = ±R` or `y = ±R`, each clipped to
  `|other coord| <= R`; the smallest admissible `t` is obtained with 4 integer
  divisions (`Math.trunc` on exact integers, or explicit floor-division helpers) and
  a min-reduction. This closed form is exactly what L∞ buys (§2.2(1)).
  Required properties: exact integer arithmetic (all intermediates provably below
  `2^53`, asserted in debug builds), no division by zero for axis-parallel `d`,
  correct behavior when `p` itself lies on the sphere, and — the flat-face case — the
  three-way result of §3.7(2) when `d` is parallel to a face and the ray lies *in*
  that face: `NoHit | Hit(t) | ContainedInSide(...)`.
  A strictly convex gauge would only need the first two; L∞ needs all three.

  ### 3.5 Placement step (per candidate)

  ```
  for R in 0 .. rMax:
      drainCalendarInto(ringMask, R)                # events scheduled for this ring
      placedThisRing = []
      for c in ringCellsInOrder(R):                 # §2.1 total order
          if ringMask.isBlocked(c): continue
          if paranoid: assert exactCheck(c, points)    # §3.6, debug only
          for p in points:                          # k new lines (p, c) for ALL p,
              d = primdir(c - p)                    #   incl. p in placedThisRing!
              scheduleRay(c,  d)                    # both rays, from c and beyond p
              scheduleRay(p, -d)
              markAheadInThisRing(R, p, d, ringMask)      # §3.7 — mandatory
          points.push(c); placedThisRing.push(c)
  ```

  The `markAheadInThisRing` step is essential and is the part the `idea.md`
  pseudocode gets wrong (see §3.7 and §4.5): a point placed early in ring `R` can
  block a cell later in the *same* ring, and — critically — **two points both placed
  in ring `R` define a new line of their own**. Note the loop iterates `points`
  *before* pushing `c`, so same-ring predecessors are included; this is load-bearing.

  ### 3.6 Exact fallback check

  `exactCheck(c, P)`: hash `primdir(c - p)` for all `p ∈ P` into an integer-keyed
  `Set` of packed directions; `c` is admissible iff no collision. `O(k)` time,
  `O(k)` space, no window, no calendar. Roles:

  - authoritative oracle in differential tests;
  - `--paranoid` runtime assertion mode;
  - the *only* engine in the small-`n` reference implementation (Phase 1).

  ---

  ## 4. Component / module design

  ### 4.1 Repository layout

  Everything under `src/core/` is host-free ESM: no filesystem, no process, no DOM.
  It is imported byte-identically by the headless CLI, by the test runner, by the
  Web Workers and by the browser main thread. Host access lives in `src/host/`
  (Node-only adapters) and in `web/js/` (browser-only adapters).

  ```
  experiments/no3sieve/
    idea.md
    plan.md                  <- this file
    package.json             # "type": "module", scripts + metadata, ZERO deps
    no3sieve                 # executable shim (#!/usr/bin/env node) -> src/cli/main.js
    src/
      core/                  # runs unmodified in Node and in the browser
        lattice.js           # primdir, gcd, linfIndex, ring<->perimeter indexing
        order.js             # spiral traversal iterators (chebyshev / euclidean)
        calendar.js          # bucket queue + overflow heap, SoA event records
        sieve.js             # SieveEngine: the §3.5 loop, config, checkpoints
        reference.js         # O(k) exact-check greedy engine (slow, obviously correct)
        verify.js            # independent O(k^2) certifier
        sat.js               # summed-area table build + window queries + scans
        metrics.js           # density curves, row/col histograms, aperiodicity probes
        tiles.js             # tile extraction / LOD aggregation (§5.3)
        stream.js            # NDJSON / binary frame protocol (engine -> UI)
        codec/               # pure encoders/decoders over Uint8Array
          csv.js  json.js  ndjson.js  txtgrid.js  bin.js  png.js  svg.js
        hash.js              # SHA-256 via WebCrypto (present in both runtimes)
        assert.js            # debug-only invariant checks, stripped by a flag
      host/                  # thin Node adapters: fs, http, signals, timers
        fs-artifacts.js      # read/write artifacts + checkpoints
        serve.js             # static server for web/ + COOP/COEP + /api streaming
        run.js               # headless run driver, SIGINT budget, progress log
        bench.js             # benchmark harness + results writer
      cli/
        main.js              # arg parsing (zero-dep), subcommands, --version
    web/                     # zero-build, native ES modules — no bundler, no install
      index.html
      css/app.css
      js/
        main.js              # bootstrap, config panel, input bindings
        state.js             # immutable app state + event bus
        viewport.js          # infinite-canvas camera: pan/zoom, world<->screen
        renderer/
          gl.js              # WebGL2 context, capability probe, backend picker
          tile-renderer.js   # occupancy layer, LOD, tile cache
          overlay-density.js # centered s x s density heat map (§5.4)
          overlay-grid.js    # lattice gridlines, ring guides, axis labels
          canvas2d.js        # fallback renderer (no WebGL2)
        engine/
          worker-pool.js     # Web Worker pool + SharedArrayBuffer bitsets
          sieve.worker.js    # ES module worker: imports src/core/sieve.js verbatim
          gpu-mark.js        # instanced GL_POINTS exact marking (§4.6)
          wasm-bridge.js     # optional wasm core, same interface (M9)
        data/
          tile-source.js     # tiles from live engine or from a loaded artifact
          sat-gpu.js         # GPU prefix-sum SAT feeding the density overlay
          topk.js            # streaming top-K windows per size s
          export.js          # wraps src/core/codec/* + File System Access / Blob
        ui/
          hud.js  legend.js  inspector.js  topk-panel.js  shortcuts.js
      schema/
        pointset.schema.json  solution.schema.json  manifest.schema.json
      wasm/
        no3core.wasm  no3core.build.md   # reproducible build recipe + hash (M9)
    test/                    # `node --test`, zero-dependency
      lattice.test.js  order.test.js  calendar.test.js
      sieve-vs-reference.test.js  verify.test.js  sat.test.js
      known-optima.test.js  determinism.test.js
      segment-closure.test.js  tiles.test.js  schema-roundtrip.test.js
      prop.js                # seeded PRNG generators for property tests
      gl/                    # headless WebGL2 (software rasterizer) golden hashes
      dom/                   # DOM-less unit tests for viewport/tile math
    bench/
      bench-sieve.js  bench-sat.js  results/
    data/                    # generated artifacts (gitignored except manifests)
  ```

  Tooling policy: CI runs `node --test --experimental-test-coverage`, `node --check`
  over every module, a vendored zero-dependency lint/format pass checked into the
  repo, and a headless-browser driver for `web/test`. No install step exists; if a
  contributor needs one, the change is rejected (R15, `S8`).

  ### 4.2 Public interfaces (sketch, not implementation)

  ```js
  // src/core/sieve.js — config is a frozen plain object; canonical JSON is hashable.
  export const DEFAULT_CONFIG = Object.freeze({
    rMax: 512,
    ringMetric: "chebyshev",        // chebyshev | euclidean
    intraRingOrder: "clockwise",    // clockwise | nearestFirst
    markMode: "outwardOnly",        // outwardOnly | fullLine
    seedPoints: [[0, 0]],
    backend: "calendar",            // calendar | naive | reference | gpu | wasm
    workers: 1,
    paranoid: false,
    checkpointEvery: 64,            // rings
    streamEvery: 1,                 // rings per NDJSON/binary frame (0 = off)
    topkSizes: [8, 16, 32, 64],     // window sizes tracked online (§5.5)
    topkKeep: 16,                   // best windows retained per size
    seed: 0,                        // reserved: tie-break jitter (v2)
  });

  export class SieveEngine {
    constructor(config) {}
    run(signal) {}                  // -> PointSet   (AbortSignal-aware)
    stepRing() {}                   // -> RingReport (incremental / streaming use)
    serialize() {}                  // -> ArrayBuffer (checkpoint, transferable)
    static deserialize(buffer) {}   // -> SieveEngine
  }

  export class PointSet {           // immutable result object
    points;                         // Int32Array, length 2k, [x0,y0,x1,y1,...]
    rMax; configHash;
    toDense(r) {}                   // -> Uint8Array ((2r+1)^2), row-major
    window(x0, y0, s) {}            // -> PointSet
    tile(tx, ty, lod) {}            // -> Tile: bitset + LOD aggregate (§5.3)
    densityMap(s, box) {}           // -> Int32Array: centered s x s pop (§5.4)
    topWindows(s, k) {}             // -> Array<{x0,y0,pop}>  (§5.5)
  }

  // src/core/verify.js
  export function verify(pointSet) {}        // -> VerifyReport, independent (§7)
  // src/core/metrics.js
  export function densityCurve(pointSet, sizes) {}   // via sat.js
  ```

  Every function above takes and returns typed arrays or plain frozen objects.
  Nothing in `src/core/` touches `fs`, `process`, `window` or `document`, which is
  what makes `S3`'s two-runtime bit-identity a structural property rather than a
  coincidence maintained by hand.

  ### 4.3 SAT / area-sum analytics (`sat.js`)

  Role clarified relative to `idea.md`: the SAT is **not** in the placement hot loop
  (it would cost `O(R^2)` per placement). It is an *analysis* stage run on the finished
  (or checkpointed) point set:

  1. Rasterize `P ∩ [-r, r]^2` to a dense `Uint8Array` grid, `N = 2r+1`.
  2. Build `S` in one `O(N^2)` pass into a flat `Int32Array` with row stride `N+1`
  (`N <= 46341` avoids overflow trivially since counts are `<= 2N`).
  3. `population(r1,c1,r2,c2)` in `O(1)` via the 4-term inclusion–exclusion identity.
  4. For each window size `s` in a configured list, scan all `(N-s+1)^2` placements,
  record `max_pop(s)`, `argmax`, and the histogram of populations.

  Key soundness note to state in the paper/README: **any sub-window of a valid set is
  itself valid**, so `max_pop(s)` is an immediate certified lower bound for the
  classical `s x s` no-three-in-line problem. This is the bridge from the infinite
  construction to the literature's `2n` target: we report `c(s) = max_pop(s) / s`.

  **Gauge alignment (why this bridge is free).** An axis-aligned `s x s` window *is*
  an L∞ ball — of radius `(s-1)/2` for odd `s`, and the low-biased variant of §5.4
  for even `s`. So the traversal gauge, the analysis gauge and the literature's
  gauge are one and the same, and in particular
  `max_pop(2R+1) >= |P ∩ B_∞(R)|` holds by construction with the centred window,
  i.e. the engine's own ring counter already reports a valid point of the `c(s)`
  curve at every ring. Had the traversal used an L2 gauge, every reported number
  would require a re-scan in a different metric than the one it was built in — the
  single strongest practical argument for §2.2.

  Implementation: the scan is a 2D sliding-window sum expressed as strided SAT
  differences over whole rows of the flat `Int32Array` (4 reads per output cell,
  monomorphic loops, no per-window closure allocation) — never a per-window nested
  scalar loop with object math.
  The *same* primitive, evaluated per screen pixel instead of per window size, is the
  explorer's density overlay (§5.4), and its running argmax is the top-K solution
  tracker (§5.5). One definition, three consumers — `src/core/sat.js` and
  `web/js/data/sat-gpu.js` are cross-tested against each other on random rasters,
  with `sat.js` as the authority.

  ### 4.4 Metrics (`metrics.js`)

  - `k(R)` growth curve and log–log slope estimate `α` in `k ~ c·R^α`
  (the honest question: is the spiral-greedy `α = 1`, i.e. linear/positive density,
  or sub-linear? This is the primary empirical result of the project.)
  - `c(s)` density curve from §4.3, with the `2` upper bound and `1.5` (HJSW) and
  `1.0` (Erdős) reference lines.
  - Row/column/diagonal occupancy histograms (must be `<= 2` everywhere: `I2`).
  - Aperiodicity probes: 2D autocorrelation of the indicator raster; search for any
  translation `v` with `|P ∩ (P+v)| / |P| > θ`; report the top-10 translations.
  ("Aperiodic" is a *claim to be tested*, not an assumption.)
  - Symmetry probes: the construction with `seedPoints = [[0,0]]` and a symmetric
  ring order may be invariant under some dihedral action; detect and report it
  (this would *reduce* interest in the set and is worth knowing early).

  All of the above operate on typed arrays and are runnable in the browser on a
  worker, so the explorer's HUD and the headless report share one implementation.

  ### 4.5 Parallelism — corrected model

  `idea.md` claims all candidates in a constant-radius segment are independent. **This
  is false**: two candidates `c1 ≺ c2` in the same ring can be collinear with a single
  existing point `p` (then placing `c1` must block `c2`), or `c1, c2` plus one earlier
  point can be collinear. The frontier argument only removes dependencies on *smaller*
  rings, not within a ring.

  The engine therefore uses **propose / verify / commit** so that parallel output is
  bit-identical to single-threaded output:

  - **Propose (parallel):** drain and apply the calendar for ring `R` across workers
  writing into a `SharedArrayBuffer` bitset. Bitset marks are idempotent
  `Atomics.or` writes ⇒ no race, no ordering requirement. This is the bulk of the
  work and scales cleanly.
  - **Commit (serial, cheap):** walk the ring in order on one thread; for each
  unmarked cell run the `O(k)` exact check against already-committed points *of this
  ring only* (an `O(k · |committed in ring|)` correction, tiny in practice since a
  ring commits `O(1)`–`O(10)` points), then commit **and immediately apply that
  point's segment-local marks** (§3.7) before testing the next cell. The
  segment-internal pair family `{(c1,c2)}` is closed here, in order; it cannot be
  deferred.
  - **Project (parallel):** for each committed point, the `k-1` new rays are computed
  and scheduled in parallel; scheduling into the bucket queue uses per-worker shards
  merged in a fixed worker-index order at ring end, so the merged calendar is a
  deterministic function of the ring, not of arrival time.

  Determinism requirement `S4` is a test, not a hope: `test/determinism.test.js`
  runs `workers ∈ {1,2,8}` and compares SHA-256 of the point list; the same test runs
  in the browser harness against the same expected hash (`S3`).

  ### 4.6 GPU / WebGL2 marking backend

  Same contract as §4.5: **the GPU produces the mask, the CPU produces the
  decisions.** Nothing about the semantics changes; only the propose stage moves.

  - **Tiers.** WebGL2 / GLSL ES 3.00 is the baseline (universally available);
  WebGPU compute (`atomicOr` on a storage-buffer bitset) is an opt-in fast path;
  Web Workers + `SharedArrayBuffer` is the portable fallback; the scalar
  single-thread path is the semantic reference. The same backend-selection logic
  runs headlessly in CI (software rasterizer) as in the browser.
  - **Exact marking, no rasterization heuristics.** Each ray is an *instance*;
  `gl_VertexID = t` indexes the lattice points along it; the vertex shader computes
  `p + t·d` in `ivec2` and emits a 1-texel `POINTS` primitive at the exact texel
  centre. Address math is integer-only — no `float` anywhere in the mapping, which
  is what makes the GPU result *equal*, not *approximately equal*, to the scalar
  backend's.
  - **Idempotent writes.** `blendEquation(MAX)` into an `R8` (or `R8UI` +
  `imageAtomicOr` under WebGPU) target ⇒ marks commute ⇒ no ordering requirement ⇒
  deterministic regardless of draw order or driver scheduling.
  - **Per-instance vertex counts.** The number of lattice hits of a ray inside the
  current band comes from §3.4 on the CPU (or a prepass) as an instance attribute;
  zero-hit instances are culled before the draw call.
  - **Readback.** Only the ring perimeter (`8R` texels) is read back per ring for the
  serial commit — the Amdahl bottleneck. Amortize by processing a *band* of `B`
  rings (§3.3) per `readPixels`/PBO round trip, then committing the band's rings in
  order on the CPU with §3.7 closure between them.
  - **Precision guard.** `i32` in shaders bounds `|p + t·d|` well below `2^31`;
  stated properly, the guard is on the **L∞ norm**: the CPU asserts
  `||p + t·d||_∞ < 2^30` for every instance in the band before the draw call, which
  bounds both components at once and is a single integer comparison. The guard is
  re-asserted per band, and the run demotes itself to the worker/wasm path if it is
  ever violated. Coordinates are always relative to the band origin, not absolute.
  - **Gate.** `S6`: golden SHA-256 of the point list must match the scalar backend on
  `>= 2` GPU vendors plus a software rasterizer for `R <= 512`. A mismatch
  automatically disables the GPU backend at runtime and reports it in the manifest.

  ---

  ## 5. Interactive explorer (web UI)

  ### 5.1 Ground rules

  - **Zero build.** `index.html` + native ES modules (`import` / `export`), served
  statically by `./no3sieve serve` (which also sets COOP/COEP so
  `SharedArrayBuffer` is available). No bundler, no transpiler, no install step, no
  framework mandated; a module may be swapped for a wasm-backed one without
  touching callers.
  - **The viewer is the contract, the in-browser engine is an accelerator.** The
  headline research artifact must be reproducible entirely headlessly (`S3`). The
  UI must be able to *view a headlessly produced artifact* with the in-browser
  engine disabled, and the headless runtime must be able to consume anything the UI
  exports (`S7`) — the same `src/core/` modules on both sides make this cheap.
  - **Typed arrays only** on hot paths: no per-point objects anywhere (R10).

  ### 5.2 Infinite canvas model

  - World coordinates **are** lattice coordinates. The camera is
  `{ cx, cy, zoom }` with `zoom` in *pixels per cell*, stored log-scaled;
  `screen = (world - c) * zoom + viewport/2`. Camera math is the *only* place
  floating point is allowed, and it stays exact to `|x| < 2^53`, far past any
  feasible `R`.
  - **No bounds, no clamping.** Panning past the generated frontier issues an
  `ensureRadius(R)` request; the engine streams the new rings and the affected
  tiles are invalidated. Ungenerated regions render as a distinct "unknown" hatch,
  never as "empty" — the distinction is load-bearing for interpretation.
  - Pan: drag / space-drag / arrow keys / trackpad two-finger. Zoom: wheel and pinch,
  anchored at the cursor (the cell under the pointer is invariant), plus `+`/`-`
  and a "fit to ring `R`" control. Continuous, inertia-free, deterministic.
  - **Level of detail**, chosen by `zoom`:

  | zoom (px/cell) | layer drawn                                                |
  |----------------|------------------------------------------------------------|
  | `>= 8`         | cells + gridlines + ring guides + per-cell inspector hits   |
  | `2 .. 8`       | points as quads, gridlines fade out                         |
  | `0.25 .. 2`    | points as single texels, nearest-neighbour, no gridlines    |
  | `< 0.25`       | **aggregate tiles**: per-block occupancy count, colormapped |

  Sub-pixel LOD must aggregate (`sum`/`max`), never point-sample: a point set of
  density `~2/n` disappears under naive downsampling and the picture lies.

  ### 5.3 Tiles

  - The plane is partitioned into `256 x 256`-cell tiles keyed `(tx, ty, lod)`.
  - A tile payload is a bitset (`8 KB` at lod 0) plus a small header; it is produced
  by `src/core/tiles.js` — on the server thread, on the worker pool during a live
  run, or in the browser from a loaded artifact, *same code* — and transferred as a
  zero-copy `ArrayBuffer`, then uploaded as an `R8UI` texture.
  - Fixed-budget **LRU cache** (default 256 MB GPU / 64 MB CPU), tunable in the HUD,
  with an explicit eviction counter shown so pathological thrash is visible.
  - Tiles are immutable and content-addressed by `(configHash, tx, ty, lod, rGen)`,
  so caching is safe across pans and reloads.

  ### 5.4 Density overlay (centered window)

  The overlay answers, *for the cell under every pixel*, "how good is the
  neighbourhood centred here?".

  - For window size `s` (HUD slider, default 16) and lattice cell `(x, y)`:

  ```
  W_s(x,y) = [x - floor((s-1)/2), x + ceil((s-1)/2)] x [y - floor((s-1)/2), y + ceil((s-1)/2)]
  D_s(x,y) = |P ∩ W_s(x,y)|          # the SAT 4-term query, §4.3
  c_s(x,y) = D_s(x,y) / s            # the literature's normalization
  ```

  so the window is genuinely **centred on the pixel's cell** (for even `s` the
  centre is biased low; the legend states which convention is active).
  - Equivalently: for **odd `s`** this is exactly the L∞ ball
  `B_∞((s-1)/2)` centred on `(x, y)` — the same gauge the engine traverses in, so
  the overlay is literally "how many points inside the L∞ ball of this radius", and
  the overlay's iso-contours are L∞ spheres. For **even `s`** it is the low-biased
  L∞ ball, which has no symmetric definition; that is precisely why the convention
  must be printed in the legend (R13) and why odd `s` is preferred for figures.
  - Rendered as a heat map over `c_s ∈ [0, 2]`, with contour lines at the reference
  values `1.0` (Erdős), `1.5` (HJSW) and `2.0` (upper bound) so the interesting
  regions are visible without reading numbers. Perceptually uniform colormap;
  colorblind-safe; toggleable; opacity slider; `2s` vs `s` normalization switch.
  - **Implementation:** per-tile SAT with an apron of `ceil(sMax/2)` cells so window
  queries never cross a tile boundary unresolved; SAT built on the GPU by two
  separable prefix-sum passes (`sat-gpu.js`), or by `src/core/sat.js` on a worker
  for the fallback renderer. Recomputed only on tile invalidation or `s` change,
  not per frame.
  - The hover **inspector** shows exact integers for the cell under the cursor:
  `(x, y)`, in-set?, blocked-by (the offending pair, from the calendar), `D_s`,
  `c_s`, ring index, order index, and whether this window is a current top-K entry.

  ### 5.5 Top-K solution browser

  - As the sieve runs (or as an artifact is scanned), a streaming min-heap per
  configured `s ∈ topkSizes` keeps the `topkKeep` best windows by `D_s`, with
  near-duplicate suppression (windows overlapping `> 50%` collapse to the best).
  - The panel lists them as `s, pop, c(s), (x0, y0)`, sorted; clicking flies the
  camera to that window and highlights its border; `↑/↓` walks the list.
  - Each entry is exportable individually or as a bundle (§5.6). Every exported
  solution is **re-verified client-side** by `src/core/verify.js` (`O(k^2)` triple
  check, `k <= 2s`) before the download is offered, and carries the check result in
  its metadata — the same verifier the headless certificate uses.

  ### 5.6 Export

  Standard, boring, tool-agnostic formats — see the table in §6. From the UI:

  - **CSV** `x,y` (translated so the window is `[0,s) x [0,s)`), the interchange
  default; **JSON** with a published JSON Schema; **NDJSON** for streams;
  **TXT grid** (`#` = point, `.` = empty, one line per row) which is the de-facto
  format in the no-three-in-line literature and diffs well; **PNG** raster
  (encoded by `codec/png.js`, deflate injected: `CompressionStream` in the browser,
  the platform zlib in the headless runtime); **SVG** figure for papers;
  **`.zip` bundle** = manifest + certificate + all of the above for the top-K set.
  - "Copy to clipboard" as CSV / JS array literal / JSON for one-click reuse.
  - Every export embeds `configHash`, engine version, git sha, the window origin in
  world coordinates, and the client-side verification result (`S7`).
  - Because both runtimes call the *same* `codec/*` encoders over the same typed
  arrays, "the browser and the headless writer produce byte-identical bytes" is a
  cheap regression test rather than a porting effort (§7.5).

  ### 5.7 Interaction vs. certified state

  The UI never mutates a certified run. User "what-if" edits (add/remove a point) go
  to a **scratch overlay layer** with its own validity check and its own export path,
  visually distinct (different colour + a persistent "MODIFIED" badge). Scratch layers
  can be diffed against the run and discarded; they can never be written back into an
  artifact bundle.

  ### 5.8 Performance budget

  | item                          | budget                                  |
  |-------------------------------|------------------------------------------|
  | frame time (1080p, overlay on)| `<= 16 ms` p50, `<= 33 ms` p99 (`S5`)    |
  | tile build (lod 0)            | `<= 4 ms` per tile, off the main thread  |
  | SAT rebuild per tile          | `<= 2 ms` GPU                            |
  | main-thread allocation/frame  | `0` bytes steady-state (no GC sawtooth)  |
  | GPU memory                    | `<= 300 MB` default cap                  |

  Instrumented in the HUD (fps, frame time histogram, tiles resident/evicted,
  engine rings/s, points/s) and dumped to the run manifest for the bench notes.

  ### 5.9 Accessibility & ergonomics

  Full keyboard navigation, focus-visible controls, `prefers-reduced-motion`
  respected, colorblind-safe palettes, a permalink that encodes
  `(configHash, cx, cy, zoom, s, overlays)` in the URL fragment so any view is
  shareable and reproducible.

  ---

  ## 6. File formats

  | artifact          | format | contents                                                        |
  |-------------------|--------|-----------------------------------------------------------------|
  | point set         | CSV    | `x,y,order_index,ring` header row, sorted by `order_index`      |
  | point set (fast)  | BIN    | `.no3`: 32-byte header + `int32[k][2]` little-endian + JSON meta |
  | run manifest      | JSON   | config, version, git sha, host, timings, `k(R)` table, hashes   |
  | certificate       | JSON   | verifier result, method, `|P|`, checksum of point set           |
  | dense raster      | PNG    | 1 px per cell, black = point, gray = sieved, white = free       |
  | density curve     | CSV    | `s, max_pop, c(s), argmax_x, argmax_y`                          |
  | checkpoint        | BIN    | points + calendar SoA + ring index (resumable, transferable)     |
  | live stream       | NDJSON | one frame per `streamEvery` rings: `{r, new_points, k, topk}`   |
  | tile              | binary | 32-byte header + bitset (`256x256` cells) or LOD `uint16` counts |
  | solution (single) | CSV    | `x,y` in `[0,s)^2`, plus sidecar JSON metadata                  |
  | solution (single) | TXT    | `#`/`.` grid, one line per row — literature de-facto format     |
  | top-K bundle      | ZIP    | manifest + certificate + CSV/TXT/JSON/PNG per solution          |
  | figure            | SVG    | vector plot of a window or of `c(s)`, publication-ready         |
  | schemas           | JSON Schema | `pointset` / `solution` / `manifest`, versioned & published |

  The `.no3` container is deliberately trivial (fixed header + little-endian typed
  array payload) so it maps onto `Int32Array` with zero parsing in either runtime and
  onto a two-line reader in any external tool.

  All artifacts carry `configHash = sha256(canonicalJson(config) + version)`,
  computed by `core/hash.js` over WebCrypto in both runtimes.
  Every JSON artifact declares `"$schema"` and is validated in CI both by the headless
  writer and by the browser exporter (`S7`) — the two must produce byte-identical
  output for the same point set, which is a test (§7.5).

  ---

  ## 7. Verification strategy

  Five independent layers; a run is only "certified" if all applicable layers pass.

  1. **`verify.js` (external certifier).** Loads only the CSV/`.no3`. For each
   `p ∈ P`, hashes `primdir(q - p)` for all `q`; any duplicate ⇒ a collinear triple,
   which is *reported explicitly* as the offending triple. `O(k^2)` time.
   Deliberately shares no code with `sieve.js` beyond `primdir` (which is itself
   property-tested).
  2. **Brute-force cross-check** for `k <= 400`: all `C(k,3)` triples via the integer
   cross product `(b-a) × (c-a) == 0`. Used in CI on small runs.
  3. **Greedy-fidelity check (`I4`).** Replay the traversal order with the slow
   reference engine for `R <= 64` and assert the *same* set is produced. This catches
   the failure mode "engine is valid but over-blocks", which the collinearity
   verifier alone cannot detect.
  4. **Segment-closure regression (`I5`).** A hand-built fixture in which the *only*
   blocker of a later cell in ring `R` is a pair of points both placed in ring `R`.
   Any engine that skips the `{(c1,c2)}` family of §3.7 emits an invalid set here and
   fails loudly. Runs in CI for every backend, including GPU and wasm.
  5. **Cross-runtime differential (`S3`, `S6`, `S7`).** A headless browser (software
   rasterizer in CI, `>= 2` real GPU vendors nightly) runs the WebGL2 and worker
   backends for `R <= 128`, hashes the point list, and compares against the scalar
   backend hash produced by `node --test`; separately, artifacts exported by
   `web/js/data/export.js` are fed back through `verify.js` and must certify, and
   their JSON/CSV/BIN bytes must match the headless writer's byte-for-byte.

  Additional test fixtures:

  - Known optima `2n` for small `n` (hard-coded configurations from the literature) fed
  to the verifier, expecting PASS; deliberately corrupted variants expecting FAIL
  with the correct reported triple.
  - `sat.test.js`: SAT population vs. naive counting on random rasters (seeded
  property test via `test/prop.js`), plus `sat-gpu.js` vs `core/sat.js` equality on
  the same rasters under the same L∞ window definition.
  - `calendar.test.js`: for random lines and radii, calendar-scheduled marks must equal
  the brute-force rasterized lattice points of that line in `[-R,R]^2` (`fullLine`
  mode makes this an exact set equality). Two additional assertions, both L∞:
  (a) the number of marks a line contributes inside `B_∞(R)` must satisfy Lemma
  3.3.1's bound `<= 4R/||d||_∞ + 1` — a violation means a bad convexity split or a
  non-primitive `d`; (b) after the split at `t*`, each ray's sequence of scheduled
  L∞ indices must be strictly increasing, which is the precondition for both the
  bucket queue and `outwardOnly`.
  - `tiles.test.js`: tile + LOD aggregation vs. direct counting; apron correctness for
  centered windows that straddle tile boundaries (§5.4).
  - `schema-roundtrip.test.js`: every format in §6 survives write → read → write
  unchanged, and every JSON validates against its schema (validator is a vendored,
  zero-dependency subset checker checked into the repo).
  - Ring-intersection unit tests for the `ContainedInSide` case of §3.7(2), including
  all four sides and all four corners, exhaustively for `R <= 32`.
  - Integer-safety tests: every intermediate in `primdir`, the ring intersection and
  the convexity split is asserted `Number.isSafeInteger` under `--paranoid`.

  ---

  ## 8. Complexity & performance budget

  Let `k = |P|`, `R = rMax`.

  | stage                          | time                                  | space        |
  |--------------------------------|---------------------------------------|--------------|
  | ring traversal                 | `|B_∞(R)| = (2R+1)^2` cells, `8r`/ring | `O(R)`       |
  | line creation                  | `O(k^2)` primdir + schedule           | `O(k^2)` events |
  | calendar marking               | `<= Σ_lines (4R/||d||_∞ + 1)` (L3.3.1), ~`O(k^2)` | — |
  | intra-ring commit correction   | `O(Σ_R k · commits_R)`                | —            |
  | segment closure (§3.7)         | `O(Σ_R |A_R| · (k + |A_R|))`          | `O(|A_R|)`   |
  | naive backend (baseline)       | `O(k^2 · R)`                          | `O(R^2)` bits|
  | reference backend              | `O(R^2 · k)`                          | `O(k)`       |
  | SAT build + full scan          | `O(R^2 · |sizes|)`                    | `O(R^2)`     |
  | verifier                       | `O(k^2)`                              | `O(k)`       |
  | GPU marking pass (§4.6)        | `O(marks / lanes)` + `O(R)` readback/ring | `O(band area)` texels |
  | tile build (lod 0)             | `O(points in tile)`                   | `8 KB` / tile |
  | density overlay (per tile)     | `O(tile area)` per invalidation       | `O(tile area + apron)` |
  | top-K tracking                 | `O(R^2 · |sizes| · log k)` streaming  | `O(|sizes| · keep)` |

  **Risk:** the `O(k^2)` event store dominates memory. At `R = 4096`, if `k ≈ 2·(2R)`
  then `k ≈ 16k` points ⇒ `~1.3e8` rays. Mitigations, in order of preference:
  (a) drop rays whose next lattice point exceeds `rMax`; (b) 16-byte packed event
  records in a struct-of-arrays layout over `Int32Array`s (already the §3.2 design);
  (c) `--backend naive` bitset fallback for memory-constrained large runs; (d)
  on-disk / OPFS spill of far-future buckets. Note the headless runtime's default heap
  is a hard ceiling: large runs must pass `--max-old-space-size` for the JS objects
  *around* the typed arrays, while the typed arrays themselves live outside it — one
  more reason the calendar is SoA and not an array of records.
  A memory model spreadsheet is a Phase-2 deliverable *before* the code is written.

  Target machine for the published numbers: 8-core x86-64, 32 GB RAM, current LTS
  Node. Language: **JavaScript (ES2022) with typed arrays, one source tree for both
  runtimes**; the calendar inner loop is the designated hotspot. Hotspot discipline:
  monomorphic call sites, no allocation inside the ring loop, no closures per event,
  all state in preallocated typed arrays — this is what makes the JIT's output stable
  across runs and across runtimes. If measurement (not superstition) shows the loop
  still short of budget at M9, it is replaced by the **WebAssembly** core behind the
  same `calendar.js` interface (§4.2), loaded identically by the headless runtime and
  the browser, and gated on a golden-hash equality test against the JS path. Browser
  target for `S5`: any 2019+ laptop GPU with WebGL2; the UI budget in §5.8 is measured
  on integrated graphics, not a discrete card.

  ---

  ## 9. Development plan

  Each milestone has a demo, an acceptance test, and a written note in
  `bench/results/`. Nothing is merged without the verifier green.

  ### M0 — Skeleton (0.5 wk)
  Repo layout, `package.json` (zero deps, `"type": "module"`), CI (`node --check`,
  `node --test`, vendored lint), the config object + canonical-JSON hashing, artifact
  writers, JSON Schemas, `./no3sieve serve` + an `index.html` that renders a
  hard-coded point list on a pan/zoom canvas (walking skeleton, both ends).
  **Accept:** `./no3sieve --version`; an empty run writes a schema-valid manifest; the
  page loads that manifest and draws nothing, correctly; `node --test` passes on a
  clean checkout with **no install step** (`S8`).

  ### M1 — Lattice + order + reference engine (1 wk)
  `core/lattice.js`, `core/order.js`, `core/reference.js` (exact-check greedy,
  `O(R^2·k)`).
  **Accept:** valid sets for `R <= 48`; verifier + brute-force triple check pass;
  spiral order property tests (bijection with `[-R,R]^2`, monotone ring index).
  This is the **ground truth** for everything after.

  ### M2 — Verifier + SAT + metrics (1 wk)
  `core/verify.js`, `core/sat.js`, `core/metrics.js`, `densityCurve`, PNG raster
  export via `codec/png.js`.
  **Accept:** SAT matches naive counts on 10k seeded property cases; known-optima
  fixtures certify; first `c(s)` plot (SVG, from `codec/svg.js`) from M1 output.

  ### M3 — Naive bitset sieve backend (1 wk)
  Full-raster marking with `outwardOnly`, `Uint32Array` bitset state, no calendar.
  **Accept:** output *identical* to `reference` for `R <= 64` (differential test);
  `>= 20x` faster than reference at `R = 128`.

  ### M4 — Calendar backend (2 wk) — *the core deliverable*
  Ring-intersection primitive, bucket queue + SoA overflow heap, convexity split,
  intra-ring immediate marking, **§3.7 segment closure incl. the `ContainedInSide`
  case**, checkpoint/resume (`serialize`/`deserialize` over `ArrayBuffer`), NDJSON
  streaming (`core/stream.js`).
  **Accept:** identical to `naive` for `R <= 256`; `R = 512` in `< 10 min` single
  thread; memory within the M4 model's prediction ±25%; the segment-closure
  regression (§7.4) passes and *fails* when the `{(c1,c2)}` family is deliberately
  disabled.

  ### M5 — Parallel execution (1 wk)
  Propose/verify/commit (§4.5) on the worker pool with `SharedArrayBuffer` bitsets and
  `Atomics.or`, sharded scheduling, worker-count sweep. The same worker code runs
  headlessly (`node:worker_threads` adapter) and in the browser (`Worker`), behind one
  `worker-pool.js` interface.
  **Accept:** bit-identical across `workers ∈ {1,2,4,8}` **and** across the two
  runtimes; `>= 3x` speedup at 8 workers on the marking phase; documented Amdahl
  analysis of the serial commit.

  ### M6 — Explorer: infinite canvas + tiles (1.5 wk)
  `viewport.js`, `tile-renderer.js`, `core/tiles.js`, LRU cache, LOD ladder, HUD,
  inspector, permalinks, Canvas2D fallback. Views *artifacts only* — no in-browser
  engine yet.
  **Accept:** loads an `R = 4096` artifact and holds `>= 30 fps` at 1080p while
  panning/zooming across the full range (`S5`); LOD aggregation matches direct counts
  (`tiles.test.js`); permalink round-trips a view exactly.

  ### M7 — Explorer: density overlay, top-K, export (1 wk)
  `sat-gpu.js`, centered-window overlay with reference contours, top-K panel with
  fly-to, all export paths + client-side re-verification, `.zip` bundles.
  **Accept:** GPU overlay matches `core/sat.js` exactly on random rasters; exported
  solutions re-certify through `verify.js`; browser-written JSON/CSV/BIN byte-match
  the headless writer (`S7`); one-click export of the top 16 windows for each
  `s ∈ {8,16,32,64}`.

  ### M8 — GPU / worker execution backend (2 wk)
  `gpu-mark.js` (instanced exact `POINTS` marking), worker pool +
  `SharedArrayBuffer`, band batching, readback amortization, automatic fallback.
  **Accept:** `S6` — golden hash identical to the scalar backend for `R <= 512` on a
  software rasterizer + `>= 2` GPU vendors; `>= 5x` faster than the single-thread JS
  path on the marking phase; live run streams into the canvas without dropping below
  30 fps.

  ### M9 — Scale run + analysis (1.5 wk)
  Long runs to the largest feasible `R`; produce `k(R)`, `α` fit, `c(s)` curve,
  aperiodicity and symmetry reports; compare to `1.0n` / `1.5n` / `2n` reference lines.
  Optional wasm hotspot **only if** the profiler demands it, gated on hash equality
  with the JS calendar.
  **Accept:** `results.md` with plots, a certified artifact bundle, and an explicit,
  falsifiable statement of what the sieve's asymptotic density appears to be —
  **including the negative result if `α < 1`.**

  ### M10 — Hardening & handoff (1 wk)
  Docs, `README`, one-command reproduction script, a hosted **static** build of the
  explorer (literally `web/` copied to a static host) with the headline artifact
  preloaded, archived artifacts, wasm build recipe + hash if M9 produced one.

  Nominal total: **~13 weeks**, single developer. Sequencing rule: **M0–M5 (the
  research engine) must be accepted before M6 starts**; the headline result may never
  depend on the browser or the GPU (R12).

  ---

  ## 10. Risk register

  | # | Risk | Likelihood | Impact | Mitigation |
  |---|------|-----------|--------|------------|
  | R1 | Spiral-greedy density is sub-linear (`α < 1`), so the set is *not* "relatively maximal" | **High** | High | Treat measurement of `α` as the deliverable, not a hoped-for `α=1`; add `intraRingOrder`/`ringMetric`/`seedPoints` sweeps and a v2 randomized-restart mode as the follow-up experiment |
  | R2 | `O(k^2)` event memory blows up before interesting `R` | High | Med | §8 mitigations (a)–(d); SoA typed arrays outside the object heap; naive backend as fallback; publish the memory model in M4 |
  | R3 | Intra-ring dependency bug ⇒ invalid sets | Med | High | Differential testing vs. `reference` at every milestone; `--paranoid` mode; verifier in CI |
  | R4 | Parallel nondeterminism | Med | Med | Propose/verify/commit design; idempotent `Atomics.or`; fixed-order shard merge; determinism test in CI (`S4`) |
  | R5 | Integer overflow / sign bugs in `primdir` and ring intersection | Med | High | Safe-integer assertions on every intermediate, exhaustive small-domain tests, seeded property tests |
  | R6 | Output is highly symmetric / eventually periodic, undermining the "aperiodic" claim | Med | Med | Explicit symmetry & autocorrelation probes in M2/M6; report honestly; offer symmetry-breaking seeds |
  | R7 | Scope creep into exact optimization | Med | Med | §0.2 is binding for v1 |
  | R8 | **Segment-closure omission** — the `{(c1,c2)}` pair family of §3.7 is skipped, silently producing *invalid* sets | Med | **High** | §3.7 is normative; dedicated regression fixture (§7.4) that must fail when the family is disabled; `--paranoid` exact check on every commit in CI; differential vs `reference` at every milestone |
  | R9 | WebGL2 nondeterminism (driver blend/precision quirks, `readPixels` alignment, `POINTS` clipping rules) | Med | High | Integer-only address math; idempotent MAX/atomicOr writes; golden-hash tests on `>= 2` vendors + software rasterizer; runtime hash check with automatic scalar fallback and a manifest note |
  | R10 | Browser/headless memory & GC stalls at large `R` (tile cache, point arrays) | Med | Med | Fixed-budget LRU tile cache with visible eviction counters; typed arrays only, zero steady-state allocation per frame and per ring; stream tiles instead of holding the whole set |
  | R11 | `SharedArrayBuffer` unavailable (missing COOP/COEP, `file://`) ⇒ no worker parallelism | Med | Low | `./no3sieve serve` sets the headers; feature-detect and degrade to `postMessage` copies, then to single-threaded, with an honest HUD badge |
  | R12 | UI scope creep displaces the research deliverable | **High** | High | UI milestones sequenced *after* M5; headline artifact must be produced headlessly; §0.2 bans the editor/framework rabbit holes |
  | R13 | Density overlay misleads (aliasing at low zoom, ambiguous "centered" convention, empty vs. ungenerated) | Med | Med | Aggregate-not-sample LOD; the centering convention printed in the legend; distinct "unknown" hatch for ungenerated regions; inspector always shows exact integers |
  | R14 | **Gauge confusion** — `L0`/`L∞`/`L2` mixed up in code, docs or between `core/sat.js` and `sat-gpu.js` (this already happened once: see the header erratum) | Med | High | One name per concept: `linfIndex(p)` for the ring gauge, `lineParamT` for the integer parameter on a line; no symbol named `l0` anywhere; `ringMetric` is an explicit enum with no default fallthrough; §7's cross-test between the two SAT implementations uses the same L∞ window definition and fails on disagreement |
  | R15 | **Toolchain creep** — a bundler, transpiler, framework, package install or second language runtime sneaks in, breaking "serve a static directory" and doubling the semantics surface | Med | High | `S8` is a CI gate: the dependency graph must stay empty and the explorer must run from a static directory over plain HTTP; the only permitted compiled artifact is a hash-gated `.wasm` behind an existing interface; every module must be loadable by both runtimes with no transformation |
  | R16 | JIT/engine variance across runtimes changes numeric results | Low | High | All decisions are exact integer arithmetic with safe-integer assertions; floating point confined to the camera (§5.2); cross-runtime golden-hash test in CI (`S3`) |

  ---

  ## 11. Open questions to resolve before/during M1

  1. Does `nearestFirst` (true "nearest-to-origin") beat `clockwise` in density? Cheap
   to A/B once M1 lands; decide the default empirically at M6.
  2. Should the seed be `[[0,0]]`, `[]` (start at ring 1), or a small hand-chosen
   symmetric kernel? Affects both density and symmetry (R6).
  3. Is a *bounded* variant (`n x n` greedy with the same order) meaningfully better
   than the window-extraction approach of §4.3? Both are cheap; measure both.
  4. Euclidean ring intersection: is the closed-form worth it, or should
   `ringMetric=euclidean` just use the L∞ calendar with an `L2` commit-order
   filter layered on top? (**Leaning: strongly the latter**, and stronger now that
   §2.2 makes L∞ normative: exactly one calendar exists, it is the L∞ one, and
   `euclidean` becomes a re-ordering of commits within an L∞ band rather than a
   second scheduler. A native L2 calendar is explicitly out of scope for v1. Note
   the trade this makes visible: L2 would delete the `ContainedInSide` case of
   §3.7(2) — its spheres are strictly convex — but it costs the closed form of §3.4
   *and* the window alignment of §4.3, which is a bad exchange.)
  5. v2 hook: after the greedy pass, does a cheap local repair (remove 1 point, add 2)
   raise `c(s)`? Design the `PointSet` API so this is addable without refactoring.
  6. Overlay normalization for the legend: `D_s / s` (matches the literature's `c(s)`)
   or `D_s / 2s` (fraction of the theoretical maximum)? Probably show both; pick one
   for the colormap domain. Also fix the even-`s` centering convention once, in §5.4.
  7. Should the browser *run* the engine at all, or only view artifacts? (Leaning:
   both, with the golden-hash gate `S6` as the price of admission — but M6 ships
   viewer-only so the research path never blocks on GPU debugging.)
  8. Tile size (`128` vs `256` vs `512` cells) and the sub-pixel LOD aggregation
   function (`sum` vs `max`): measure cache pressure vs. upload count at M6.
  9. Is WebGPU worth a second backend in v1, or deferred given WebGL2's universality
   and the fact that the serial commit is the Amdahl bound anyway? (Leaning: defer.)
  10. Streaming protocol: NDJSON (debuggable, schema'd) vs. a binary frame format
   (fast). Start NDJSON, add binary only if the profiler demands it.
  11. Does the segment-internal pair family (§3.7) materially change the resulting
   set's density versus the (incorrect) cross-family-only variant? Worth measuring
   once — it quantifies how wrong the `idea.md` reading was.
  12. Does the JS calendar loop actually miss its budget at M9, i.e. is the `.wasm`
   core needed at all? Decide from a profile, never from taste.

  ---

  ## 12. Definition of done (v1)

  - [ ] `node --test` green, coverage `>= 85%` on `src/`.
  - [ ] One command reproduces the headline artifact from a clean checkout, with **no
       install step and no build step** (`S8`).
  - [ ] `results.md` states the measured `α` and `c(s)` with error bars and an explicit
       comparison to the `1.0n` / `1.5n` / `2n` reference lines.
  - [ ] All milestones M0–M10 accepted.
  - [ ] `web/test` green in CI (headless browser + software rasterizer); no bundler,
       transpiler, framework or package manager in the dependency graph; the explorer
       runs from a static directory over plain HTTP.
  - [ ] The headline artifact is reproducible with the browser and GPU paths entirely
       disabled (the UI is an accelerator and a lens, never a dependency), and the
       headless and browser runs of the same config hash to the same value (`S3`).
  - [ ] Every published point set ships with a passing certificate from `verify.js`
       *and* an independent brute-force check where size permits.
  - [ ] The segment-closure regression (§7.4) is in CI and demonstrably fails when
       §3.7's `{(c1,c2)}` family is disabled.
  - [ ] The explorer loads the headline artifact, pans/zooms to `R >= 4096` at
       `>= 30 fps` with the density overlay on (`S5`), and everything it exports
       re-verifies through `verify.js` and validates against a published schema (`S7`).
  - [ ] GPU backend hash-identical to the scalar backend for `R <= 512` on
       `>= 2` GPU vendors plus a software rasterizer (`S6`).

  Explicitly **not** done and never to be done:

  - Any build toolchain for the UI or the engine (bundler, transpiler, framework,
  install step). Everything must run from a static directory over plain HTTP and
  from `node --test` on a clean checkout.
  - A second language runtime anywhere in the pipeline. The only compiled artifact
  permitted is a hash-gated `.wasm` behind an interface that already exists in JS.
  - Server-side rendering, accounts, persistence beyond local files / IndexedDB / OPFS.
  - A UI *editor* that mutates a certified run in place (see §5.7: what-if edits live
  in a separate scratch layer).

  ---

  ## 3.7 Intra-ring (segment) pair closure — normative

  When a ring — or, in the parallel/GPU pipeline, an **arc segment** of a ring — is
  painted, it is **not** sufficient to close over pairs `(old point, new point)`.
  Every pair of points placed *within the same segment* also determines a line, and
  that line can block a cell still ahead in the traversal order. After a segment
  `A ⊂ ring R` is committed, the set of new lines is

  ```
  NEW(A) = { (p, c) : p ∈ P_before, c ∈ A }   ∪   { (c1, c2) : c1 ≠ c2 ∈ A }
                      cross family                      segment-internal family
  ```

  The second family is exactly the one the `idea.md` pseudocode omits. `|A|` is small
  in practice (`O(1)`–`O(10)` points per ring), but the term is **not optional**:
  dropping it produces *invalid* sets, not merely sub-optimal ones. Restated as a
  rule: *for all arc cells set at the current **L∞** radius, close over **all pairs**
  inside that radius before advancing.* ("L0" in earlier drafts is the typo of the
  header erratum; the radius meant here is `||·||_∞`, the same one the calendar
  buckets and the traversal are indexed by, which is why "before advancing" is
  well-defined at all.)

  Three consequences:

  1. **Placement inside a segment is a fixpoint, not a filter.** A candidate may be
  free when the segment is proposed and blocked by the time the ordered walk reaches
  it. The commit stage must be strictly ordered, re-check each candidate against
  every point committed so far *in this segment*, and immediately apply the
  segment-local marks before testing the next candidate (§4.5 commit). This is the
  one stage that is inherently serial, and no worker or GPU tier may reorder it.
  2. **Same-ring chords have a degenerate case.** A line through two points of the
  same L∞ sphere meets that sphere in exactly those two points **unless** the line
  is collinear with a face of the square, in which case it contains the *entire
  face*. That is precisely the "two points already in column `x = R`" situation,
  which must blank the remainder of that face. The ring-intersection primitive
  (§3.4) must therefore return a three-way result:
  `NoHit | Hit(t) | ContainedInSide(side, t_lo, t_hi)`.
  This is a direct consequence of L∞ having **flat faces**: for a strictly convex
  gauge (e.g. L2) a chord meets the sphere in at most 2 points and
  `ContainedInSide` is unreachable. It is the one place where the L∞ choice of
  §2.2 costs code rather than saving it, and it is why §7.4 plus the exhaustive
  `R <= 32` side/corner tests are normative rather than nice-to-have.
  3. **Corner sharing.** A cell may sit on two sides at once (`|x| = |y| = R`); the
  perimeter indexing (§3.2) must be a bijection so a corner is marked once, not
  twice, and never skipped by the side-clipping logic. Under L∞ these are exactly
  4 cells per sphere — the only cells belonging to two faces — so the case is
  enumerable and must be tested exhaustively, not sampled.

  Cost: `O(|A|^2)` primdirs per segment plus `O(|A| · k)` for the cross family — the
  same asymptotics as §3.5 — but ordered, sequential, and run to a fixpoint over the
  segment before the next segment begins. Dedicated regression fixture required:
  a configuration where a same-ring pair is the *sole* blocker of a later same-ring
  cell (see R8).