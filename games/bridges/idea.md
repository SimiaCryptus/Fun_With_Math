# Bridges

> **Bridges** is a generalization of *Hex* onto arbitrary, configurable tilings
> (tessellations) of the plane, with 2‑player and 3‑player modes.
> Claim cells, grow a connected chain, link the two (or three) sides of the board
> that belong to you — and cut your opponents off before they do the same.
> Rendered in HTML + modular ES6 with **three.js** for eye candy.

---

## 1. Elevator pitch

Hex is a perfect game: trivially simple rules, no draws, a first‑player win by
strategy‑stealing, and deep, subtle play. But Hex is welded to one board: a
rhombus of hexagons.

**Bridges** asks: *what is Hex, actually?*

The answer: Hex is a **connection game on the faces of a planar tiling**, where
each player owns a pair of opposite boundary arcs. Nothing about that definition
requires hexagons. So Bridges makes the tiling a **parameter**:

- hexagons (classic Hex),
- squares (needs a crossing rule — hence *bridges*),
- triangles, truncated squares (4.8.8), kagome (3.6.3.6), snub square,
  Cairo pentagons, brick offsets, dual/Laves tilings, and organic
  (Voronoi‑relaxed) boards,

and makes the **board outline** a parameter too. A quadrilateral outline has four
sides → two players own one opposite pair each. A hexagonal outline has six sides
→ three players own one opposite pair each. That single observation is the whole
reason 2‑ and 3‑player modes exist and why the original note said the player count
"depends on whether the unit tiles are rectangular or hexagonal" — more precisely,
it depends on the **macro shape of the board**, and the tiling is free.

### Why the name "Bridges"

Three reasons, all load‑bearing:

1. **Heritage.** Gale's *Bridg‑It* (the Shannon switching game) is Hex's cousin,
   played by drawing bridges between dots — with the rule that bridges may not
   cross.
2. **Mechanics.** On tilings whose vertices touch four or more tiles, two
   diagonal connections *want to cross*. Bridges resolves this by letting the
   earlier claim **bridge over** the later one. Crossings are literal overpasses.
3. **Strategy.** In Hex, a "bridge" is the fundamental motif: two stones sharing
   two empty cells are *virtually connected*. Bridges are the atoms of good play.

---

## 2. Rules

### 2.1 Core rules (all modes)

1. **Board.** A finite region of the plane, cut from a tiling. Each tile is a
   **cell**. Two cells are **adjacent** if they share an *edge* (positive‑length
   boundary segment). Sharing only a *vertex* is not adjacency (see §2.3).
2. **Sides.** The board outline is a convex polygon with `S` sides. Each side is a
   **border arc**. A cell touching a border arc is a **border cell** of that arc.
   A cell in a corner touches two arcs and belongs to both (as in Hex).
3. **Ownership of arcs.** With `P` players and `S = 2P` sides, player `k` owns
   arcs `k` and `k + P` (opposite pairs).
4. **Turns.** Players alternate in fixed order. On your turn you **claim exactly
   one unclaimed cell**. Claims are permanent; nothing is ever captured or moved.
5. **Passing** is not allowed (except where a variant says so).
6. **Win.** You win the moment a chain of cells you own, connected by adjacency,
   touches **both** of your border arcs.
7. **Game end.** The game ends immediately on a win. If the board fills with no
   winner (only possible in some configurations — see §2.4), the game is a draw
   unless a tiebreak variant is enabled.

With `tiling = hex`, `outline = rhombus`, `players = 2`, these rules are
*exactly* Hex. That is the conformance test.

### 2.2 The no‑draw property, and when it holds

Hex cannot be drawn: when the board is full, exactly one player has a connection.
The topological reason is that hexagonal tilings are **trivalent** — every vertex
is surrounded by exactly three tiles, so a coloured region's boundary never
encounters an ambiguous four‑way pinch.

Bridges classifies every tiling:

| Class | Condition | Consequence |
|---|---|---|
| **Clean** | every interior vertex has degree 3 | 2‑player games can never be drawn; strategy‑stealing gives first player a theoretical win |
| **Pinched** | some vertex has degree ≥ 4 | diagonal contacts are ambiguous; needs a crossing rule (§2.3) |

