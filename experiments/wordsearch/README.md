# Predictive Markov Wordsearch Generator

A Progressive Web App (PWA) that generates wordsearch puzzles in which the
**filler letters are not random**. Instead, they are predicted by a Markov
model trained on a reference text so that the background of the grid reads
like plausible fragments of natural language in every direction — making the
hidden target words genuinely harder to find.

> For the full technical specification, see [`idea.md`](./idea.md).

---

## Why This Exists

In a typical wordsearch, the cells that don't belong to a hidden word are
filled with **uniformly random** letters. This has a giveaway side effect:
the human eye is very good at noticing structure. A real word standing in a
sea of random noise (`QXZJ...`) pops out, because the surrounding letters
almost never form letter combinations that look like language.

This project flips that around. The filler is generated to **mimic the
statistical texture of natural language** along all eight reading directions.
When the noise itself looks word-like, the target words blend in, and the
puzzle becomes meaningfully harder — not because of grid size, but because of
*camouflage*.

---

## Background Concepts

### Wordsearch Puzzles

A wordsearch is a 2D grid (lattice) of single characters. A set of **target
words** is hidden inside it, each placed along a straight line in one of eight
directions:

```
NW   N   NE
\  |  /
W -- o -- E
/  |  \
SW   S   SE
```

Words may run forwards or backwards, vertically, horizontally, or
diagonally. Every remaining cell is "filler". The quality of the puzzle is
largely determined by how well the filler hides the targets.

### Markov Models

A **Markov model** predicts the next item in a sequence based on the recent
history. For text, we model it at the *character* level: given the previous
few characters, what is the probability distribution over the next character?

Training is simply counting. We slide a window over a reference text and
record, for each observed context, how often each following character
appears:

```
context "th" ->  { e: 120, a: 40, i: 30, r: 12, ... }
context "qu" ->  { i: 95,  e: 30, a: 10, ... }
```

Normalising those counts gives a probability distribution we can sample from.

### Order & Context

The **order (N)** is how many preceding characters the model looks at:

- Order 0 — ignores history; just the overall letter frequency (unigram).
- Order 1 — looks at the single previous character.
- Order 3 — looks at the previous three characters (our default).

Higher orders produce text that looks more convincingly like the source, but
require more training data and are more likely to hit contexts they've never
seen before.

### Back-off

When a high-order context has never been observed in the training text, the
model **backs off** to a shorter context, and keeps shortening until it finds
one with data — ultimately falling back to the order-0 unigram distribution.
This guarantees we can always produce a prediction without leaving holes in
the grid.

---

## How It Works

At a high level, generation proceeds in three phases:

1. **Train** — Build the Markov model from a reference text by counting
   `context -> { char -> count }` frequencies up to order N.

2. **Place** — Drop each target word onto the grid at a random position and
   direction, rejecting placements that conflict (overlaps are allowed only
   when the shared letters match). Placed cells are **locked** so the filler
   never overwrites them.

3. **Fill** — Fill the remaining cells, but not left-to-right. We use an
   **adjacency-ordered** fill: cells surrounded by the most already-filled
   neighbours are filled first. For each chosen cell, we read the context
   string in each of the eight directions, ask the model for a prediction
   per direction, and **combine** those distributions before selecting a
   letter.

```
place target words (locked cells)
compute initial adjacency scores for empty cells
while empty cells remain:
   cell  = highest adjacency score (random tie-break)
   dists = predictions from every direction with a known context
   combined = combine(dists, config.combiner)
   cell.char = select(combined, config.sampling)
   update neighbours' adjacency scores
```

The key insight is the **combination step**. A single cell is read as part of
potentially several different lines (one per direction), so its letter should
be plausible for *all* of them at once. We support several combiners:

| Combiner  | Behaviour                                                                        |
|-----------|----------------------------------------------------------------------------------|
| `product` | Multiply probabilities — AND-like; favours letters that all directions agree on. |
| `sum`     | Average the distributions — OR-like; more permissive.                            |
| `max`     | Take the single strongest directional vote.                                      |
| `vote`    | Each direction votes for its argmax; majority wins.                              |

Everything runs **client-side** and the app ships as an installable,
offline-capable PWA — no server, no build step.

---

## How This Differs From Similar Approaches

