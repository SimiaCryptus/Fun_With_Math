# Tomb Crawler — Game Design Document

## 1. Summary

Tomb Crawler is an endless maze-collection game in the spirit of the "endless 256"
style of mobile arcade game. The player guides a small explorer through an
unbounded, procedurally generated **hexagonal** labyrinth of ancient ruins,
collecting coins while avoiding wandering tomb creatures. Explosives are the
core powerup system: they are single-use inventory items that the player decides
when to deploy.

- **Platform:** Desktop and mobile browsers
- **Tech:** Plain HTML + modular ES6 (native `import`/`export`, no bundler required) + three.js
- **Session length:** 2–10 minutes per run
- **Core loop:** Explore → collect coins → pick up explosives/multipliers → survive → push score higher

### Key differences from the genre template

| Genre convention                  | Tomb Crawler                                              |
|-----------------------------------|-----------------------------------------------------------|
| Square grid, 4 directions         | Hex grid, 6 directions                                    |
| Chasing "doom" wall/horizon       | No horizon; the pressure comes from resource depletion    |
| Collectibles respawn / refill     | Coins never respawn; collected or destroyed is permanent  |
| Timed "power mode" pickup         | Bombs are inventory items used on demand                  |
| Single powerup type               | Bombs, incendiaries, shaped charges, score multipliers    |

### Visual / thematic constraints

- Do **not** use any pac-man or ghost imagery: no chomping yellow disc, no pellets
  as dots-in-a-row with a mouth, no floating sheet-like ghosts, no "frightened
  blue" enemy mode.
- Theme: a sunken tomb / ruined temple. Sandstone floors, carved walls, torchlight,
  gold coins, scarabs, stone guardians.

---

## 2. Core Gameplay

### 2.1 The player

- Represented as a small explorer figure (or a stylised lantern-bearer) viewed from above.
- Occupies exactly one hex cell at a time and moves cell-to-cell with smooth interpolation.
- Has a **facing direction** (one of 6 hex directions); this matters for shaped charges.
- Moves continuously in the current direction until blocked by a wall
  (genre-standard "keep moving" behaviour). The player may queue a turn which is
  applied as soon as the target neighbour is open.
- Starts with **3 lives**. Contact with an enemy costs a life and grants ~2 seconds
  of invulnerability (flashing), during which the player can escape.
- Run ends when lives reach 0.

### 2.2 Coins

- Gold coins sit on floor cells. Walking onto a cell collects its coin.
- Base value: 10 points. Occasional **coin piles** (rarer) are worth 50.
- Coins **never respawn**. Once a region is harvested, it stays empty, which pushes
  the player to keep exploring outward.
- Explosions **destroy coins** in their blast area (no points awarded). This is the
  main cost of using bombs carelessly.

### 2.3 Pressure without a doom horizon

Since nothing chases the player off the map, tension comes from:

1. **Depletion:** nearby coins run out, forcing travel through unexplored, riskier areas.
2. **Difficulty by distance:** enemy density, speed and variety scale with the distance
   from the origin cell (and weakly with elapsed time).
3. **Multiplier timers:** active multipliers reward staying in coin-dense unexplored areas.
4. **Limited explosives:** bombs are finite and must be found.

### 2.4 Scoring

- `score += coinValue × activeMultiplier`
- Destroying an enemy with an explosive: 100 × multiplier.
- Destroying a destructible wall: 5 (no multiplier) — small reward for opening paths.
- Distance bonus on death: `maxDistanceReached × 2`.
- High score and best distance stored in `localStorage`.

---

## 3. The Hex World

### 3.1 Coordinate system

- **Axial coordinates** `(q, r)` with implicit `s = -q - r`.
- **Pointy-top** hexes (flat edges on left/right) so that horizontal screen movement
  maps naturally to E/W.
- Six direction vectors, indexed 0–5 clockwise starting at East:

| Index | Name | (dq, dr) |
|-------|------|----------|
| 0     | E    | (+1,  0) |
| 1     | SE   | ( 0, +1) |
| 2     | SW   | (-1, +1) |
| 3     | W    | (-1,  0) |
| 4     | NW   | ( 0, -1) |
| 5     | NE   | (+1, -1) |

