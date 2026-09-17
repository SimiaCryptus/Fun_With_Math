# Pastaponics — A Programmable Soil, Grown One Noodle at a Time

## What is this?

Imagine a bowl of noodles. Now imagine that every noodle is actually a tiny,
porous pipe, and each one carries something different into the bowl — one
carries nitrogen, another phosphorus, another a splash of living compost tea,
another just plain water. Now imagine a plant growing its roots down into that
bowl, free to explore, and free to *choose* which noodles it wants to wrap
around and drink from.

That's Pastaponics.

More formally, this project is an exploration of the **Programmable Tubular
Rhizosphere Substrate (PTRS)** — a synthetic, 3D-printed "soil" made of a
lattice of tubes instead of dirt. Each tube is a nutrient channel, a place for
roots to anchor, and a tiny neighborhood for microbes to move in. By feeding
different things into different tubes, we let the plant do something it
almost never gets to do in a normal garden or hydroponic rig: **actively pick
and choose its own diet**, tube by tube, root by root.

This repository (well, this experiment within it) is the design process and
prototype tooling for actually generating these tube lattices — figuring out
how to pack many distinct, non-touching, differently-labeled tubes into a
single 3D-printable block in a way that's both scientifically useful and
biologically hospitable.

## The core idea, briefly

Roots are not passive straws. In real soil, roots sense nutrient gradients,
grow more aggressively toward rich patches, recruit specific microbes, and
change their branching pattern depending on what they find. This project asks:
**what happens if we make those choices dramatic and legible?** Instead of a
uniform slurry of nutrients evenly present everywhere (as in most hydroponics),
what if the nutrients are segregated into clearly separate channels, so we
can literally watch which ones a plant favors?

This turns a plant's root system into something like a decision-making map.
Every channel is a hypothesis — "will the plant prefer this over that?" —
and the pattern of colonization becomes the answer.

It also reaches for something a bit more poetic: in the earliest evolutionary
history of land plants (long before modern soil ecosystems existed), roots
grew into much simpler, more structurally regular substrates. This project is
a kind of speculative return to that — except now the "structure" is
programmable, sensor-laden, and designed by us rather than by geology.

## Why it's interesting

- **It turns plant behavior into data.** Instead of guessing what a root
  "wants," you can literally see which tubes get colonized, and how fast.
- **It's a tunable experiment platform.** You can change what's inside a tube
  mid-experiment and watch the plant re-adapt its architecture in real time.
- **It blurs hydroponics and soil ecology.** Real microbial communities can be
  introduced into specific channels, turning this into a "synthetic
  rhizosphere" — a designed, observable ecosystem in miniature.
- **It's a genuinely hard and fun geometry problem.** Packing many distinct,
  labeled, non-intersecting tubes into a 3D-printable volume — while keeping
  them reachable by roots, printable without failures, and biologically
  sensible — turns out to connect to a surprising range of fields: space-filling
  curves, maze generation, L-systems and plant venation algorithms, minimal
  surfaces, and swarm-like growth simulations. It's the kind of problem where
  "draw a bowl of noodles, but make it real" opens up a genuinely deep design
  space.
- **It's a small, physical rebuttal to a big, abstract problem.** Human systems
  tend to hide their waste and nutrient loops behind pipes and infrastructure;
  a plant growing in a PTRS lattice is forced to live inside its own feedback
  loop, visibly. There's something clarifying about watching that happen.

## The UI, in plain terms

The tool at the center of this experiment is a small interactive 3D
design app. You don't need to know how to code to use it conceptually — it
works roughly like a "nutrient landscape designer":

- You describe a handful of **channels** — give them a name (nitrogen,
  phosphorus, "bio," water, hormone, stress-test, etc.), a size, a target
  share of the total volume, and optionally a preferred zone (e.g. "keep
  water near the top," "keep the stress channel far from everything else").
- The tool then **generates a lattice** of tubes that fits all of these
  channels into one 3D block, threading them past each other without ever
  letting two different tubes touch, while leaving enough open space between
  them for roots (and eventually root hairs, and eventually microbes) to move
  through freely.
- You can **spin the model around, turn channels on and off, and slice through
  it** to see how the tubes interleave — like an X-ray of a lattice of pasta.
- The tool checks its own work: it flags places where tubes are too close
  together, where the design wouldn't print well (too steep an overhang,
  a pocket that would trap material during printing), or where a pocket of
  root space would be sealed off and unreachable.
