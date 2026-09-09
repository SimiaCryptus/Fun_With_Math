# Troggle — Tridimensional Boggle

> **One line:** Boggle in a cube. Find words by walking a path through a 4×4×4 – 6×6×6
> block of letters, before the sand runs out.

---

## 1. Concept

Classic Boggle is a 4×4 grid where a word is a path of adjacent (8-neighbour) letters,
each cube used at most once. Troggle extrudes that into three dimensions:

* The board is an **N×N×N block of lettered cubes**, N ∈ {4, 5, 6} (64 / 125 / 216 letters).
* Adjacency is the **26-neighbourhood** by default (face + edge + corner neighbours),
  i.e. any cube whose coordinates differ by at most 1 on every axis.
* A word is a **simple path**: consecutive letters adjacent, no cube reused within a word.
* Play is **timed** (default 180 s); score is a function of word length and how much of the
  third dimension the path exploits.

The central design tension is *legibility*: a 6³ block hides 4³ = 64 cubes inside itself.
Everything in the rendering and control design below exists to solve that problem.

---

## 2. Rules

### 2.1 Valid word

A submitted word is scored if **all** of the following hold:

1. Length ≥ `minWordLength` (default 3; 4 for the 6³ board).
2. It exists in the active dictionary (see §6).
3. There is at least one **valid path** for it on the board:
   * letters of the path spell the word (with `Qu` counting as two letters — see §4.3),
   * each step is between adjacent cubes under the current adjacency mode,
   * no cube index repeats within the path.
4. It has not already been scored this round (case-insensitive, accent-folded).

### 2.2 Adjacency modes

| Mode      | Neighbours | Description                        | Difficulty |
|-----------|-----------:|------------------------------------|------------|
| `face`    |          6 | ±1 on exactly one axis             | Hard (sparse) |
| `edge`    |         18 | face + edge, excludes corners      | Medium |
| `corner`  |         26 | everything in the 3×3×3 shell      | Default / easiest |

Mode is a lobby setting; it changes both the solver and the legal-path checker, so it must
live in one place (`Grid.neighbours`).

### 2.3 Scoring

Base score by length (Boggle-like, extended upward):

| Length | 3 | 4 | 5 | 6 | 7 | 8 | 9+ |
|--------|---|---|---|---|---|---|----|
| Points | 1 | 1 | 2 | 3 | 5 | 11 | 11 + 4·(len − 8) |

Multipliers/bonuses that reward using the third dimension (the whole point of the game):

* **Layer bonus:** +1 per distinct Z-layer visited beyond the first (`layers − 1`).
* **Volume bonus:** +3 if the path's bounding box spans all three axes by ≥ 2
  (i.e. it is genuinely 3D, not a plane).
* **Deep bonus:** ×1.5 (rounded up) if every cube in the path is an *interior* cube
  (not on the outer shell). Only meaningful for N ≥ 5.

Only the **best-scoring path** for a word counts; the solver returns the max.

Penalties: submitting an invalid/unfindable word costs nothing but time (a 400 ms shake +
a small "miss" counter shown at the end). No negative scores — this is a chill game.

### 2.4 Round flow

```
LOBBY → (roll) → COUNTDOWN(3s, board visible, input locked)
      → PLAYING(timer) → RESULTS(reveal all missed words, replay/share)
```

---

## 3. Board generation

### 3.1 Deterministic RNG

All randomness flows from a seed so a board can be shared as a short string
(`troggle:5:corner:8f31c2ab`) and so the "Daily Cube" is identical for everyone.

* PRNG: `mulberry32(seed)` — 32-bit, fast, dependency-free.
* Seed derivation for the daily: `hash("troggle" + YYYY-MM-DD + size + adjacency)`.

### 3.2 Dice, not frequencies

Naïve frequency sampling produces vowel deserts and `J/Q/X/Z` clusters. Troggle uses **dice**
(as Boggle does), extended to fill up to 216 slots:

* A canonical pool of 6-face dice is defined in `data/dice.js` for each board size.
* The pool is shuffled (Fisher–Yates with the seeded PRNG), assigned to cube positions,
  each die rolled to pick its face.
* Die faces are drawn from an English-weighted distribution, with the constraint that every
  die contains ≥ 1 vowel and no die contains more than one of `{J,K,Q,X,Z}`.

### 3.3 Quality gate (rejection sampling)

After generation, the board is validated by the solver; regenerate (max 12 attempts,
then accept best) unless:

* total findable words ≥ `minWords(N)` (e.g. 60 for 4³, 150 for 5³, 300 for 6³),
* vowel ratio ∈ [0.28, 0.45],
* every 2×2×2 sub-block contains ≥ 1 vowel,
* at least 3 words of length ≥ 7 exist.

