# Text Block: an interactive sorted-rotation matrix

## Summary

Text Block is a small, dependency-free web experiment built with plain HTML, CSS and
modular ES6 (native `<script type="module">`, no bundler). It visualizes the
**sorted offsets of a text ring**. This is the full matrix of cyclic rotations that
underlies the Burrows–Wheeler Transform (BWT), rendered as a live, "Matrix"-inspired
grid of glowing glyphs.

The visualization is meant to make these properties of the BWT tangible:

- every row is the same ring, read from a different starting offset
- sorting those rows produces the first column (F) and the last column (L = BWT)
- each individual character of the input appears exactly once in every row, and
  following one character through the grid reveals the structure (LF-mapping)
  that makes the transform invertible

The experiment has three core interactions:

1. **Live editing.** The text ring can be edited, and the block re-sorts and
   re-renders in real time.
2. **Horizontal dragging.** The block can be dragged left and right. The
   sorting-origin column can then be shown with the characters that *precede*
   each offset (prefixes) as well as the ones that follow it (suffixes).
3. **Positional highlighting.** Clicking a cell highlights that specific character
   occurrence everywhere it appears in the grid. Highlighting survives edits when
   possible and supports standard shift/ctrl multi-select.

---

## Concepts and terminology

### Text ring

The input text `T` of length `n` is treated as **circular**. The character after
`T[n-1]` is `T[0]`. Position arithmetic is always mod `n`.

An optional **sentinel** (`$` by default, conceptually lexicographically smallest)
can be appended. With the sentinel, the sorted rotations correspond one-to-one with
the suffix array of `T$`. Without it, the block shows the pure cyclic rotation sort.
This matters for periodic strings such as `abab`, where rotations can tie.

### Rotation / offset

Rotation `i` is the ring read starting at position `i`:
`R_i = T[i] T[i+1] ... T[i+n-1]` (indices mod `n`).

### Sorted offsets

`SA` is the list of offsets `0..n-1` ordered by the lexicographic order of their
rotations. Ties between identical rotations are broken by offset, which keeps the
sort stable and deterministic. Row `r` of the block displays rotation `SA[r]`.

### Sorting-origin column

Column 0 of the unshifted block is the **sorting-origin column**. It holds the first
character of every rotation, which is the F column. Everything to its right is the
*suffix side* of each row. Everything to its left, once the block is dragged, is the
*prefix side*. The last column of the unshifted block is L, the BWT output.

### Positional character (cell identity)

The cell at row `r` and display column `k` shows the ring position
`p(r, k) = (SA[r] + k - shift) mod n`, and the character `T[p]`.

Two cells are "the same character" **only if they share `p`**, not merely the same
glyph. Clicking an `a` highlights *that* `a` (for example, ring position 7) in all
`n` rows. Other `a`s are not highlighted. Each position appears exactly once per
row, so a highlighted position traces a path of `n` cells through the block.

---

## Visual design

### Aesthetic

- Black or very dark green background. Monospace glyphs in phosphor green
  (`#00ff66`-ish) with a soft `text-shadow` glow.
- Brightness is not uniform:
  - the sorting-origin column (F) and the L column are rendered slightly brighter
    and have subtle vertical guide lines
  - prefix cells (to the left of the origin) are dimmer than suffix cells, so the
    eye can find the origin at any drag offset
- Highlighted cells invert or flare: brighter glyph, stronger glow, and a
  background tint. Each selected position may get its own hue from a small palette
  (green, cyan, amber, magenta…) so several selections stay distinguishable.
- Subtle animation adds the "digital rain" feel without hurting legibility:
  - when the text changes, cells whose character changed briefly flicker through a
    few random glyphs before settling on the new one
  - when rows re-sort, they slide vertically to their new rank using a CSS
    transform transition instead of jumping
- `prefers-reduced-motion` disables flicker and slide animations.

### Layout

~~~
+-----------------------------------------------------------+
|  [ text ring editor ...................... ] [$] [reset]  |
|  n = 11   BWT: "ard$rcaaaabb"   selection: 2 positions    |
+-----------------------------------------------------------+
|     offset | <- prefixes |F   suffixes ...             L| |
|  r0   11   |  . . . . .  |$ a b r a c a d a b r a      | |
|  r1   10   |  . . . . .  |a $ a b r a c a d a b r      | |
|  ...                                                      |
+-----------------------------------------------------------+
~~~

- **Header / editor bar.** The text input, a sentinel toggle, and small readouts:
  length, the current BWT string (L column), and selection count.
- **Row gutter** (optional, toggleable). Row rank `r` and offset `SA[r]`. It does
  not scroll horizontally with the block.
