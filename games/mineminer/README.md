# MineMiner

**Minesweeper, but you can walk around inside it.**

## What is this?

MineMiner takes the classic tile-flipping puzzle everyone has played at least once — the
grey grid, the numbers, the mines, the satisfying cascade when you clear a big empty patch —
and turns it into a physical, three-dimensional vault you explore in your browser. Instead of
flipping flat tiles, you're a miner striking real stone blocks with a pickaxe. Instead of a
number simply appearing, the block shatters, dust flies, and a glowing translucent digit is
left hovering in the empty space where the block used to be — a permanent ghost you can read
from any angle as you orbit or walk through the vault you've carved out.

The board can be one layer deep (which plays exactly like traditional Minesweeper), or two or
three layers stacked on top of each other. In the deeper vaults, a single number can be
warning you about mines above you, below you, or diagonally through the block corner — up to
26 neighbouring cells instead of the familiar 8. Reading those numbers well is the whole game.

## The idea in brief

Minesweeper survives because it's really a logic puzzle wearing a minimal, almost incidental
skin. MineMiner asks: what happens if you take that same logic puzzle and give it a *body* —
a floor, a ceiling, dust, sound, gravity, a camera you can spin and walk with? The numbers
don't disappear once solved; they stay behind as glowing markers, so a cleared vault becomes
a kind of readable hologram of its own solution, something you can look back at and admire or
double-check.

Marking a suspected mine also does something new here: it makes that block *safe to strike*.
A correctly marked mine gets defused rather than detonated when you hit it, and an incorrectly
marked block just gets cleared with a small penalty. This turns flagging from a passive note
into an active decision with real stakes — commit to your read of the board, and you get a
safety net; commit wrongly too often and it costs you.

## Why it's interesting

- **Familiar rules, new geometry.** If you already know Minesweeper, you already know how to
  play — but the third dimension changes the texture of the puzzle completely. Numbers become
  denser, ambiguous, and genuinely difficult to parse at first, then click into place once
  you learn to think in shells and layers instead of rows and columns.
- **The board remembers itself.** Every number you've ever uncovered stays visible as a soft
  glowing marker. You're not solving a puzzle that vanishes as you go — you're excavating a
  structure that keeps a visual record of your reasoning, layer by layer.
- **Two ways to look at the same problem.** You can hover above the vault in an orbiting
  "diorama" view to read the whole board like a puzzle on paper, or drop down to a first-person
  walking view once you've tunnelled out a pocket, and inspect the same information as if you
  were standing inside it. Neither view is strictly better — they're different lenses on the
  same logic.
- **Cascades become spectacle.** Clearing a big empty pocket in classic Minesweeper is a nice
  little flood-fill animation. In three dimensions, that same cascade ripples outward as an
  actual chain reaction tunnelling through the rock, shell by shell, with sound and dust — a
  small, satisfying payoff for good deduction.

## Who might enjoy this

- Anyone who already likes Minesweeper and wants to see how far the underlying puzzle can be
  stretched without changing its core rules.
- Puzzle players who enjoy spatial reasoning — the kind of person who likes block-based logic
  games, 3D chess variants, or voxel puzzles.
- People who enjoy "diorama" games — small self-contained worlds you can orbit, inspect, and
  slowly take apart, rather than large open worlds to run around in.
- Casual players looking for something with the same short-session, pick-up-and-play appeal
  as classic Minesweeper, but with more visual and tactile feedback to enjoy along the way.
- Anyone curious about accessible ways of taking a two-dimensional idea and asking "what
  would this feel like with one more axis?"

You don't need any special hardware or account to play — it runs directly in a modern web
browser. Just open it, start striking blocks, and see how far into the vault you can dig
before your judgement (or your luck) runs out.