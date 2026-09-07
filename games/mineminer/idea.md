# MineMiner

**A Minecraft-inspired implementation of Minesweeper, in the browser.**
Stack: plain HTML + [three.js](https://threejs.org/) + modular ES6 (native `import` / `export`, no bundler required).

---

## 1. High Concept

You are a miner in a sealed steel vault. The vault contains a slab of stone blocks — some of them are **mineblocks**
(explosive ore). Your job is to break every safe block and flag every mineblock without triggering a detonation.

Classic Minesweeper logic, but:

* The board is a **3D voxel grid** (1–3 layers tall), viewed and manipulated in 3D space.
* "Revealing" a cell = **destroying (mining) the block**, leaving open air.
* The proximity number of a mined block does not disappear — it stays behind as a **mostly-transparent numbered ghost**
  floating in the now-empty cell, so the player can still read the board after clearing it.
* **Marking** (flagging) a block makes it *safe to strike*: a marked mineblock will not detonate. Marks are the player's
  commitment, and also their safety harness.
* **Cascading destruction** is on by default: mining a block whose proximity count is 0 auto-clears the connected region
  of zero-count blocks and their numbered borders, exactly like classic Minesweeper's flood fill — except now it ripples
  in three dimensions.

---

## 2. The Playfield

### 2.1 Anatomy of a vault

```
ceiling  ████████████████████   <- indestructible steel (roof)
layer 2  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   <- stone / mineblocks   (levels 2+)
layer 1  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   <- stone / mineblocks
layer 0  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   <- stone / mineblocks
floor    ████████████████████   <- indestructible steel (bedrock)
```

* **Floor & ceiling**: steel plates, `y = -1` and `y = depth`. Indestructible, unflaggable, ignored by all game logic.
  They exist to frame the puzzle visually and to stop the camera (and the player's eye) from wandering into nothing.
* **Walls**: optional steel frame around the perimeter (same material, thin bevel) so the slab reads as a contained
  "vault" rather than a floating raft.
* **Play volume**: `width × depth × height` cells, `height ∈ {1, 2, 3}`. Each cell holds exactly one of: `STONE`,
  `MINE`, or `AIR` (mined out).

### 2.2 Adjacency

Proximity counts use the **full Moore neighbourhood in 3D**: all cells whose coordinates differ by at most 1 on each
axis — up to **26 neighbours** (8 in-plane + 9 above + 9 below).
The 26 neighbours split into three classes by how they touch the cell:
| Class          | Cells | Offset Manhattan length | Weight            |
|----------------|-------|-------------------------|-------------------|
| Face-connected | 6     | 1                       | always `1`        |
| Edge-connected | 12    | 2                       | `1` / `½` / `0`   |
| Point-connected| 8     | 3                       | `1` / `½` / `0`   |
A cell's number is the **weighted sum** of mines in its neighbourhood, so boards can read
`3½` as easily as `3`. A class weighted `0` leaves the neighbourhood entirely — it is ignored by
counts, by cascades, by safe-first-strike and by chording alike (so `edge=0, corner=0` *is* the old
6-adjacency ruleset). Chording compares the weighted sum of the marks around a number, not the mark
count.


With `height = 1` this degenerates exactly to classic Minesweeper's 8 neighbours, which is why level 1 feels familiar.
Every added layer roughly triples the information density of a single number, so mine ratios must drop as height grows
(see §7).

Two settings sliders (`Edge neighbours (12)` and `Corner neighbours (8)`, each `1 / ½ / 0`) let advanced players dial
the information density: all-`1` is the classic Moore ruleset, `0/0` is face-only "sonar", and `½` weights make
diagonal contacts *legible but distinguishable* from a solid face contact — a `2½` tells you far more than a `3` ever
could. Default is `1 / 1`.

---

## 3. Rules

### 3.1 Cell states

Each cell tracks two orthogonal facts:

| Field     | Values                          | Meaning                                   |
|-----------|---------------------------------|-------------------------------------------|
| `content` | `EMPTY` \| `MINE`               | Is there ore in this cell? (hidden truth) |
| `state`   | `INTACT` \| `MARKED` \| `MINED` | What the player has done to it            |
| `count`   | `0..26`, in ½ steps             | Weighted adjacent mineblocks (precomputed)|
| `known`   | `bool`                          | Has its number ever been shown?           |

### 3.2 Actions

* **Strike (mine) a block** — primary action (LMB / `E` / tap).
    * Target `INTACT`, `content = EMPTY` → becomes `MINED`. Its `count` is revealed and persists as a ghost number. If
      `count === 0`, trigger cascade (§3.4).
    * Target `INTACT`, `content = MINE` → **detonation**. Game over (or lose a life, §3.6).
    * Target `MARKED` → **safe strike**. The mark acted as a defusing charge:
        * If it *was* a mineblock, it is **defused**: the block is removed, the cell becomes
          `MINED` and is permanently rendered as a *defused ore ghost* (a dim, cracked, translucent red cube). It counts
          as correctly solved. Neighbour counts do **not**
          change — the mine still "existed" for numbering purposes.
        * If it was *not* a mineblock, striking it is a **misfire**: it clears normally, but the player pays the misfire
          cost (time penalty / score penalty / life, per settings). This is what keeps marking from being a free win
          button.
    * Target `MINED` (air) → nothing.
* **Mark / unmark** — secondary action (RMB / `Q` / long-press). Toggles `INTACT` ⟷ `MARKED`. Marks are limited to the
  known mine count by default (`Strict marks` option) so the mark counter is meaningful.
* **Probe** (optional QoL, middle-click / `F` on a revealed number): if the number of marks around a ghost number equals
  the number, strike all remaining `INTACT` neighbours at once (the classic "chord"). Fast, and dangerous if you
  mismarked.

### 3.3 Persistent numbered ghosts

This is the signature mechanic. When a block is destroyed:

* The solid mesh is removed and replaced by a **ghost marker** occupying the same cell:
  a mostly-transparent cube (`opacity ≈ 0.12`) with a glowing digit rendered on it.
* Digits are drawn as **billboarded sprites** (always facing the camera) so the number is readable from any orbit angle,
  plus a faint volumetric tint of the digit's colour so a dense cleared region still reads as a colour field at a
  glance.
* `count === 0` cells leave an *empty* ghost: no digit, only the faintest wireframe edge, so the eye passes straight
  through cleared "safe air".
* Marked mineblocks that get struck leave a **defused ghost** (red/orange, small ✕ or ore glyph), so a solved board
  still shows exactly where the mines were.

Rationale: in 3D you constantly re-orbit the board, and a classic Minesweeper board that went blank on clear would be
unreadable from a new angle. Persistent ghosts turn the cleared space into a *readable lattice* — the board becomes a
hologram of its own solution.

### 3.4 Cascading destruction (default ON)

On mining a cell with `count === 0`, run a BFS/flood fill:

```
queue <- [start]
while queue not empty:
    c <- pop(queue)
    for each n in neighbours26(c):
        if n.state != INTACT: continue        # never touch MARKED cells
        if n.content == MINE:  continue       # impossible when c.count==0, defensive
        mine(n)                               # -> MINED, number becomes known
        if n.count == 0: push(queue, n)
```

* **Marked cells are never auto-cleared.** A mark is a wall the cascade respects; this is what the idea note means by
  "marking prevents detonation" at the cascade level too — an over-eager cascade can never blow you up through a mark.
* Cascades are **animated as a chain**, not instantly: cells pop in expanding shells (~12–25 ms per shell) with a
  shockwave of dust particles and a rising crumble sound. Watching a big cascade tunnel through three layers is the
  game's biggest dopamine hit.
* `Settings → Cascade: on/off/single-layer`.
  `single-layer` restricts flood fill to the same `y` as the origin (a gentler ruleset for tall boards, keeps numbers
  legible).

### 3.5 Win condition

Win when **every** cell satisfies one of:

* `content == EMPTY && state == MINED`, or
* `content == MINE && (state == MARKED || state == MINED-via-defuse)`.

Equivalently: no `INTACT` safe blocks remain. On win: steel walls retract, the ghost lattice pulses, remaining unstruck
marked mines auto-defuse in a satisfying cascade of pops, timer freezes, score panel slides in.

### 3.6 Loss / lives

* Default: striking an unmarked mineblock **detonates** → run ends. Detonation animation: white flash, radial
  block-shatter, the struck cell and its neighbours are blown out, camera shake, all remaining mines reveal in red.
* `Settings → Lives: 1 / 3 / ∞`. With lives > 1, a detonation destroys the mine cell (marking it as a *scar*), costs a
  life and a big time penalty, and play continues. `∞` is Zen/practice mode.
* `Settings → Safe first strike` (default ON): the first struck cell and all its neighbours are guaranteed mine-free
  (mines are re-rolled after the first click, §5.2), so no run ever dies on move one, and the first move always produces
  a cascade.

---

## 4. Camera, Controls, Feel

### 4.1 Two camera modes

1. **Orbit (default)** — the "diorama" view. Orbit / pan / zoom around the slab. Best for reading the whole board. Mouse
   drag = orbit, wheel = zoom, MMB drag = pan.
2. **Miner (first person)** — the "Minecraft" view. Once you've tunnelled a pocket in the slab, you can drop in: WASD +
   mouse-look, crosshair targeting, block-highlight wireframe on the aimed face. Available on 2–3 layer boards where
   there is headroom. Collision = you cannot walk through `INTACT`/`MARKED` blocks or steel.

Press `V` to toggle. Transition is a smooth camera tween, not a cut.

### 4.2 Layer slicing

Tall boards hide their own interior. Two tools:

* **Layer isolate** (`1` / `2` / `3`, `0` = all): non-selected layers render at 15% opacity and are not
  raycast-targetable. Lets you play a 3-layer board as three 2D boards when you want to.
* **X-ray hold** (`Alt`): all `INTACT` blocks go semi-transparent so you can see ghost numbers behind them. Purely
  visual; no information is added.

### 4.3 Input map

| Input                 | Action                      |
|-----------------------|-----------------------------|
| LMB / `E`             | Strike block                |
| RMB / `Q`             | Toggle mark                 |
| MMB / `F`             | Probe (chord)               |
| Drag LMB (orbit mode) | Orbit camera                |
| Wheel                 | Zoom / (miner mode) nothing |
| `V`                   | Toggle camera mode          |
| `0`–`3`               | Layer isolate               |
| `Alt` (hold)          | X-ray                       |
| `Space`               | Pause / menu                |
| `R`                   | Restart level (same seed)   |
| `N`                   | New seed                    |
| `Z`                   | Undo (if enabled)           |

**Touch**: tap = strike, long-press = mark, one-finger drag = orbit, two-finger = pinch zoom

+ pan. On touch, a mode toggle button (⛏ / 🚩) is also offered because long-press is slow.

### 4.4 Juice checklist

* Aimed block gets a black wireframe outline + a subtle 1.02 scale-up (Minecraft-style selection box).
* Striking: 3-frame crack overlay → block shatters into 8 mini-cubes with physics-lite tumble and fade; dust puff;
  chunky "crunch" sample with pitch jitter.
* Marking: a torch/flag prop plants on the block's top face with a small squash-and-stretch bounce; a soft "clink".
* Cascade: shell-by-shell pops with an ascending pentatonic arpeggio — the bigger the cascade, the longer the melody.
* Defusing a marked mine: green sparkle + descending "safe" chime.
* Detonation: everything above.
* Ambient: low mine-shaft hum, occasional drip, dust motes drifting in a slanted light shaft.

---

## 5. Core Algorithms

### 5.1 Grid representation

Flat typed arrays for speed and trivial serialization:

    index(x, y, z) = x + width * (z + depth * y)

    content : Uint8Array   // 0 EMPTY, 1 MINE
    state   : Uint8Array   // 0 INTACT, 1 MARKED, 2 MINED, 3 SCAR
     counts  : Float32Array // 0..26 in 0.5 steps (weighted)

`neighbours26(i)` is precomputed once per board into a flat `Int32Array` of
`26 * cellCount` entries (with `-1` for out-of-bounds), so hot loops never do bounds math. A parallel
`slotWeights : Float32Array(26)` holds the weight of each neighbour slot (identical for every cell), so
counting is `c += slotWeights[k]` instead of `c++`.

### 5.2 Mine placement

1. Seeded RNG (mulberry32 from a string seed → shareable/daily boards).
2. Fisher–Yates shuffle of all cell indices; take the first `mineCount`.
3. **Safe first strike**: on the player's first strike at cell `c`, if `c` or any of its 26 neighbours holds a mine,
   relocate those mines to random cells outside the protected set (guaranteed possible while
   `mineCount + 27 <= cellCount`), then recompute counts.
4. Recompute `counts` in one pass over the neighbour table.

### 5.3 Optional: solvability guarantee

`Settings → No-guess boards` (default ON for the campaign, OFF for custom):
after placement, run a **constraint solver** in a worker:

* Repeatedly apply the two trivial rules (all-mines / all-safe around a known number).
* Then apply pairwise subset elimination on the constraint set.
* If the board stalls with `INTACT` cells remaining, nudge: swap one mine into a random free cell and retry (bounded
  attempts, then fall back to allowing guesses).

This matters far more in 3D than in 2D — 26-neighbour constraints produce nastier 50/50s, and a guess-death after five
minutes of tunnelling feels awful.

### 5.4 Cascade

BFS as in §3.4, but the *visual* reveal is decoupled from the *logical* reveal:
the solver marks all cells instantly (so the board state is never inconsistent), and pushes
`(cellIndex, delayMs)` pairs into a **reveal queue** consumed by the renderer over the next few hundred milliseconds.
Input is accepted during the animation; the queue is flushed instantly if the player clicks again.

---

## 6. Rendering Plan

### 6.1 Meshes

* **Blocks**: one `THREE.InstancedMesh` per material family (`stone`, `mine-when-revealed`, `marked`, `steel`).
  Destroying a block = swap its instance matrix to zero-scale (or move to a free list) +
  `instanceMatrix.needsUpdate = true`. A 24×24×3 board is 1728 cells — trivially fast, and instancing keeps it at a
  handful of draw calls even at 40×40×3.
* **Ghosts**: a second `InstancedMesh` with a transparent, depth-written-off,
  `blending: NormalBlending` material, plus per-instance colour (`instanceColor`) for the number's palette colour.
* **Digits**: a single `THREE.Points`/`InstancedMesh` of billboarded quads sampling a **digit atlas texture** (0–26
  rendered once into a canvas atlas at startup, MSDF-ish crisp edges via a small alpha-threshold shader). Per-instance
  UV offset selects the digit.
* **Marks**: instanced flag/torch prop, slightly emissive.
* **Steel floor/ceiling/walls**: two big boxes with a tiling steel-plate texture + normal map.

### 6.2 Materials & art direction

* Voxel/blocky silhouettes, 16×16 pixel-art textures with `NearestFilter` (Minecraft DNA), but modern lighting: one
  directional "shaft" light with soft shadows, plus a cool ambient fill and a warm bounce from the floor.
* Palette: cold grey stone, dark steel with rivets, warm torch orange for marks, numbers use the classic Minesweeper
  colour ramp extended to 26 (1 blue, 2 green, 3 red, 4 navy, 5 maroon, 6 teal, 7 black→white, 8 grey, then a perceptual
  ramp through purple/magenta for 9+).
* Post: mild bloom on emissive marks and digits, subtle vignette, optional FXAA. All toggleable via
  `Settings → Effects: low/med/high` (also the mobile fallback).

### 6.3 Performance rules

* Never allocate in the frame loop (reuse `Vector3`/`Matrix4` scratch objects).
* Raycast against a **single invisible bounding box** and compute the hit cell mathematically from the hit point + face
  normal (voxel DDA), instead of raycasting 1700 instances.
* Cap DPR at 2, `powerPreference: 'high-performance'`, `antialias` off when bloom is on.
* Target 60 fps on integrated graphics for the largest campaign board.

---

## 7. Levels & Progression

Height grows with progression, and mine **density** falls as height grows, because each number covers up to 26 cells
instead of 8.

| # | Name             | W × D × H   | Cells | Mines | Density | Notes                           |
|---|------------------|-------------|-------|-------|---------|---------------------------------|
| 1 | Surface Scratch  | 8 × 8 × 1   | 64    | 8     | 12.5%   | Tutorial: strike, mark, cascade |
| 2 | Shallow Seam     | 12 × 12 × 1 | 144   | 22    | 15.3%   | Classic beginner feel           |
| 3 | Deep Seam        | 16 × 16 × 1 | 256   | 45    | 17.6%   | Classic intermediate            |
| 4 | Double Deck      | 10 × 10 × 2 | 200   | 22    | 11.0%   | Introduces vertical adjacency   |
| 5 | The Undercut     | 14 × 14 × 2 | 392   | 47    | 12.0%   | Layer-isolate hotkeys taught    |
| 6 | Triple Threat    | 10 × 10 × 3 | 300   | 27    | 9.0%    | First 3-layer board             |
| 7 | The Vault        | 16 × 16 × 3 | 768   | 77    | 10.0%   | Campaign finale                 |
| ∞ | Custom / Endless | up to 40³   | —     | —     | —       | Sliders + seed field            |

Tutorial beats are delivered as diegetic signs bolted to the steel wall, one per new mechanic (strike → number →
cascade → mark → defuse → layers → probe), each dismissed by performing the action once.

**Stars per level**: clear it (★), clear it without a misfire or detonation (★), clear it under the par time (★). Stars
unlock cosmetic block skins (nether-ish, ice, circuitry) and the Endless mode sliders.

---

## 8. HUD & UI

* **Top-left**: mines remaining (`total − marks`), lives (pickaxe icons), timer.
* **Top-right**: layer isolate buttons `[0][1][2][3]`, camera-mode toggle, settings gear.
* **Bottom-centre**: current action mode on touch (⛏/🚩); on desktop, a one-line contextual hint that fades after the
  tutorial.
* **Board completion bar**: thin ring around the mines counter showing % of safe blocks cleared.
* **Pause / settings overlay**: cascade mode, adjacency mode, lives, safe first strike, no-guess boards, strict marks,
  undo, effects quality, volume, colourblind palette, reduced motion (kills camera shake and shortens cascade
  animation), seed display + copy.
* **End-of-run panel**: time, misfires, largest cascade, seed, ★ earned, `Retry seed` /
  `New seed` / `Next level`.
* All UI is plain DOM/CSS layered over the canvas (crisp text, accessible, no 3D text pain).

---

## 9. Architecture

### 9.1 File layout

```
games/mineminer/
  index.html
  styles/
    main.css
    hud.css
  src/
    main.js                 # bootstrap: load assets, build App, start loop
    core/
      App.js                # owns Game, Renderer, Input, UI; the frame loop
      Clock.js              # fixed-step accumulator + tween/queue scheduler
      EventBus.js           # tiny pub/sub: 'block:mined', 'cascade', 'win', ...
      rng.js                # mulberry32 + string->seed hashing
      settings.js           # defaults, load/save to localStorage
    game/
      Grid.js               # typed arrays, index math, neighbour table
      Board.js              # rules engine: strike/mark/probe/cascade/win checks
      MineGenerator.js      # placement, safe-first-strike relocation
      Solver.js             # no-guess validation (also used by hint system)
      LevelDefs.js          # the level table from §7
      GameState.js          # timer, lives, marks, score, stars, save/load
    render/
      Scene.js              # scene, lights, fog, camera rigs
      BlockRenderer.js      # instanced stone/mine/steel meshes
      GhostRenderer.js      # transparent ghost cubes + instance colours
      DigitAtlas.js         # canvas-baked 0..26 glyph atlas
      NumberSprites.js      # billboarded digit instances
      MarkRenderer.js       # flag/torch props
      Effects.js            # bloom/vignette composer, shake, flashes
      Particles.js          # dust, shatter chunks, sparkles
      Highlighter.js        # selection wireframe
    input/
      OrbitController.js
      MinerController.js    # FPS movement + collision
      Picker.js             # voxel DDA raycast -> cell index + face
      InputRouter.js        # maps device events -> intents (strike/mark/probe)
    ui/
      Hud.js
      Overlay.js            # pause/settings/end-of-run
      Tutorial.js
    audio/
      AudioBus.js           # WebAudio graph, volume, ducking
      sfx.js                # sample table + pitch-jittered one-shots
    workers/
      solver.worker.js
  assets/
    textures/  (stone.png, steel.png, ore.png, cracks.png, flag.png)
    audio/     (crunch*.wav, clink.wav, boom.wav, chime*.wav, ambience.ogg)
```

### 9.2 Separation of concerns (hard rule)

* `game/*` is **pure logic**: no three.js import, no DOM. It is deterministic given
  `(seed, settings, action list)` — which makes it unit-testable in Node and makes replays, undo, and shareable seeds
  nearly free.
* `render/*` and `ui/*` are **observers**: they subscribe to `EventBus` events emitted by
  `Board`/`GameState` and mutate their own visuals. They never mutate game state.
* `input/*` emits **intents** (`{type:'strike', cell}`), which `App` validates and forwards to `Board`. Rebinding,
  touch, and AI/autoplay all become the same code path.

### 9.3 Key APIs (sketch)

    // game/Board.js
    class Board {
      constructor(grid, opts)          // opts: {cascade, adjacency, strictMarks, lives}
      strike(cell)   -> Result         // {kind:'cleared'|'defused'|'boom'|'noop', revealed:[], delays:[]}
      toggleMark(cell) -> Result
      probe(cell)    -> Result
      isWon()        -> bool
      snapshot() / restore(s)          // for undo
    }

    // render/BlockRenderer.js
    class BlockRenderer {
      constructor(scene, grid, atlas)
      syncCell(cell)                   // read state -> update instance
      hideCell(cell, animate=true)
    }

    // input/Picker.js
    pick(camera, ndc, grid, layerFilter) -> {cell, faceNormal} | null

Events on the bus: `cell:changed`, `cascade:started`, `cascade:step`, `mine:defused`,
`mine:detonated`, `board:won`, `board:lost`, `layer:isolated`, `camera:mode`.

---

## 10. Persistence

* `localStorage['mineminer.settings']` — settings object (versioned).
* `localStorage['mineminer.progress']` — per-level best time, stars, completion.
* `localStorage['mineminer.run']` — in-progress run: seed, settings, and the **action log**
  (`[{t, type, cell}]`). Restoring a run = replay the log through a fresh `Board`
  (fast, exact, and doubles as the replay/undo mechanism).
* URL hash for sharing: `#w=16&d=16&h=3&m=77&seed=granite-42&adj=26` → deep-linked board.

---

## 11. Accessibility

* Colourblind-safe number palette option (shapes/underlines added to digits: `6̲`, `9̲`).
* `Reduced motion`: no camera shake, instant cascades, no bloom pulse.
* Full keyboard play: arrow keys / WASD move a cursor cell, `E` strike, `Q` mark,
  `Tab` cycles layers; cursor cell is announced via an ARIA live region ("layer 2, column D, row 7, number 3, 2 marks
  nearby").
* Scalable HUD text; all UI is real DOM so browser zoom works.
* Audio cues distinct enough to play by ear (mark, clear, defuse, boom are four different timbres, not four pitches).

---

## 12. Build & Dev

* **No build step required**: `index.html` uses `<script type="module" src="./src/main.js">`
  and an import map for `three`. Ships as static files.
* Optional `npm run dev` = any static server (`vite` if available, for HMR only).
* Tests: `node --test` over `game/*` (pure logic) — counts correctness, cascade never crosses a mark, safe-first-strike
  invariant, win detection, solver terminates, seeded determinism.
* Lint/format: eslint + prettier, `"type": "module"`.

---

## 13. Milestones

1. **M0 – Skeleton**: three.js scene, steel floor/ceiling, one instanced layer of stone, orbit camera, voxel picking
   with selection outline.
2. **M1 – Minesweeper works**: `Grid`/`Board`/`MineGenerator`, strike/mark, digit atlas, persistent ghosts, cascade with
   animation, win/lose. Level 1–3 playable. *This is the vertical slice.*
3. **M2 – Depth**: 2–3 layer boards, 26-neighbour counts, layer isolate, X-ray, miner (FPS) camera mode.
4. **M3 – Feel**: particles, shatter, sounds, bloom, camera shake, cascade arpeggio, tutorial signs.
5. **M4 – Meta**: level select, stars, timers, settings persistence, seeds/URL sharing, no-guess solver in a worker.
6. **M5 – Polish**: mobile/touch, accessibility pass, perf pass on integrated GPUs, block skins, endless/custom mode.

---

## 14. Stretch Ideas (post-1.0)

* **TNT blocks**: non-mine blocks that, when struck, blow a 3×3×3 hole — free clearing, but they detonate any unmarked
  mine they touch. Risk/reward tool.
* **Water**: mining a water-adjacent cell floods the cascade region and *reveals* nothing; forces you to plan drainage
  order.
* **Sonar / hint pickaxe**: consumable that safely reveals one cell the solver can prove; earned by clearing without
  misfires.
* **Daily Vault**: date-seeded board, shared leaderboard of times, single attempt.
* **Bedrock caves**: non-rectangular play volumes carved by 3D noise — organic mine shafts rather than a slab, with
  numbers wrapping around cave walls.
* **Co-op**: two miners, shared board, WebRTC; marks are visible to both, and only the marker can safely strike their
  own mark.
* **Speed mode**: no marks allowed, no lives, pure cascade-chaining time attack.
* **Editor**: place mines by hand, export a seed/URL, share hand-crafted puzzles.

---

## 15. Design Notes / Open Questions

* **Is 26-adjacency too information-dense?** A single `13` is nearly unreadable as a constraint. Mitigation: density
  caps in §7, and the option to fall back to 6-adjacency. Playtest whether 3 layers is genuinely fun or whether 2 is the
  sweet spot.
* **Misfire cost tuning.** If striking a wrong mark is cheap, "mark everything, strike everything" becomes optimal.
  Current answer: a misfire costs a life on Lives 1/3 (i.e. it is exactly as fatal as a wrong strike) and only a time
  penalty in Zen. Needs playtesting; an alternative is that a misfire *consumes* the mark and locks the cell for 5
  seconds.
* **Ghost clutter.** A fully cleared 16×16×3 board is 768 translucent cubes. Mitigation:
  zero-count ghosts render as almost nothing, and digits fade with distance/angle. Fallback option:
  `Ghosts: full / numbers-only / off`.
* **Should the ceiling be removable?** A "lift the lid" animation on level start reads beautifully and helps the orbit
  view; the ceiling can slide away and return as a thin outline frame.