Clean tilings include: hexagonal (6.6.6), truncated square (4.8.8),
truncated hexagonal (3.12.12), truncated trihexagonal (4.6.12), brick/soldier
offsets, and generic Voronoi diagrams of points in general position.

Pinched tilings include: square (4.4.4.4, degree 4), triangular (degree 6),
kagome (3.6.3.6, degree 4), Cairo pentagonal (mixed 3 and 4), snub square.

The UI shows the class as a badge, because it changes the game's character.

### 2.3 Crossings and the Bridge Rule (pinched tilings)

At a vertex `v` of degree `d ≥ 4`, list the incident cells in cyclic order
`c0, c1, …, c(d-1)`. Consecutive cells share an edge and are already adjacent.
Non‑consecutive pairs are **chords**: potential *diagonal* connections through the
single point `v`. Two chords **conflict** if they interleave in the cyclic order
(e.g. on a square lattice, chord `c0–c2` conflicts with chord `c1–c3`).

Bridges supports four `crossingMode` settings:

| Mode | Behaviour |
|---|---|
| `strict` | Diagonals never connect. Simple, but 2‑player games on pinched tilings *can* be drawn. |
| `bridge` **(default)** | Diagonals connect, but the set of live chords at each vertex must stay **non‑crossing**. When a new claim would create a chord conflicting with an existing live chord, the **older** chord wins and bridges *over*; the newer one is severed at `v`. |
| `open` | All diagonals connect for everyone. Fast and chaotic; multiple players can win simultaneously (see `simultaneousWin`). |
| `priority` | Conflicts resolved by fixed player order rather than timestamp. Deterministic but unfair; useful for study. |

`bridge` mode is the signature mode. It is:

- **Deterministic** — chord birth time is the move number at which its *second*
  endpoint was claimed; ties are impossible.
- **Local and incremental** — resolving a conflict only inspects one vertex.
- **Monotone** — a live chord is never revoked, so union‑find remains valid with
  no rollback (undo replays from the move list instead).
- **Gorgeous** — the winning chord is drawn as an arched overpass, the losing one
  dives underneath with a visible break in the path. Free eye candy directly from
  the rules.

> **Design note.** `bridge` restores the no‑draw property in practice for
> degree‑4 tilings, because a full board's chord graph is a maximal non‑crossing
> matching, which is topologically equivalent to a trivalent refinement. Higher
> degrees (triangular, degree 6) are not yet proven; treat them as experimental
> and enable `tiebreak` for them.

### 2.4 Three players

Three players own opposite pairs of a hexagonal outline. Consequences:

- **Draws are real.** With three colours, a full board can have zero connections.
  Enable a `tiebreak` to avoid anticlimax.
- **Kingmaking.** The trailing player can decide the winner. Mitigations offered:
    - `firstToConnect` (default) — the first player to complete a link wins outright.
    - `scoring` — play to a full board; rank by (connected? , longest chain length,
      cells owned). Rewards second place, which suppresses spite.
    - `elimination` — a player who is provably cut off (their two arcs are separated
      by a completed opposing wall) is eliminated and their cells become neutral
      walls; last player standing or first to connect wins.
- **Balance.** First player advantage is smaller but real; see `pieRule` variants.

### 2.5 Variants (all toggleable, all serialized in the game config)

| Variant | Description |
|---|---|
| `pieRule` (swap) | Player 2 may, as their first action, swap colours instead of moving. The standard Hex fairness fix. |
| `auction` | 3‑player balance: players bid a handicap in "skipped first turns". |
| `goal: opposite` | Default. Connect your two arcs. |
| `goal: fork` | Connect **all** arcs of one parity class (a *Y*‑style goal). On a triangular outline with one player class this is the game of **Y**, which is draw‑free on any clean tiling. |
| `goal: ring` | *Havannah*‑style: enclose at least one cell (yours or not) in a closed loop. |
| `goal: any` | Win by fork **or** ring **or** opposite — the Havannah cocktail. |
| `misère` | Whoever completes a connection **loses**. Surprisingly playable. |
| `neutralCells` | A seeded percentage of cells start blocked (rendered as rock/water). Adds asymmetric puzzle scenarios. |
| `handicap: n` | Player 2 (or 2 and 3) pre‑place `n` cells. |
| `blitz` | Per‑move / total clocks with Fischer increment. |
| `simultaneousWin` | Only meaningful in `open` crossing mode: shared victory allowed. |

