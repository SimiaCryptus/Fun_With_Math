# no3sieve — web explorer (zero build)

Native ES modules, no bundler, no npm, no transpiler. Two ways to run:

```sh
# any static server works; a plain one is enough for the viewer + main-thread engine
python3 -m http.server -d experiments/no3sieve/web 8080
# -> http://localhost:8080/
```

`file://index.html` also works: the module Worker will fail to construct and the runner automatically falls back to the
time-sliced main-thread path (announced in the HUD as `backend calendar / main`). Semantics are identical either way —
the parallel/worker path is an _execution strategy only_ (plan §4.5, §4.6).

## What is implemented

| plan section                                                                                       | module                                          |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| §2.1 ring-major L∞ order, `clockwise` / `nearest_first`                                            | `js/order.js`                                   |
| §3.2 ring mask over `S_∞(R)` (8R cells, bijective perimeter index)                                 | `js/lattice.js`                                 |
| §3.3 line-event calendar: bucket queue + overflow heap + convexity split at `t*`                   | `js/calendar.js`, `js/sieve.js`                 |
| §3.4 ring walk incl. the flat-face `ContainedInSide` case                                          | `SieveEngine._applyLine`                        |
| §3.5 / §3.7 **segment closure over both `NEW(A)` families**                                        | `SieveEngine.stepRing`                          |
| §3.6 exact `O(k)` fallback + `--paranoid`                                                          | `SieveEngine.exactCheck`                        |
| §4.3 SAT, `max_pop(s)`, `c(s)` curve                                                               | `js/sat.js`                                     |
| §5.2 infinite canvas, cursor-anchored zoom, aggregate LOD                                          | `js/viewport.js`, `js/renderer/canvas2d.js`     |
| §5.4 centered `s×s` density overlay + reference contours + inspector                               | `js/renderer/canvas2d.js`, `js/ui/inspector.js` |
| §5.5 top-K windows with >50% overlap suppression, fly-to, per-window export                        | `js/topk.js`, `js/ui/topk-panel.js`             |
| §5.6 / §6 CSV / JSON / NDJSON / TXT grid / PNG / SVG / manifest / c(s) CSV                         | `js/data/export.js`                             |
| §7.1–§7.4 independent verifier, brute force, differential vs reference, segment-closure regression | `js/verify.js`, `js/selftest.js`                |

## Correctness notes

- The metric is **L∞** everywhere (plan header erratum). There is no symbol named
  `l0` in this tree — the ring gauge is `linfIndex(x, y)`, the integer parameter on a line is `t` (R14).
- `outward_only` is sound **only after** the convexity split: `t ↦ ||p + t·d||_∞`
  is convex but not monotone, so each line is split at its minimizer `t*` into two monotone rays before any mark is
  dropped (§3.1). `convexitySplit()` finds `t*`
  by binary search on the monotone predicate `g(t+1) >= g(t)`.
- The **flat-face degeneracy** needs no special case in this implementation: a ray whose direction is parallel to a face
  has `g(t) ≡ R` across the whole face, so the ring walk blanks the entire face, and a drained event that re-schedules
  into the ring currently being drained is re-served because the bucket is a growable queue (`Calendar.takeNext`).
- **Segment closure** is structural rather than bolted on: `stepRing` iterates
  `points` _before_ pushing the candidate, so a candidate's lines against same-ring predecessors are created and their
  ring-`R` marks applied immediately, in order. `selftest.js` includes the regression that must _fail_ when those
  same-ring marks are suppressed.
- Nothing here is a `float`: identity of a mark is `(base, d, t)` in exact integer algebra, and scheduling is exact
  integer L∞.

## Reading a sparse picture (density falls off, arcs look empty)

This is the first thing everyone asks, so: **the line constraints are bounded correctly, and the emptiness is
arithmetic, not a leak.** How to convince yourself, and what you are actually seeing:

- **Check it, don't trust it.** `--paranoid` (the checkbox) now asserts `I4` in _both_ directions: every accepted cell
  must be admissible **and every masked cell must be genuinely blocked**. The second half is new — previously nothing
  could detect over-blocking. Self-test runs it to `R = 48`, and the differential
  `calendar == reference` test (`R <= 24`, both orders) would already fail if a single spurious mark existed, since the
  reference engine has no marking at all.
- **Each face of `S_∞(R)` _is_ one row or one column** (`y = ±R`, `x = ±R`). By
  `I2` a row/column holds at most 2 points ever, so a ring of `8R` cells can absorb at most 8 points, and the global row
  bound caps `|P ∩ B_∞(R)|` at
  `2(2R+1)` ≈ 4 points per ring. `8R − O(1)` blank cells per ring is the steady state, not a bug. The HUD's `last ring`
  and `I2 dead` lines report exactly this:
  once `rows`/`cols` saturate, blocking is _forced_, not chosen.
- **The straight empty strips through the origin** are the seed cluster. With
  `seed_points = [[0,0]]` the greedy's first four commits are
  `(0,0),(0,1),(1,1),(1,0)` — a 2×2 block that permanently fills rows `0,1`, columns `0,1`, `y = x` and `x + y = 1`.
  Each of those six saturated lines then legitimately kills exactly 2 cells of _every_ later ring, at fixed angular
  positions. `seedPoints` is now actually implemented (it used to be accepted and ignored), so you can break that
  cluster: seeds are committed in ring-major/lex order, with §3.7 closure, and a seed that is collinear with two earlier
  points is a hard error rather than a silent skip.
- **The empty _arcs_** are the fixed angular phase of `clockwise`: every ring starts at `(0,R)`, so the greedy always
  takes the first free cells in the same angular order and the accepted points precess as an arm, starving the tail of
  the order. Try `nearest_first`, and compare `c(s)` — this is precisely the
  `intra_ring_order` sweep the plan calls for (R1), and the honest answer to
  "does the spiral greedy have positive density?" is the project's deliverable, not an assumption.
- `mark_mode` other than `outward_only` now throws instead of being silently ignored — a config that is quietly dropped
  is indistinguishable from a marking bug when you are staring at an unexpectedly sparse picture.

## Self-test

Click **Self-test** (or `import { runSelfTest } from './js/selftest.js'` in the console). It checks the perimeter
bijection exhaustively for `R <= 32`, asserts the calendar backend is _identical_ to the exact-check reference engine
for `R <= 24`
in both intra-ring orders, cross-checks the verifier against brute-force
`C(k,3)`, asserts a corrupted set fails with the correct triple, asserts the segment-closure regression, and asserts
Lemma 3.3.1's mark bound.

## Not implemented here (deliberately)

WebGL2/WebGPU marking (`S6`), `SharedArrayBuffer` worker pool, tile server + LRU tile cache, `.zip` bundles,
scratch-layer what-if editing. The renderer is Canvas2D with aggregate LOD, which meets `S5` comfortably at the point
counts this problem produces (`|P| = O(R)`, so `R = 4096` is only ~16k points — brute-force iteration per frame is
cheaper than a tile pipeline, and the plan's tile machinery is only needed once a _dense_ raster layer is introduced).