- Once you're happy with the design, you can **export it** — either as a file
  ready to send to a 3D printer, or as a shareable specification that fully
  describes what was generated, so an experiment can be exactly reproduced
  later.

In short: it's a sandbox for designing programmable growing substrates,
with instant visual feedback and built-in sanity checks, aimed at getting
from "I have an idea for a nutrient layout" to "I have a printable object"
as directly as possible.
## Running the prototype
The tool is a static, dependency‑free web app (three.js is loaded from a CDN via an
import map). Module scripts need an HTTP origin, so serve the folder rather than
opening `index.html` from disk:
```sh
python3 -m http.server 8000      # then open http://localhost:8000/index.html
```
Pipeline (see `problem.md` §2) and where each stage lives:
| Stage | File(s) | Notes |
|---|---|---|
| 1 Spec | `src/spec.js` | presets from `idea.md` §3.2, defaults, JSON normalisation |
| 2 Routing | `src/generators/*` | k‑colour maze (§4.2), layered Hilbert (§4.1), helices (pipeline test) |
| 2½ Post‑process | `src/postprocess.js` | organic jitter, straight port stubs, Chaikin smoothing |
| 3 Validation | `src/validate.js`, `src/section.js` | clearance, bend radius, overhang runs, drain minima, Hagen–Poiseuille ΔP, root‑access flood fill |
| 4 Solidify | `src/mesh.js` | sweep meshing, wall‑offset cross‑sections, punched pores, plate with port holes, frame |
| 5 Deliver | `src/viewer.js`, `src/stl.js`, `src/main.js` | three.js viewer + overlays, binary STL / glTF / JSON, pre‑flight |
Everything is deterministic from the seed. Preview quality (coarser rings) is used
while editing; exports re‑mesh at print quality and run a watertightness pre‑flight.
Known gaps: tubes are anchored only at the manifold plate (no frame bridges yet, §6.5);
explicit pores are meshed as one wall quad each, so their size follows mesh quality
and is reported rather than matched to the µm spec; 3MF export is not implemented.


## Background, briefly

The idea draws on a few different threads:

- **Hydroponics**, where nutrients are delivered in liquid form rather than
  through soil, and where researchers already control nutrient recipes
  precisely.
- **Root biology**, particularly the well-documented fact that roots are not
  uniform foragers — they sense, prefer, avoid, and adapt.
- **Rhizosphere microbiology**, the study of the communities of microbes that
  live around roots and trade nutrients for sugars.
- **3D printing and generative geometry**, which make it possible to fabricate
  complex, customized internal structures that would have been impossible to
  build by hand — lattices, internal channels, and porous walls, all in one
  print job.
- Even a bit of **plant-inspired growth algorithms** from computer graphics
  (the same techniques used to generate realistic tree branches and leaf vein
  patterns turn out to be useful for laying out nutrient tubes).

None of these pieces are individually novel. What's being explored here is
what happens when you combine them deliberately: a soil substitute that is
*designed to ask questions*, rather than just designed to grow plants.

## Who might find this useful or interesting

- **Plant biologists and soil ecologists** curious about root foraging
  behavior, nutrient signaling, and rhizosphere microbial ecology, who want a
  more controllable and observable alternative to real soil.
- **Hydroponics and controlled-environment agriculture researchers** looking
  for substrates that let plants participate in their own nutrient
  regulation, potentially improving efficiency or resilience.
- **Makers and 3D-printing hobbyists** interested in generative design
  problems — this is a genuinely interesting geometry and fabrication
  challenge even divorced from the biology.
- **Educators**, as a way to make root behavior visible and tangible for
  students — a lattice with a transparent face turns "root foraging" from an
  abstract concept into something you can watch happen.
- **Anyone interested in synthetic ecosystems** — small, designed systems
  where biology and engineered structure co-adapt — as a hands-on, physical
  entry point into that larger idea.
- **Speculative designers and artists** drawn to the idea of a "programmable
  soil" as a concept object, independent of whether it ever becomes an
  agricultural product.

This is early-stage, exploratory work — more a research probe and design
tool than a finished product. The interesting part right now is less "does
this grow better lettuce" and more "can we build a substrate that lets a
plant show us, clearly and repeatably, what it wants."