---

## 3. Boards

### 3.1 Outlines

| Outline | Sides | Players | Notes |
|---|---|---|---|
| `rhombus` | 4 | 2 | Classic Hex geometry; the diagonal is the natural axis. |
| `square` | 4 | 2 | Nicest with square/4.8.8 tilings. |
| `hexagon` | 6 | 3 (or 2, owning two arcs each and ignoring one pair) | The 3‑player board. |
| `triangle` | 3 | 1–3 with `goal: fork` | The *Y* board. |
| `dodecagon` | 12 | 2, 3, 4, 6 | Experimental many‑arc boards. |
| `disc` | ∞ | any | Arcs are angular sectors; needs `sectors: n`. Wonderfully weird. |

### 3.2 Edge treatment

How the tiling meets the outline, controlled by `edgeMode`:

- `whole` — keep only cells entirely inside the outline. Ragged, honest, fast.
- `centroid` — keep cells whose centroid is inside. Slightly ragged, better fill.
- `clip` — clip boundary polygons against the outline (Sutherland–Hodgman).
  Produces a crisp straight edge with odd little sliver cells; slivers below
  `minAreaRatio` are merged into their largest neighbour.

### 3.3 Size

A single integer `size` (default 11, range 3–31) meaning "cells across the short
axis". Each tiling maps `size` to its own lattice extent so that boards of the
same `size` feel comparable in length‑of‑game.

### 3.4 Faces vs. vertices (dual play)

`playOn: 'faces' | 'vertices'`. Playing on the **vertices** of a tiling is the
same as playing on the **faces of its dual**, which is how you get:

- vertices of triangular tiling = faces of hexagonal = Hex,
- vertices of square tiling = *Gale/Bridg‑It* territory,
- vertices of kagome, 4.8.8, etc. = a fresh family of boards for free.

Implementation: `dualize(board)` returns a new board; everything downstream is
unchanged. One function, double the content.

---

## 4. Architecture

### 4.1 Principles

1. **Pure engine, dumb renderer.** `engine/` has zero imports from `three`.
   It is testable in Node and runnable in a Worker for the AI.
2. **Topology is data.** Tilings produce a plain, serializable graph
   (cells, edges, vertices, arcs). Everything else — rules, rendering, AI,
   a11y — consumes that one structure. Adding a tiling adds no rules code.
3. **Moves are the truth.** State = `config + seed + move list`. Undo, replay,
   share‑by‑URL, and network sync are all the same mechanism.
4. **ES modules, no build step required.** Import maps + CDN‑pinned three.js so
   `index.html` works from `file://` or any static host. An optional Vite config
   exists for bundling/minification.
5. **Degrade gracefully.** No WebGL2? Drop post‑processing. Still no WebGL? Fall
   back to a 2D canvas renderer that speaks the same interface.

### 4.2 File layout

