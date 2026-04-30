# Binary Coded Layered Autonoma

An interactive cellular automaton that combines **Langton's Ant**, **multi-color substrates**, and **Conway's Game of
Life** into a single layered system. Multiple ants traverse a colored grid, encoding their movement rules in binary,
while a selectively-activated life simulation evolves on top of the substrate they create.

Open `layered_automata.html` in a browser to run the simulation — no build step or dependencies required.

## Concept

The system layers three interacting subsystems:

1. **Multi-Color Substrate (2–8 colors)** — a grid of colored cells that ants modify as they move.
2. **Binary-Coded Ants** — Langton-style ants whose turn behavior (Left/Right) is encoded as a binary string indexed by
   the substrate color underneath them.
3. **Selective Conway's Life** — a Game-of-Life layer that only evolves on cells whose substrate color is enabled by an
   *activation mask*, with positive/negative modes that create or inhibit life.

The interplay between these layers produces highway structures, fractal boundaries, and emergent life colonies tuned to
specific color patterns.

## How It Works

### Ant Movement

Each ant reads the substrate color at its current cell and consults its binary **Ant Rule**:

- Bit `0` → turn Left
- Bit `1` → turn Right

The ant then increments the cell's color (mod `numColors`), marks the cell, and steps forward. With `numColors = 4` and
rule `0101`, this generalizes Langton's classic `LRLR` ant.

### Life Activation Mask

A second binary string — the **Activation Mask** — determines which substrate colors are eligible to host life. Each
color also has an **Activation Mode**:

- **Positive (+)**: ant presence spawns life and clears inhibition
- **Negative (−)**: ant presence kills life and creates an *inhibition zone* that suppresses spawning (decays at ~
  10%/generation)

### Conway's Life Layer

Life evolves only on **marked** cells whose substrate color is mask-enabled and not inhibited. The rules are extended:

- **Search radius** (1–5) — neighborhood size for counting live neighbors
- **Birth** — exact neighbor count required to spawn life
- **Survival min/max** — neighbor range that keeps a live cell alive
- **Mutual inhibition** — neighbors only count if they share the same activation mode (+ or −) as the cell being
  evaluated

Negative-mode cells use slightly relaxed survival/birth thresholds, making them more fragile.

### Multi-Ant System

Up to 8 ants can run simultaneously with configurable:

- **Spawn modes**: `center`, `corners`, `edges`, `random`, `grid`
- **Synchronization**:
    - `synchronized` — all ants share the same rule and mask
    - `independent` — each ant gets a randomized rule/mask
    - `offset` — each ant uses a rotated version of the base rule

## Controls

| Control                                 | Description                                       |
|-----------------------------------------|---------------------------------------------------|
| **Simulation Speed**                    | Delay between generations (1–2000 ms)             |
| **Number of Substrate Colors**          | 2–8 colors (sets rule/mask length)                |
| **Number of Ants**                      | 1–8 simultaneous ants                             |
| **Ant Spawn Mode**                      | How ants are initially placed                     |
| **Ant Synchronization**                 | How rules are shared across ants                  |
| **Ant Rule**                            | Per-color L/R turn instruction (clickable bits)   |
| **Life Activation Mask**                | Per-color flag for life eligibility               |
| **Activation Mode**                     | Per-color +/− toggle (spawn vs. inhibit)          |
| **Life Search Radius**                  | Neighborhood radius for life rules                |
| **Birth / Survival Min / Survival Max** | Generalized Conway thresholds                     |
| **Ant Activation Radius**               | Radius around ants where life is seeded/inhibited |
| **Activation Probability**              | Per-cell chance of activation within radius       |
| **Grid Size**                           | 50×50 up to 500×500                               |

### Buttons

- **Start / Stop** — toggle continuous simulation
- **Step** — advance a single generation
- **Reset** — clear grids and respawn ants
- **Randomize All** — randomize rule, mask, and parameters
- **Random Rule** — randomize only the ant rule
- **Random Mask** — randomize only the activation mask & modes

## Stats Panel

- **Generation** — total simulation steps
- **Ant Steps** — combined steps across all ants
- **Marked Cells** — cells visited at least once by an ant
- **Live Cells** — currently alive Conway cells
- **Inhibited Cells** — cells suppressed by negative activation
- **Active Ants** — number of ants currently running
- **Current Mask** — the active life-activation bitstring

## Visualization

- **Substrate** is rendered using the configurable color palette (only marked cells are drawn).
- **Live cells** appear as bright green squares.
- **Inhibited cells** are tinted red.
- **Ants** are shown as colored squares with a yellow direction indicator and an ID label (when multiple ants are
  present).
- **Click the canvas** to enter fullscreen zoom mode; press **Esc** or click again to exit.

## Tips for Interesting Patterns

- Start with `numColors = 4`, rule `0101` (classic Langton's ant) to observe the famous ~10,000-step highway emergence.
- Try rule `1100` or `0011` with 4 colors for symmetric expanding patterns.
- Mix positive and negative activation modes to create competing life regions with shifting boundaries.
- Use multiple ants with the `offset` synchronization to generate kaleidoscopic interference patterns.
- Larger life search radii (3–5) combined with higher birth thresholds produce slow, organic-looking growth.
- Use **Randomize All** repeatedly to discover novel rule combinations.

## Files

- `layered_automata.html` — self-contained simulation (HTML + CSS + JS)
- `README.md` — this document

## Implementation Notes

- Rendering uses a single `ImageData` buffer for substrate and life cells (fast bulk pixel writes), with ants drawn via
  standard canvas calls for glow effects.
- Grid wraps toroidally on all edges.
- Inhibition decays stochastically (10% chance per generation) so negative regions slowly heal.
- Neighbor counting respects activation-mode matching, producing emergent segregation between positive and negative life
  populations.