# 0x800

It's 2048, except the board is a hexagon made of hexagons, tiles slide in
**six** directions, and every value is written in base 16. Build `0x800`
(2048) to win.
Pure vanilla HTML/CSS/JS — no build step, no dependencies, no network,
no accounts. A single-page game you can open straight from disk.

## Play

Open `index.html` — no build step, no dependencies, works from `file://`
and offline.

- **Keys:** `W E / A D / Z C` form a hexagon around `S` (physical keys, any
  layout). Arrows and numpad work too. `U` undo · `R` new game · `?` help.
- **Touch:** swipe the board in any of six directions, or tap the hex pad.
- Click **SCORE** to toggle HEX / DEC. The help overlay has a board-size
  selector (7 / 19 / 37 / 61 cells) and themes (auto / light / dark / high
  contrast).

## Develop

```
node test/run.js      # zero-dependency tests for hex.js, game.js, palette
```

`src/hex.js` and `src/game.js` are pure (no DOM); `move()` returns a new
state plus an `events` array which `render.js` turns into the animation
timeline. See `idea.md` for the design document.