~~~text
games/bridges/
  index.html                 # import map, canvas, HUD skeleton, no-JS fallback
  idea.md                    # this document
  styles/
    main.css                 # layout, HUD, panels, themes (CSS custom props)
  src/
    main.js                  # bootstrap: parse URL -> config -> Game + Renderer + UI
    config.js                # defaults, validation, URL <-> config codec

    engine/                  # PURE. no three.js, no DOM.
      Game.js                # state machine: turn order, apply/undo, events
      Board.js               # cells, edges, vertices, arcs, adjacency, spatial hash
      Rules.js               # legality, crossing resolution, variant hooks
      Connectivity.js        # DisjointSet + arc sentinels, incremental win check
      DisjointSet.js
      Goals.js               # opposite / fork / ring / any  (pluggable predicates)
      Chords.js              # per-vertex non-crossing chord bookkeeping (Bridge Rule)
      Score.js               # tiebreaks: longest chain, territory, elimination
      History.js             # move list, undo/redo, replay, branching analysis
      Serialize.js           # JSON, compact base64 move string, SGF-ish text

    tilings/
      Tiling.js              # interface + shared lattice helpers
      registry.js            # id -> module, metadata for the setup UI
      hex.js  square.js  triangle.js
      truncSquare.js         # 4.8.8      (clean)
      triHex.js              # 3.6.3.6    kagome (pinched, deg 4)
      rhombiTriHex.js        # 3.4.6.4
      snubSquare.js          # 3.3.4.3.4
      truncHex.js            # 3.12.12    (clean)
      truncTriHex.js         # 4.6.12     (clean)
      cairo.js               # pentagonal, mixed degree
      brick.js               # offset rectangles, parametric offset
      voronoi.js             # seeded random points + Lloyd relaxation (clean!)
      penrose.js             # stretch goal: aperiodic, no translation symmetry

    geometry/
      Vec2.js  Polygon.js
      outline.js             # rhombus/square/hexagon/triangle/disc generators
      clip.js                # Sutherland-Hodgman, sliver merge
      weld.js                # vertex quantization + topology extraction
      dualize.js
      relax.js               # Lloyd iterations for voronoi.js
      SpatialHash.js         # O(1) point -> cell for picking

    render/
      Renderer.js            # scene, camera rig, resize, render loop, quality tiers
      BoardMesh.js           # merged prism geometry + per-cell attributes
      cellShader.js          # GLSL: owner palette lookup, claim animation, patterns
      BridgeMesh.js          # arched overpasses + severed-path decals
      Overlay.js             # hover, last-move, legal hints, threat/connection viz
      Materials.js  Themes.js
      PostFX.js              # bloom, SMAA, SSAO, outline (all optional)
      CameraRig.js           # orbit-limited + orthographic "study" mode
      Picking.js             # ray -> plane -> SpatialHash (GPU id-buffer fallback)
      Canvas2DRenderer.js    # no-WebGL fallback, same public interface

    ui/
      HUD.js                 # turn indicator, clocks, captured arcs, undo
      SetupPanel.js          # tiling / outline / size / players / variants
      Toast.js  Modal.js
      Sound.js               # WebAudio: click, claim, bridge-clank, victory
      A11y.js                # keyboard graph navigation, ARIA live, text board

    ai/
      Bot.js                 # main-thread facade over the worker
      bot.worker.js
      mcts.js                # UCT + RAVE, tuned playouts
      resistance.js          # classic Hex electrical-resistance evaluation
      patterns.js            # bridge/edge templates, virtual connections
      maxn.js                # 3-player: max^n and paranoid search

    net/
      LocalHotseat.js
      PeerLink.js            # stretch: WebRTC datachannel, move-list sync
  tests/
    topology.test.js         # Euler characteristic, edge sharing, no overlaps
    hex-conformance.test.js  # hex+rhombus+2p reproduces known Hex results
    chords.test.js           # Bridge Rule determinism & non-crossing invariant
    connectivity.test.js     # union-find vs brute-force BFS, fuzzed
    nodraw.test.js           # fill random boards, assert exactly one winner (clean)
    serialize.test.js        # round-trip config + moves, URL length budget
~~~

### 4.3 The tiling interface

Every tiling module is small and declarative. It describes a **prototile patch**
plus **lattice vectors**; the generic generator does the rest.

~~~js
// tilings/hex.js
export default {
  id: 'hex',
  name: 'Hexagonal',
  vertexConfig: '6.6.6',
  clean: true,                    // all vertices degree 3 -> draw-free
  tags: ['classic', 'regular'],
  // lattice translations, in tile-radius units
  basis: [ [1.5, HALF_SQRT3], [1.5, -HALF_SQRT3] ],
  // one or more prototiles per lattice cell, each a closed polygon
  protoTiles: [ { kind: 'hex', poly: hexPoly(1) } ],
  defaultOutline: 'rhombus',
  // how `size` maps to lattice extent for this tiling
  extent: size => ({ i: size, j: size }),
};
~~~