- Opposite direction: `(d + 3) % 6`.
- Distance: `(|dq| + |dr| + |ds|) / 2`.
- Cell key for maps/sets: the string `"q,r"` (or a packed integer for speed).
- World position (pointy-top, size `R`):
  `x = R·√3·(q + r/2)`, `z = R·1.5·r` (y is up in three.js).

### 3.2 Cell types

| Type              | Walkable | Destructible | Notes                                  |
|-------------------|----------|--------------|----------------------------------------|
| Floor             | yes      | —            | May hold a coin or pickup              |
| Solid wall        | no       | no           | Carved stone pillar                    |
| Cracked wall      | no       | yes          | Visibly cracked; bombs turn it to floor|
| Rubble (post-blast)| yes     | —            | Cosmetic floor variant after a blast   |

Walls are modelled as whole **blocked cells** (not edges between cells). This
keeps movement, pathfinding and blast propagation simple on a hex grid.

### 3.3 Lazy, infinite generation (chunks)

- The world is divided into **hex-shaped chunks** (radius ~8 cells, ~217 cells each),
  or alternatively axial-aligned parallelogram chunks for simpler indexing
  (e.g. 16×16 in `(q, r)`). Parallelogram chunks are recommended for implementation simplicity.
- A chunk is generated **the first time it comes within view distance** of the player.
- Generation is **deterministic**: `chunkSeed = hash(worldSeed, chunkQ, chunkR)`,
  fed into a small seeded PRNG (e.g. mulberry32 or sfc32). The same seed always
  produces the same base layout.
- **Mutable state** (collected coins, destroyed walls, used pickups) is stored as a
  per-chunk diff layered on top of the deterministic base. This allows chunks to be
  unloaded from the GPU and memory while keeping the world consistent if the
  player returns.

### 3.4 Maze generation algorithm

Goals: every floor cell reachable, a maze-like but not overly narrow feel, loops
so the player can evade enemies, and seamless joins across chunk borders.

Recommended approach — **"lattice rooms + carved corridors"**:

1. **Portals on borders:** For each chunk edge, derive a deterministic set of
   "portal" cells from a hash of the *edge* (shared by both neighbouring chunks),
   so both sides agree on where openings are without generating each other.
2. **Fill** the chunk with solid wall.
3. **Carve** a spanning tree connecting all portals plus a handful of random interior
   nodes using a randomized Prim's/DFS over a coarse sub-lattice (every other cell),
   carving the connecting cells as floor.
4. **Add loops:** remove ~10–20% of the remaining walls that separate two floor
   regions, to avoid dead-end-heavy mazes.
5. **Open small chambers:** occasionally clear a radius-1 or radius-2 hex blob
   (a "crypt chamber") — good spots for coin piles and pickups.
6. **Mark cracked walls:** a percentage of internal walls (scaling with distance)
   become destructible. Some cracked walls hide sealed **treasure pockets**
   reachable only by bombing.
7. **Validate** connectivity inside the chunk with a flood fill from any portal;
   carve a fix-up corridor if a region is isolated.

### 3.5 Populating a chunk

After carving, in deterministic order:

- **Coins:** placed on ~70–85% of floor cells.
- **Coin piles:** 1–3 per chunk, preferring chambers and dead ends.
- **Pickups:** 0–2 per chunk, drawn from a weighted table (see §5), never adjacent to a portal.
- **Enemy spawn markers:** count derived from distance tier; enemies are only
  instantiated when the chunk is active and the spawn point is outside the
  player's immediate radius (≥ 6 cells).
- The **origin chunk** is special: guaranteed open start chamber, no enemies within
  radius 8, one free bomb.

### 3.6 Chunk lifecycle

| State      | Condition                          | Data held                                   |
|------------|------------------------------------|---------------------------------------------|
| Unknown    | Never approached                   | Nothing                                     |
| Active     | Within view radius                 | Cell array, meshes, live enemies            |
| Dormant    | Left view radius                   | Diff only (collected coins, broken walls); meshes disposed |

Enemies in a chunk that goes dormant are despawned; a dormant chunk remembers how
many of its enemies were killed so they don't all reappear.

---

## 4. Enemies

