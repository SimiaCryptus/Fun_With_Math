# Point-CAD

*A parametric 3D point-structure sketcher*

## What is this?

Point-CAD is a small tool for describing shapes in three-dimensional space
not by drawing them directly, but by stating the *relationships* you want
between a handful of labeled points — this distance equals 100mm, this angle
is 90 degrees, this length should be as short as possible — and letting a
solver figure out where the points actually have to go to satisfy all of
those relationships at once.

You can think of it as a very small, very focused cousin of the "sketch"
tools found inside serious CAD software (like SolidWorks or Fusion 360), but
stripped down to its geometric essence: points, distances, and angles,
extended into full 3D space rather than confined to a flat sketch plane.

## The basic idea

Most drawing tools ask you to place things exactly where you want them. A
*parametric* tool asks you instead to describe **constraints** — facts that
must remain true — and it works out a consistent geometry that honors them.
If you later change one number (say, a beam length), everything connected to
it recomputes automatically. This is the same idea behind spreadsheets: you
don't compute the totals yourself, you describe the relationships and let the
machine keep them consistent.

Point-CAD applies this idea to a set of points floating in 3D space. Each
point starts out at a rough, approximate position (a "seed") that you place
by eye. You then attach constraints to pairs or triples of points:

- **Distance** — "these two points should be 100mm apart," or "as far apart
  as variable `L1`," or simply "as close together as possible."
- **Angle** — "the angle at this point, formed by these two neighbors,
  should be 90 degrees."

From just these two relationships — distance and angle — a surprising amount
of everyday geometric vocabulary can be built: perpendicularity, points lying
on a line, equal-length sides, midpoints, points lying on a sphere, even
parallel lines in three dimensions (which, perhaps surprisingly, take a bit
more cleverness in 3D than they do on paper).

Once you've described what you want, you press "Solve." The tool nudges all
the unfixed points and free variables until the constraints are satisfied as
closely as possible, using a standard numerical technique (a damped
Gauss-Newton solver, for anyone curious about the math) rather than magic.
It will tell you if your description leaves things ambiguous
(under-constrained) or contradictory (over-constrained), rather than
silently guessing.

## Two ways to work, always in sync

Point-CAD can be driven in two parallel ways that describe exactly the same
underlying model:

1. **A 3D viewport**, where you place points, drag them around, and click to
   attach constraints — much like sketching in ordinary CAD software, except
   the camera can orbit freely in three dimensions.
2. **A tiny text language** ("PCS," for Point-CAD Script), where the same
   sketch is written as short, readable lines like:

   ```
   point A at (0, 0, 0) fixed
   point B at (100, 0, 0)
   distance A B = 100
   angle A B C = 90
   ```

Editing either one updates the other immediately. The text form is also
exactly what gets saved to disk, so a saved file is not an opaque binary
blob — it's a short, human-readable script that describes the whole
structure, which you could, in principle, write by hand or read years later
without any special software.

## Why this is interesting

- **It's a minimal, transparent example of constraint solving.** Rather than
  a black-box CAD engine, the core geometric idea (points + distances +
  angles + a least-squares solver) is small enough to hold in your head, and
  is explained in plain language rather than buried behind a UI.
- **It takes 3D seriously from the start.** Many small sketch tools work in
  a flat 2D plane and treat 3D as an afterthought. Point-CAD's points always
  live in full three-dimensional space, so a "flat" sketch is just a special
  case where all the points happen to lie on a plane — not a different mode.
- **It's deliberately extensible.** The underlying design leaves room to add
  new kinds of geometry (areas, curves, volumes) or even entirely different
  notions of space (spherical or curved geometries, for instance) without
  rewriting the core — a design idea worth studying even independently of
  the tool itself.
- **The save format doubles as the scripting language.** There's no
  separate "file format" to reverse-engineer — what you see in the console
  is what gets written to disk, and vice versa.

## Who might find it useful

- Anyone curious about how CAD-style sketch constraints actually work under
  the hood, without wading through the source code of a full commercial CAD
  package.
- Hobbyists designing simple 3D structures — trusses, frames, mechanical
  linkages, wireframe scaffolding — where the relationships between points
  matter more than free-hand placement.
- Educators or students looking for a hands-on way to explore geometry,
  numerical optimization, or the idea of "solving" a diagram rather than
  drawing it.
- Developers interested in embeddable, dependency-free web components, or in
  small domain-specific languages that double as both a UI affordance and a
  file format.
- Anyone who has ever wanted to say "make these two things the same length"
  and have a computer handle the arithmetic.

## A little bit of background

The tool grew out of an interest in keeping the *geometric core* of a CAD-like
sketcher as small as possible — just enough primitives (points, distance,
angle, a solver) to be genuinely useful, while pushing every fancier idea
(areas, curves, volumes, non-Euclidean spaces) out to the edges as optional
extensions rather than built-in assumptions. That constraint, in turn, forced
some interesting design questions: how do you express "parallel" using only
distance and angle in 3D? How do you know when a sketch has *just enough*
constraints, versus too many or too few? Working through those questions is
as much the point of the project as the resulting sketching tool.