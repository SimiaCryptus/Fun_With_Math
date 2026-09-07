# 0x800 — hexadecimal 2048 on a hex grid

> **Pitch:** It's 2048, except the board is a hexagon made of hexagons, tiles
> slide in six directions, and every tile value is written in base 16. You win
> when you build `0x800` (2048 decimal). The name, the goal, the board, and the
> numbering all rhyme: _hex_ everywhere.

A single-page game: **HTML + CSS + vanilla ES6 modules**, no build step, no dependencies, no network. Open `index.html`
and play.

---

## 1. Goals & non-goals

### Goals

- Feel _identical in muscle memory_ to 2048: slide, merge, spawn, repeat.
- Six-direction movement that reads naturally on a hex board.
- Pure-logic core (`hex.js`, `game.js`) with **zero DOM access**, so it can be unit-tested in node and reasoned about.
- Smooth 60fps tile animation using CSS transforms only.
- Playable with keyboard, touch swipe, and on-screen buttons.
- Total payload < 50 KB, works offline, works from `file://`.

### Non-goals (v1)

- No accounts, leaderboards, or telemetry.
- No AI solver / autoplay (see stretch goals).
- No multiplayer.

---

## 2. The board

### 2.1 Shape

A **hexagon of hexagons** with radius `N` (default `N = 2`, 19 cells). Cell count is `3N² + 3N + 1`:

| N   | cells | difficulty                           |
| --- | ----- | ------------------------------------ |
| 1   | 7     | toy / tutorial                       |
| 2   | 19    | **default** — comparable to 4x4 2048 |
| 3   | 37    | relaxed, long game                   |
| 4   | 61    | sandbox                              |

Cells are **pointy-top** hexes, so the six move directions are
`E, W, NE, NW, SE, SW` (there is no "straight up").

```
              _____
             /     \
       _____/  0,-2 \_____
      /     \       /     \
     / -1,-1 \_____/  1,-2 \        ... a radius-2 board, 19 cells,
     \       /     \       /            axial coordinates (q,r)
      \_____/  0,-1 \_____/
      /     \       /     \
     / -1, 0 \_____/  1,-1 \
     \       /     \       /
      \_____/  0, 0 \_____/
            \       /
             \_____/
```

### 2.2 Coordinates

Use **axial coordinates** `(q, r)` with the implicit cube coordinate
`s = -q - r`, so `q + r + s === 0` always.

A cell is on the board iff:

```js
const inBoard = (q, r, N) => Math.abs(q) <= N && Math.abs(r) <= N && Math.abs(q + r) <= N;
```

Cells are stored in a `Map` keyed by the string `` `${q},${r}` ``, or in a flat array with a precomputed index map —
either is fine, but the _canonical cell order_ must be deterministic (row-major by `r`, then `q`) so that saves,
replays, and tests are stable.

### 2.3 Pixel layout (pointy-top)

```js
// size = circumradius of one hex in px
const x = size * Math.sqrt(3) * (q + r / 2);
const y = size * (3 / 2) * r;
// board pixel size: width  = size * sqrt(3) * (2N + 1)
//                   height = size * (3N + 2) / 2 * ... (see render.js)
```

Everything is drawn centered on `(0,0)` and translated by half the viewport, so the board is symmetric and resizing is a
single CSS variable change.

---

## 3. Movement

### 3.1 The six directions

In axial `(dq, dr)` with derived `ds = -dq - dr`:

| name | key | axial      | cube         | invariant | sort key (descending = farthest first) |
| ---- | --- | ---------- | ------------ | --------- | -------------------------------------- |
| E    | `D` | `(+1,  0)` | `(+1, 0,-1)` | `r`       | `q - s`                                |
| W    | `A` | `(-1,  0)` | `(-1, 0,+1)` | `r`       | `s - q`                                |
| NE   | `E` | `(+1, -1)` | `(+1,-1, 0)` | `s`       | `q - r`                                |
| SW   | `Z` | `(-1, +1)` | `(-1,+1, 0)` | `s`       | `r - q`                                |
| NW   | `W` | `( 0, -1)` | `( 0,-1,+1)` | `q`       | `s - r`                                |
| SE   | `C` | `( 0, +1)` | `( 0,+1,-1)` | `q`       | `r - s`                                |

