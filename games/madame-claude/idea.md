# Madame Claude — A Tarot Fortune Telling Game

## Concept

Madame Claude is a browser-based tarot card fortune telling experience. The
player visits Madame Claude's virtual parlor, optionally shares a question or a
few personal details, and receives a spread of tarot cards drawn from a
deterministic shuffle. Each card is revealed with prerendered art, and the
reading is interpreted either by a built-in rule-based interpreter or, when an
Anthropic API key is supplied, by a large language model acting in the persona
of Madame Claude.

The game is designed to be:

- **Deterministic by default** — the same person, in the same place, on the
  same day, gets the same cards. This mirrors the folk belief that a reading
  is "meant for you today."
- **Optional in depth** — the player can click through with zero input, or
  write a paragraph about their situation for a richer reading.
- **Self-contained** — no backend is required. The UI runs entirely in the
  browser. The API call (if any) is made client-side with a user-provided key.
- **Reproducible in art** — all card images are generated offline by a Node.js
  render script and committed as static assets.

---

## Gameplay Flow

1. **Arrival**
   - The parlor scene loads: dim background, a table, a face-down deck.
   - Madame Claude greets the visitor with a short, atmospheric line.

2. **Consultation (optional input)**
   - A freeform text area invites the player to share a question, a worry, a
     name, a birthdate, or nothing at all.
   - Placeholder text suggests prompts:
     *"What weighs on your mind? A question, a name, a date… or silence."*
   - A collapsible "Settings" panel offers:
     - Spread type (single card, three-card past/present/future, Celtic Cross).
     - Seed override (text field; leave blank for the default).
     - Anthropic API key (password field, stored only in `sessionStorage`
       unless the player ticks "remember on this device", which uses
       `localStorage`).
     - Model selection (defaults to a fast, inexpensive Claude model).

3. **Shuffle**
   - The deck animates a shuffle.
   - A seed is derived (see *Seeding*), fed to a PRNG, and the 78-card deck is
     shuffled with Fisher–Yates.
   - Cards are dealt face-down into the chosen spread layout.

4. **Reveal**
   - The player clicks each card (or "Reveal All").
   - Each card flips to show its prerendered art, name, and orientation
     (upright or reversed).
   - A short built-in keyword meaning appears beneath each card.

5. **Reading**
   - If no API key is provided, the built-in interpreter composes a reading
     from card meanings, positions, and orientation using templated prose.
   - If an API key is provided, the cards, positions, orientations, and the
     player's freeform input are sent to the Anthropic API. Madame Claude's
     response streams into the reading panel.
   - The reading can be copied, saved as an image, or shared as a URL that
     encodes the seed and spread type (never the freeform input or API key).

6. **Return**
   - "Ask again" resets the spread. Because the default seed includes the
     date, asking the same thing on the same day yields the same cards unless
     the player supplies a different question (which alters the seed) or a
     manual seed override.

---

## Seeding

The random seed determines the shuffle and therefore the entire reading.

### Default seed

```
seed = hash( location + "|" + date + "|" + normalizedInput )
```