~~~js
// tilings/Tiling.js  (excerpt)
export function generateBoard(tiling, { outline, size, edgeMode, seed }) {
  const region = makeOutline(outline, tiling, size);        // geometry/outline.js
  const raw    = stampLattice(tiling, region.bbox);          // prototiles x basis
  const kept   = applyEdgeMode(raw, region, edgeMode);       // whole|centroid|clip
  const topo   = weld(kept, { epsilon: 1e-6 });              // vertices + edges
  const board  = new Board(topo);
  board.arcs   = assignArcs(board, region);                  // boundary -> side ids
  board.chords = buildChords(board);                         // per-vertex chord sets
  board.hash   = new SpatialHash(board.cells);
  return board;
}
~~~

Aperiodic tilings (Penrose) and `voronoi.js` bypass `stampLattice` with their own
generator but return the same polygon soup, so `weld` onward is shared.

### 4.4 Board generation pipeline, in detail

1. **Outline** — build the convex region polygon and record its `S` side segments
   with their side ids and outward normals.
2. **Stamp** — iterate lattice coordinates covering the outline's bounding box,
   emitting every prototile translated by `i*b0 + j*b1`.
3. **Edge mode** — filter or clip against the region; merge slivers.
4. **Weld** — quantize vertex coordinates to a grid (`round(x / eps)`) and
   deduplicate into a vertex table. Build an edge table keyed by sorted vertex
   pairs; an edge with two incident cells makes those cells **adjacent**; an edge
   with one incident cell is a **boundary edge**.
5. **Cyclic order** — for each vertex, sort incident cells by the angle of
   `centroid − vertex`. Record `degree`. Enumerate non‑consecutive pairs as
   **chords**; precompute which chords interleave (conflict).
6. **Arcs** — for each boundary edge, classify it to the outline side it lies on
   (nearest side by distance, disambiguated by normal alignment). Each cell's
   `arcs` is the union over its boundary edges. Corner cells naturally get two.
7. **Validate** — assert Euler's formula `V − E + F = 1` for the disc, assert no
   polygon overlaps (via spatial hash), assert every arc has ≥ `size/2` cells,
   assert the cell graph is connected. Fail loudly in dev; auto‑fall‑back to hex
   in production with a toast.

### 4.5 Win detection

Incremental disjoint‑set union, one forest per player, plus `S` **sentinel nodes**
(one per border arc):

~~~js
claim(cellId, player) {
  const ds = this.sets[player];
  for (const n of board.neighbors(cellId))
    if (owner[n] === player) ds.union(cellId, n);
  for (const chord of Chords.activateFor(cellId, player, moveNumber))
    ds.union(chord.a, chord.b);                  // Bridge Rule already applied
  for (const arc of board.cells[cellId].arcs)
    ds.union(cellId, SENTINEL(arc));
  return Goals.check(player, ds, board);         // O(1) for `opposite`
}
~~~

`Goals.check` for `opposite` is a single `find` comparison of the player's two
sentinels. `fork` compares all owned sentinels. `ring` needs a small local
boundary‑walk around the just‑placed cell, still O(local). Undo is *replay from
the move list* — simpler and less bug‑prone than persistent union‑find, and
boards are small enough that replaying 200 moves is microseconds.

---

## 5. Rendering & eye candy (three.js)

The engine is abstract; the renderer's job is to make an abstract graph feel like
a **physical object on a table**.

### 5.1 Geometry strategy

Cells are **extruded prisms**. Because general tilings have non‑congruent tiles,
`InstancedMesh` is not always available, so the default is:

- triangulate every cell polygon once (ear clipping), build top cap + side walls,
- **merge all cells into a single `BufferGeometry`** with custom per‑vertex
  attributes: `aCellId`, `aCellCenter`, `aOwner`, `aClaimTime`,
- a `ShaderMaterial` (or `MeshStandardMaterial` + `onBeforeCompile`) reads
  `aOwner` to sample a **1×N palette `DataTexture`**, and `aClaimTime` to drive
  animation entirely on the GPU.

Result: **one draw call** for the whole board, and claiming a cell costs a tiny
attribute range update — no geometry rebuild, no per‑cell objects, no GC churn.
For congruent‑tile tilings the renderer opportunistically switches to
`InstancedMesh` (detected by comparing polygon hashes).