Generation + solving for 6³ must stay under ~600 ms; it runs in a **Web Worker** with a
loading spinner so the main thread never janks.

---

## 4. Input

Three coequal input paths. All of them funnel into the same `submitWord(word, path?)`.

### 4.1 Pointer / touch selection

* **Tap** a cube to append it to the current path (must be adjacent to the last one;
  non-adjacent taps flash red and are ignored).
* **Drag** across cubes to trail-select (pointer capture + raycast on move).
* Tapping the **last** selected cube again removes it (backtrack); tapping the **first**
  clears.
* Release / `Enter` / the ✓ button submits. `Esc` / double-tap empty space clears.
* Occluded cubes: raycasting only hits cubes whose *current* opacity ≥ 0.35, so x-ray
  ghosts are not accidentally selectable. Layer-slicing (§5.3) is the intended way in.

### 4.2 Typing

* A always-focused (but visually minimal) text field; typing anywhere focuses it.
* As the user types, the engine live-searches for a path and **highlights it in the cube**
  (first/shortest path found). This doubles as a teaching aid.
* Green outline = findable + in dictionary; amber = findable but not a word; grey = no path.
* `Enter` submits, `Backspace` on empty field clears highlight.

### 4.3 Speech

* `webkitSpeechRecognition` / `SpeechRecognition`, `continuous = true`,
  `interimResults = true`, `lang` from settings (default `en-US`).
* Interim transcripts highlight the path; final transcripts auto-submit each token.
* Normalisation: lowercase, strip punctuation/whitespace, fold accents, expand digits
  ("for" ← "4"), and a homophone map for common ASR slips (`to/too/two` are all tried).
* A mic button with three states (off / listening / error) and a live level meter.
  Never auto-start: browsers require a gesture, and hot mics are hostile.
* Graceful degradation: if the API is absent, hide the mic and show a tooltip.

### 4.4 The `Qu` rule

One die face is `Qu`. It occupies one cube but contributes two letters. Path→word
expansion and word→path search both handle it; the solver's trie walk consumes two
characters for that node.

### 4.5 Keyboard-only play (accessibility)

* `WASD`/arrows move a 3D cursor within the current layer, `Q`/`E` change layer,
  `Space` selects, `Backspace` backtracks, `Enter` submits.
* The cursor position is announced via an `aria-live` region:
  *"Layer 3, row 2, column 4, letter T, selected."*

---

## 5. Rendering (three.js)

### 5.1 Scene

* `WebGLRenderer` (antialias, `powerPreference: 'high-performance'`), sRGB output,
  `ACESFilmicToneMapping`, DPR capped at 2.
* `PerspectiveCamera(50°)` framed so the block fills ~70% of the shorter viewport axis;
  reframed on resize and on N change.
* Lighting: hemisphere + one directional key with soft shadows off (cheap), plus a subtle
  fresnel rim in the cube shader so silhouettes read against the background.
* Background: dark radial gradient; optional slow-rotating starfield (disabled under
  `prefers-reduced-motion`).

### 5.2 Cubes and letters

* A single `InstancedMesh` of `RoundedBoxGeometry` for up to 216 instances; per-instance
  colour via `instanceColor`, per-instance state (selected/hinted/dim) via a custom
  attribute consumed by an `onBeforeCompile` patch.
* Letters: **one canvas texture atlas** (26 glyphs + `Qu`, 512² power-of-two, mip-mapped)
  drawn on 6 faces via per-instance UV offset, so the letter is legible from every angle
  without billboarding. Faces are oriented so no letter appears upside-down.
* Selected cubes: emissive lift + 6% scale-up (springy `easeOutBack`, 120 ms).
* The selection path is drawn as a `TubeGeometry` through cube centres (`CatmullRomCurve3`),
  animated with a flowing dash/uv scroll.

### 5.3 Seeing inside — the hard problem

Four complementary tools, all bound to on-screen controls **and** keys:

1. **Layer slicing** (`[` / `]` or a slider): show only layer *k* on an axis; the rest
   drop to 8% opacity. The axis is chosen by which face is most camera-facing.
2. **Peel / exploded view** (`X`): instances translate outward from the centre by
   `t · (pos − centre) · 1.6`, revealing the core. Fully interactive while exploded.
3. **X-ray** (`Z` held): all cubes → 25% opacity, letters stay opaque; depth-write off,
   sorted back-to-front.
4. **Focus dimming:** whenever a path exists, non-adjacent cubes dim to 40% and legal next
   cubes get a soft glow — this is also the beginner's guide rail.

### 5.4 Camera controls

Custom minimal orbit controller (~150 lines, no `OrbitControls` dependency, because we need
tap-vs-drag disambiguation to coexist with selection):

