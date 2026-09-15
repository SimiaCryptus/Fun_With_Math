# 3D Checkers (8×8×8)

Checkers, but the board is a cube.

## What is this?

Ordinary checkers is played on an 8×8 grid, but pieces only ever sit on the
32 dark squares — the squares where the row and column add up to an odd
number. This project takes that same idea and adds a third dimension: an
8×8×8 cube of 512 tiny cells, where a cell is "in play" if the sum of its
three coordinates (left/right, forward/back, up/down) is odd. That works out
to exactly 256 playable cells — the natural 3D sibling of the familiar
checkerboard.

Pieces move the same way they always have, just with one more axis to move
along. In 2D, a checker slides diagonally — one step that changes both its
row and column. In 3D, a piece still takes a single diagonal step, but now
there are three *pairs* of axes it can move across (left-right & forward-back,
forward-back & up-down, left-right & up-down), giving four directions for a
man and twelve for a king instead of two and four. Jumping, multi-jumps,
forced captures, and kinging on the far face all work exactly like standard
English draughts — the rules haven't changed, only the geometry they live in.

The starting armies are much bigger too: with three rows of pieces filling
each side's end of the cube, each player begins with 96 pieces (smaller
"Light" and "Skirmish" setups are available for shorter games). The result
is recognizably checkers, but with dramatically more space to maneuver in,
far more possible moves at any given turn, and capture chains that can
snake up, down, and sideways through the interior of the cube.

## Seeing inside a cube

The obvious problem with a solid cube of game pieces is that most of it is
hidden inside the shape. This project's main design challenge — and its most
interesting feature — is making that interior legible:

- **Exploded view** (the default) gently separates the cube into its eight
  horizontal levels, turning it into a stack of ordinary-looking checkerboards
  that you can still see the connections between.
- **Slice / focus view** lets you isolate a single level and dim everything
  else, if you want to concentrate on one plane at a time.
- **X-ray view** highlights, when you select a piece, exactly which cells and
  other pieces are relevant to its possible moves — fading the irrelevant
  parts of the cube almost out of sight.
- A full free-orbiting camera, capture paths drawn as glowing arcs through
  the lattice, and animated multi-level jumps all help keep the state of a
  256-cell 3D board readable at a glance, something that would otherwise be
  close to impossible.

You play by clicking pieces and destinations, exactly as you would on a flat
board; the software takes care of showing you what's legal, including
mid-chain jumps that carry a piece through several levels in one turn.

## Playing against another person or the computer

Two people can play on the same screen and take turns, optionally with the
camera swinging around 180° each turn so each player is looking from their
own side of the cube. Alternatively, you can play against a computer
opponent with a choice of difficulty, from a "just plays something
reasonable" Easy mode up to a Hard mode that thinks several moves ahead
before it responds.

## Why this is interesting

Checkers is a game most people already understand, which makes it a good
vehicle for something more unusual: what does a familiar game feel like once
you give it a genuine extra dimension, instead of just a fancier board? The
branching factor and tactical complexity increase enormously (roughly ten
times as many possible moves at any point compared to 2D checkers), while
the underlying rules stay simple enough to hold in your head. It's a small,
self-contained example of how spatial reasoning changes once you move from
a plane to a volume — the same reason 3D tic-tac-toe or 3D chess variants
have long fascinated people, but built on a game that's easier to actually
play well.

It's also a nice showcase of visualization technique: cubes of data (voxel
grids, 3D scans, volumetric simulations) are hard to look at directly, and
the exploded/slice/X-ray view techniques used here for a game board are the
same broad family of tricks used to make any kind of 3D data set
comprehensible on a flat screen.

## Who might enjoy this

- Checkers players curious what their game looks like with room to maneuver
  in three dimensions instead of two.
- Puzzle and strategy game fans who enjoy abstract games with unusual
  boards or higher-dimensional twists.
- Anyone interested in how to visually present complex 3D/volumetric
  information in an interface, as a compact, playful example.
- People who just want to try something that looks and feels different from
  a typical browser board game, with a cube of glowing checker pieces to
  spin around and inspect.

No installation is required beyond a modern web browser — the game runs
entirely client-side.