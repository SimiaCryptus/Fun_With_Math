# Gravitic Portals

*What if a portal were not a shortcut through space, but a rule about gravity itself?*

This is a math-and-physics explorer. It lets you place pairs of circular portals in a room and watch how gravity reshapes itself around them. It is the non-gamified version of the idea: there are no levels, scores or enemies. There is only the field, and you are free to poke at it.

---

## The Short Version

In most portal games, a portal is a doorway. Step through one and you come out of the other. That works until gravity gets involved. Put one portal in the floor and another in the ceiling directly above it. Fall through the floor, and you reappear at the ceiling still falling. You speed up, fall again, and speed up again. Energy appears from nowhere, forever.

This project avoids that problem with a different idea. A portal is a promise that two circular patches of space sit at the **same gravitational potential**. Potential is the quantity that gravity "rolls downhill" on: gravity always points in the direction the potential falls fastest. If the two patches are forced to agree, the surrounding space has to bend its gravity to make that possible. That bending is called the **Correcting Field**.

Because the whole thing comes from a single potential, no closed loop can ever gain energy. A free-energy loop is not forbidden by a rule added on top. It is mathematically impossible.

---

## Background

The mathematics is not new. A potential held at fixed values on surfaces is the setting for classical electrostatics. Two parallel metal disks held at opposite voltages form a **disk capacitor**, a problem studied since the 19th century. Away from any mass, gravitational and electric potentials obey the same equation (Laplace's equation), so two hundred years of electrostatics apply directly. We are borrowing that toolbox and relabelling it.

The tool therefore leans on well-understood behaviour:

- **Between two facing disks** the field runs straight between them and nearly cancels ordinary gravity.
- **At the rims** the field spikes sharply, the same effect that makes lightning rods work.
- **Far away** the pair looks like a weak dipole, and gravity is barely disturbed.

---

## What You See and Do

The interface is a 3D view you can orbit around, with a control panel at the side.

**In the scene**
- Translucent portal disks with a glowing rim.
- Optional views of the field: arrows coloured by strength, a movable slice showing a heat map of the potential or the total gravity, and streamlines flowing around the rims.
- A swarm of small test particles that fall through the field and pass through the portals, so you can see where gravity actually sends things.

**In the panel**
- Drag portals, rotate them, and change their radius.
- Presets: floor-to-ceiling, wall-to-wall, a 45° tilt, and unequal radii.
- Switches to show or hide each part of the field (the gap, the rim and the far field).
- Switches to compare the fast approximate model with a slow, accurate reference calculation.
- A running readout of particle energy. It stays steady, which is the point.

---

## What Falls Out of the Theory

- **The calm chamber.** A floor portal and a ceiling portal create a region between them where the Correcting Field cancels gravity. It is not gravity "switched off". The field actively opposes it, so the space behaves like a neutral-buoyancy tank. How well gravity cancels depends on how far apart the portals are compared with their size.
- **Dangerous edges.** The rim of every portal is a zone of intense gravity, while the middle is calm. The tool clamps the rim at a small distance so the numbers stay finite.
- **Scale change.** If the two portals have different radii, the map between them must include a scale factor. Anything passing through is shrunk or enlarged. This is a geometric consequence, not an added power-up. It also raises real questions about momentum and energy. The project treats these honestly, as open problems with several candidate rules.

---

## Why It Is Interesting

- It shows a game-style "impossible" mechanic resting on real physics.
- It makes an abstract object, a scalar potential field, something you can look at and push around.
- It has honest limits. The simple formulas only approximate the true field, and the tool measures how well. To address this, the field is precomputed from an accurate numerical solution and then looked up quickly. Unequal portals and overlapping pairs are known to be rougher, and the project says so.
- It is deterministic: the same setup always produces the same field, so results can be shared and reproduced.

---

## Who Might Find It Useful

- **Students and teachers** of electromagnetism, potential theory or classical mechanics, who want a concrete example of boundary-value problems, conservative fields and the disk capacitor.
- **Curious people** who enjoy "what if" physics and want to see why naive portal gravity breaks.
- **Game and level designers** thinking about physics-based mechanics, who want to understand the field model before it is turned into gameplay.
- **Science communicators** looking for visual material on potentials, field lines and edge singularities.

---

## Status and Related Ideas

This is an experiment under active development. A separate gamified direction, **Equipotential**, drops the portals entirely. In it, the walls of a room hold chosen potentials and the player solves puzzles by predicting and riding the resulting gravity. This version stays on the exploratory, non-game side.