Note the pleasing fact: **each direction leaves exactly one cube coordinate constant**, which is precisely the "line"
(row) grouping we need. Every step in direction `d` increases the dot product `cell · d` by exactly 2, so the dot
product is a valid monotone ordering along each line.

### 3.2 The move algorithm

```js
function move(state, dir) {
  const lines = groupCellsByInvariant(state.cells, dir); // Map<inv, cell[]>
  const events = []; // animation instructions
  let moved = false,
    gained = 0;

  for (const line of lines.values()) {
    line.sort((a, b) => dot(b, dir) - dot(a, dir)); // far edge first
    const out = []; // compacted tiles
    for (const cell of line) {
      const tile = state.tiles.get(key(cell));
      if (!tile) continue;
      const top = out[out.length - 1];
      if (top && top.value === tile.value && !top.mergedThisMove) {
        top.value *= 2;
        top.mergedThisMove = true;
        gained += top.value;
        events.push({ type: 'merge', id: tile.id, into: top.id });
      } else {
        out.push(tile);
      }
    }
    // write compacted tiles back onto the first out.length cells of the line
    out.forEach((tile, i) => {
      const target = line[i];
      if (!sameCell(tile.at, target)) moved = true;
      events.push({ type: 'slide', id: tile.id, from: tile.at, to: target });
      tile.at = target;
    });
  }
  return {
    moved: moved || events.some((e) => e.type === 'merge'),
    gained,
    events,
  };
}
```

Rules, identical to classic 2048:

- A tile may participate in **at most one merge per move**
  (`4 4 4 4` → `8 8`, never `10`).
- Merges resolve from the **destination edge inward**, so `4 4 4` → `8 4`.
- A move is **legal** iff at least one tile changed cell or merged. Illegal moves do not spawn a tile, do not increment
  the move counter, and trigger a short "nudge" shake animation.

### 3.3 Spawning

After every legal move, spawn one tile in a uniformly random empty cell:

- `0x1` with probability 90%
- `0x2` with probability 10%

The board starts with **two** spawned tiles.

RNG is a seedable `mulberry32` so tests are deterministic and a "share seed"
feature is possible later:

```js
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### 3.4 Game over

Game is over when the board is full **and** no two adjacent cells hold equal values. Checking three of the six
directions suffices (adjacency is symmetric):
`E`, `SE`, `SW`.

### 3.5 Win

The first time a `0x800` tile is created: fire the win overlay, record it in the save, and offer **Keep going** / **New
game**. After "keep going", play continues up to `0x8000` (the largest value that fits nicely on a tile) and beyond if
the player is a machine.

---

## 4. Hexadecimal theming

This is the whole joke, so lean into it hard.

### 4.1 Tile labels

Values are powers of two rendered as uppercase hex, no prefix on the tile face:

```
  1  2  4  8  10  20  40  80  100  200  400  800  1000  2000  4000  8000
