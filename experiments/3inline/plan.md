# Interactive Lab Implementation Plan: No-Three-in-Line Explorer

## 1. Overview

An interactive, browser-based laboratory (HTML + modular ES6, no build step
required) that lets a user **see**, **manipulate**, and **solve** the
no-three-in-line problem on an n×n grid. The lab exposes the algorithmic
machinery from `plan.md` — incremental line index, expansion frontier,
sublattice mutation, simulated annealing / parallel tempering — as a live,
visual, steppable demonstration, alongside a **manual mode** where the user
attempts the puzzle by hand with real-time constraint feedback.

### Goals

- Visualize the **collinearity constraint** directly on the grid.
- Show the **expansion frontier** (safe cells) and **blocked cells** live.
- Provide a **manual solving mode** with instant validity feedback.
- Provide an **auto-solve mode** running the entropic search, fully steppable
  and observable (line index, frontier, fitness, temperature, entropy).
- Support **warm starts** (parabola construction) and live metrics.

### Non-Goals (v1)

- Beating world records for large n.
- Full belief-propagation guidance (stub/optional only).
- Server-side compute (everything runs client-side).

---

## 2. Technology & Project Layout

Pure ES6 modules loaded via `<script type="module">`. No bundler; optional
small dev server for module CORS. Rendering via Canvas 2D (grid + overlays)
with an HTML/CSS control panel. Web Worker for the search loop to keep the UI
responsive.

```
experiments/3inline/
├── index.html              # Lab shell, layout, control panel markup
├── styles/
│   └── lab.css             # Layout, theme, overlay legend styling
├── src/
│   ├── main.js             # Entry: wires UI <-> state <-> renderer <-> worker
│   ├── core/
│   │   ├── grid.js         # Grid model: binary matrix M, point set
│   │   ├── geometry.js     # cross product, gcd, line descriptor normalization
│   │   ├── lineIndex.js    # incremental line index (O(k) add/remove)
│   │   ├── frontier.js     # reference-counted expansion frontier
│   │   ├── config.js       # Config object: M + lineIndex + frontier bundle
│   │   └── zobrist.js      # Zobrist hashing for tabu / dedup
│   ├── constructions/
│   │   └── parabola.js     # {(x, x^2 mod p)} warm start + reflections
│   ├── search/
│   │   ├── sublattice.js   # 3x3/5x5/7x7 sublattice + sum-preserving perms
│   │   ├── mutation.js     # mutation operator (select + perm + validate)
│   │   ├── fitness.js      # hard/soft fitness; saturation test
│   │   ├── annealing.js    # adaptive SA acceptance + cooling
│   │   ├── tempering.js    # parallel tempering replicas + swaps
│   │   ├── entropy.js      # process-entropy proxies (Hamming window)
│   │   └── solver.js       # orchestrates search loop, emits events
│   ├── worker/
│   │   └── searchWorker.js # runs solver.js off main thread, postMessage API
│   └── ui/
│       ├── renderer.js     # Canvas draw: points, lines, frontier, sublattice
│       ├── overlays.js     # toggleable layers (lines, frontier, heatmap)
│       ├── controls.js     # bind buttons/sliders to state & worker
│       ├── metrics.js      # live charts: fitness, temp, entropy, count
│       └── manualMode.js   # click-to-place, instant feedback, undo/redo
└── plan.md                 # this file
```

---

## 3. Core Data Model

### 3.1 Geometry (`core/geometry.js`)

- `cross(a, b, c)` → `(bx-ax)*(cy-ay) - (by-ay)*(cx-ax)`; zero ⇒ collinear.
- `gcd(a, b)`.
- `lineKey(p, q)` → canonical descriptor: direction `(dx,dy)` reduced by gcd
  with sign convention (first nonzero component positive), plus offset
  `c = dy*px - dx*py`. Returns a stable string key `"dx,dy,c"`.
- A line through two lattice points enumerates all lattice points satisfying
  the equation within `[0,n)²`.

### 3.2 Line Index (`core/lineIndex.js`)

Hash map `key -> Set<pointId>` recording which selected points lie on each
line. Maintains the invariant **"no key has ≥3 points"** for valid configs.

- `addPoint(p)`: for each existing selected point `q`, compute `lineKey(p,q)`,
  append. Detect violations (any line reaching 3). O(k).
