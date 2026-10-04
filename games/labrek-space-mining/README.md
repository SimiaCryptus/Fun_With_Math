# Labrek Space Mining

*"The asteroid is a ship you didn't build — and it doesn't want to be one."*

Labrek is a browser-based engineering sandbox about working on a small, spinning asteroid. You land a handful of robots on a real-feeling rock, anchor yourself to it, dig into it, process what you find, and eventually try to turn the rock itself into a spacecraft and steer it onto a new orbit.

There is nothing to install and no account to make. It runs in a current desktop browser.

---

## The Idea

Most space games treat asteroids as scenery or as piles of ore. Labrek treats them as what they are: loose, fragile, weakly bound heaps of rubble in near-weightlessness.

The central rule is that **physics is the game**. Nothing happens because a script says so. If something happens, it is because of mass, gravity, force, friction or heat.

- Every chunk of rock has mass, and every chunk pulls on every other chunk.
- Every push has an equal push back. Drilling shoves the drill and the robot. Firing an engine shoves the rock it is bolted to.
- Rock is held together by cohesion and friction, and each connection has a limit. Exceed it and the connection fails.

The famous example is the game's core lesson. Bolt a big chemical rocket onto a rubble pile and fire it, and the pile comes apart around the engine. Build a strong frame, anchor it with drilled pitons, wrap the body in a cable net to spread the load, and the same engine can push the whole asteroid.

---

## Background

Asteroids are real engineering targets. Many are "rubble piles": loose collections of boulders and dust held together mostly by their own faint gravity and by friction. Their gravity is tiny. On a body about 100 metres across, escape speed is only a few centimetres per second. A robot that hops too hard simply leaves forever.

Many asteroids also spin, and some tumble. A spinning body can shed material from its equator if it turns too fast. Lopsided, wobbling, reshaped bodies are normal, not special cases.

Labrek stays in the realistic energy range of roughly the year 2080: chemical rockets, ion engines, solar power, small reactors, robots and mass drivers (electric rail guns that throw rock pellets). It deliberately avoids made-up physics, so what you learn about microgravity, spin and structure carries over to the real thing.

---

## How It Plays

1. **Survey.** Read the report on your asteroid: mass, size, spin period, how close it is to flying apart, and what it is made of.
2. **Land and anchor.** Touch down gently, then fix yourself to the surface with pitons, nets and clamps.
3. **Power up.** Deploy solar wings and later a reactor with radiators.
4. **Extract.** Drill and scoop. Dust is a hazard, and digging can trigger landslides or collapse.
5. **Process.** Sinter regolith into solid blocks, pull volatiles from ice, refine metal.
6. **Build.** Print frames, mounts and more robots.
7. **Push.** Apply thrust with mass drivers, ion engines or rockets, without exceeding what the structure can carry.
8. **Steer.** Hit the mission's target orbit, spin rate or structural goal.

Time warp lets slow, months-long pushes finish in minutes of real play.

### Missions

Eight short missions teach one idea each, plus a free sandbox.

| Mission | What it teaches |
|---|---|
| First Touch | Microgravity and escape speed |
| Dust Bowl | Reaction forces and avalanches |
| Big Rocket | Spreading load across a structure |
| Slow Push | Mass drivers and patience |
| Despin | Spin, inertia and where to apply torque |
| Wake the Comet | Heat, ice and outgassing jets |
| Split Decision | Using fracture deliberately |
| Iron Ship | The full construction stack |

There is no grind. Unlocks exist to introduce concepts in a sensible order, and the sandbox has everything available.

---

## The Interface

The layout is clean and minimal, and keyboard friendly.

- **Centre:** the 3D view. Orbit around a selected object, follow it, or fly freely. The direction of the Sun is always marked.
- **Left panel:** the build palette of modules, bonds and robots, with tooltips showing mass, power and strength limits. (The current prototype shows a small set of test actions: mount an engine, spin the body up, throw a boulder, make a dust burst.)
- **Right panel:** an inspector for whatever you select. It shows mass, spin versus breakup spin, escape speed, stock, and power and heat.
- **Top bar:** mission objective, a small diagram of your orbit against the target, and the time and warp level. A seed, asteroid class, size and a gravity multiplier let you generate your own rock.
- **Bottom bar:** an event log of fractures, jets and lost robots. Click an entry to jump to it.

### Seeing why things break

Overlays make the physics readable:

- **1** material
- **2** stress on every connection, from green to red
- **3** which way "downhill" really points once gravity and spin are combined
- **4** velocities
- **5** temperature
- **6** the body's rotation axes

Before committing to a burn, a "will it hold?" preview predicts which connections would fail. A burn planner shows expected velocity change, torque and safety margin.

Other controls: **Space** pause, **,** and **.** slow down or speed up time, **F** focus the selection, **B** build mode, **WASD** drive a selected robot.

Accessibility options include a colourblind-safe stress palette, adjustable UI size and reduced camera shake.

---

## Why It Is Interesting

- **Failure is content.** Fragmentation, spin-up, avalanches, outgassing jets and robots flung into space are the main drama, and you can always inspect the cause.
- **Real numbers, real feel.** Gravity is a thousandth of a thousandth of Earth's. Things drift, tumble and precess. Spinning bodies wobble and flip the way real ones do.
- **Everything is connected.** Mining changes mass and balance, which changes spin, which changes loads on your anchors.
- **Hands-on engineering.** You place, anchor, fire and fix. Robots handle local chores but do not plan your base for you.
- **Repeatable.** Asteroids are generated from a seed, and the simulation is deterministic, so the same seed and inputs give the same outcome. That makes challenges shareable.

Under the hood, the rock is made of 2-metre blocks, each with mass and material. Blocks lock together into rigid clusters until forces exceed friction or cohesion limits. Then they slide, break away, and may later settle and re-join. Energy lost to friction becomes heat. The simulation is a custom one, built because no off-the-shelf engine handles mutual gravity, fracture and splitting bodies together.

---

## Who Might Enjoy It

- Fans of orbital-mechanics and ship-building games who like understanding why a design worked or failed.
- Students and teachers looking for an intuitive feel for microgravity, angular momentum, friction, structural load and delta-v.
- Space enthusiasts curious about asteroid mining and planetary-defence style deflection.
- Puzzle and sandbox players who enjoy experimenting and watching emergent results.

It is not a relaxing logistics or idle game, and it does not include colonies, crew life support or elaborate story campaigns.

---

## At a Glance

| | |
|---|---|
| Genre | Physics sandbox, engineering, simulation |
| Setting | Near-future (~2080), realistic technology |
| Platform | Modern desktop browser (WebGL2) |
| Cost / setup | Free, no install, no account, no network needed once loaded |
| Part of | The Cognotik games catalog (games.cognotik.com) |

> Land on a tumbling rubble pile with a handful of robots and turn it into a spacecraft. Every block has mass, every body pulls on every other, and every push pushes back.