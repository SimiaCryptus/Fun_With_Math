# 3D Checkers (8×8×8)

**Stack:** HTML + modular ES6 (native `<script type="module">`, no bundler) + three.js

A browser-based **true 3D checkers** game. The board is an **8×8×8 cube of voxels**
(512 cells). Exactly as a 2D checkerboard only uses the dark squares, the 3D board only
uses the dark cells of the 3D checkerboard colouring — the cells where the coordinate
sum is odd. That is **256 playable cells (50%)**, and pieces move along the 3D analog of
the 2D diagonal: a step that changes exactly two coordinates by ±1 (a *face diagonal*),
which is precisely the set of unit moves that keep a piece on its own colour.

Two modes: **head-to-head** (two humans, one screen) and **vs CPU** (selectable
difficulty, AI in a Web Worker).

---

## 1. Goals

- Fully playable 3D checkers in the browser with zero build step.
- Solve the central UX problem of a volumetric board — **seeing inside the cube** —
  with exploded-level, slice and X-ray views, so the game state is readable at a glance.
- Clean separation between **game rules**, **AI**, **rendering**, and **UI** so each
  module can be tested and swapped independently.
- 60fps on a mid-range laptop with ~200 pieces on screen (instanced rendering);
  degrades gracefully (lower shadow quality, no post-effects) on weaker hardware.

## Non-goals (for v1)

- Online multiplayer / networking.
- Rule variants (flying kings, backward-capturing men, other cube sizes) — see stretch.
- Mobile-first layout (should *work* on touch, desktop is the primary target).

---

## 2. Geometry

### 2.1 Coordinates
- Three axes, all 0–7 internally, 1–8 / a–h in notation:
  - **file** `x` (a–h): left ↔ right
  - **rank** `y` (1–8): toward the opponent. Red's home face is rank 1, Black's is rank 8.
  - **level** `z` (1–8): bottom ↔ top of the cube.
- A cell is **playable** iff `(x + y + z) % 2 === 1` (0-based). This is the 3D
  checkerboard colouring: 256 of 512 cells, 32 playable cells per rank plane, 4 per row.

### 2.2 Directions
All legal steps change **exactly two** coordinates by ±1 (face diagonals). There are 12:
```
(±1, ±1,  0)   file+rank   — the familiar 2D diagonal within a level
( 0, ±1, ±1)   rank+level  — the 2D diagonal within a file slice
(±1,  0, ±1)   file+level  — lateral: no forward/backward component
```
Space diagonals `(±1,±1,±1)` and axis steps `(±1,0,0)` are illegal — they would land on
a non-playable cell. The 256 playable cells form a single connected graph under the 12
face-diagonal steps, so every cell is reachable.

### 2.3 Why this is a much bigger game
|                         | 2D (8×8)  | 3D (8×8×8) |
|-------------------------|-----------|------------|
| Playable cells          | 32        | 256        |
| Pieces per side (start) | 12        | 96         |
| Man move directions     | 2         | 4          |
| King move directions    | 4         | 12         |
| Typical branching       | ~7–10     | ~60–150    |

Occupancy at start is the same 75% as 2D (192 of 256), but the branching factor is an
order of magnitude larger and multi-jump chains can weave through levels — hence the
"much greater tactical complexity" that motivates the project.

---

## 3. Game Rules (3D analog of English draughts)

- 8×8×8 board; only the 256 dark cells are used.
- **Setup:** each side has **96 men** filling all playable cells in the three rank
  planes closest to them (ranks 1–3 for Red, 6–8 for Black). Ranks 4–5 (64 cells) are
  empty. Smaller setups selectable in settings: *Light* (2 ranks, 64 each), *Skirmish*
  (1 rank, 32 each) — useful for learning and for faster games.
- **Red** moves first. Sides alternate turns.
- **Men** move one step along a **forward** face diagonal — a step with `Δrank = +1`
  for Red / `−1` for Black. That is 4 directions: `(±1,+1,0)` and `(0,+1,±1)`.
  Lateral steps `(±1,0,±1)` are *not* forward and are not allowed for men (variant
  toggle: "men may step sideways", default OFF — see Open Questions).
