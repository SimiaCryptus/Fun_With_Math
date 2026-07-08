# Number Crush

A match-and-clear puzzle game driven by arithmetic logic. See
`../../idea.md` and `../../plan.md` for the full design and plan.

## Status

Milestones 0–3 implemented:

- **M0** — Scaffolding: HTML page, canvas, ES modules, Vitest tests.
- **M1** — Board model & static rendering: hex-packed grid of numbered
  tiles.
- **M2** — Selection & input: drag to draw a contiguous, non-repeating
  line (2–4 tiles) with a live sum indicator and drag-back support.
- **M3** — Rule engine (Sum equals X): valid selections clear and score;
  invalid selections give gentle feedback.

> Note: gravity/refill (M4) is not yet implemented. Cleared tiles are
> temporarily refilled in place with fresh values so play can continue.

## Running

```bash
npm install
npm run dev      # start the dev server, open the shown URL
npm test         # run unit tests
```

You can also open `index.html` directly via any static file server
(ES modules require http://, not file://).

## Controls

- **Drag** across adjacent tiles to build a selection.
- Drag **back** onto the previous tile to shorten the selection.
- **Release** to resolve: tiles summing to the target (default 10)
  clear and award points.

## Structure

See `../../plan.md` §6 for the intended directory layout. Modules
implemented so far:

- `src/model/` — `coords.js`, `HexGrid.js`, `Tile.js`, `Board.js`
- `src/rules/` — `RuleEngine.js`, `rules/sumEquals.js`
- `src/input/` — `Selection.js`, `InputController.js`
- `src/render/` — `Renderer.js`
- `src/game/` — `Game.js`, `ScoreManager.js`
- `test/` — unit tests for coords/grid, rule engine, selection