- `removePoint(p)`: reverse. O(k).
- `wouldViolate(p)`: test add without committing.

### 3.3 Expansion Frontier (`core/frontier.js`)

Reference-counted blocking map `cell -> blockCount`.

- For every pair of selected points, the line they define passes through other
  lattice cells; each such empty cell gets `blockCount++`.
- `blockCount == 0` ⇒ cell is **safe** (in frontier).
- Incremental update on add/remove of a point: recompute pair-lines involving
  that point only. O(n) amortized per the plan's claim.
- Exposes `frontierCells()` and `blockCount(cell)` for the heatmap overlay.

### 3.4 Config Bundle (`core/config.js`)

Holds `M`, `lineIndex`, `frontier`, `n`, `pointCount`, Zobrist `hash`.
Provides `add`, `remove`, `clone`, `isSaturated()`, `pointList()`.

---

## 4. Constructions (`constructions/parabola.js`)

- `parabolaWarmStart(n)`: largest prime `p ≤ n`, place `{(x, x² mod p)}`.
- Optional reflections/concatenation toward ~2n points.
- Returns a valid Config (asserts via line index).
- Used by "Warm Start" button and as solver init option.

---

## 5. Search Engine

### 5.1 Sublattice & Permutations (`search/sublattice.js`)

- `pickSublattice(config, size, biasFrontier)`: choose base `(r,c)`, strides
  `(s,t)` for a `size×size` subgrid; bias toward frontier-heavy regions.
- `sumPreservingPerms(occupiedSubmatrix)`: enumerate 0/1 submatrices with the
  same row/column marginals (transportation-polytope vertices). For 3×3 this
  is a small explicit enumeration; larger sizes use elementary swap chains.

### 5.2 Mutation Operator (`search/mutation.js`)

- `mutate(config, opts)`: select sublattice → enumerate sum-preserving perms →
  pick one → apply tentatively → **global validity check** via line index →
  return `{config', delta, accepted}` or rejection.

### 5.3 Fitness (`search/fitness.js`)

- Hard: `pointCount` with `-∞` on any violation.
- Soft: `pointCount - λ * (#collinear triples)` for annealing signal.
- `isSaturated(config)`: frontier empty.

### 5.4 Annealing & Tempering (`search/annealing.js`, `search/tempering.js`)

- Adaptive cooling targeting ~0.3 acceptance rate.
- Parallel tempering: 4–8 replicas, swap adjacent every ~100 steps.
- Escape mechanism: when entropy collapses or stagnation > K steps, promote
  sublattice size (5×5/7×7) or chain moves.

### 5.5 Entropy Diagnostics (`search/entropy.js`)

- Sliding-window average Hamming distance between visited configs.
- Empirical entropy of sublattice-selection distribution.
- Emits warning when process entropy collapses (triggers escape).

### 5.6 Orchestrator (`search/solver.js`)

- Event-emitting loop: `onStep`, `onAccept`, `onSwap`, `onEscape`, `onBest`.
- Supports `step()`, `run(stepsPerTick)`, `pause()`, `reset()`.
- Maintains best-so-far config across replicas/time.

---

## 6. Worker Integration (`worker/searchWorker.js`)

- Runs `solver.js` off main thread.
- Message protocol:
  - In: `{cmd: 'init'|'step'|'run'|'pause'|'reset'|'setParams', payload}`.
  - Out: `{type: 'state'|'metrics'|'best'|'event', payload}` (throttled, e.g.
    every animation frame ~60Hz max).
- Serializes minimal state (point list, frontier sample, metrics) — not full
  index structures — to keep transfer cheap.

---

## 7. UI & Visualization

### 7.1 Renderer (`ui/renderer.js`)

Canvas layers (drawn back-to-front):

1. **Grid** lines + coordinate ticks.
2. **Blocked-cell heatmap** (frontier blockCount → color intensity).
3. **Frontier safe cells** (subtle green dots / outlines).
4. **Selected points** (solid markers).
5. **Constraint lines**: when a point is hovered/selected, draw all lines
   through it; on violation, highlight the offending collinear triple in red.
6. **Active sublattice** highlight during auto-solve (animated box + strides).

