# Residual-Volume Coding Lab

**A decision tree that is paid in bits — and a 3D workbench for watching it
discover the laws hiding in a point cloud.**

---

## The one-sentence idea

> The volume of a region is the address length of every point inside it.

If you already know that a point lies somewhere inside a region, and you
still need its coordinates to some measurement precision, the bits you have
left to pay are the logarithm of that region's volume divided by the volume
of one resolution cell. Shrink the region cheaply, and you have compressed
the data. That is the whole criterion.

---

## Background: what ordinary decision trees miss

A classical decision tree judges a split by counting rows. If 98 of 100
observations go left, the split is "98:2 pure", and that is all the tree
knows. The continuous space the points live in is scenery, not evidence.

So two splits that route the same points the same way look identical —
even when one shaves off a sliver of the domain and the other carves away
nine-tenths of it.

That difference is exactly where the information is. Suppose 98% of your
observations sit inside a blob occupying 1% of the available space. The
row counts say 98:2. The geometry says 1:99. The **gap between those two
ratios** is the evidence that something structured is going on: the data
are concentrated in a way that blind chance would never produce.

This lab builds a model around that gap. A split earns its keep only when
the share of *points* on each side differs from the share of *space* on
each side — and only when that earning exceeds the cost, in bits, of
describing the boundary itself.

Three things follow immediately, and they are not separate design choices
but the same fact seen from three angles:

1. The tree is a **density estimator** (uniform within each leaf).
2. A split's value is exactly a **divergence** between where the points
   are and where the space is, minus the price of the boundary.
3. **Model complexity stops being a knob.** It is quoted in the same
   currency — bits — as the compression it buys. A curved boundary is used
   when, and only when, it pays for itself.

### The hard part

Scoring by volume means you must actually *know* the volume of a region
like "inside this ellipsoid, outside that plane, below this learned
surface". Exact volumes of such regions are, in general, intractable.

The lab's answer is a **measure oracle** that never lies: it returns an
*interval* — a certified lower and upper bound — rather than a number it
cannot justify. It works by chopping space into boxes and tagging each one
as definitely inside, definitely outside, or still unknown. Inside boxes
bank into the lower bound; unknown boxes are the remaining doubt.

And since the oracle returns intervals, so does every split's score. Which
licenses the trick that makes the whole thing affordable: **you do not need
precise volumes, you only need to know which split wins.** Refinement is
*decision-directed* — geometry is sharpened only where the contenders'
intervals still overlap, and stops the instant one is certified ahead.

---

## What the lab does

A self-contained browser workbench. Pick a 3D point cloud, choose which
families of split surface are allowed to compete, press **Train**, and
watch the tree pay for itself in real time.

Everything is deterministic from a seed, and the full configuration lives
in the page's URL — so any run you find interesting can be shared verbatim.

### The point clouds

A gallery of synthetic datasets, each chosen to test something specific:

- **uniform** — the null control. A correct method should find nothing and
  say so.
- **blob** — the textbook case above: dense lump, sparse surroundings.
- **noisy plane**, **shell**, **torus**, **helix** — clouds hugging a known
  law, so recovery can be *scored*, not just admired.
- **Gaussian mixture** — a diffuse density with no law. The honest outcome
  here is tiling, not discovery, and the lab should show that.
- **Lorenz**, **Rössler**, **Thomas** — attractors from chaotic systems.
- **Bilogistic ribbon** (the headline) — two logistic maps swept in
  opposite directions along one axis. Along it the cloud changes character:
  a thin curve where both maps are at rest, flat sheets where one has gone
  chaotic, a fractal patch where both have, with crisp gaps at the periodic
  windows. The local dimension genuinely varies, so no single modelling
  style can win everywhere. It is a fair fight.

### The split families

Generators only *propose* geometry; the code length alone decides.

- **tightBox** — simply shrink to the bounding box of the points. A
  deliberately dull baseline, and an important one: without it, an
  elaborate boundary could appear to "discover structure" when all it did
  was trim empty margin.
- **axis** — ordinary coordinate cuts (the conventional density tree).
- **affinePCA** — tilted planes along principal directions.
- **quadEllipsoid** — ellipsoids and spherical shells.
- **quadImplicit** — the law finder. It fits an algebraic relation
  g(x) ≈ 0 and offers the band |g(x)| < w as a *single* split.

That last point matters more than it sounds. Real laws are thin on *both*
sides. A one-sided cut has to slice one face of a band and then hope a
later split handles the other — and a greedy tree will often refuse the
first cut, because it only pays off jointly with the second. Allowing
two-sided bands lets a law be found in one move.

---

## Reading the interface

**Centre — the 3D view.** The unit cube, and in it:
- the **data**, coloured by which leaf claimed them;
- the **leaf boxes** — the certified-inside volume, drawn. This is the
  abstraction made literal: you are looking at the thing being charged for;
- the **split surfaces** that were accepted, bands shown with both faces;
- the **sieve** — points redrawn *from the trained model*: pick a leaf
  according to its share of points, then a position uniformly inside it.
  If the magenta cloud looks like the data, the codec understood it. If it
  looks like a pile of blocks, it did not. This is the most immediate
  honesty check in the lab.

