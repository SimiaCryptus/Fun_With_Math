# Bridges

## What is this?

Bridges is a connection game — the same family as the classic game *Hex* —
but played on a board you get to choose. Instead of one fixed grid of
hexagons, you can play on squares, triangles, kagome lattices, pentagons,
organic hand-drawn-looking cells, and more, with two or three players,
all rendered as a lit, tactile 3D board you can rotate and zoom.

The rule you already half-know if you've played Hex: claim cells one at a
time, try to build an unbroken chain between your two sides of the board,
and stop your opponent from doing the same first. Nobody captures anything.
Nobody ever takes a piece back. It's a race to connect, not a fight to
survive.

## A little background

Hex was invented independently by Piet Hein in 1942 and by John Nash (yes,
*that* Nash) in 1948. It's one of the most elegant games ever designed:
the rules fit in two sentences, there are no draws — the board always ends
up connected for exactly one player — and yet it takes a lifetime to play
well.

Hex is normally locked to one specific board shape: a rhombus of hexagonal
cells. Bridges asks a simple question — what actually *makes* Hex work, and
does it require hexagons? It turns out the honest answer is "no." Hex is
really a game about a network of cells and a boundary split into sides
belonging to each player. Hexagons are just one convenient way to build
that network. Bridges keeps the underlying idea and lets you swap out the
tiling and the shape of the board.

Along the way, changing the tiling introduces a wrinkle: on some patterns
(like plain squares), two diagonal connections can cross at a single point,
which never happens on a hexagon grid. Bridges solves this the way Gale's
old game *Bridg-It* did — literally, with a bridge. When two claims would
cross, the earlier one arches gracefully over the later one, which is
severed at that point. This isn't just a rule footnote — it's rendered as
an actual little arched overpass on the board, with the cut-off path
visibly broken underneath it. It's the single most satisfying visual
moment in the game, and it's a direct, honest translation of the rule
into something you can see happen.

## Why it's interesting

- **Same soul, endless variety.** Every tiling changes the character of
  play — hexagons feel classical and clean, squares feel sharp and full of
  ambushes, kagome and pentagonal boards feel genuinely alien even after
  you know the rules. It's one game engine producing dozens of distinct
  strategic experiences.
- **Two and three player modes.** A four-sided board splits naturally
  between two players; a six-sided board splits between three, each
  owning a pair of opposite edges. Three-player games introduce their own
  drama — including the possibility that the player who's clearly losing
  gets to decide who wins, which the game has several optional rules to
  soften.
- **It's genuinely pretty.** The board is real 3D geometry — cells rise
  and settle with a little bounce when claimed, a ripple runs outward
  across neighbours, claimed cells get a glossy enamel finish, and a
  winning chain lights up end to end while the camera slowly orbits. None
  of this is decoration bolted on afterward — it grows directly out of
  the rules themselves.
- **It plays fair, on purpose.** Like Hex, there's a "pie rule" option
  letting the second player swap sides after the first move, which removes
  the first-player's inherent advantage without changing the game itself.
- **Accessible by design.** Colour is never the only way to tell players
  apart (there are patterns too), the whole board can be played by keyboard
  or announced aloud for screen readers, and there's a plain-text mode for
  playing without any graphics at all.

## Who might enjoy this

- Fans of Hex, Bridg-It, Y, or Havannah looking for new territory built on
  familiar, elegant foundations.
- Board game and abstract strategy enthusiasts curious about tiling theory,
  who'd enjoy seeing how mathematical ideas about tessellations translate
  directly into playable, competitive games.
- People who want a two-player tabletop-style game to play casually online
  with a friend, with a low barrier to learning but real strategic depth.
- Anyone who appreciates elegant, well-crafted web-based 3D — the entire
  game runs in a browser with no installation, and a full match can be
  shared and replayed from a single link.
- Teachers or hobbyists interested in geometry and graph theory, since the
  game makes ideas like planar graphs, tiling duality, and vertex degree
  visible and tangible instead of abstract.

## Playing a game

Open the game in a browser, pick a tiling and board shape from the setup
panel (with live previews so you can see what you're choosing), pick your
number of players, and start claiming cells. There's no installation, no
account, and no build step — it's a single web page. When the game ends,
you get a link that replays the exact match from the first move, which is
also how you'd share an interesting position with a friend.
Any seat can be handed to a bot (easy, medium or hard — the difference is
how long it is allowed to think, not a handicap), and games can be played
on a Fischer clock (main time plus an increment per move; untimed by
default). Drag to orbit the board, right‑drag or shift‑drag to pan, and
scroll or pinch to zoom; `R` resets the view and `T` looks straight down.
## Go on any tiling
Set the **goal** to `go` in the settings and the same board becomes a Go
board: place stones, capture groups that run out of liberties (liberties run
along shared edges, so the crossing rule doesn't apply), no suicide, simple
ko. Pass with the `Pass` button (or `P`); once everyone has passed in turn
the board is scored by area — your stones plus the empty cells only you
surround — and the largest area wins. Dead stones aren't removed, so play
them out. It works with two or three colours, with the pie rule for balance,
with clocks, and every bot level knows how to play it.