All enemies are tomb creatures. They move on the same hex grid, cell-to-cell.
None of them use the "frightened/blue/eyes-return-home" genre tropes; the only
way to eliminate them is explosives/fire.

| Enemy              | Look                       | Behaviour                                                                                       | Appears from distance |
|--------------------|----------------------------|-------------------------------------------------------------------------------------------------|-----------------------|
| **Scarab**         | Small bronze beetle        | Random wander; at junctions picks a random non-reverse direction                                | 0                     |
| **Sentinel**       | Stone statue on a plinth   | Patrols a fixed loop/line; moves slowly but predictably                                          | 15                    |
| **Cobra**          | Hooded serpent             | Wanders; when player within line-of-sight along a hex axis, dashes along that axis              | 30                    |
| **Tomb Hound**     | Jackal-headed guardian     | Pursues the player using BFS pathfinding when within radius 10, otherwise wanders               | 50                    |
| **Swarm**          | Cluster of tiny locusts    | Moves fast and erratically; splits into 2 small scarabs when bombed (only once)                 | 80                    |

### 4.1 Movement rules

- Enemies avoid reversing direction unless in a dead end (prevents jittery back-and-forth).
- Enemies cannot pass through walls, cracked or otherwise.
- Enemies avoid cells that are currently burning (they will path around fire if possible;
  wanderers that are forced in die).
- Pathfinding (Hound) uses BFS limited to a max node budget (e.g. 400) to stay cheap.

### 4.2 Difficulty scaling

`tier = floor(distanceFromOrigin / 15)`, with elapsed time adding a small bonus.

- Enemy count per chunk: `1 + tier × 0.6` (capped).
- Enemy speed: base × (1 + 0.05 × tier), capped at ~1.4× player speed... but never
  faster than the player except for Cobra dashes.
- Cracked-wall ratio and pickup rarity both increase slightly with tier.

---

## 5. Powerups

Pickups are items lying on floor cells. Walking over one collects it.

### 5.1 Inventory

- The player has **one explosive inventory** with a slot per type:
  `bomb`, `incendiary`, `shapedCharge`.
- Each slot has a cap (e.g. bomb 5, incendiary 3, shaped 3).
- The currently **selected** type is shown in the HUD; the player cycles types and
  deploys the selected one.
- Deploying places the device on the player's current cell. It is **single-use**.
- Only one device may be placed on a given cell at a time.

### 5.2 Bomb (primary powerup)

- **Fuse:** 1.5 s, with a visible sparking fuse and ticking audio.
- **Blast shape:** hex radius 2 around the placement cell, but blast rays are
  **stopped by solid walls** (propagate outward along the 6 axes and fill the ring
  via line-of-sight check), so explosions feel physical in corridors.
- **Effects inside blast:**
  - Kills enemies (score bonus).
  - Destroys cracked walls → rubble floor.
  - **Destroys coins** and coin piles (no points).
  - Does **not** destroy pickups (so bombs never waste other bombs).
  - Damages the player (costs a life) — encourages planning an escape route.
- **Chain reaction:** a blast touching another placed device detonates it immediately.

### 5.3 Incendiary

- **Fuse:** 1.0 s.
- Ignites cells in hex radius 1 plus a flame spread of up to 3 cells along open
  corridors (flood fill with a budget), stopping at walls.
- Fire persists for a **time window of 5 s**, flickering down in intensity.
- Any enemy entering or standing in a burning cell dies.
- The player takes damage when entering fire (so fire acts as a temporary wall for both sides).
- Fire **destroys coins** in burning cells and **does not** break cracked walls.
- Tactical use: seal a corridor behind you, or create a kill zone at a junction.

### 5.4 Shaped Charge

- **Fuse:** 1.0 s.
- The device records the player's **facing direction at placement**.
- Explodes in all directions **except forward**: the forward axis and its immediate
  60° cone are left untouched. Concretely, blast rays of length 3 travel along the
  5 non-forward axes (and fill the sectors between them), but not into the forward
  sector.
- Same effects as a bomb within its area (kills enemies, breaks cracked walls,
  destroys coins, damages player).
- Tactical use: drop it while running away to wipe out pursuers and side threats
  without destroying the coins in the corridor ahead of you. A clear arrow decal on
  the device shows the protected direction.

### 5.5 Score multipliers (time-bound)

