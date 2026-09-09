# Troggle — Boggle in a Cube

## What is this?

You know Boggle: a tray of sixteen lettered dice, shaken and dropped into a
4×4 grid, and a couple of minutes to find as many words as you can by tracing
a path from letter to letter. Troggle takes that same idea and lifts it into
the third dimension. Instead of a flat grid, you're looking at a cube — a
block of letters stacked in layers, 4×4×4 up to 6×6×6 — floating in space.
Words are still found by walking from one letter to a neighbouring one, but
now "neighbouring" can mean up, down, forward, back, or even diagonally
through the middle of the block. Half the word you're hunting for might be
hiding on the far side of the cube, behind letters you can currently see.

There's no build step, no account, nothing to install — you open a page and
a glowing cube of letters appears, ready to be spun around, peered into, and
picked apart.

## The idea in a bit more depth

Ordinary Boggle is a solved problem for your eyes: you can see the whole
board at once. The entire design challenge of Troggle is that you *can't* —
a 6-cube-wide block hides a 4-cube-wide block inside it, and that inner block
hides its own words just as well as the outer shell does. So the game is
really two puzzles layered on top of each other:

1. The word puzzle — the same one you already know from Boggle.
2. The *seeing* puzzle — how do you even perceive a word path that curls
   through the inside of a solid block of letters?

Troggle's answer to the second puzzle is a handful of simple tools rather
than one clever trick: you can rotate the cube freely with a drag of the
mouse or finger, you can "peel" it apart with a slider so the outer layers
slide away from the centre, and once you start spelling a word, every letter
that isn't a legal next step quietly dims out of your way, leaving a trail
of bright candidates to follow. None of these are complicated to use, but
together they make an otherwise-impossible 3D word search feel manageable —
sometimes even meditative, in the way that untangling a knot is.

You can play by tapping or clicking letters in sequence, by simply typing
the word you've spotted (the cube will light up a path for it as you type,
which doubles as a little tutorial in how the game reads adjacency), or, on
supported browsers, by speaking words aloud and letting speech recognition
transcribe them. All three methods score identically — use whichever fits
how you think.

Scoring rewards exactly the thing that makes this game different from its
flat ancestor: longer words score more, as in classic Boggle, but there are
extra points for paths that genuinely use the depth of the cube — crossing
several layers, spanning all three axes, or staying entirely within the
hidden interior letters that are hardest to spot in the first place. Finding
"CAT" is fine. Finding a seven-letter word that snakes from one corner of
the cube through its dead centre and out the other side is the whole point.

## Why it's interesting

Word games are usually a test of vocabulary layered on a very simple visual
task — glancing across a flat grid costs you almost nothing. Troggle removes
that assumption. It asks: what happens to a familiar puzzle when the easy
part (seeing the board) suddenly becomes hard, and the game has to grow new
tools just to stay playable? The peel slider, the dimming trail, the
live-typed path preview — none of these exist in ordinary Boggle because
they don't need to. Here they're the actual heart of the design.

It's also a small case study in taking a well-understood game and asking
"what if this had one more dimension?" — a question that tends to be more
interesting than it sounds, because it doesn't just add difficulty, it
changes what "adjacent" even means, how you generate a fair board, and how
you reward a player for using the extra space well rather than ignoring it.

## Who might enjoy this

- Anyone who likes Boggle, Scrabble, or word-search puzzles and wants
  something with a genuinely different shape to it, not just a harder grid.
- People who enjoy fiddly spatial puzzles — rotating, slicing, and peeling
  something apart to understand its structure — even outside of word games.
- Players who like a bit of everything: this is one of the few word games
  where you can plausibly play with your voice, your fingers, or a keyboard
  cursor, and it works reasonably well however you approach it.
- Anyone curious about game design as an exercise in translation — taking a
  classic mechanic and rebuilding just enough new furniture around it (here,
  mostly ways of *seeing*) to let it survive the jump to three dimensions.
- Casual players looking for a quick, timed, no-stakes brain-warmer: round
  lengths run from a minute and a half to ten minutes, and a shareable
  "Daily Cube" seed means everyone can compare notes on the same board.

No prior 3D-game experience is needed — the controls are deliberately kept
to "drag to look around, tap or type to play." If you've ever shaken a box
of letter dice, you already know what to do here; the cube just asks you to
look a little harder before you start finding words.