* **Desktop:** LMB drag = orbit, wheel = dolly, RMB/MMB drag = pan, double-click = recentre.
* **Touch:** 1 finger = orbit *unless* the gesture starts on a cube and stays under the
  drag threshold (8 px) → treated as tap/trail-select. 2 fingers = pinch-zoom + pan.
* Damped (inertial) rotation, polar clamp to avoid gimbal flip, distance clamp.
* Snap buttons: `Front / Top / Iso` with 400 ms eased tweens.

### 5.5 Performance targets

60 fps on a 2019 mid-range phone at 6³: ≤ 3 draw calls for the block, ≤ 20 total;
raycast against a `Box3`-accelerated instance list, not per-triangle; no per-frame
allocations in the render loop (pre-allocated `Vector3`/`Matrix4` scratch objects).

---

## 6. Dictionary & solver

### 6.1 Word list

* Base: TWL/ENABLE-style open list, filtered to 3–15 letters, lowercase, a–z only.
  (~170k words → ~1.6 MB raw.)
* Shipped as a **packed trie / DAWG** in a binary `.bin` (~700 kB, ~250 kB gzipped),
  loaded once and cached in IndexedDB.
* Loaded and queried inside the Web Worker; the main thread only ever asks
  `isWord(w)` / `solve(board)`.

### 6.2 Solver

Depth-first search from every cube, walking the trie in lockstep so a branch dies the
instant its prefix leaves the trie. Visited set is a `Uint8Array(N³)` reused across
branches. Results: `Map<word, {bestScore, bestPath}>`.

Used for: the generation quality gate, the "you missed these" results screen, hints, and
the live typing highlight (`findPath(word)` = same DFS, early-exit).

### 6.3 Hints (optional, costs points)

* *Nudge:* flash a cube that starts ≥ 3 unfound words (−1 pt).
* *Reveal:* show one unfound word's path for 1.5 s (−half its value).

---

## 7. UI

```
┌──────────────────────────────────────────┐
│  ⏱ 2:14      Troggle 5³      ★ 47        │  top bar: timer / title / score
├──────────────────────────────────────────┤
│                                          │
│              [ 3D canvas ]               │
│                                          │
│        layer ▮▮▯▯▯   ⤢ peel  ◎ x-ray     │  view tools (bottom-left, thumb-reachable)
├──────────────────────────────────────────┤
│  T R O G ▌            ✓  ✗   🎤          │  word bar: current path, submit, clear, mic
├──────────────────────────────────────────┤
│  FOUND (9): TROG · GORE · OGRE …         │  collapsible; tap a word to replay its path
└──────────────────────────────────────────┘
```

* Mobile-first, `dvh` units, safe-area insets, no layout that breaks under a virtual keyboard.
* Toasts for feedback: `+5 GOLDEN` (green), `NOT A WORD` (amber), `ALREADY FOUND` (grey).
* Results screen: score, WPM-ish "words per minute", best word with its path animated,
  a bar of what you missed by length, share button (copies the seed string + emoji grid).

---

## 8. Architecture

Plain ES modules, no build step, no framework. `three.js` from an import map so it can be
swapped for a local vendored copy offline.

```
games/troggle/
  index.html            # import map, canvas, DOM shell
  idea.md               # this document
  css/
    style.css
  js/
    main.js             # bootstrap: wires modules, owns nothing
    core/
      rng.js            # mulberry32, hashString, shuffle, pick
      grid.js           # coords/index, neighbours, path validity, path metrics
      dice.js           # dice pools per size, rolling
      board.js          # generate + quality gate
      trie.js           # packed trie load + isWord/hasPrefix
      solver.js         # DFS solve() and findPath()
      scoring.js        # scoreWord(word, path, grid)
      game.js           # state machine, timer, found-words set, events
    view/
      renderer.js       # scene, camera, loop, resize
      cubes.js          # InstancedMesh, letter atlas, per-instance state
      atlas.js          # canvas glyph atlas generator
      pathline.js       # tube through selected centres
      controls.js       # orbit/pan/zoom + tap-vs-drag arbitration
      effects.js        # slice / peel / x-ray / dim transitions
    input/
      picker.js         # raycast → cube index, drag-trail selection
      keyboard.js       # 3D cursor + shortcuts
      speech.js         # SpeechRecognition wrapper + normalisation
    ui/
      hud.js  toasts.js  results.js  settings.js
    workers/
      dict.worker.js    # trie load, solve, isWord, board generation
    data/
      dice.js  words.bin
  tests/
    grid.test.js  scoring.test.js  solver.test.js  board.test.js
```

**Data flow:** `input/* → game.js (single source of truth) → EventTarget → view/* + ui/*`.
Views never mutate game state; the game never touches the DOM or three.js.

---

## 9. Settings & persistence

`localStorage['troggle.settings']`:
`{ size, adjacency, duration, minWordLength, speechLang, reducedMotion, colorblind, sound }`