- Pickups labelled ×2 and ×3 (rarer).
- Duration: 10 s (×2), 8 s (×3).
- Picking up a multiplier while one is active:
  - Same value → refresh timer to full duration.
  - Higher value → replace; lower value → add its duration to the current one at half rate.
- HUD shows a radial countdown ring. Coins collected during a multiplier pop with a
  coloured score floater.

### 5.6 Pickup spawn table (per pickup roll)

| Item           | Base weight | Weight change with tier |
|----------------|-------------|-------------------------|
| Bomb           | 45          | −1 per tier (min 25)    |
| Incendiary     | 20          | +1 per tier             |
| Shaped charge  | 15          | +1 per tier             |
| Multiplier ×2  | 15          | —                       |
| Multiplier ×3  | 5           | +0.5 per tier           |

Additional extra life ("ankh") pickup: very rare (≈1 per 10 chunks), cap 5 lives.

---

## 6. Controls

### 6.1 Keyboard (desktop)

Six directions mapped to a hex-friendly cluster:

| Key | Direction |
|-----|-----------|
| D   | E         |
| X / C | SE      |
| Z   | SW        |
| A   | W         |
| Q / W | NW      |
| E   | NE        |

- Arrow keys as an alternative: Left/Right = W/E, Up/Down combined with the
  last horizontal direction selects NW/NE or SW/SE.
- **Space** — deploy selected explosive.
- **Tab / 1–3** — select explosive type.
- **P / Esc** — pause.

### 6.2 Touch (mobile)

- **Swipe** anywhere: swipe angle is binned into 6 sectors of 60°, rotated to match
  the camera orientation, giving the desired direction.
- **Tap** on the right-hand explosive button to deploy; tap the small icons next to it
  to switch type.
- Turn buffering is essential: a swipe is kept queued for ~400 ms and applied at the
  next cell where that direction is open.

---

## 7. Rendering (three.js)

### 7.1 Camera

- Perspective camera, ~55° tilt from vertical, following the player with smooth
  damping. Optional orthographic mode in settings.
- Slight look-ahead in the movement direction so the player sees more of where
  they're heading.

### 7.2 Geometry

- **Floors:** one `InstancedMesh` per active chunk using a flat hexagonal prism
  (`CylinderGeometry` with 6 radial segments, rotated for pointy-top).
- **Walls:** `InstancedMesh` of taller hex prisms; cracked walls use a separate
  instanced mesh with a cracked texture/material tint.
- **Coins:** a single global `InstancedMesh` (spinning via vertex shader or per-frame
  matrix update of visible instances only); removing a coin hides its instance
  (scale to 0 or swap-with-last).
- **Pickups, devices, enemies, player:** small individual meshes/groups built from
  primitives (low-poly), easy to replace with glTF models later.

### 7.3 Lighting & mood

- Dim ambient light + a warm point light carried by the player (torch radius) to
  create a fog-of-war feel.
- `scene.fog` in dark sepia to fade distant chunks, which also hides chunk pop-in.
- Explosions: short-lived bright point light, particle burst (Points), camera shake.
- Fire: animated emissive quads per burning cell + flickering light (limit to a few
  real lights; others emissive-only).

### 7.4 Performance targets

- 60 fps on mid-range phones.
- View radius ~14 cells; at most ~9 active chunks.
- Dispose geometries/materials of dormant chunks; reuse shared materials.
- Cap device pixel ratio at 2.

---

## 8. HUD & UI

- **Top-left:** score, active multiplier with countdown ring.
- **Top-right:** lives (ankh icons), distance from origin.
- **Bottom-right:** explosive inventory — three slots with counts, selected slot highlighted.
- **Screens:** title, pause, game over (score, best, distance, coins collected,
  enemies destroyed), settings (volume, camera mode, control layout).
- HUD built in HTML/CSS over the canvas (simpler and crisper than rendering in WebGL).

---

## 9. Audio

- Coin pickup: short chime with slight random pitch; pitch rises during a multiplier streak.
- Fuse hiss/tick, explosion boom, fire crackle loop, wall crumble.
- Enemy cues: scarab clicks, cobra hiss before a dash, hound growl when it starts hunting.
- Ambient low drone for the tomb atmosphere.
- Web Audio API; audio context unlocked on first user input.

