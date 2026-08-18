# No-three-in-line: a visual theory explorer

I recently finished a browser-based explorer for one of those puzzles whose rules fit on an index card, but whose behaviour at scale still refuses to be pinned down. It’s called **no3sieve**, and the point of this document is to describe what it argues, what it shows, and who I think might enjoy standing in front of it — without assuming you care about modules, workers, or build pipelines.

## The puzzle, in one breath

Imagine an infinite square grid. You may place a point at any grid intersection, subject to a single rule: **no three placed points may lie on the same straight line**. Rows, columns, diagonals, and every rational slope in between all count. Three points on a line and the set is invalid; two points on a line are fine, and indeed they determine exactly which other lattice cells on that line must remain empty forever.

This is the classical **no-three-in-line problem**, usually stated for an n×n board: what is the largest number of points you can place? For small boards the answer is known — often 2n — but for large n the exact maximum is open. There is an easy upper bound of 2n, because a valid set can take at most two points from any row; there are constructive lower bounds around 1·n from Erdős and around 1.5·n from Hall, Jackson, Sudbery, and Wild; and there is a gap between the best known constructions and the suspected truth.

This project asks a nearby question, and I think it’s the more interesting one for interactive exploration: **what happens if you don’t search for the best arrangement, but instead grow a set outward through every cell once, taking a point whenever it is still legal?** The result is a deterministic, greedy process; we can watch it, measure it, and argue about its asymptotics without claiming it is optimal.

## The object the explorer actually builds

The traversal is **ring-major**, with rings defined by the **Chebyshev / L∞ norm**: the ring at radius R is the square shell of cells with `max(|x|,|y|) = R`. The origin is visited first; then the cells of ring 1 in clockwise order starting at `(0,1)`; then ring 2; and so on, potentially forever. Within a ring, the order is currently either clockwise or “nearest first”; ties are broken lexicographically, so the result is a single, reproducible sequence.

At each candidate cell the construction asks: does placing a point here create a collinear triple with any two points already placed? If yes, the cell is skipped; if no, the point is committed. There is no backtracking, no repair, and no search. That’s also exactly the definition of the reference semantics, which is the closest thing the project has to ground truth.

The ball of radius R is just a square window of side `2R+1`. This is not a coincidence; it’s the main reason the whole instrument uses L∞ rather than Euclidean rings. The classical problem lives in axis-aligned square windows, and an axis-aligned square window _is_ an L∞ ball. So the ring counter, the density overlay, and the literature’s `c(n)` curve all speak the same gauge. No resampling, no conversion, no hidden mismatch between what is built and what is reported.

The flat faces of the L∞ sphere do cost something: a line can lie exactly along an entire side of a ring and blank `2R+1` cells at once. A strictly convex shape like a circle would avoid that degeneracy, but it would also lose the closed-form line intersection and the window alignment. The explorer treats that flat-face case as a first-class part of the theory, not an edge case to be ignored.

## Why the empty strips are not a bug

The first thing everyone notices is that the default picture contains four broad, straight, empty strips passing through the origin. They look like a rendering leak; they are not. They are the arithmetic signature of the seed.

With the default seed at the origin, the greedy process’s first few commitments are `(0,0)`, `(0,1)`, `(1,1)`, and `(1,0)`. Those four points place two points on each of the rows `y=0` and `y=1`, two on the columns `x=0` and `x=1`, and two on the diagonals `y=x` and `x+y=1`. Once a row or column or diagonal holds two points, every other cell on that line is blocked forever — not out to some distance, but _everywhere_, because collinearity is an integral property with no cutoff. Hence the strips: a cell like `(t,0)` is blocked for every `t` by the pair `(0,0),(1,0)`. The inspector will show you the exact offending pair if you hover over any such cell.

This is also why the density overlay falls off and why rings can look startlingly empty. A ring contains `8R` cells, but the row/column/diagonal budget caps a valid set inside an L∞ ball at about 4 points per ring on average; most cells are forced vacancies, not missed opportunities.

If you want the constraint to have bounded reach, the explorer lets you lower a **horizon W**. That is the single most useful theoretical idea in the project.

## The horizon W: making “collinear” local

The classical rule forbids triples no matter how far apart their points are. But a triple whose extreme points are a billion cells apart cannot affect any window of side a thousand; no such window contains all three. So the engine optionally replaces the infinite constraint with a finite one: only triples whose entire span is at most W are forbidden.

This is not an approximation. A theorem in the accompanying theory document proves that with horizon W, the constructed set agrees cell-for-cell with the infinite-horizon set everywhere inside the ball of radius `floor(W/2)`. Set `W = 2R` and you recover the classical object exactly. Set W fixed and let R grow, and you get a different, local object: each cell decides based only on points within distance W, so the far field becomes a sliding-window process with a genuine steady-state density.

