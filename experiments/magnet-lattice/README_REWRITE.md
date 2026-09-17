# Magnet Lattice Toy

A little browser toy for exploring what happens when you scatter a bunch
of spinning magnets across a grid and let them fight it out.

Open `index.html` in a local web server (see the technical README if you
want the exact commands) and you'll get a blank canvas, a grid, and three
modes to play with: **Draw**, **Simulate**, and **Analyze**.

## The idea

Picture a pegboard where every peg is a small magnetic disk, standing
upright, free to spin in place but pinned so it can't slide around. Each
disk is a tiny compass needle. Put two of them near each other and they'll
tug at each other's orientation — just like two magnets on a table will
twist to align north-to-south. Put down a whole grid of them and you get a
little ecosystem of these tugs-of-war happening all at once.

This project lets you:

- **Draw** an arrangement — click on grid cells to drop a magnet, drag to
  set which way it's initially pointing.
- **Simulate** what happens when you let go — the magnets spin, wobble,
  and settle (or oscillate forever) as their invisible forces pull on
  each other. You can dial in how strong the coupling is, how heavy the
  disks feel (inertia), how much friction/damping there is, and watch
  energy and momentum readouts update live.
- **Analyze** the arrangement — find its resting (lowest-energy) state,
  and see the "coupling matrix," a color-coded map of how strongly every
  magnet is entangled with every other one. From there you can compute
  the natural resonant patterns ("normal modes") the lattice likes to
  vibrate in, and watch an animation of any one of them.

You can also copy your arrangement out as a small chunk of JSON text (and
paste one back in), so you can save interesting layouts, share them, or
tweak them by hand.

## Why bother with the physics?

Under the hood, each magnet is described by a single number: the angle
it's pointing. The energy between any two magnets follows the real
physics formula for dipole-dipole interaction (the same math that
describes how two bar magnets attract or repel depending on their
relative orientation). From there, standard tools from classical
mechanics — the Lagrangian, torques, and a numerically careful
"symplectic" integrator — are used to simulate how the whole system
evolves over time without slowly leaking or gaining energy the way naive
simulations often do.

The point isn't just "get a cool animation." A lot of care went into
making sure the simulation is physically trustworthy: derivatives are
checked against numerical approximations, energy conservation is
tested over long runs, and the eigen-analysis (used to find resonances)
is validated against known cases. If you nudge a slider and see the
energy readout drift wildly, that's a bug — not "just how simulations
are."

## Why is this interesting?

Coupled dipole/oscillator systems like this show up all over physics and
engineering — in mechanical metamaterials, in arrays of coupled
pendulums, in models of magnetic domains, even loosely in neural and
spin-lattice models. Watching a lattice of these magnets settle into
a pattern, or ring like a bell at a particular resonant frequency, is a
small, hands-on way to get an intuition for ideas like:

- **energy minimization** — systems tend toward configurations that
  minimize potential energy (here, magnets aligning head-to-tail),
- **normal modes** — complex vibrations of a coupled system can be
  broken down into a handful of simple, independent "shapes" of motion,
- **symplectic integration** — why some numerical methods for simulating
  physics are much better than others at getting long-term behavior
  right.

It's also just satisfying to watch a scattered mess of magnets spin
around and click into a tidy, aligned pattern.

## Who is this for?

- Anyone who likes physics toys and wants to fiddle with sliders and
  watch things wiggle.
- Students (or the perpetually curious) wanting a visual, interactive
  companion to studying dipole interactions, Lagrangian mechanics, or
  normal-mode analysis.
- Makers designing an actual 3D-printed version of this toy — this app
  doubles as a design tool: lay out where the magnets go, see whether
  the arrangement is stable, and check what its dynamics would look like
  before committing to plastic and magnets.
- Anyone who enjoys a good rabbit hole — this one starts with "spinning
  magnets" and ends up brushing against eigenvalues, energy
  conservation, and resonance.

See `idea.md` for the full technical specification, and the main
`README.md` for how to actually run and test the code.