---

## 10. Architecture

### 10.1 File layout

- `index.html` — canvas, HUD markup, loads `src/main.js` as `type="module"`;
  three.js via import map.
- `src/main.js` — bootstrap, creates `Game`.
- `src/core/Game.js` — state machine (title / playing / paused / gameover), main loop.
- `src/core/Loop.js` — fixed-timestep update (e.g. 60 Hz) + variable render.
- `src/core/Rng.js` — seeded PRNG and hash helpers.
- `src/hex/Hex.js` — axial math, directions, distance, neighbours, rings, line-of-sight.
- `src/world/World.js` — cell queries (`getCell(q,r)`), chunk management, mutation API.
- `src/world/Chunk.js` — cell storage (typed arrays), diff state.
- `src/world/MazeGenerator.js` — deterministic chunk generation.
- `src/world/Populator.js` — coins, pickups, spawn markers.
- `src/entities/Player.js` — movement, turn buffer, facing, lives, invulnerability.
- `src/entities/Enemy.js` + `src/entities/behaviors/*.js` — wander, patrol, dash, hunt.
- `src/entities/EnemyManager.js` — spawn/despawn per chunk, collision checks.
- `src/items/Inventory.js` — explosive slots, selection.
- `src/items/Devices.js` — bomb, incendiary, shaped charge: fuse timers, blast shapes.
- `src/items/Effects.js` — fire grid (burning cells with expiry), multiplier timer.
- `src/render/Renderer.js` — three.js setup, camera rig, resize.
- `src/render/ChunkView.js` — builds/disposes instanced meshes for a chunk.
- `src/render/EntityViews.js`, `src/render/Particles.js`.
- `src/input/Input.js` — keyboard + touch swipe to direction/deploy events.
- `src/ui/Hud.js`, `src/ui/Screens.js`.
- `src/audio/Audio.js`.
- `src/config.js` — all tunable constants (speeds, fuse times, radii, weights).

### 10.2 Principles

- **Simulation is grid-based and render-independent.** Game logic works on cells and
  ticks; the renderer only interpolates positions for display. This makes logic testable
  without WebGL.
- **Event bus** (`coinCollected`, `enemyKilled`, `explosion`, `wallDestroyed`,
  `playerHit`) decouples systems like HUD, audio and particles from gameplay.
- **Determinism:** world layout depends only on `worldSeed`; runs can be replayed or
  shared via seed ("daily tomb" mode as a stretch goal).

### 10.3 Update order per tick

1. Read input, update player's buffered direction.
2. Advance player; on cell entry: collect coin/pickup, check fire.
3. Advance enemies; on cell entry: check fire.
4. Tick device fuses; resolve detonations (including chains) → apply blast to world.
5. Tick fire expiry and multiplier timer.
6. Resolve player–enemy collisions (same cell, or swapped cells this tick).
7. Update chunk loading around the player.
8. Emit events → HUD/audio/particles.

---

## 11. Milestones

1. **Hex foundation:** hex math, render a static finite hex maze, player movement with turn buffering.
2. **Infinite world:** chunked deterministic generation, seamless borders, load/unload.
3. **Coins & scoring:** persistent collection, HUD, game over & high score.
4. **Enemies:** scarab wanderer, collisions and lives; then sentinel, cobra, hound.
5. **Bombs:** inventory, fuse, blast with wall occlusion, cracked walls, coin destruction.
6. **Advanced explosives:** incendiary fire grid, shaped charge directional blast, chain reactions.
7. **Multipliers** and pickup spawn tables, difficulty scaling.
8. **Juice:** particles, lighting, audio, camera shake, mobile controls polish.
9. **Stretch:** daily seed, achievements, glTF art, minimap of explored hexes.

---

## 12. Open Questions

- Should the player be immune to their own blasts to keep the game more forgiving on mobile?
  (Current plan: they take damage; revisit after playtesting.)
- Should destroyed coins count toward a "waste" stat shown at game over?
- Is continuous movement right on a 6-direction grid, or should the player stop at
  junctions when no input is held? Prototype both.
- Ideal chunk shape: parallelogram (simpler) vs. hexagonal (more uniform loading radius).