- **Captures** jump along the same directions over an adjacent enemy piece onto the
  empty cell immediately beyond it (the jumped cell is on the opposite colour; the
  landing cell two steps away is back on the playing colour). Men capture forward only.
- **Multi-jumps:** if another capture is available with the same piece after a jump,
  the player must continue jumping. Chains may change level and file freely.
- **Forced capture:** if any capture is available, the player must capture.
  (Toggleable, default ON.) Any capturing piece/line may be chosen; the longest chain
  is *not* required (English rule).
- **Kinging:** a man reaching the far **face** (rank 8 plane for Red, rank 1 for Black —
  32 playable cells each) becomes a **king**. Kings move and capture one step along
  **all 12** face diagonals (no flying kings). A move ends when a piece is kinged.
- **Win:** opponent has no pieces left, or has no legal move on their turn.
- **Draw:** 40 consecutive moves (configurable) without a capture or a man moving,
  threefold repetition, or mutual agreement (UI button).

---

## 4. Game Modes

### 4.1 Head-to-Head (local)
- Two players alternate on one device.
- Camera optionally swings 180° around the vertical axis between turns ("flip board"
  setting) so each player views the cube from their own home face.
- Per-player names editable in the side panel.

### 4.2 vs CPU
- Player chooses side (red/black), difficulty, and setup size.
- CPU thinks asynchronously in a **Web Worker**; thinking indicator on the CPU's card.
- Difficulties (depths are lower than 2D because of the branching factor):
  | Level  | Strategy                                                                 | Approx. depth |
  |--------|--------------------------------------------------------------------------|---------------|
  | Easy   | Random legal move, prefers captures / longer chains                      | 0–1           |
  | Medium | Negamax + alpha-beta, material + advancement eval                        | 3             |
  | Hard   | Negamax + alpha-beta, positional eval, move ordering, TT, iterative deepening | 4–6 (time-limited ~2s) |

### 4.3 Shared features
- Undo (vs CPU: undoes player + CPU move; H2H: one move, confirm dialog configurable).
- Move history with 3D notation (§5.1), clickable to preview positions.
- Resign / offer draw / new game. Optional per-side move timer (off by default).

---

## 5. Architecture

Strict layering, communicating through a small event bus / observable state:

```
┌────────────────────────────────────────────────────────┐
│  UI (DOM overlay: menus, side panel, view controls)    │
├────────────────────────────────────────────────────────┤
│  Renderer (three.js voxel lattice, instanced pieces,   │
│            explode/slice/x-ray views, picking, tweens) │
├────────────────────────────────────────────────────────┤
│  Game Controller (turn flow, input → move, mode logic) │
├──────────────────────┬─────────────────────────────────┤
│  Rules Engine        │  AI (Web Worker)                │
│  (pure, no DOM)      │  (uses Rules Engine)            │
└──────────────────────┴─────────────────────────────────┘
```

### 5.1 Rules Engine (`src/engine/`)
Pure functions, no three.js or DOM, fully unit-testable.

- **Cell indexing:** playable cells packed into `0..255`:
  `idx = (y * 8 + z) * 4 + (x >> 1)` (each row of fixed `(y, z)` has exactly 4
  playable files). `geometry.js` provides `toIdx(x,y,z)`, `fromIdx(idx)`,
  `isPlayable(x,y,z)`, and **precomputed tables** `STEP[idx][dir]` / `JUMP[idx][dir]`
  (`-1` when off-board) for the 12 directions, plus per-colour forward-direction masks.
- **Board:** `Uint8Array(256)` (mailbox). Values `0 empty, 1 red man, 2 red king,
  3 black man, 4 black king` (or signed `Int8Array`). Plus side-to-move, halfmove clock,
  Zobrist hash. Optional later: 256-bit bitboards as `BigUint64Array(4)` for the AI.
