# Solar Trader — Dev Notes

## Overview

Solar Trader is a browser-based space trading simulation built with Three.js.
Players pilot a ship through a simplified solar system, trading goods between
stations, managing propellant/Δv budgets, and progressing through in-game time
via a warp-speed time control system.

## Navigation

A link back to the site root ("HOME") is provided in the top bar (`#btn-home`),
allowing players to return to the games index at any time.

## Layout Structure

- `#viewport` — fullscreen WebGL canvas (`#gl`) plus an overlay `#labels` div
  for HTML-based object labels (stations, targets, etc).
- `#topbar` — fixed header showing:
  - Current in-game date
  - Time warp controls (pause, 1d, 4d, 16d, 64d)
  - Credits, Δv, propellant, and cargo hold readouts
  - Status indicator
  - SAVE / LOAD buttons and HOME link
- `#panel-left` — navigation panel (`#nav-root`) for plotting courses,
  selecting destinations, and viewing porkchop transfer plots.
- `#panel-right` — tabbed trade panel (`#trade-root`) with MARKET, SHIPYARD,
  and CONTRACTS tabs.
- `#logbar` — scrolling event log fixed to the bottom of the screen.

## Styling

- Dark, HUD-inspired theme using CSS variables (`--bg`, `--panel`, `--cyan`,
  `--amber`, `--magenta`, `--good`, `--bad`) defined in `:root`.
- Monospace font stack for a technical/console aesthetic.
- Reusable component classes: `.tbtn` (toolbar button), `.btn` (action button),
  `.item` (list entries), `.row` (key/value display rows), and
  `table.mkt` (market data tables).

## Scripts

- Uses native ES module import maps to load `three` and `three/addons/`
  directly from unpkg (no bundler required).
- Main game logic lives in `./src/main.js`.

## Follow-ups

- Verify `#btn-home` styling matches other toolbar buttons across browsers
  (anchor vs button element defaults).
- Confirm root `/` route resolves correctly relative to deployment path
  (e.g., if hosted under a subdirectory, adjust the href accordingly).