Why does this matter? The global run estimates the growth exponent α from a single nested family of windows, heavily correlated across radii. The finite-W run offers many essentially independent windows of the same size, so the density constant can be measured with honest error bars. It turns a vague curve into a statistic; and because the transfer between the two regimes is conjectured but not yet proven, the UI gives you a way to test it live.

The price of finite W is that a row may hold at most two points _per W-window_ rather than two points ever. The set inside any `(W+1)` square is valid, but globally the set can have positive density; the robust upper bound of 2 points per row disappears and the per-ring commit count grows. The explorer’s HUD and density overlay make the difference visible.

## What the UI is for

I think of the page as a _research instrument_, not just a plot. It is an infinite canvas: drag to pan, wheel to zoom, cursor-anchored so the cell under the pointer stays put. The world coordinates are the lattice coordinates; panning past the generated frontier asks the engine for more rings, and ungenerated regions are hatched as “unknown,” never drawn as empty. That distinction is load-bearing for interpretation.

The overlay shown by default is a **centered s×s density field**. For every cell, it asks: how many placed points lie inside the square window centered here? Then it divides by s, so the colormap is the same normalization as the literature’s `c(s) = max_pop(s)/s`, but rendered across the entire plane. Reference contours at 1.0, 1.5, and 2.0 let you see how much of the field approaches known construction constants and the absolute upper bound.

On top of that:

- **Top-K windows** scan for the best windows of chosen sizes with overlap suppression, so you can find and fly to exceptional neighborhoods rather than just looking at the origin.
- **Inspector** shows exact integers for any cell: coordinates, ring index, whether it’s in the set, its density value, and if it’s blocked, which two earlier points killed it.
- **Layer toggles** include grid, ring guides, “unknown” hatch, and lines that are already saturated with two points.
- **Paranoid mode** checks each commit against an independent, slower oracle, in both directions: accepted cells are genuinely legal, and masked cells are genuinely blocked. Over-blocking is detectable, not assumed.
- **Export** writes CSV, JSON, NDJSON, plain text grids, PNG, SVG, density curves, and a manifest; every exported solution is re-verified in the browser before download.

The renderer aggregates at low zoom instead of point-sampling. A set of density around 2/n would otherwise vanish under naive downsampling and the picture would lie about where the points are.

## What remains genuinely open

The central measurement is the density exponent. The rigorous bounds place it between `2/3` and `1`; the project’s stance is not to assume where in that range the spiral-greedy set falls. It may be that the ordered greedy process is polynomially sparser than the optimum — there are precedents in greedy Sidon sets and greedy 3-AP-free sets — or it may reach linear density with a positive constant. The UI is built to make the evidence visible rather than to settle the question by assertion.

A second open issue is horizontal: how does the finite-W density `c*(W)` scale as W grows? If the origin window and the far-field mean agree, the process is statistically homogeneous; if they diverge, something interesting is happening near the seed or along sector seams. The page makes that comparison practical.

A third, more internal fact is good to know: the marking part of the computation is associative, commutative, and idempotent, so it can be parallelized freely; the placement part is inherently sequential. The same cell can be free when a ring is proposed, then become blocked by a point committed earlier in the same ring. Two points placed in the same ring can define a line that blocks still later cells in that same ring. That is exactly why the commit walk is ordered; it is a fold, not a filter, and the flat-face degeneracy is entangled with the earliest witness of that fact.

## Who might find it useful

- **Mathematics educators and students** get a concrete, interactive counterexample to the idea that “greedy is obviously maximal.” The density field and the forced strips make strategic blocking visible without any algebra.
- **Combinatorics researchers** get certified lower-bound windows for the classical problem; every sub-window of a valid set is itself valid, so the top-K windows are immediate lower bounds for their corresponding sizes. The finite-W mode multiplies the number of useful samples.
- **People interested in greedy processes** get a visual case study where deterministic order, local versus global constraints, and spiral geometry interact in ways that can be measured but not yet predicted from first principles.
- **Anyone who likes generative geometry** gets a pretty, structured pattern that is only partly understood; the starved arcs and sector seams are the honest result, not a rendering artifact.

## What this document is not

This is not a developer README. It won’t tell you how to run the code, what modules exist, or how to write tests. Those details live elsewhere. It also is not a proof; the accompanying theory document carries the full formal apparatus, and the browser’s paranoid mode and independent verifier are the executable legs of that argument. The goal here is to describe the object itself, as clearly as I can, and to give you enough orientation to make the picture mean something.

I’m looking forward to hearing whether that works; more soon, I hope.