- `getLegalMoves(state, player)` → `Move[]`
  `{ from, to, path: [idx...], captured: [idx...], becomesKing }`.
  Applies forced capture (returns only captures if any exist). Multi-jump chains are
  enumerated by DFS with the "kinging ends the move" cut-off.
- `applyMove(state, move)` → new state (copy-on-write); mutating `makeMove/unmakeMove`
  pair used internally by the search.
- `getGameStatus(state)` → `'playing' | 'red_wins' | 'black_wins' | 'draw'`.
- **Notation** (`notation.js`): a cell is `<file><rank><level>`, e.g. `c14` = file c,
  rank 1, level 4. Moves `c14-d25`, captures `c14xe36`, chains `c14xe36xc58`.
  `toNotation(move)` / `fromNotation(str, state)`.
- `hashState(state)` — Zobrist keys `256 cells × 4 piece types` + side to move.

### 5.2 AI (`src/ai/`)
- Runs in `ai.worker.js` (`new Worker(url, { type: 'module' })`), imports the engine.
- Protocol: `{ type: 'think', state, player, difficulty, timeBudgetMs }` →
  `{ type: 'move', move, stats: { nodes, depth, evalScore } }`, with periodic
  `{ type: 'progress', depth, bestSoFar }` so the UI can show search depth.
- Evaluation components (weighted per difficulty):
  - material (man = 100, king = 160 — kings are relatively less dominant with 12
    short directions and 96-piece armies; tune empirically)
  - advancement of men toward the far face
  - back-face guard bonus (occupied home-face cells block enemy kinging)
  - centre control (2×2×2 core: files d–e, ranks 4–5, levels 4–5, and its shell)
  - mobility (legal move count) and **capture-threat count**
  - trapped-king penalty, exposed-piece penalty (enemy can jump it next move)
- Search: negamax + alpha-beta, iterative deepening with a time budget, transposition
  table (`Map` keyed by hash, or a fixed-size typed-array table), move ordering
  (captures by chain length → kinging moves → TT move → history heuristic), always
  extend through forced multi-jumps. Because move lists are large, **staged move
  generation** (captures first, quiet moves only if needed) is a required optimisation.
- Small random jitter on Easy/Medium; optional opening book for Hard.

### 5.3 Game Controller (`src/game/`)
- Owns the authoritative `GameState` + history stack; mode selection, turn sequencing,
  input validation (including in-progress multi-jump chains), AI requests, undo/redo,
  timers, win/draw detection, `localStorage` save/resume.
- Events: `moveMade`, `pieceSelected`, `chainContinued`, `turnChanged`, `gameOver`,
  `pieceKinged`, `pieceCaptured`, `aiThinking`, `aiProgress`, `aiDone`.

### 5.4 Renderer (`src/render/`)
- `SceneManager`: renderer, camera, lights, resize, render loop, quality presets.
- `LatticeView`: the 8×8×8 cube. Playable cells drawn as one `InstancedMesh` of
  translucent bevelled cubes (256 instances); non-playable cells invisible or faint
  wireframe. Cube frame/edges, level plates in exploded mode.
- `PieceView`: `InstancedMesh` per piece type (red man/king, black man/king), up to 192
  live instances; per-instance colour for highlight tints. Kings = stacked disc + crown.
- `ViewModes` — the heart of the UX (§6):
  - **Compact:** the true cube, for overview/cinematic shots.
  - **Exploded:** the 8 levels separated vertically by an adjustable gap (0–1 slider),
    turning the cube into 8 readable stacked boards. Default gameplay view.
  - **Slice/Focus:** isolate a level (or rank/file plane); everything else ghosted.
  - **X-ray:** on selection, all cells/pieces not involved in the selected piece's legal
    moves fade to ~15% opacity so paths through the interior are visible.
  All modes tween smoothly; piece positions are functions of `(cell, explodeFactor)`.
- `HighlightLayer`: selected-piece glow, legal-destination markers, capture-path
  polylines (with level changes drawn as vertical arcs), last-move trail.