### 7.2 Overlays (`ui/overlays.js`)

Toggle layers independently: lines, frontier, heatmap, sublattice, BP marginals
(optional). Legend panel explaining colors.

### 7.3 Controls (`ui/controls.js`)

- Grid size `n` (slider, e.g. 4–50).
- Mode toggle: **Manual** / **Auto-solve**.
- Buttons: Warm Start (parabola), Clear, Step, Run/Pause, Reset, Escape Now.
- Sliders: temperature, cooling rate, replicas, sublattice size, λ (soft).
- Display target bound (~2n) and current count.

### 7.4 Metrics (`ui/metrics.js`)

Lightweight live charts (canvas):

- Point count vs. step (with ~2n reference line).
- Temperature schedule.
- Process entropy proxy.
- Acceptance rate.
- Replica fitness ladder (for tempering).

### 7.5 Manual Mode (`ui/manualMode.js`)

- Click empty cell → place point.
  - If cell is **blocked**, reject with a flash and draw the violating line(s).
  - If safe, add and update frontier/index live.
- Click selected point → remove it.
- Hover cell → preview which lines it would create / which triple it breaks.
- Undo/redo stack (config snapshots or move log).
- Live readout: current count, frontier size, saturated? badge.
- "Hint" button: highlight a frontier cell (or suggest a sublattice swap when
  saturated below optimum), reusing solver internals.

---

## 8. Interaction Flows

### Manual Solve

1. User sets `n`, optionally Warm Start.
2. Clicks to place/remove points; blocked clicks are visually rejected.
3. Frontier/heatmap update each move; saturation badge lights when stuck.
4. Hint suggests next safe cell or a rearranging sublattice move.

### Auto Solve (Observable)

1. User picks init (random valid / parabola), search strategy, params.
2. Worker runs; UI animates accepted mutations, sublattice selection, swaps.
3. Metrics stream live; escape events flash; best-so-far tracked.
4. User can Pause, single-Step, tweak temperature, force Escape.

### Hybrid

- User pauses auto-solve, hand-edits, then resumes from edited state.

---

## 9. Visual Encoding of Constraints (Summary Legend)

- **Solid marker** = selected point.
- **Green outline** = safe frontier cell (`blockCount==0`).
- **Heat color** = blocked cell, intensity ∝ number of blocking lines.
- **Thin gray line** = a line through ≥2 selected points (collinearity carrier).
- **Red line + 3 red markers** = an actual no-three-in-line violation (only in
  soft mode or during a rejected manual placement preview).
- **Animated box** = active sublattice under mutation.

---

## 10. Implementation Phases

1. **Phase 0 — Skeleton**: `index.html`, `lab.css`, `main.js`, empty modules,
   Canvas grid render at fixed n.
2. **Phase 1 — Core model**: `geometry`, `lineIndex`, `frontier`, `config`;
   unit-tested in console.
3. **Phase 2 — Manual mode**: click placement, validity feedback, frontier
   heatmap, undo/redo.
4. **Phase 3 — Constructions**: parabola warm start button.
5. **Phase 4 — Search core**: sublattice perms, mutation, fitness, hill-climb;
   run on main thread first.
6. **Phase 5 — Worker + observability**: move solver to worker, stream metrics,
   animate steps.
7. **Phase 6 — Advanced search**: adaptive SA, tabu (Zobrist), parallel
   tempering, entropy diagnostics, escape moves.
8. **Phase 7 — Polish**: overlay toggles, legend, hint system, metric charts,
   D4 canonicalization for dedup.

---

## 11. Testing & Validation

- **Unit**: line-key normalization, add/remove invariants, frontier ref-count
  correctness (brute-force cross-check on small n), parabola validity.
- **Property**: after any mutation, full O(k³) recheck must agree with the
  incremental line index (debug-only assertion).
- **Known values**: verify achievable counts match known small-n optima
  (n≤10 exhaustive references).
- **Performance**: confirm O(n) incremental updates; profile worker throughput.

---

## 12. Stretch Goals

- Belief-propagation marginals overlay (`barely-safe` vs `robustly-safe`).
- Overlap-distribution experiment: many runs, plot pairwise Hamming overlaps.
- Export/import configs (JSON), shareable URLs.
- Record/playback of a search run as an animation.