### 5.2 Animation, in the shader

~~~glsl
float t = clamp((uTime - aClaimTime) / 0.45, 0.0, 1.0);
float ease = 1.0 - pow(1.0 - t, 3.0);
// claimed cells rise and settle with a tiny overshoot
pos.y += aOwner > 0.0 ? ease * uRise + sin(t * 9.4) * (1.0 - t) * 0.03 : 0.0;
// a ripple races outward from the claim across neighbours
float d = distance(aCellCenter, uLastClaimCenter);
pos.y += ripple(uTime - uLastClaimTime - d * 0.06) * 0.05;
~~~

Everything expensive is GPU‑side and free of per‑frame JS.

### 5.3 Bridges as objects

When the Bridge Rule fires at a vertex:

- the **winning** chord spawns a `TubeGeometry` along a `CatmullRomCurve3`
  arcing from centroid → above the vertex → centroid: a little stone/iron
  overpass, with a satisfying clank from `Sound.js`;
- the **losing** chord gets a *severance decal* — the two cells stay coloured but
  a visible gap and cast shadow under the arch show the path is cut;
- hovering the vertex shows a tooltip: "claimed move 34 — bridges over move 41".

This is the moment where the abstract rule becomes physical, and it is worth
disproportionate polish.

### 5.4 Scene dressing

- **Materials.** PBR: matte resin for unclaimed cells, glossy enamel for claimed,
  subtle clearcoat, per‑theme roughness. PMREM‑prefiltered environment map for
  believable reflections without lights everywhere.
- **Lighting.** One key directional light with soft shadow map, one hemisphere
  fill, plus a per‑player point light that brightens on your turn.
- **Post‑processing.** `EffectComposer` with SMAA → SSAO (quality tier ≥ high) →
  `UnrealBloomPass` (victory chains bloom) → optional `OutlinePass` for hints.
- **Board frame.** The outline is drawn as a beveled wooden/metal rail, with each
  arc tinted by its owner — so "which sides are mine" is answered by *looking*,
  never by reading. Corner arcs blend both colours.
- **Victory.** The winning chain lights from arc to arc like a fuse, the camera
  performs a slow orbit, losers' cells desaturate, bloom spikes, confetti of
  instanced prototiles.
- **Themes.** `slate`, `paper` (flat, high‑contrast, tournament), `neon`,
  `garden`, `blueprint`. Themes are CSS custom properties + a material preset
  object, hot‑swappable.
- **Camera.** `CameraRig` wraps damped orbit with clamped polar angle, plus a
  one‑key **orthographic top‑down "study" mode** that turns off all FX for
  serious play or screenshots. Auto‑fit on board change.

### 5.5 Picking

Raycast against a single invisible flat plane at `y = 0`, then look up the cell
via `SpatialHash` (grid bucket → point‑in‑polygon over ≤ 4 candidates). O(1),
works for any tiling, no GPU readback, no per‑cell colliders. A GPU id‑buffer
path exists behind a flag for pathological tilings (huge sliver counts).

### 5.6 Quality tiers

Detected from `renderer.capabilities`, device memory, and a 30‑frame warm‑up
benchmark: `low` (no post, no shadows, flat material, capped DPR 1),
`medium` (shadows + SMAA), `high` (+ SSAO, bloom), `ultra` (+ higher shadow res,
DPR 2, reflections). User‑overridable; respects `prefers-reduced-motion` by
disabling ripples, camera drift, and confetti.

---

## 6. UI / UX

- **Setup panel** with live preview: tiling gallery (each rendered as a small
  thumbnail generated from the real generator), outline, size slider, player
  count, variant toggles, and a "clean / pinched" badge with a one‑line
  explanation of what the crossing rule does.
- **Turn HUD**: whose turn, colour, optional clocks, and a *connection meter* per
  player — an honest progress indicator (shortest remaining path cost via
  Dijkstra over "empty = 1, mine = 0, theirs = ∞").
- **Hints** (toggle, off in ranked): highlight legal cells, show your virtual
  connections (bridge templates) as dashed links, show the opponent's shortest
  threat.