`localStorage['troggle.stats']`: per-size bests, streaks, daily-cube history (last 30).

---

## 10. Accessibility

* Full keyboard play (§4.5) and visible focus rings on every control.
* `aria-live="polite"` for score/timer milestones, `assertive` for word results.
* A DOM mirror of the board (`<table>` per layer, off-screen) so screen readers can read it.
* Colour-blind-safe palette; state is never colour-only (icons + motion + text).
* `prefers-reduced-motion`: no auto-rotate, instant tweens, no dash flow.
* Text scales with `rem`; the HUD survives 200% zoom.

---

## 11. Testing

* `grid`: neighbour counts (6/18/26) at corner/edge/face/interior positions; path validity
  rejects repeats and non-adjacent steps.
* `scoring`: table cases + layer/volume/deep bonuses + `Qu`.
* `solver`: hand-built 3×3×3 boards with known answers; `findPath` agrees with `solve`.
* `board`: same seed → identical board; quality gate holds over 100 seeds.
* Manual matrix: iOS Safari, Android Chrome, desktop Chrome/Firefox/Safari; portrait +
  landscape; with/without speech API.

---

## 12. Roadmap

* **M1 — Playable core:** 4³ board, corner adjacency, tap select, typing, timer, scoring,
  plain-array dictionary. No worker, no fancy views.
* **M2 — Legibility:** slice / peel / x-ray, focus dimming, letter atlas, polish controls.
* **M3 — Depth:** worker + packed trie, solver, results screen with missed words, seeds,
  Daily Cube, share string.
* **M4 — Voice & a11y:** speech input, keyboard cursor, screen-reader mirror, settings.
* **M5 — Beyond:** async multiplayer on a shared seed, 6³ marathon mode, "gravity" mode
  (used cubes fall and are replaced), colour-tinted bonus cubes, PWA offline install.

## 13. Open questions

* Is 26-neighbour adjacency *too* generous at 6³ (word count explodes)? Maybe scale
  `minWordLength` and default to `edge` mode for N ≥ 5.
* Should a cube be reusable across *different* words in the same round? (Yes, as in Boggle.)
* Does trail-drag selection fight the orbit gesture too much on phones, or is the 8 px
  threshold + "start on a cube" rule enough? Needs playtesting.
## 14. Implementation notes (deviations from the plan above)
The shipped UI follows §5–§7 with three deliberate simplifications, all reversible:
* **Letters only — there are no cubes.** The block renders as a cloud of opaque,
    dark-haloed glyphs floating at the cube centres (camera-facing quads, glyph atlas +
    per-instance UV offset, one draw call for the whole block). The glass-cell shader
    still exists behind a `showCubes` flag, but it is off: shells made it hard to tell
    which letter you were about to hit, and clicks kept landing on a cube face rather
    than on the letter you meant. The glyphs write depth so front letters occlude back
    letters, and letters deeper than the block centre shrink/fade slightly.
* **Picking is glyph-pixel, not geometry.** `cubes.pickLetter()` tests the pointer
    against the *rendered glyph quads* in screen space (nearest-to-camera first, plus a
    ~1.35× snap radius for near misses), so only a letter is ever selectable and the
    dead space between letters no longer swallows taps. Faint letters (sliced-away
    layers) are excluded — the §4.1 "opacity ≥ 0.35" rule — unless they are legal next
    cubes or the head/tail of the current path, which is how you tap an interior letter
    you can see behind a front one.
* **Two InstancedMeshes instead of per-instance opacity.** `cubes.js` keeps a `tier`
   per cube (clear / ghost / hidden) and refills a clear mesh (~30% fill) and a ghost
   mesh (~5%, drawn after) each frame; a per-instance `glow` attribute lifts the
   opacity/brightness of selected, legal, cursor and hint cubes. Focus dimming is done
    with *colour*, not alpha, so it stays smooth. With the shells hidden the tiers now
    only drive letter brightness/alpha (and therefore pickability).
* **Dictionary:** a compact built-in word list (`js/data/words.js`) makes the game
  playable with zero assets. `core/dict.js` prefers `js/data/words.txt` when present,
  and `workers/dict.worker.js` already generates + solves off the main thread, so the
  packed DAWG of §6.1 only has to satisfy the same `isWord`/`step` interface.
Gesture arbitration (§5.4 / §13): trail-drag selection is **off** — it fought the orbit
gesture too much to be usable, so *every* drag orbits (right/middle drag pans anywhere,
two fingers pinch-zoom and pan) and only a **tap** selects. Layer slicing (§5.3.1) and
x-ray (§5.3.3) are gone as well; **peel is a slider** (0–100%), which with focus dimming
turned out to be the only "see inside" tool that earned its keep once the cube shells
were hidden. Selection is transient input state, so it lives in `core/selection.js`
rather than in `game.js`.