- **Block.** An `n × n` grid of cells. Horizontally it can extend past `n` columns
  when dragged. Because the data is a ring, any shift is valid and the content
  wraps.
- The origin column is marked with a persistent vertical line, so after dragging
  it stays obvious where each rotation "starts".

---

## Interactions

### 1. Editing the text ring

- The primary editor is a single-line `<input>` or auto-growing `<textarea>`.
  Newlines are either disallowed or shown as a visible glyph such as `⏎`. The same
  applies to spaces, shown as `␣`, so that every cell is visible.
- On every `input` event:
  1. compute the new text
  2. update stable character identities (see *Persistence* below)
  3. recompute `SA`
  4. re-render the block using a diff/patch approach, not a full rebuild
- Empty input shows an empty-state message. A length of 1 renders a trivial
  1×1 block.
- A soft length cap (for example 256) protects performance, since the grid is
  `O(n²)` cells. Beyond the cap, the UI warns and offers truncation.
- *Optional stretch goal:* an in-grid circular ring widget above the block, where
  characters sit on a circle and the current selection is highlighted on the ring
  too.

### 2. Dragging the block left/right

- Pointer-drag (mouse, touch, pen via Pointer Events) anywhere on the block pans it
  horizontally. The pan snaps to whole-column increments on release. During the
  drag, it may follow the pointer with sub-cell smoothness.
- The drag changes `shift`, an integer column offset:
  - `shift = 0`: origin at the left edge; the block shows suffixes only
  - `shift = k > 0`: `k` prefix columns are revealed to the left of the origin,
    showing the `k` characters that precede each rotation's offset in the ring
- The ring wraps, so the viewport can show more than `n` columns (for example
  `n` prefix + `n` suffix). This makes the relationship between the L column and
  the next row's F column visible.
- Keyboard: `←` / `→` shift by one column when the block has focus. `Home`
  resets `shift` to 0.
- A drag must not trigger selection. A click with movement below a small
  threshold (about 4px) counts as a click. Anything larger counts as a drag.

### 3. Positional highlighting and selection

- **Click** on a cell: the selection becomes `{ p(cell) }`, the single ring
  position under the cursor. All `n` cells showing that position are highlighted.
- **Ctrl/Cmd + click**: toggle that position in or out of the selection.
- **Shift + click**: select the contiguous range of ring positions from the
  *anchor* (the last plain- or ctrl-clicked position) to the clicked position.
  - The range is taken in ring order, going the shorter way around, or forward from
    the anchor. The chosen convention must be documented in the UI tooltip.
  - Shift + ctrl/cmd adds that range to the existing selection.
- **Click on empty space or `Esc`**: clear the selection.
- Hovering a cell previews its position path with a faint highlight, so the user
  can see what a click would select.
- The readout shows the selected positions and their characters, for example
  `pos 3 'a', pos 7 'a'`.
- *Optional overlay:* draw a thin polyline through the highlighted cells of each
  selected position, row by row, to make the path through the sorted order
  explicit.

---

## Persistence of selection across edits

Selection is stored by **stable character identity**, not by raw position, so it
can survive edits.

- Each character in the ring gets a unique, monotonically assigned id when it is
  inserted. The model keeps `chars: Array<{ id, ch }>`.
- Selection is a `Set<id>`. The anchor for shift-click is also an id.
- On an edit, the old and new strings are reconciled:
  1. Preferred: use the input's `selectionStart` / `selectionEnd` from before and
     after the event, plus `inputType`, to determine exactly which range was
     replaced.
  2. Fallback: compute the longest common prefix and suffix between the old and
     new text. The middle section is a replacement.
  3. Characters in the unchanged prefix and suffix keep their ids. Removed
     characters drop their ids, and those ids are removed from the selection.
     Inserted characters get fresh ids.
- Result:
  - typing elsewhere in the text does not disturb highlights
  - deleting a highlighted character removes its highlight
  - replacing a character (select one char, type another) creates a new identity,
    which is *not* highlighted
- Undo/redo from the native input behaves like any other edit and goes through the
  same reconciliation.

---

## Architecture (modular ES6)

~~~
experiments/text-block/
  index.html        – markup shell, loads main.js as a module
  style.css         – matrix theme, grid layout, highlight palette, motion prefs
  idea.md           – this document
  src/
    main.js         – bootstraps modules, wires events to state
    state.js        – single source of truth + tiny pub/sub (subscribe/emit)
    ring.js         – text ring model: chars with stable ids, apply edits
    diff.js         – old/new text reconciliation (range-based + prefix/suffix)
    sort.js         – rotation sorting → SA (with/without sentinel)
    selection.js    – selection set, anchor, click/ctrl/shift semantics
    drag.js         – pointer-events drag → shift, click-vs-drag threshold
    render.js       – grid DOM creation and incremental patching
    glyphfx.js      – flicker / row-slide animations (respects reduced motion)