- **History**: move list, arrow‑key scrubbing, branch‑on‑undo analysis mode,
  export/import.
- **Sharing**: the entire game is a URL —
  `#t=triHex&o=hexagon&s=11&p=3&v=pie,bridge&m=<base64 moves>`.
  Copy‑link and "replay this game" are one click.
- **Sound**: short, dry, tactile. Click on hover, wooden set on claim, metallic
  clank on bridge, low swell on victory. Mutable, and never required.

### Accessibility (non‑negotiable)

- Colourblind‑safe default palette **plus** shader‑drawn fill patterns
  (dots / stripes / cross‑hatch) per player, so colour is never the only channel.
- Full keyboard play: arrow keys walk the adjacency graph in screen‑space
  directions, `Enter` claims, `Tab` cycles to arcs/HUD. Focus ring rendered in 3D.
- ARIA live region announces every move as
  "Player 2 claims cell 47, adjacent to 3 of their cells, 4 steps from connecting".
- `?text=1` renders a plain‑text board and a text move interface — playable with
  a screen reader alone.
- Reduced‑motion and high‑contrast modes.

---

## 7. AI opponents

All AI runs in a **Web Worker** over the pure engine, so the UI never stutters.

1. **`easy`** — random legal move, biased toward cells adjacent to its own chain
   and near its axis.
2. **`medium`** — the classic Hex **electrical resistance** evaluation: model the
   board as a resistor network (own cells = 0 Ω, empty = 1 Ω, enemy = ∞) between
   your two arc sentinels; score = `log(R_opponent / R_self)`. Pick the move
   maximizing it. This generalizes to *any* tiling for free — it only needs the
   adjacency graph — which is exactly why it's the right choice here.
3. **`hard`** — MCTS with UCT + RAVE, cheap biased playouts, plus a
   **virtual‑connection** layer from `patterns.js` (bridge/edge templates,
   H‑search style AND/OR combination) to prune and to detect won positions early.
   Time‑budgeted, incremental between turns (ponder while you think).
4. **3 players** — `max^n` for shallow exact play plus MCTS with a 3‑vector
   reward and a `paranoid` toggle; explicit anti‑kingmaking term so the bot
   doesn't behave absurdly when it cannot win.
5. **Difficulty by budget**, not by handicap: same algorithm, fewer milliseconds.

Pattern templates are tiling‑dependent, so `patterns.js` *learns* them at board
generation time by brute‑forcing small local shapes (radius ≤ 2) once and caching
by tiling id — a neat trick that keeps the AI strong across arbitrary boards.

---

## 8. Data model (sketch)

~~~js
// Board (immutable after generation)
Cell   = { id, poly: Float32Array, centroid: [x,y], area,
           neighbors: Int32Array, vertices: Int32Array, arcs: number[] }
Vertex = { id, p: [x,y], cells: Int32Array /* cyclic */, degree,
           chords: number[] }
Chord  = { id, vertexId, a, b, conflicts: Int32Array }
Arc    = { id, side, cells: Int32Array, owner: playerIndex }

// Game (mutable)
State  = { owner: Int8Array,        // -1 empty, 0..P-1 player
           claimTime: Int32Array,   // move index, for rendering + Bridge Rule
           liveChords: Uint8Array,
           turn, moveNumber, winner, phase }

// Persisted
Config = { version, tiling, playOn, outline, size, edgeMode, players,
           crossingMode, goal, variants:[], seed, theme }
Save   = { config, moves: Int32Array, meta: { started, names, result } }
~~~

---

## 9. Roadmap
> **Status:** M0–M2 plus parts of M3, M5 and M6 are implemented (see `src/`
> and `tests/`): triangle (default) / hex / square / 4.8.8 / kagome / 3.4.6.4 /
> snub square / 3.12.12 / 4.6.12 / Cairo / brick tilings, rhombus/square/hexagon
> outlines, all three edge modes, `strict`/`bridge`/`open` crossing modes with
> overpass meshes, 2‑ and 3‑seat play, pie rule, URL sharing, merged
> single‑draw‑call board, Fischer clocks (untimed by default), per‑seat bots
> (`easy` / `medium` / `hard`, in a Worker with main‑thread fallback) and a
> damped orbit/pan/dolly camera rig.
> Tiles whose group genuinely reaches an owned side get a painted rim
> (striped once it spans both sides); this, link bars, theme and animations
> are per‑device display settings in the settings dialog, separate from the
> shareable game config.
> `priority` crossing mode, dual play, MCTS+RAVE, tiebreaks and a11y are still open.


