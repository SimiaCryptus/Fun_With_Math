# Marching Orders

A Lemmings-inspired siege game. You don't control individual soldiers directly;
you shape the flow of a marching column of alien infantry by placing crates,
issuing role assignments, and modifying the terrain. Your goal is to breach a
fortified tower and reach its objective before your reinforcements run out.

---

## 1. Core Concept

- **Genre:** Indirect-control puzzle / tactics hybrid (Lemmings meets tower siege).
- **Perspective:** 3D, free-orbit camera over a voxel diorama, with an optional
  fixed isometric preset for puzzle-style readability.
- **Player fantasy:** You are a field commander with a limited toolkit, watching
  your troops pour out of a drop pod and trying to turn a mindless stampede into
  a coordinated assault.
- **Win condition:** Deliver a required number of troops to the tower's objective
  (throne room, reactor core, signal spire, etc.) or destroy a designated target.
- **Lose condition:** Reinforcement pool exhausted before objective is met, or a
  level-specific timer expires.

---

## 2. Troops

### 2.1 Baseline Behaviour
Troops spawn from a **drop pod** at a fixed rate and march forward. By default they:
- Walk in a straight line along their facing direction.
- Turn around when they hit a wall taller than they can step over (1 voxel).
- Step up/down 1-voxel ledges automatically.
- Fall off edges. Falls over N voxels are lethal.
- Engage enemies in melee range as **brawlers** (weak, slow attack, low HP).
- Ignore hazards unless explicitly equipped/ordered to deal with them.

### 2.2 Stats (per troop)
| Stat     | Purpose                                   |
|----------|-------------------------------------------|
| HP       | Damage soak                                |
| Armor    | Flat damage reduction                     |
| Speed    | Voxels per second                          |
| Attack   | Damage per hit                             |
| Range    | 1 for melee, higher with ranged weapons    |
| Morale   | Drops when allies die nearby; low morale = flee back toward the pod |

### 2.3 Equipment (via Weapon Crates)
Crates are placed by the player on any walkable voxel. The first N troops to
walk over a crate pick up its contents and are permanently changed.

| Crate       | Effect                                                           |
|-------------|------------------------------------------------------------------|
| Rifle       | Ranged attack; troops stop and fire when enemy is in line of sight |
| Shotgun     | Short-range, high damage, knocks enemies back                    |
| Grenades    | Troops lob grenades at groups of enemies or destructible walls    |
| Armor       | +Armor, -Speed                                                    |
| Shield      | Blocks projectiles from the front; shield-bearers walk in front   |
| Pickaxe     | Troop digs a horizontal tunnel through soft voxels                |
| Drill       | Troop digs downward                                               |
| Climbing Kit| Troop scales vertical walls up to X voxels                        |
| Ladder Kit  | Troop places a persistent ladder others can use                   |
| Explosive   | Troop becomes a one-shot demolition charge                        |
| Medkit      | Troop heals nearby allies instead of fighting                     |
| Jetpack     | Troop can clear gaps and short vertical rises                     |

Crates have a **capacity** (e.g. 5 uses) and a **cost** from a level-specific
budget, encouraging deliberate placement.

### 2.4 Commands / Specializations
In addition to crates, the player can click a troop (or a spot on the path) to
issue a **role**. Roles are Lemmings-style and act on the flow of the column:

| Role      | Behaviour                                                        |
|-----------|------------------------------------------------------------------|
| Blocker   | Stands still; others turn around when they bump into them         |
| Builder   | Builds a diagonal stair of voxels forward and upward              |
| Bridger   | Lays planks across a horizontal gap                               |
| Breacher  | Attacks a wall/door until destroyed                               |
| Scout     | Runs ahead at double speed, reveals traps, doesn't fight          |
| Sergeant  | Nearby troops follow the sergeant's path and get a morale boost   |
| Halt      | Group stops until released (area command)                         |
| Charge    | Group sprints and ignores morale for a short time (area command)  |

Roles are limited per level (e.g. "3 Blockers, 2 Builders").

---

## 3. The Tower

Each level is a fortified structure the player must penetrate. Towers are built
from voxels and contain:

### 3.1 Static Defenses
- **Walls** – varying hardness: soft (dig-able), hard (needs explosives), or
  indestructible.
- **Doors / Gates** – destructible barriers; some open from a switch.
- **Moats / Pits** – gaps requiring bridging or jetpacks.
- **Spikes / Acid Pools** – lethal floor hazards.
- **Turrets** – automated ranged emplacements with fixed arcs.
- **Traps** – pressure plates that trigger crushers, flame vents, or floor drops.
- **Switches / Levers** – toggled by any troop walking over them; open gates,
  disable turrets, drop drawbridges.