Most wordsearch generators — and the academic literature on puzzle generation
— fall into one of a few buckets. Here's where this project sits relative to
them:

### vs. Random / Frequency-Weighted Filler

The overwhelmingly common approach is to fill empty cells with **uniformly
random** letters, or occasionally letters drawn from a language's *unigram*
frequency table (so `E` and `T` appear more than `Q` and `Z`). Both ignore
*sequence* structure entirely. We model the **conditional** distribution
(order-N), so the filler exhibits realistic letter *transitions*, not just
realistic letter *counts*.

### vs. Single-Direction Text Generation

Plenty of toys use a Markov chain to generate fake words or text. But text is
generated in **one** direction (left to right). A wordsearch is read in
**eight**. A naive Markov fill that only respects, say, the horizontal
direction would still produce nonsense vertically and diagonally. Our
**multi-directional combination** is the core difference: each cell is
optimised to be plausible across *all* the lines it participates in
simultaneously.

### vs. Dictionary / Constraint-Solver Filler

Some sophisticated generators (closer to crossword construction) try to make
the filler spell *real* words in multiple directions using dictionaries and
constraint solvers. That is computationally expensive, often infeasible for
dense grids, and produces a different feel (it leaks real words, which can be
distracting). We deliberately aim for **plausible-but-not-real** texture:
cheap to compute, tunable, and statistically camouflaging rather than
exhaustively word-packed.

### vs. Difficulty-by-Size

Many generators make puzzles "harder" simply by enlarging the grid or adding
more words. Our difficulty lever is **statistical camouflage**: by matching
the noise to the language model, target words blend into their surroundings
regardless of grid size. The Markov order and combiner give fine-grained,
*qualitative* control over difficulty.

### Summary

| Approach                       | Sequence-aware | Multi-directional | Produces real words |    Cost    |
|--------------------------------|:--------------:|:-----------------:|:-------------------:|:----------:|
| Uniform random filler          |       ✗        |         ✗         |          ✗          |    Low     |
| Unigram-frequency filler       |       ✗        |         ✗         |          ✗          |    Low     |
| Single-direction Markov        |       ✓        |         ✗         |          ✗          |    Low     |
| Dictionary / constraint solver |       ✓        |         ✓         |          ✓          |    High    |
| **This project**               |     **✓**      |       **✓**       | ✗ (plausible-only)  | **Medium** |

---

## Configuration

| Option    | Default    | Notes                                          |
|-----------|------------|------------------------------------------------|
| grid size | 15 × 15    | Width × height of the lattice.                 |
| order (N) | 3          | Markov context length.                         |
| combiner  | `product`  | How directional predictions are merged.        |
| sampling  | `weighted` | `weighted` (sample) or `argmax` (most likely). |
| back-off  | enabled    | Shorten context when unseen, down to unigram.  |

---

## Project Structure

```
src/
 markov/
   MarkovModel.js      # train + predict next-char distributions
   textPipeline.js     # normalise / tokenise reference text
 grid/
   Grid.js             # lattice data structure + cell access
   directions.js       # 8 direction vectors + helpers
   placement.js        # place target words randomly w/o conflict
 fill/
   adjacency.js        # order cells by adjacency score
   combiners.js        # combine multiple distributions
   filler.js           # main fill loop
 ui/
   app.js              # bootstrap, event wiring
   render.js           # draw grid to DOM/canvas
   controls.js         # config form (order, combiner, size, words)
 pwa/
   sw.js               # service worker (offline cache)
 index.js              # entry point
index.html
manifest.webmanifest
```

---

## Status & Roadmap

This is an experiment under active design. Milestones:

1. **M1 — Core model**: `MarkovModel` train/predict + back-off, with tests.
2. **M2 — Grid primitives**: `Grid`, `directions`, context reading.
3. **M3 — Placement**: random non-conflicting word placement + locks.
4. **M4 — Fill engine**: adjacency ordering + combiners + filler loop.
5. **M5 — UI**: controls, rendering, regenerate/export.
6. **M6 — PWA**: manifest + service worker + install flow.
7. **M7 — Polish**: presets, sample reference texts, accessibility.

---

## Stretch Goals

- Per-direction weighting of contributions.
- Difficulty estimation heuristics.
- Shareable puzzle URLs (encode grid + word list).