- **location** — coarse geolocation, resolved in priority order:
  1. Browser Geolocation API (rounded to ~1 decimal degree so small movements
     don't change the reading; requires user permission).
  2. `Intl.DateTimeFormat().resolvedOptions().timeZone` as a fallback.
  3. The literal string `"unknown"` if neither is available.
- **date** — local calendar date as `YYYY-MM-DD`.
- **normalizedInput** — the freeform text, trimmed, lowercased, whitespace
  collapsed. Empty string if none was given. This means a specific question
  gets its own specific reading, while still being stable for the day.

### Manual seed

Any string typed into the seed field replaces the default entirely. This is
useful for sharing a reading, testing, and for players who want to "reroll."

### PRNG

- Hash: a small, dependency-free string hash (e.g. cyrb53 or FNV-1a) producing
  a 32- or 53-bit integer.
- Generator: mulberry32 or sfc32 seeded from the hash. Both are tiny and
  deterministic across browsers.
- Shuffle: Fisher–Yates over the 78-card array; a second draw per card decides
  orientation (reversed if `rng() < 0.3`, tunable).

---

## Anthropic API Integration

### When it is used

Only when the player supplies an API key. Without a key, the game is fully
playable with the built-in interpreter.

### Request

- Endpoint: Messages API, called directly from the browser with the
  `anthropic-dangerous-direct-browser-access` header (the key belongs to the
  user, so this is appropriate for a local/personal tool).
- Streaming enabled so text appears progressively.
- System prompt establishes the persona:

  > You are Madame Claude, a warm, theatrical, slightly mysterious tarot reader.
  > You interpret the provided cards in their given positions and orientations.
  > Weave the visitor's own words into the reading where relevant. Be evocative
  > but kind. Never claim to predict the future with certainty; frame insights
  > as reflection and possibility. Do not invent cards that were not drawn.

- User message includes structured data:

  ```
  Spread: Three Card (Past / Present / Future)
  Cards:
    1. Past — The Tower (reversed)
    2. Present — Six of Cups (upright)
    3. Future — The Star (upright)
  Visitor's words: "I'm thinking about moving back to my hometown."
  Date: 2025-03-14
  ```

### Safety and privacy

- The API key never leaves the browser except to `api.anthropic.com`.
- The freeform input is sent only when the player has opted in by providing a
  key; the UI states this clearly next to the key field.
- Errors (invalid key, rate limit, network) fall back gracefully to the
  built-in interpreter with a gentle in-character message
  (*"The spirits are quiet tonight… let me read the cards myself."*).

---

## Card Data

A single `cards.json` describes all 78 cards:

```json
{
  "id": "major-16",
  "name": "The Tower",
  "arcana": "major",
  "number": 16,
  "suit": null,
  "keywords": {
    "upright": ["sudden change", "upheaval", "revelation"],
    "reversed": ["averted disaster", "fear of change", "delayed reckoning"]
  },
  "meaning": {
    "upright": "…one or two sentences…",
    "reversed": "…one or two sentences…"
  },
  "image": "assets/cards/major-16.png",
  "art": {
    "palette": ["#1b1b3a", "#e0a458", "#f4f4f9"],
    "symbols": ["tower", "lightning", "falling figures", "crown"]
  }
}
```

- 22 Major Arcana (0–21).
- 56 Minor Arcana across Wands, Cups, Swords, Pentacles (Ace–10, Page, Knight,
  Queen, King).
- The `art` block is consumed by the render script, not the UI.

---

## Spreads

Defined in `spreads.js` as data:

| Spread        | Cards | Positions                                              |
|---------------|-------|--------------------------------------------------------|
| Single        | 1     | The Answer                                             |
| Three Card    | 3     | Past, Present, Future                                  |
| Celtic Cross  | 10    | Situation, Challenge, Root, Past, Crown, Near Future,   |
|               |       | Self, Environment, Hopes/Fears, Outcome                |

Each spread specifies card count, position labels, a short description of each
position, and layout coordinates (grid cell or percentage offsets) for the UI.

---

## UI

**Stack:** plain HTML, modular ES6 (native `import`/`export`, no bundler
required), and hand-written CSS. No frameworks.

### File layout

```
games/madame_claude/
├── idea.md
├── index.html
├── css/
│   ├── base.css          # reset, typography, variables
│   ├── parlor.css        # scene, table, ambient effects
│   ├── cards.css         # card faces, flip animation, spread layouts
│   └── panels.css        # input, settings, reading panel
├── js/
│   ├── main.js           # bootstraps the app
│   ├── seed.js           # location/date/input → seed; hash; PRNG
│   ├── deck.js           # loads cards.json, shuffles, deals
│   ├── spreads.js        # spread definitions
│   ├── interpreter.js    # built-in templated reading
│   ├── anthropic.js      # API client with streaming
│   ├── ui/
│   │   ├── parlor.js     # scene setup and greeting
│   │   ├── consult.js    # input and settings panel
│   │   ├── spread.js     # renders cards and handles reveals
│   │   └── reading.js    # reading panel, copy/share/save
│   └── storage.js        # session/local storage helpers
├── data/
│   └── cards.json
├── assets/
│   ├── cards/            # prerendered PNGs, one per card + card-back.png
│   ├── fonts/
│   └── textures/
└── render/               # Node.js art generation (see below)
```

### Visual design

- Dark, velvet-textured background with a subtle vignette.
- Cards use a fixed 5:9 aspect ratio; the back is a repeating ornamental
  pattern.
- Flip animation via CSS 3D transforms (`rotateY`), ~600 ms.
- Reading text uses a serif display font for headings and a readable serif
  for body; streamed text appears with a soft fade per chunk.
- Fully responsive: spreads reflow to a vertical stack on narrow screens.
- Keyboard accessible: cards are buttons, focus order follows position order,
  reveal state is announced via `aria-live`.
- Respects `prefers-reduced-motion` by disabling shuffle and flip animations.

---

## Card Art Rendering

**Stack:** Node.js script, run offline. Output PNGs are committed to
`assets/cards/` so the UI has zero runtime dependency on the renderer.

### Approach

Procedural, stylized art rather than photographic. Each card is composed from:

1. A background gradient and texture derived from the card's `palette`.
2. An ornamental border shared by all cards (Major Arcana get a gold border,
   each Minor suit gets its own accent color).
3. A central composition built from a library of vector symbols (`tower`,
   `cup`, `sword`, `star`, `moon`, `figure`, etc.) placed according to simple
   per-card layout rules driven by the `symbols` list.
4. The card's number/name in a decorative typeface, and the suit glyph for
   Minor Arcana.

This keeps the deck visually coherent and allows regenerating all 78 cards
from a single script if the style changes.

### File layout

```
render/
├── package.json
├── render.js             # entry point: reads cards.json, writes PNGs
├── symbols/              # SVG fragments for each symbol
├── compose.js            # layout rules: symbols → positioned SVG
├── frame.js              # borders, titles, suit glyphs
└── palette.js            # color helpers
```

### Dependencies (npm)

- `sharp` — rasterizes the composed SVG to PNG at 2× resolution.
- `@resvg/resvg-js` (alternative to sharp if font embedding is needed).
- `seedrandom` or the same PRNG as the UI — so decorative jitter in the art is
  deterministic per card.
- `commander` — CLI flags.

### Execution

```sh
cd games/madame_claude/render
npm install
npm run render              # renders all 78 cards + card back
npm run render -- --only major-16   # re-render a single card
npm run render -- --size 1000       # override output width in px
```

`package.json` scripts:

```json
{
  "scripts": {
    "render": "node render.js",
    "clean": "rimraf ../assets/cards/*.png"
  }
}
```

Output: `../assets/cards/<id>.png` for each card and `card-back.png`.
The script is idempotent and skips unchanged cards unless `--force` is passed.

---

## Built-in Interpreter

When no API key is present, `interpreter.js` produces a reading by:

1. Opening with a line keyed to the spread type.
2. For each position, choosing a sentence template based on the position's
   role and the card's orientation, then filling in the card name and one or
   two keywords.
3. Adding a "connective" sentence between adjacent cards using simple rules
   (e.g. Major following Major → "the forces at work are larger than you";
   same suit twice → comment on the suit's element).
4. Closing with a gentle, non-deterministic reflection line chosen by the
   seeded PRNG so it stays stable for the reading.

Templates live in `data/templates.json` to keep prose editable without
touching logic.

---

## Sharing

A share URL encodes only non-sensitive state:

```
?spread=three&seed=<hash>
```

Opening the link reproduces the exact same cards and orientations. The
freeform input and API key are never included; the recipient sees the cards
and the built-in reading (or can add their own key for an LLM reading).

---

## Out of Scope (for now)

- User accounts or server-side persistence.
- Multiplayer or shared sessions.
- Audio (could be added later as ambient loop + card flip sound).
- Localization beyond English.
- Alternative decks (data model supports it; art pipeline would need a second
  symbol library).

---

## Milestones

1. **Skeleton** — `index.html`, module loading, `cards.json`, seed + shuffle,
   single-card spread with placeholder rectangles.
2. **Art pipeline** — render script produces all 78 cards; UI shows real art.
3. **Spreads + reveal** — three-card and Celtic Cross layouts, flip animation,
   built-in interpreter.
4. **Anthropic integration** — settings panel, streaming reading, graceful
   fallback.
5. **Polish** — responsive layout, accessibility, share links, reduced-motion
   support, save-as-image.