```

```js
const label = (v) => v.toString(16).toUpperCase();
```

Nice consequence: labels are at most **4 characters**, versus 5 for decimal
`65536`, so tiles stay legible at small sizes. The rhythm `1 2 4 8` repeating every four steps is a visual metronome for
the player, and each new "digit place" (`10`, `100`, `800`) feels like a milestone.

### 4.2 Palette

Sixteen steps, one per exponent, hue rotating through the wheel and saturation climbing. Defined as CSS custom
properties so themes swap trivially:

```css
:root {
  --tile-1: #f5f0e6;
  --tile-1-fg: #6b6252; /* 1     */
  --tile-2: #efe4cf;
  --tile-2-fg: #6b6252; /* 2     */
  --tile-4: #f4b183;
  --tile-4-fg: #201a12; /* 4     */
  --tile-8: #ef8354;
  --tile-8-fg: #fdf9f3; /* 8     */
  --tile-10: #e5533d;
  --tile-10-fg: #fdf9f3; /* 10  = 16   */
  --tile-20: #d13b6e;
  --tile-20-fg: #fdf9f3; /* 20  = 32   */
  --tile-40: #a63bd1;
  --tile-40-fg: #fdf9f3; /* 40  = 64   */
  --tile-80: #6c4bd1;
  --tile-80-fg: #fdf9f3; /* 80  = 128  */
  --tile-100: #3b6bd1;
  --tile-100-fg: #fdf9f3; /* 100 = 256  */
  --tile-200: #2f9bc9;
  --tile-200-fg: #fdf9f3; /* 200 = 512  */
  --tile-400: #22b39a;
  --tile-400-fg: #06201c; /* 400 = 1024 */
  --tile-800: #ffce3a;
  --tile-800-fg: #2a2000; /* 800 = 2048 — WIN */
  --tile-1000: #b8ff3a;
  --tile-1000-fg: #12200a;
  --tile-2000: #6cffd1;
  --tile-2000-fg: #04211a;
  --tile-4000: #ff6cd1;
  --tile-4000-fg: #22041a;
  --tile-8000: #101014;
  --tile-8000-fg: #ffce3a; /* the void */
}
```

`0x800` gets the only gold tile on the board — it is the trophy.

### 4.3 Chrome & copy

- Monospace everywhere (`ui-monospace, "SF Mono", Menlo, Consolas, monospace`).
- Score panels: `SCORE 0x1A4` with a click-to-toggle **HEX / DEC** switch.
- Move counter shown as `0x2F`, time as `mm:ss` (some things stay decimal).
- Empty cells rendered as faint `··` like a hex dump's padding.
- Status line messages in the style of a debugger:
  `> merged 0x40 + 0x40 = 0x80`, `> spawn 0x1 @ (-1,2)`, `> no move: W`.
- Win overlay: `0x800 REACHED` with the byte value `2048` beneath it.
- Lose overlay: `SEGMENTATION FAULT — board full`.

---

## 5. Input

### 5.1 Keyboard

The six QWERTY keys around `S` form a hexagon; map them to the six directions exactly as they sit on the keyboard:

```
    W   E          NW  NE
  A   S   D   →   W       E
    Z   C          SW  SE