- `AnimationSystem`: tweened moves (arc jumps for captures, longer arcs across levels),
  captured pieces fly to per-side graveyard trays, kinging animation, camera tweens.
- `Picker`: raycasting against instanced meshes (`instanceId` → cell/piece), with
  view-mode-aware picking (ghosted objects are not pickable). Hover feedback.
- `CameraController`: OrbitControls, full orbit allowed (the cube has no "underside"),
  min/max distance, presets: red face, black face, top, iso, and per-level focus.

### 5.5 UI (`src/ui/`)
Plain DOM overlay above the canvas (no framework).
- Main menu: New Game → mode → (side, difficulty) → setup size → options → Start.
- In-game side panel: player cards (name, pieces left, captured, kings, timer,
  thinking indicator + search depth), move list, buttons (Undo, Resign, Draw, Menu).
- **View controls:** explode slider, view-mode buttons, level selector (1–8, plus
  "all"), camera presets, "show cell labels" toggle.
- Modals: game over, confirm dialogs, settings.
- Settings: forced capture, men-sideways variant, board flip, animation speed,
  shadow quality, show legal moves, show cell labels, sound, theme, default view mode.
- Toasts for rule hints ("You must capture!", "Continue jumping").

### 5.6 Shared (`src/core/`)
- `EventBus`, `Store` (settings → `localStorage`), `tween.js`, `math.js`, `constants.js`.

---

## 6. Interaction Design

- **Seeing the board:** exploded view by default; mouse-wheel over the explode slider or
  `E` toggles compact/exploded; `[` / `]` step the focused level; `X` toggles X-ray.
- **Select:** click a piece of your colour → it lifts & glows; legal destinations light
  up; capture paths drawn as polylines through the lattice. In exploded view a
  destination on another level appears on its own plate, linked by an arc.
- **Move:** click a highlighted destination → animate → engine applies the move.
- **Multi-jump:** after the first jump only that piece stays selected; remaining capture
  cells highlighted; clicking the final cell of a full chain executes it at once.
- **Hover:** hovered piece and its legal moves preview faintly; cursor becomes pointer.
- **Illegal action feedback:** shake + toast where applicable.
- **Keyboard:** `U` undo, `F` flip camera, `Esc` deselect/menu, `1–5` camera presets,
  `E` explode, `X` x-ray, `[`/`]` level focus.
- Input disabled during animations and CPU thinking.

---

## 7. Visual Design

- Lattice: playable cells as small translucent glass/wood-toned cubes with soft bevels;
  cube frame in dark wood or brushed metal; level plates appear in exploded view.
- Pieces: bevelled discs (LatheGeometry), red & black (or ivory & ebony). King = stacked
  disc + crown emboss / emissive ring. Pieces sit on their cell's bottom face.
- Highlights: emissive cell fill for legal destinations; path polylines with glow;
  depth-cued ghosting for X-ray (`transparent`, `depthWrite: false`, sorted).
- Background: neutral gradient room, blurred; strong contrast so the lattice reads well.
- Cell labels (optional): small billboard text `c14` on hover / always-on.
- Themes (stretch): Classic Wood, Glass/Neon (well suited to a translucent lattice), Marble.
- Post-processing (toggleable): FXAA/SMAA, mild bloom for highlights.
- Sound (optional): slide, capture thud, kinging chime, game-over; muted until first
  interaction.

---

## 8. Proposed File Structure

