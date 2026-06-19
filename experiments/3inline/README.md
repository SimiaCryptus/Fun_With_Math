# No-Three-in-Line Explorer

An interactive, browser-based laboratory for exploring the classic
**no-three-in-line problem**: place as many points as possible on an _n×n_
grid so that **no three of them are collinear** — not just horizontally,
vertically, or diagonally, but along _any_ straight line of _any_ rational
slope.

The target for large grids is roughly **2n points** (the best known bound).
Can you reach it by hand? Can the built-in entropic search solver do better?

---

## Quick Start

This is a zero-build, pure ES-module web app. You only need a static file
server (browsers block ES-module loading from `file://`).

```bash
# Option A: the bundled npm script (uses http-server)
npm run serve
# then open http://localhost:8090

# Option B: any static server you like
python3 -m http.server 8090
# then open http://localhost:8090
```

Open `index.html` through the server and start placing points.

---

## What You Can Do

The app has two modes, switchable at any time from the control panel.

### 🖐 Manual Mode (solve it yourself)

- **Click an empty cell** to place a point.
- **Click a point** to remove it.
- **Blocked cells flash red** with the offending line if a placement would
  create three-in-a-line — so you get instant feedback on why a move is
  illegal.
- **Hover** any cell to preview where it sits.
- **Undo / Redo** your moves.
- **Hint** highlights a safe cell you can still legally fill (or warns you
  when the board is _saturated_ and the only way forward is to rearrange).

### 🤖 Auto-Solve Mode (watch the algorithm work)

A discrete optimization engine searches for dense configurations using:

- a **parabola warm start** (the classic `{(x, x² mod p)}` construction),
- **sublattice mutations** that rearrange points while respecting structure,
- **simulated annealing** with adjustable temperature and cooling,
- a **tabu list** to avoid revisiting configurations,
- and **escape mechanisms** that kick in when the search stagnates.

Controls:

- **Step** – advance the search one move at a time.
- **Run / Pause** – let it search continuously.
- **Escape** – manually trigger a larger perturbation to break out of a rut.
- Sliders for **temperature**, **cooling rate**, and **sublattice size**.

> Keyboard shortcuts (in auto mode): **Space** = single step, **r** =
> run/pause toggle.

---

## Visual Legend

The grid overlays let you _see_ the constraint structure directly:

| Marker          | Meaning                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| 🟡 solid dot    | a selected point                                                          |
| 🟢 green dot    | a **safe** cell (a point can still be added here)                         |
| 🔴 heat tint    | a **blocked** cell — color intensity shows how many lines pass through it |
| gray line       | a **carrier line** through two or more selected points                    |
| red line + dots | an actual three-in-a-line **violation**                                   |
| purple box      | the **sublattice** currently being mutated (auto mode)                    |

Toggle any overlay on or off in the **Overlays** section of the panel.

---

## Reading the Metrics

The panel shows a live snapshot of the search:

- **Points / target** – current count vs. the ~2n goal.
- **Frontier** – number of cells where a point can still be safely added.
- **Saturated** – `YES` when no single point can be added without a violation.
- **Best** – best (densest) configuration found so far.
- **Step** – number of search iterations.
- **Entropy** – a process-diversity proxy; a collapse signals the search is
  stuck and triggers an escape.
- **Diagonal** – how concentrated points are near the main diagonals (used
  only as a tie-breaker between equally good configurations).
- **Accept rate** – fraction of proposed moves accepted.

A small live chart plots point count over time against the target line.

---

## Tips

- **Start from a Warm Start.** The parabola construction gives a strong,
  collinearity-free starting configuration that's much easier to improve than
  an empty board.
- **When you get stuck (saturated), don't give up** — the only way to do
  better is usually to remove a point and rearrange. That's exactly what the
  auto-solver's sublattice moves do.
- **Hybrid workflow:** pause the solver, hand-edit the board, and resume from
  your edited state.
- **Bigger grids are harder.** Use the `n` slider (4–50) to scale difficulty.

---

## How It Works (Briefly)

The core trick that makes this fast is an **incremental line index**: instead
of re-checking every triple of points (O(k³)) after each move, the app keeps a
hash map from each line to the points on it, so adds and removals cost only
O(k). A **reference-counted frontier** tracks, for every empty cell, how many
lines already pass through it — cells with a count of zero are safe.

For the full mathematical and algorithmic background — the parabola
construction, sublattice marginal-preserving moves, simulated annealing,
parallel tempering, and the role of entropy in the search — see
[`idea.md`](idea.md). The implementation roadmap is in [`plan.md`](plan.md),
and an honest assessment of what's novel vs. standard is in
[`novelty.md`](novelty.md).

---

## Development

```bash
npm test        # run the unit tests (mocha)
npm run serve   # serve the app locally
```

Tests cover the line index, frontier, tabu list, warm-start validity, and the
invariant that the solver never produces an illegal (three-in-line)
configuration.

The codebase is plain ES modules under `src/` — no bundler, no transpiler:

- `src/core/` – geometry, line index, frontier, config, hashing.
- `src/constructions/` – the parabola warm start.
- `src/search/` – mutation, fitness, annealing, entropy, the solver loop.
- `src/ui/` – Canvas renderer, metrics chart, manual-mode helpers.

---

## License

See repository for license details.
