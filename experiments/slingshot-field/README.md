# Momentum-Exchange Fields in the Rotating Three-Body Frame

An interactive picture of how a spacecraft, moon, or comet trades energy with a planet during a close pass: the gravity-assist "slingshot", mapped over every way the encounter could happen.

---

## The short version

When a small object flies past a planet, the planet's gravity bends its path. Seen from the planet, the object leaves as fast as it arrived and only its direction changes. Seen from the Sun (or any outside viewpoint), the planet is moving, so the object can leave faster or slower than it came in. That is a gravity assist.

Usually a gravity assist is described with one example flyby at a time. This project asks a bigger question: **what happens across all possible flybys, at once?** It draws the answer as a set of maps, laid over the familiar landscape of a two-body system such as Earth and Moon, or Sun and Jupiter.

---

## Background

### The three-body setting

Imagine two large bodies, such as the Earth and the Moon, circling each other. A tiny third body, like a spacecraft, feels both of them but does not disturb them. This is the *circular restricted three-body problem*, a standard model in celestial mechanics and mission design.

It is easiest to view from a frame that turns along with the two large bodies. In that frame:

- the two bodies sit still;
- there are five special balance spots, the **Lagrange points**;
- a single conserved number, the **Jacobi constant**, acts like an energy budget. It decides which regions the small body can reach and which are off limits. As the budget changes, narrow "necks" at the Lagrange points open and close, letting the body pass between regions.

The usual pictures of this setting show *where* a body can go. The usual pictures of gravity assists show *how much speed* one flyby gains. This project joins the two.

### The key idea

Switching between viewpoints changes velocities in a simple, straight-line way. So a flyby acts as a rule that turns an incoming velocity into an outgoing velocity: a rotation, plus a shift caused by the planet's motion. How much it rotates depends on how close and how fast the pass is.

For each possible encounter the project asks:

1. How much does the velocity change? (the **momentum exchange**)
2. How much energy is gained or lost? (the **energy exchange**)
3. What simple rule turns incoming velocity into outgoing velocity? (the **exchange operator**)
4. How sharply does the result react to small changes in the approach? (the **sensitivity**)

A useful fact makes this tractable: in this model, energy gained equals angular momentum gained, so one map covers both.

### What is an "encounter"?

Draw a circle around the smaller body. Every encounter is a trajectory that enters the circle at some **position angle** and with some **direction of travel** (inward-aimed, or tilted forward or backward). Fixing the Jacobi constant fixes the speed, so each encounter is just a pair of angles. All encounters at a given energy budget therefore form a flat two-dimensional sheet that can be drawn as an ordinary image.

Each point on that sheet is then colored by what happened: how much energy was exchanged, where the object went, and whether it left at all, was captured, or hit the body.

---

## What you see in the interface

The window is split into two linked panels with a control column on the side.

**Left panel: the physical picture.** The rotating-frame view of the system, showing:

- the two bodies, the five Lagrange points, and the circle around the smaller body;
- contour lines of the gravitational landscape;
- the forbidden region, shaded, which the object cannot enter at the chosen energy budget;
- a ring around the circle showing how much energy is traded by encounters arriving at each angle.

**Right panel: the encounter sheet.** Horizontal is where on the circle the object arrives; vertical is the tilt of its approach. Layers that can be switched on include:

- **Outcome map:** exit, capture, collision, or multiple passes.
- **Energy exchange:** red where the object gains energy, blue where it loses.
- **Velocity-change arrows:** the size and direction of the kick.
- **Energy-gradient streamlines:** which way to nudge an approach to gain more.
- **Curvature map:** whether an encounter sits at a stable best case, a ridge, or a saddle.
- **Sensitivity map:** bright ridges where tiny changes in approach lead to wildly different outcomes. These trace the natural "highways" of the system.
- **Operator glyphs:** small ellipses showing how each encounter stretches and turns velocities.

**Interaction.** Click any point on the encounter sheet and the left panel draws the actual trajectory, with its incoming and outgoing velocities.

**Jacobi slider.** Drag the energy budget and watch every map change as the Lagrange necks open, with ready-made presets for each case.

**Presets and exports.** Choose Earth–Moon, Sun–Jupiter, or Sun–Earth. Save any view as an image or export the underlying data.

---

## Why it is interesting

- **It shows structure that single flybys hide.** The best slingshots are not isolated lucky cases. They sit in a landscape with peaks, valleys, saddles, and sharp edges, and this makes that landscape visible.
- **It links two worlds.** Energy-hopping through gravity assists and the transport routes of three-body dynamics are normally studied separately. Here they share one picture.
- **It raises open questions.** Do the best energy gains lie on the natural transport highways, between them, or away from them? How does the pattern reorganize as the energy budget crosses the Lagrange thresholds? Where does the simple "one planet, one flyby" approximation break down?
- **It has built-in honesty checks.** Because energy and angular momentum gains must match, any numerical error shows up directly.

A note on novelty: the combination appears to be new, but that has not been verified. A literature review is the first planned step, and any claim will reflect what it finds.

---

## Who might find it useful

- **Mission designers and astrodynamicists** looking for good flyby geometries or for sensitive, hard-to-control ones.
- **Researchers in celestial mechanics and chaos** interested in how transport routes relate to energy exchange.
- **Planetary scientists** studying how moons, comets, and asteroids are scattered, captured, or ejected.
- **Students and teachers** who want an intuitive, visual route into gravity assists, Lagrange points, and conserved quantities.
- **Anyone curious** about how a spacecraft steals a little speed from a planet.

---

## Scope

The first version covers motion in a plane with circular orbits. Three-dimensional motion, elliptical orbits, repeated flybys, and uncertainty-based views are possible future directions.