```
games/3d-checkers/
├── idea.md
├── index.html
├── styles/
│   └── main.css
├── assets/
│   ├── textures/
│   └── sounds/
└── src/
    ├── main.js
    ├── core/
    │   ├── EventBus.js
    │   ├── Store.js
    │   ├── tween.js
    │   └── constants.js
    ├── engine/
    │   ├── geometry.js         # coords ↔ idx, parity, 12 directions, STEP/JUMP tables
    │   ├── Board.js            # Uint8Array(256) state, make/unmake
    │   ├── moves.js            # getLegalMoves (incl. 3D multi-jump DFS), applyMove
    │   ├── status.js           # win/draw detection
    │   ├── notation.js         # c14-d25, c14xe36xc58
    │   ├── setups.js           # standard (96), light (64), skirmish (32)
    │   └── zobrist.js
    ├── ai/
    │   ├── ai.worker.js
    │   ├── search.js
    │   ├── evaluate.js
    │   ├── ordering.js
    │   ├── difficulty.js
    │   └── openingBook.js
    ├── game/
    │   ├── GameController.js
    │   ├── History.js
    │   ├── Timer.js
    │   └── players/
    │       ├── HumanPlayer.js
    │       └── CpuPlayer.js
    ├── render/
    │   ├── SceneManager.js
    │   ├── LatticeView.js      # 8×8×8 cell lattice, frame, level plates
    │   ├── PieceView.js        # instanced pieces
    │   ├── ViewModes.js        # compact / exploded / slice / x-ray
    │   ├── HighlightLayer.js
    │   ├── AnimationSystem.js
    │   ├── CameraController.js
    │   ├── Labels.js           # cell label billboards
    │   └── Picker.js
    └── ui/
        ├── Menu.js
        ├── SidePanel.js
        ├── ViewControls.js     # explode slider, level selector, view-mode buttons
        ├── MoveList.js
        ├── Modals.js
        ├── Settings.js
        └── Toast.js
tests/
└── engine/                     # geometry tables, move gen, multi-jump, kinging, status
```

three.js via import map from a CDN (no bundler):

```html
<script type="importmap">
  { "imports": { "three": "https://unpkg.com/three@0.16x/build/three.module.js",
                 "three/addons/": "https://unpkg.com/three@0.16x/examples/jsm/" } }
</script>
```

---

## 9. Milestones

1. **Geometry + Engine** – parity/indexing, 12-direction STEP/JUMP tables, legal move
   generation incl. 3D multi-jumps & forced capture, kinging, status, notation, setups,
   unit tests with hand-built positions (e.g. chains that change level twice).
2. **Static 3D scene** – lattice, 192 instanced pieces at start, orbit camera,
   **exploded-view slider** working end to end.
3. **Human vs Human** – picking on instanced meshes, selection/path highlights, X-ray
   mode, move animation across levels, turn flow, move list, undo, game-over modal.
4. **AI** – Easy, then Medium/Hard in a Web Worker with staged move gen, TT, progress
   reporting; tune eval weights with self-play at small setups.
5. **Polish** – kinging/capture animations, camera flip, labels, sounds, settings,
   themes, save/resume, quality presets, responsive layout.
6. **QA** – rule edge cases (multi-jump through kinging, no-move loss, draw rules),
   performance with 192 pieces + transparency sorting, cross-browser tests.

---

## 10. Stretch Goals

- Rule variants: flying kings, men capturing backward, mandatory longest chain,
  "men may step sideways", other cube sizes (6×6×6 for quick games, 10×10×10).
- Online play via WebRTC or a small WebSocket relay.
- Hint button (best move from the AI), post-game analysis, threat heat-map overlay.
- Puzzle mode with 3D tactical positions; replay mode with export/import.
- VR/AR (WebXR) — walking around a volumetric board is the natural home for this game.
- Accessibility: keyboard cell navigation (`file/rank/level` entry), screen-reader
  announcements in notation, high-contrast theme.

---

## 11. Open Questions

- Should **men be allowed lateral steps** `(±1,0,±1)`? Strict analog says no (all 2D
  man moves advance); allowing them adds mobility but slows games. Default OFF, variant.
- Is 96 pieces per side too many for casual play? Should *Light* (64) be the default
  with *Standard* (96) as an option?
- Which explode/level should be the default view, and should X-ray auto-enable on
  selection?
- Mailbox `Uint8Array(256)` vs 256-bit bitboards (`BigUint64Array(4)`) for the AI —
  BigInt ops are slow in JS; benchmark before committing.
- Hard-mode time budget (~2s) vs reachable depth given a ~100 branching factor; should
  the budget scale with device speed?
- Draw rule: 40 moves without capture/man-move may be too short for a 192-piece game.