### 3.2 Guards (Enemy AI)
- **Sentry** – stands still, melee attacks anyone in reach.
- **Patroller** – walks a fixed route.
- **Archer / Gunner** – ranged, stays on a platform.
- **Brute** – slow, high HP, area knockback.
- **Alarm Runner** – runs to a bell/console to summon reinforcements.
- **Commander** – buffs nearby guards; killing them may cause guards to flee.

Guards have simple state machines (idle → alert → engage → retreat) and use the
same voxel navigation rules as player troops.

### 3.3 Objective Types
- **Reach** – get X troops to a marked room.
- **Capture** – hold a point for T seconds.
- **Destroy** – reduce a core structure to 0 HP.
- **Extract** – reach the objective and then return to the pod.

---

## 4. Level Design

### 4.1 Voxel World
- Minecraft-inspired unit voxels, chunked for rendering.
- Voxel types carry gameplay data: hardness, walkable, lethal, climbable, etc.
- Terrain is fully editable at runtime (digging, building, explosions).
- Levels are stored as compact JSON or a run-length-encoded binary blob.

### 4.2 Level Editor
- In-browser editor built from the same modules as the game.
- Paint voxels, place spawners, guards, crates, switches, and objective markers.
- Set per-level budgets: troop count, crate allowance, role limits, time.
- Playtest instantly from the editor; export/import level files.

### 4.3 Campaign Structure
- **Tutorial outpost** – teach marching, blockers, one crate type.
- **Frontier forts** – introduce guards, turrets, digging.
- **Fortress tier** – multi-floor towers, switches, traps, morale pressure.
- **Citadel** – combined puzzles, boss commander, tight budgets.
- Optional star ratings: troops saved, time, budget unused.

---

## 5. Art & Setting

- **Troops:** alien humanoid soldiers – lanky, large-eyed, vaguely insectoid,
  in colour-coded fatigues. Equipment visibly changes their silhouette (helmet,
  backpack, rifle, shield) so roles are readable at a glance.
- **Enemies:** a rival alien faction or automated garrison; heavier, angular,
  contrasting colour palette.
- **Style:** chunky voxels for terrain, low-poly stylised characters with flat
  shading. Bright, readable colours over realism.
- **Effects:** particle bursts for explosions and voxel destruction, simple
  tracer lines for gunfire, screen-space outlines for selected units.
- **Audio:** marching footsteps scale with troop count; crate pickup, role
  assignment, and alarm sounds give immediate feedback.

---

## 6. Technology

- **Platform:** Browser, HTML5.
- **Language:** Modular ES6 (native `import`/`export`, no bundler required for
  dev; optional bundling for release).
- **Rendering:** three.js
  - Chunked voxel meshes with greedy meshing and a texture atlas.
  - Instanced meshes for troops and guards (many identical units).
  - Orbit camera with clamped angles; optional isometric preset.
- **Simulation:**
  - Fixed-timestep game loop decoupled from render frame rate.
  - Deterministic troop AI so replays and level validation are reproducible.
  - Spatial hashing on voxel grid for cheap unit/enemy/crate lookups.
- **Physics:** Custom grid-based movement (no general physics engine); simple
  parabolic arcs for grenades and jetpacks.
- **Persistence:** `localStorage` for progress and custom levels; JSON export.

### 6.1 Proposed Module Layout
```
src/
  main.js              # bootstrap, game loop
  engine/
    renderer.js        # three.js scene, camera, lighting
    input.js           # mouse/keyboard, raycasting into voxel grid
    audio.js
  world/
    voxel.js           # voxel type definitions
    chunk.js           # chunk storage + greedy mesher
    world.js           # world grid, edits, queries
    level-loader.js    # JSON <-> World
  units/
    troop.js           # base troop, stats, equipment
    roles/             # blocker.js, builder.js, breacher.js, ...
    guard.js           # enemy state machine
    pathing.js         # grid step/fall/turn rules
  items/
    crate.js
    equipment.js       # rifle, grenades, armor, etc.
  defenses/
    turret.js
    trap.js
    switch.js
  ui/
    hud.js             # budgets, counters, role palette
    editor.js          # level editor tools
  levels/
    *.json
```

---

## 7. MVP Scope

1. Voxel world rendering + camera.
2. Drop pod spawning brawler troops that march, turn, step, and fall.
3. One guard type (Sentry) and melee combat.
4. Two crates (Rifle, Pickaxe) and two roles (Blocker, Builder).
5. One objective type (Reach) and a win/lose screen.
6. One hand-built level as JSON.

## 8. Stretch Goals

- Full crate and role sets.
- Level editor with sharing via URL-encoded level data.
- Morale system and fleeing.
- Multi-floor towers with interior views (cutaway rendering).
- Replays and ghost runs.
- Co-op mode where two commanders share a budget.