**M0 — Skeleton (playable Hex).**
`hex` tiling, `rhombus` outline, 2 players, union‑find win check, flat three.js
prisms, click to claim, hotseat. Conformance test vs. known Hex positions. Ship it.

**M1 — Tilings.**
Generic `stampLattice` + `weld` + arc assignment. Add `square`, `triangle`,
`truncSquare`, `triHex`. Implement `strict` crossing mode. Setup panel with live
thumbnails.

**M2 — The Bridge Rule.**
`Chords.js`, non‑crossing invariant, timestamps, bridge overpass meshes and
severance decals. Fuzz tests for determinism and no‑draw on degree‑4 tilings.

**M3 — Three players.**
`hexagon` outline, arc pairing, turn order, `firstToConnect` / `scoring` /
`elimination`, connection meters, kingmaking mitigations.

**M4 — Eye candy pass.**
Custom cell shader with GPU claim animation, PBR + PMREM env, post‑processing
chain, themes, victory sequence, sound, quality tiers.

**M5 — AI.**
Worker, resistance bot, MCTS+RAVE, learned local patterns, 3‑player search.

**M6 — Depth.**
`voronoi`, `cairo`, `snubSquare`, `rhombiTriHex`, dual play, `goal: fork/ring`,
variants, handicaps, clocks.

**M7 — Polish & share.**
URL sharing, replays, analysis branching, full a11y audit, `?text=1` mode,
PWA/offline, optional WebRTC peer play, tutorial with interactive puzzles.

**Stretch.** Penrose and other aperiodic boards; spherical/toroidal topologies
(which break the no‑draw theorem in fascinating ways); a puzzle mode
("connect in 3 moves"); a tiling editor.

---

## 10. Open questions

1. **Does the Bridge Rule guarantee no draws** on every degree‑4 tiling, or only
   on the square lattice? Needs a proof or a counterexample search. (Brute force
   all fillings of small boards — a good `nodraw.test.js` extension.)
2. **Degree ≥ 5 vertices** (triangular, snub) — is timestamp resolution even the
   right primitive, or should chords be *bid* for? Prototype `strict` vs `bridge`
   playability there before committing.
3. **First‑player advantage across tilings.** The pie rule fixes 2‑player, but
   how *big* is the advantage on, say, kagome vs. hex? Measure with bot self‑play
   and surface it in the setup UI as a "balance" rating.
4. **Fair 3‑player start.** Is `auction` genuinely better than a fixed handicap?
   Playtest.
5. **How big is too big?** Target 60 fps at 2 000 cells on integrated graphics.
   Beyond that, does merged‑geometry hold, or is a chunked LOD needed?
6. **Is `clip` edge mode worth it?** Sliver cells are ugly and strategically
   weird; maybe `centroid` plus a decorative frame is simply better.
7. **Naming the pieces.** "Claim a cell" or "place a stone"? Bridges' physicality
   suggests *tiles* being *laid* — decide once, use everywhere, including in the
   a11y announcements.

---

## 11. Prior art & credits

- **Hex** — Piet Hein (1942), John Nash (1948). The origin.
- **Bridg‑It / Gale's game** — David Gale; Shannon switching game. The crossing
  rule and the name.
- **Y** — Craige Schensted & Charles Titus; the fork goal, draw‑free on clean
  tilings.
- **Havannah** — Christian Freeling; the ring/fork/bridge goal cocktail.
- **Chameleon / 3‑player Hex** — precedent for the hexagonal 3‑player board.
- **Grünbaum & Shephard, *Tilings and Patterns*** — the tiling taxonomy and
  vertex‑configuration notation used in `tilings/`.
- **three.js** — the eye candy.