~~~

### State shape

~~~
{
  chars: [{ id, ch }],   // the ring, in order
  sentinel: true,        // append '$' (rendered with its own id)
  sa: Int32Array,        // sorted offsets
  shift: 0,              // integer column shift (prefix columns shown)
  selection: Set<id>,
  anchor: id | null,
  hover: id | null
}
~~~

Derived values, such as the BWT string and the position→id map, are computed from
state and are not stored.

### Data flow

`input event → ring.applyEdit (diff.js) → sort.computeSA → state.emit('text')`
`pointer → drag.js / selection.js → state.emit('shift' | 'selection' | 'hover')`
`render.js subscribes → patches only what changed`

### Sorting

- For the target sizes (≤ a few hundred characters), a straightforward approach is
  enough: sort offsets with a comparator that compares rotations character by
  character, mod `n`. The comparator stops at the first difference or after `n`
  characters and breaks ties by offset. The cost is `O(n² log n)` in the worst
  case, which is fine at this scale.
- A prefix-doubling implementation (`O(n log² n)`) can replace the comparator
  later if larger inputs are wanted. Callers do not change because the API is
  the same: `computeSA(chars, { sentinel }) → Int32Array`.

### Rendering strategy

- The grid is a CSS grid of `<span>` cells, one row element per rotation. Each row
  element is keyed by its **offset**, so re-sorting moves existing rows. A FLIP
  animation handles the vertical slide instead of recreating rows.
- Each cell carries `data-pos` (ring position) and gets its highlight state from
  a class set by `data-id`. A selection change toggles classes on the affected
  cells only. The renderer keeps an index `id → cells[]` for that purpose.
- Horizontal shift uses a `transform: translateX(...)` on the block while
  dragging. On release, the renderer commits a new `shift` and re-labels cell
  contents. The number of rendered columns stays constant.
- Event handling uses delegation: a single `pointerdown` / `pointermove` /
  `click` handler on the block container reads `data-pos` from the target.
- An optional `<canvas>` renderer is a later path if DOM cell count becomes a
  bottleneck. `render.js` exposes the same interface either way.

---

## Accessibility

- The block is focusable (`tabindex="0"`) and supports arrow-key navigation of a
  "cursor cell":
  - `↑` / `↓` move the cursor between rows
  - `←` / `→` move it between columns, and shift the block when the cursor reaches
    an edge
  - `Space` / `Enter` select the cursor cell, with the same modifier semantics as
    clicks
- `aria-live` region announces selection changes, for example:
  "position 7, character a, selected; appears in 11 rows".
- Colour is never the only highlight cue. Selected cells also get an underline or
  box outline.

---

## Edge cases

- **Repeated rotations** (periodic text such as `aaaa` or `abab` without a
  sentinel): identical rows are ordered by offset. The UI may group or badge tied
  rows.
- **Whitespace and special characters** are shown as visible stand-in glyphs, but
  the underlying characters are sorted by their code units. Optionally, sorting
  can use grapheme clusters via `Intl.Segmenter` so emoji occupy one cell.
- **Sentinel toggling** changes `n`. The sentinel gets its own stable id, so
  selections of normal characters survive the toggle.
- **Selecting the sentinel** is allowed and highlights its path like any other
  position.
- **Very small n** (0 or 1) must not break drag or selection logic.

---

## Milestones

1. **Static block.** Hard-coded text, compute SA, render the sorted matrix with
   the theme, and mark the F and L columns.
2. **Live editing.** Input field, recompute on input, and incremental
   re-render.
3. **Selection.** Click, ctrl/cmd, and shift semantics with positional
   highlighting, hover preview, and readouts.
4. **Stable ids.** Diff-based identity tracking so selection persists across
   edits.
5. **Dragging.** Pointer-based horizontal pan with snapping, prefix/suffix
   dimming, and keyboard shifting.
6. **Polish.** Row-slide and glyph-flicker animations, sentinel toggle, path
   overlay, accessibility pass, and reduced-motion support.
7. **Stretch goals.** Circular ring widget, inverse-BWT step-through using the
   highlighted LF path, and a canvas renderer for larger inputs.

## Open questions

- Should shift-click ranges follow ring order (contiguous in `T`) or row order
  (contiguous in the block)? The default is ring order. A row-order mode may be
  useful for exploring runs in L.
- Should vertical re-sorting on each keystroke be animated, or debounced so that
  fast typing does not cause constant motion?
- Should the block also be draggable vertically, rotating the *row* order, to show
  that SA is not cyclic? It is probably not needed, but it might be worth
  prototyping.