```

Also bound:

- **Numpad**: `7 9 / 4 6 / 1 3` → `NW NE / W E / SW SE`
- **Arrows**: `←` = W, `→` = E, `↑` = NW, `↓` = SE. Hold **Shift** to mirror the diagonals: `Shift+↑` = NE, `Shift+↓` =
  SW. (Arrows are the fallback; a hint tooltip nudges players toward `WEADZC`.)
- `U` or `Ctrl+Z` — undo
- `R` — new game (with confirm if score > 0)
- `?` — help overlay
- `Esc` — dismiss overlay

Key handling uses `event.code` (`KeyW`, `Numpad7`) so non-QWERTY layouts keep the _physical_ hexagon.

### 5.2 Touch / pointer

Track `pointerdown` → `pointerup`. If distance > 24px, compute
`angle = atan2(dy, dx)`, snap to the nearest of the six direction angles (0°, 60°, 120°, 180°, 240°, 300° for
pointy-top), and move. Any swipe within ±30° of a direction counts, so the whole circle is covered — no dead zones.

`touch-action: none` on the board; the rest of the page stays scrollable.

### 5.3 On-screen buttons

A hexagonal ring of six arrow buttons under the board (visible on touch devices, `opacity: .35` on desktop until hover).
They are real `<button>`s with
`aria-label="move north-east"` so screen readers and keyboard tabbing work.

---

## 6. Rendering & animation

**Approach: absolutely-positioned DOM nodes + CSS transforms.** Chosen over canvas because text rendering is free,
theming is CSS, and accessibility is possible. Chosen over SVG because transform animation on `<div>` is cheaper.

- The board container is `position: relative`, sized in `px` from `--hex-size`.
- Each **cell** is a static `.cell` div with a CSS `clip-path` hexagon, positioned once at init.
- Each **tile** is a `.tile` div with a stable `id`, positioned by
  `transform: translate3d(x, y, 0)`; sliding is just changing that transform with `transition: transform 90ms ease-out`.

```css
.cell,
.tile {
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
```

### Animation timeline for one move (~180ms total)

1. `t=0` — apply new transforms to every moving tile (90ms slide).
2. `t=90` — remove the absorbed tile of each merge; the survivor gets class
   `.pop` (scale 1 → 1.18 → 1, 110ms) and updates its label/color.
3. `t=100` — insert the spawned tile with class `.spawn`
   (scale 0.1 → 1, opacity 0 → 1, 120ms).
4. Input is queued (not dropped) during the animation; at most one pending move is buffered so fast players never feel
   input lag.

`@media (prefers-reduced-motion: reduce)` collapses all durations to 0ms and disables the shake.

### Layout responsiveness

A single `ResizeObserver` on the wrapper recomputes
`--hex-size = clamp(18px, min(vw, vh) / (2N + 2), 56px)` and re-lays cells; tiles inherit position from the same
formula, so there is one source of truth.

---

## 7. State, persistence, undo

### 7.1 Game state shape

```js
/** @typedef {{ id:number, value:number, q:number, r:number }} Tile */
const state = {
  version: 1,
  radius: 2,
  seed: 1234567,
  rngCalls: 42, // replay/restore the RNG stream exactly
  tiles: [
    /* Tile[] */
  ],
  nextTileId: 37,
  score: 0,
  best: 0,
  moves: 0,
  startedAt: 1700000000000,
  elapsedMs: 0,
  won: false, // reached 0x800 at least once
  keptGoing: false,
  over: false,
};
```

### 7.2 localStorage

| key              | contents                                   |
| ---------------- | ------------------------------------------ |
| `0x800:state:r2` | JSON of the live game, per radius          |
| `0x800:best:r2`  | best score for that radius                 |
| `0x800:prefs`    | `{ theme, hexScore, sound, reduceMotion }` |

Saved (debounced 250ms) after every move; loaded on boot with a `version`
check — unknown versions are discarded rather than migrated in v1.

### 7.3 Undo

A ring buffer of the last **10** states (structured-cloned before each move). Undo restores score, tiles, move count,
and `rngCalls`. Undo is free but tracked: the results screen shows `undos: 0x3`, and a run with zero undos gets a ★ next
to the score.

---

## 8. File layout

```
  games/0x800/
    index.html         # markup, inline critical CSS, <script type="module">
    styles.css         # layout, hex clip-paths, palette, themes, animations
    idea.md            # this document
    src/
      hex.js           # coordinate math: axial<->cube, neighbors, lines,
                       # ring/spiral generation, pixel layout. Pure.
      rng.js           # mulberry32 + counted wrapper
      game.js          # createGame, move, spawn, isOver, serialize/deserialize.
                       # Pure — no DOM, no timers.
      render.js        # builds cells/tiles, applies transforms, runs the
                       # animation timeline
      input.js         # keyboard, pointer/swipe, on-screen buttons -> dir
      storage.js       # localStorage load/save/prefs
      ui.js            # score panels, overlays, status log, theme switch
      main.js          # wiring: load state -> render -> input loop
    test/
      hex.test.js
      game.test.js
      run.js           # tiny zero-dep runner: `node test/run.js`
```

### Module contracts (public API sketch)

```js
  // hex.js
export const DIRS;                        // [{name,q,r,angle,key}, ...] x6
export function cells(radius);            // canonical-ordered [{q,r}]
export function key(q, r);                // "q,r"
export function neighbor(cell, dir);

export function lines(radius, dir);       // cell[][] ordered far-edge-first
export function toPixel(q, r, size);      // {x, y}

// game.js
export function createGame({radius, seed});

export function move(state, dirName);     // -> {state, moved, events, gained}
export function isOver(state);

export function serialize(state)

/
deserialize(json);
```

`game.move` is **pure**: it returns a new state plus an `events` array; it never mutates its input and never touches the
DOM. That is what makes the tests boring and the animations easy.

---

## 9. Testing

Zero-dependency: `node --test` (or the tiny `test/run.js` harness) over the pure modules.

Cases to cover:

- `hex`: cell counts `3N²+3N+1` for N=0..4; every cell has ≤6 neighbors and exactly 6 iff not on the rim; `lines()`
  partitions the board for all six directions; sort order is monotone along a line.
- `game`: `4 4 4 4` → `8 8`; `4 4 4` → `8 4` in the direction of travel; a tile never double-merges; illegal move
  returns `moved:false` and spawns nothing; full-but-mergeable board is not game over; full-and-unmergeable is; score
  equals the sum of all merge results; `deserialize(serialize(s))` is a deep-equal round trip; fixed seed + fixed move
  list reproduces a fixed final board (golden test).
- Property test: after any random legal move sequence, the multiset of tile values always sums to `spawnedTotal`
  (conservation of value).

---

## 10. Accessibility

- All controls are focusable `<button>`s; the board itself is
  `role="grid"`-ish with an `aria-label` describing the position and value of every tile, regenerated after each move.
- An `aria-live="polite"` status region announces
  `"moved north-east, merged 40 and 40 into 80, score 0x1A4"`.
- Never color-only: every tile shows its number; a **high contrast** theme ships alongside the default and dark themes.
- Full keyboard play, visible focus rings, respects
  `prefers-reduced-motion` and `prefers-color-scheme`.
- Target contrast ratio ≥ 4.5:1 for every tile fg/bg pair (checked in a test).

---

## 11. Milestones

| #   | deliverable                                                       |
| --- | ----------------------------------------------------------------- |
| M0  | `hex.js` + tests: coordinates, board generation, line grouping    |
| M1  | `game.js` + tests: slide/merge/spawn/over, pure and deterministic |
| M2  | Static render: draw the radius-2 board and tiles, no animation    |
| M3  | Keyboard input + full game loop, score, new game, game over       |
| M4  | Animation timeline, spawn/pop/shake, input queueing               |
| M5  | Touch swipe + on-screen buttons + responsive sizing               |
| M6  | Persistence, undo, best score, HEX/DEC toggle, themes             |
| M7  | Accessibility pass, help overlay, polish, README + screenshot     |

---

## 12. Stretch goals

- **Radius selector** (7 / 19 / 37 / 61 cells) with per-size best scores.
- **Daily seed**: everyone gets the same tile sequence; share a result string of hex digits, Wordle-style —
  `0x800 · daily #0x2A · score 0x3F1C · 0x1CE moves`.
- **Replay / share**: seed + direction string (`DEWACZ...`) is a complete replay; encode to a URL hash and add a
  scrubber.
- **Solver**: expectimax over the 6 directions with a monotonicity + free-cell heuristic, exposed as a "hint" arrow and
  an autoplay toggle.
- **Sound**: three short synthesized blips via WebAudio (slide, merge, win), pitch rising with the exponent — a merge
  chain becomes an arpeggio.
- **Nibble mode**: hard variant where the board is radius 1 (7 cells) and the goal is `0x40`.
- **Endian mode**: joke variant where the board mirrors horizontally each move.
- **PWA**: manifest + service worker for install-and-play-offline.
