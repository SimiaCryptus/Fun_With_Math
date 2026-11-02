# Coupled Uncertain Theory Trees — interactive demonstrator

Browser demonstrator and first executable implementation of the fixed-tree core
of `idea.md` (§5.1–5.7). See `plan.md` for the design.

## Run

    python3 -m http.server 8000
    # open http://localhost:8000/index.html      (app)
    # open http://localhost:8000/tests.html      (browser test runner)

Modules do not load from `file://`. Three.js is loaded from a pinned CDN
(0.160.0) through the import map in `index.html`. For offline use, put
`three.module.js` and `examples/jsm/controls/OrbitControls.js` under `vendor/`
and point the import map there.

## Test

    node --test tests/

## Layout

- `src/core/` — pure, deterministic, DOM-free engine. It never sees latent truth (enforced by a test).
- `src/eval/` — evaluation metrics and oracle B6-T (reads latent truth).
- `src/data/` — generators, corruption, scenario registry.
- `src/viz/`, `src/ui/` — three.js scene and DOM panels (read-only on core state).

## Status vs plan milestones

M0–M7 implemented (fixed-tree core, all fixed-tree scenarios, safeguard toggles).
M8 (structural learner, S5) not implemented; incremental recompilation, which M8
needs, is implemented and tested.