**Right — the instruments.**

- **Ledger.** Bits per point. Blue is what the data cost under the model;
  amber is the model's own description, amortised; grey is the 30-bit
  no-model reference. Shorter is better, and a model that cannot beat grey
  has achieved nothing.
- **Race.** One bar per candidate split, each showing its certified gain
  *interval*. You can watch the bars narrow as geometry is refined, and
  watch refinement stop the moment a winner is certain. Bars left of zero
  can never pay for themselves.
- **Profile.** For each root-to-leaf path: bits spent on boundaries (across)
  versus volume removed (up). *A few large, cheap drops followed by a
  plateau* means the model collapsed a direction — it found structure. *Many
  small break-even steps* means it is merely tiling a smooth density. The
  number of collapses estimates the data's intrinsic codimension — a
  quantity nobody asked for, which falls out of compression for free.
- **Recovery.** Where the dataset declares a ground-truth law, this scores
  the accepted constraints against it: orientation error, width error,
  codimension.
- **Tree.** Every accepted split, printed as a readable constraint — e.g.
  `|0.41x − 0.89z + 0.12| < 0.012` — with its gain interval and price.

**Left — the controls.** Dataset and its parameters; measurement resolution
(the default makes the no-model cost exactly 30 bits/point, so every number
is easy to read against it); which generator families may compete; the
accounting protocol; refinement budgets; and a complexity multiplier that
raises or lowers the price of every boundary, letting you trace the
trade-off between model size and compression.

There is also a [test suite](tests.html) — the identities, the bounds, and
the behavioural claims, all executable. If something the method depends on
is false, the suite is designed to say so rather than hide it.

---

## Why this is interesting

**It gives "explanation" an operational meaning.** A function explains a set
of points when describing the function costs fewer bits than describing the
variation it removes. No appeal to taste, no tuned regulariser, no separate
penalty term — just an exchange rate, and a boundary either clears it or
does not.

**It looks for relations, not regressions.** Nothing here privileges
"predict y from x". A constraint among several variables at once —
a conservation law, a circle, a coupled relation — is treated identically.
There is no designated response variable, so the method is free to find
whatever is cheapest.

**Structure emerges rather than being requested.** Intrinsic dimension is
never a parameter and never an output you ask for. It appears as a side
effect: once a direction has been squeezed down to the noise floor, further
squeezing earns nothing, so the model stops. Count the collapsed directions
and you have the codimension.

**Laws are reported with their tolerance.** The output is not just
"y ≈ 0.3 + 0.4x" but the *width* of the band around it. And because
everything is relative to measurement resolution, coarse data supports only
coarse laws — which is the correct and honest behaviour.

**Uncertainty is never faked.** Every geometric quantity carries bounds and
states whether they are certified or probabilistic. The system is allowed
to say "I don't know precisely, and it doesn't matter for this decision."

**Volume is a common denominator between models.** Once you can measure
predicate-defined regions, any two models that can be written as predicates
become comparable — by how much of the *space* they agree about, not just
how many test points. Two classifiers with identical accuracy may diverge
wildly where no data were ever collected. Overlap sees that; accuracy
cannot.

---

## Who it is for

- **People who build models and distrust them.** The sieve view and the
  ledger are deflationary instruments. They make it hard to mistake
  complexity for insight.
- **Scientists and engineers looking for laws in data.** Especially where
  the interesting relation is implicit, holds only in part of the domain,
  or needs to be reported along with its tolerance.
- **Anyone working with dynamical systems.** The attractor and bifurcation
  datasets are the native habitat: structure whose dimension changes from
  place to place.
- **Teachers and students of information theory or MDL.** The abstract
  claim that compression and learning are the same activity is, here,
  something you can rotate with the mouse. Volume *is* code length, and
  you can see it.
- **Safety, verification and design-space work.** The certified-interval
  measure oracle answers questions like "how much of the feasible space is
  safe?" and "where exactly do these two models disagree?" with bounds
  attached rather than point estimates.
- **The simply curious.** Watching a tree reject an elaborate curved
  surface because it cannot pay its own bill is a surprisingly good way to
  develop intuition about what evidence actually is.

---

## Honest limitations

- **Three dimensions.** Certified box subdivision degrades badly as
  dimension grows. The lab fixes d = 3 so the guarantees are real rather
  than aspirational; a sampling-based fallback exists, but it trades
  certainty for confidence.
- **Growth is greedy.** Like any top-down tree, it can miss constraints
  that only pay off in pairs. Two-sided bands cover the most common such
  case; they do not cover all of them.
- **Everything is relative to a reference measure.** "Surprising" means
  surprising *compared to what*. Choose an over-large bounding box and
  early splits look better than they are. The tightBox baseline guards
  against the worst of this, but the dependence is real and deliberate —
  you may supply a weighted measure that encodes a physical prior, and then
  the model reports surprise relative to *that*.
- **Not all winners are readable.** Sparse planes and quadrics read as
  symbolic laws. Deep stacks of learned surfaces compress just as honestly
  but offer spatial accounting rather than a formula. The lab distinguishes
  the two cases instead of blurring them.
- **This is a demonstration, not a benchmark result.** The point is to make
  the mechanism visible and testable.