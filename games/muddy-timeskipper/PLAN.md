# MUDDY TIMESKIPPER — Implementation Plan (three.js + modular ES6)

Target: single-player, browser, no build step required (native ES modules + importmap),
60 fps on integrated GPU at 1600x900, deterministic fixed-step simulation.

---

## 0. TECH DECISIONS (locked)

| Concern            | Decision                                                                 |
|--------------------|--------------------------------------------------------------------------|
| Renderer           | three.js r16x via CDN importmap (`three`, `three/addons/`)               |
| Module system      | Native ES6 modules, no bundler in dev; optional esbuild for ship         |
| Physics            | Custom arcade vehicle model (no rigid-body engine). Deterministic.       |
| Sim rate           | Fixed 120 Hz (`SIM_DT = 1/120`), render decoupled, accumulator loop      |
| Velocity history   | 60 Hz ring buffer of Float32Array per vehicle (40 s = 2400 samples)      |
| Math in sim layer  | Own `Vec3` POJO helpers — **no THREE in sim layer** (headless testing)   |
| Randomness         | Seeded `mulberry32` (`RNG`) so races replay identically                  |
| Units              | SI internally (m, m/s, rad). mph only for display / thresholds.          |
| Persistence        | `localStorage` JSON save blob (v1 schema, migration function)            |
| Tests              | `node --test` on sim layer (no DOM/WebGL needed)                         |

Key constant: `88 mph = 39.3216 m/s` (`MPH = 0.44704`).

---

## 1. FILE TREE

    games/muddy-timeskipper/
      index.html                  # importmap, canvases, boot overlay
      PLAN.md
      src/
        main.js                   # bootstrap: renderer, race, loop, hud wiring
        core/
          constants.js            # all tuning numbers in ONE place
          Vec3.js                 # engine-free vector helpers
          MathX.js                # clamp/lerp/damp/smoothstep/mph conversions
          RingBuffer.js           # strided fixed-capacity history buffer
          EventBus.js             # tiny pub/sub (SNAPBACK, CRASH, LAP, GAG)
          RNG.js                  # mulberry32 seeded rng
          Loop.js                 # accumulator fixed-step loop + fps stats
        physics/
          MudField.js             # heightfield: depth / wetness / rut vectors
          VehicleBody.js          # arcade vehicle integrator + strain + failure
          Collision.js            # vehicle-vehicle & wall pushout (broadphase grid)
        temporal/
          gears.js                # gear table (T1/T2/T3 + unlockables)
          VelocityHistory.js      # per-vehicle recorder + interpolated sampling
          SnapbackController.js   # arming, cooldown, lockout, apply-to-all
        entities/
          PlayerVehicle.js        # body + input mapping + history
          AIVehicle.js            # body + AIDriver + history
          AIDriver.js             # racing line follow + recovery FSM + panic
        track/
          TrackSpline.js          # Catmull-Rom centerline, nearest-point, progress
          tracks/sludge-speedway.js
          tracks/gristle-gulch.js
        game/
          Race.js                 # world owner: fixedUpdate/render, laps, standings
          Standings.js            # progress ranking, lap/checkpoint validation
          GagDirector.js          # geysers, worms, critters reacting to snapback
          SaveGame.js
        render/
          Renderer.js             # WebGLRenderer, toon lighting, post (optional)
          MudTerrain.js           # displaced mesh + DataTexture from MudField
          VehicleRig.js           # squash/stretch, eyes, tongue, grill scream
          CameraRig.js            # chase cam + snapback whip + shake
          Fx.js                   # mud clump particles, geysers, speed lines
        ui/
          HUD.js                  # speedo, strain thermometer, VELOCITY RIBBON
          GearSelector.js
          Menus.js
        audio/
          AudioBus.js             # WebAudio: SPLORCH/BOINK/BLORP/SKREEEEEE
      tests/
        velocityHistory.test.js
        snapback.test.js
        vehicleBody.test.js

Dependency direction: `render/ui/audio -> game -> entities -> {physics, temporal} -> core`.
Nothing in `core|physics|temporal|entities` may import `three`. CI check: grep.

---

## 2. THE CORE MECHANIC, SPECIFIED PRECISELY

### 2.1 Recording
Every history tick (60 Hz) each vehicle appends a 6-float record:

    [ vx, vy, vz, yaw, yawRate, speed ]

Capacity = `ceil(MAX_OFFSET_S * HISTORY_HZ) + 2 = 2402`. Memory per vehicle
`2402 * 6 * 4 B ≈ 57 KB`; 6 vehicles ≈ 346 KB. Acceptable.

### 2.2 Sampling
`history.sample(ageSeconds)` returns a linearly interpolated record between the two
neighbouring ticks (yaw interpolated as an angle via shortest arc). If `ageSeconds`
exceeds recorded history (early race), it **clamps to the oldest sample** and sets
`clamped = true` — the HUD shows a Ren & Stimpy style `"TOO YOUNG!!"` stamp and the
gear still fires (never punish the player with a dead button), but cooldown is halved.

### 2.3 Applying (`SnapbackController.activate`)
For each affected vehicle, given the past record `P` and gear `G`:

    // 1. horizontal velocity blend
    vNew.xz = lerp(vCur.xz, P.v.xz, G.blend)          // G.blend: 1.0 player, <1 for AI
    // 2. optional heading realign (T1 feels "corrective", T3 feels "violent")
    vNew.xz = rotateTowards(vNew.xz, forward(yawCur), G.headingRealign)
    // 3. vertical safety: never re-inject big vertical velocity (prevents launches/clipping)
    vNew.y  = clamp(lerp(vCur.y, P.v.y * 0.35, G.blend), -MAX_FALL, 6)
    // 4. sanity cap
    if (|vNew| > SNAP_MAX_SPEED) vNew *= SNAP_MAX_SPEED / |vNew|
    // 5. angular
    yawRate = lerp(yawRateCur, P.yawRate, G.blend * G.angularBlend)
    // 6. cartoon impulse (visual only): squash = 1 + G.impulseScale * |vNew - vCur| / 30

Positions, orientation, mud load, rut deformation, suspension, lap progress are
**never** touched. That invariant has a unit test (`snapback.test.js`).

### 2.4 Arming / gating
* `armed = speedMph >= 88` (latches for `ARM_GRACE = 0.75 s` after dropping below, so
  the player is not fighting a 1-frame window).
* `cooldown[gearId]` per gear, ticked down in fixedUpdate.
* Switching gear sets `switchLockout = 1.2 s` (no activation during lockout).
* Activation consumes arm latch (must re-reach 88 mph).

### 2.5 AI blast radius
Gear defines `chaosRadius` (metres, `-1` = whole field). AI inside the radius get the
snapback with `G.aiBlend`, plus `AIDriver.panic(G.panic)` which forces the recovery FSM
into `FLAIL` for `0.4..1.2 s` with exaggerated counter-steer.

### 2.6 Anti-degenerate rules (balance)
* Snapback cannot *increase* forward speed by more than `SNAP_GAIN_CAP = 1.15x` current
  forward speed for the player — otherwise "hit 88, snapback to a faster past" becomes a
  free infinite accelerator. Gains above the cap are converted into **cartoon boost fx
  only**, not real velocity.
* `snapbackCount` per lap feeds a `rhythmMeter`; exceeding `RHYTHM_LIMIT` per lap adds
  mud-load penalty ("gunked up") — implements spec §10 "overusing snapbacks".

---

## 3. MILESTONES (each ends in a playable/verifiable build)

### M0 — Skeleton & harness (0.5 d)
* `index.html` with importmap, `main.js` renders a grey plane + orbit cam, `Loop` prints
  stable `sim ticks/s = 120`.
* Accept: no console errors; `node --test` runs (0 tests ok).

### M1 — Arcade vehicle on flat ground (2 d)
* `VehicleBody`, `Vec3`, `MathX`, `constants`, keyboard/gamepad input.
* Model per fixed step:
  1. `fwd = (sin yaw, 0, cos yaw)`, `right = (cos yaw, 0, -sin yaw)`
  2. `vF = dot(v,fwd)`, `vL = dot(v,right)`
  3. `engine = throttle * TORQUE * (1 - vF/V_MAX) - brake * BRAKE * sign(vF)`
  4. `grip = BASE_GRIP * mudGrip * (1 - instability)`, `instability = smoothstep(0.82,1,vF/V88)`
  5. lateral damping `vL += -clamp(vL * grip * LAT_K, ±LAT_MAX) * dt`
  6. `yawRateTarget = steer * STEER_MAX * steerFalloff(vF) * (0.35 + 0.65*grip)`
  7. `yawRate = damp(yawRate, yawRateTarget + oversteer(vL, grip), YAW_DAMP, dt)`
  8. drag: `v -= v * (AIR_DRAG*|v| + MUD_DRAG*depth) * dt`
  9. gravity + ground clamp, recompose `v = fwd*vF + right*vL + up*vy`
* Accept: reachable top speed ≈ 105 mph on hardpack, 88 mph feels twitchy (steer
  authority ≤ 45% at 88), donuts possible with handbrake.

### M2 — Mud field (2 d)
* `MudField`: `GRID = 256x256` over track AABB, three Float32Arrays: `depth`,
  `wetness`, `rutU/rutV` (packed rut flow direction), plus `height`.
* `sample(x,z)` bilinear → `{height, depth, wetness, rut}`; `grip = 1/(1+depth*MUD_GRIP_K)`.
* `deform(x, z, radius, amount, dirX, dirZ)` on every wheel contact: deepens rut,
  writes rut direction (EMA), marks dirty rect.
* `MudTerrain` builds a `PlaneGeometry(…, 255, 255)` with a `DataTexture` (RGBA:
  height, depth, wetness, rutMask) updated per dirty rect each frame (`texture.needsUpdate`,
  partial upload via `texSubImage2D` through `renderer.copyTextureToTexture` fallback).
* Rut steering pull: `yawRate += RUT_PULL * cross(fwd, rut) * depth`.
* Accept: driving carves visible ruts that persist and measurably alter handling
  (lap-2 lines differ from lap-1); getting stuck in a deep pit is possible.

### M3 — TEMPORAL CORE (3 d)  ← the game
* `RingBuffer`, `VelocityHistory`, `gears`, `SnapbackController`.
* HUD **VELOCITY RIBBON**: scrolling strip chart of the last 40 s of player speed with
  tick markers at −8 s / −20 s / −40 s and a ghost pip showing *the speed you would snap
  to* for the currently selected gear. This single widget converts the mechanic from
  "mystery button" to a skill. Non-negotiable feature.
* Strain thermometer 0..1 = `smoothstep(0.82, 1.0, speedMph/88)`; glows/latches when armed.
* Accept (automated): `snapback.test.js` proves (i) position/yaw/mud unchanged,
  (ii) resulting velocity within 1e-4 of `lerp(cur, past, blend)` after caps,
  (iii) clamped path when history short, (iv) cooldown/lockout gating.
* Accept (feel): a player can deliberately create an "anchor" (crawl through a mud pit
  at 15 mph), sprint to 88 on the straight, and snap back to the crawl to survive a
  hairpin.

### M4 — AI drivers (3 d)
* `TrackSpline` racing line + per-segment target speed baked offline
  (`v_target = sqrt(LAT_ACC / curvature)` clamped).
* `AIDriver` FSM: `RACE → (snapback) → FLAIL → STABILISE → REACQUIRE → RACE`
    * `FLAIL` (0.4–1.2 s): counter-steer with sign error, throttle stab, scream anim.
    * `STABILISE`: kill lateral velocity, steer to velocity vector, no throttle.
    * `REACQUIRE`: pick nearest spline point ahead, drive to it at 70% target speed.
    * `RACE`: pure pursuit lookahead `L = 6 + 0.8*speed`, PID-ish steer, speed target
      from baked curvature, rubber-band `±6%` (difficulty-scaled).
* Personalities as parameter sets (spec §5): Gritty Gus (aggro, high torque, blocks),
  Slick Sally (fast on hardpack, terrible in deep mud), Boggy Bill (slow, mud-immune),
  Turbo Tadpole (tiny, high accel, low mass → snapback flings her hardest).
* `Collision.js`: circle-circle pushout + impulse exchange, 8 m broadphase grid.
* Accept: 5 AI complete a clean lap unassisted within 8% of each other; a T3 snapback in
  a choke point measurably reshuffles standings ≥ 1 position in ≥ 60% of trials.

### M5 — Track & race structure (2 d)
* Track data format:

      export default {
        id:'sludge-speedway', name:'The Sludge Speedway', laps:3, seed:1234,
        centerline:[[x,y,z],...],      // Catmull-Rom control points
        widths:[12, 14, 9, ...],       // per control point
        mudZones:[{x,z,r,depth,wetness}],
        hazards:[{type:'geyser', x,z, period, phase}],
        checkpoints:[t0,t1,...],       // spline params, must be crossed in order
        spawn:[{x,z,yaw}]
      }
* `Standings`: progress = `lap * 1 + splineT`; checkpoint order validation; wrong-way
  detection; reset-to-track after 4 s stuck/rollover (position kept, velocity zeroed —
  NOT a rewind, keeps the fiction pure).
* Accept: 3-lap race completes, standings correct, respawn cannot be exploited for shortcut.

### M6 — Cartoon rig & camera juice (3 d)
* `VehicleRig` (three.js): body group with non-uniform scale in *velocity-aligned* local
  space: `stretch = 1 + 0.35*strain + 0.5*snapImpulse`, cross-axis `1/sqrt(stretch)`.
* Eyes: two spheres, `scale = 1 + 1.6*strain`, pupils shift with lateral G.
* Tongue: bent plane, visibility when `|vL| > 6 m/s`, wobbles with yawRate.
* Grill "scream": morph via 2-frame texture swap + vertical scale spike on snapback.
* `MeshToonMaterial` + inverted-hull outline (`side: BackSide`, scaled 1.04, black).
* `CameraRig`: chase with spring damping; on snapback: FOV punch (`+18°` over 90 ms,
  ease back 400 ms), 4-frame hold, rotational whip toward the delta-v direction,
  procedural shake `amp = 0.12 * |Δv|/30`.
* `Fx`: pooled mud clumps (InstancedMesh 512), sheet-peel decals, speed lines plane.
* Accept: snapback reads instantly as a *joke* on screen even with the HUD hidden;
  frame time ≤ 6 ms CPU during a 6-car snapback.

### M7 — Audio & gags (2 d)
* `AudioBus`: WebAudio graph, procedural first (no assets needed to ship M7):
    * BOINK: sine 900→180 Hz over 140 ms + bandpassed noise tail.
    * BLORP: sawtooth 220→60 Hz, 260 ms, lowpass sweep, 1.4 s reverb tail.
    * SKREEEEEE: two detuned saws 1.2 kHz with vibrato 9 Hz, 900 ms, distortion curve.
    * SPLORCH: white-noise burst through resonant lowpass 400 Hz, envelope 25/180 ms.
    * Engine: sawtooth osc, `freq = 60 + rpm*0.09`, wet lowpass tied to mud depth.
* `GagDirector`: on `SNAPBACK` event, choose N nearby gag actors by seeded RNG:
  geyser erupt, worm scream, critter flattened-then-inflates. Cooldown per actor 6 s.
* Accept: no audio clipping (`masterGain 0.8` + limiter), gag rate feels ~1 per snapback,
  never 3 at once.

### M8 — Progression, menus, save (1.5 d)
* Unlock table: gears (T0 "Twitch" 3 s, T4 "Geezer" 70 s), trucks, tracks, cosmetics.
* `SaveGame`: `{v:1, unlocks:[], best:{trackId:ms}, options:{}}`.
* Menus: track select, truck select, gear loadout (one active + quick-swap), options
  (sensitivity, shake amount, gore/gross-out slider, reduced-motion mode).

### M9 — Perf, balance, polish (2 d)
* Budgets: draw calls ≤ 120, tris ≤ 350 k, `SIM` CPU ≤ 3 ms/frame, GC-free steady state
  (all sim vectors preallocated; **no object literals in fixedUpdate** — enforced by a
  "no-alloc" review checklist and a heap-growth test over 60 s).
* Balance pass with telemetry: log snapback usage histogram per gear, win rate,
  average positions gained per snapback. Tune `blend`, `cooldown`, `chaosRadius`.
* Accessibility: reduced-motion (disable FOV punch/shake), colour-blind safe HUD,
  remappable keys, "assist" mode (auto-arm, wider 88 window).

---

## 4. TUNING TABLE (initial values, live in `core/constants.js`)

| Name              | Value      | Meaning                                    |
|-------------------|------------|--------------------------------------------|
| SIM_HZ            | 120        | physics steps/s                            |
| HISTORY_HZ        | 60         | velocity samples/s                         |
| V88               | 39.3216    | m/s (88 mph) arm threshold                 |
| V_MAX             | 47.0       | m/s engine-limited top speed               |
| TORQUE            | 15.5       | m/s^2 at zero speed                        |
| BRAKE             | 18.0       | m/s^2                                      |
| BASE_GRIP         | 1.0        | hardpack lateral grip scalar               |
| LAT_K             | 6.5        | lateral velocity kill rate                 |
| LAT_MAX           | 22.0       | max lateral accel (m/s^2)                  |
| STEER_MAX         | 1.9        | rad/s at low speed                         |
| YAW_DAMP          | 9.0        | yaw rate convergence                       |
| OVERSTEER_K       | 0.055      | fishtail gain                              |
| AIR_DRAG          | 0.0022     | quadratic                                  |
| MUD_DRAG          | 0.9        | per unit mud depth                         |
| MUD_GRIP_K        | 1.6        | grip = 1/(1+depth*K)                       |
| RUT_PULL          | 1.25       | rad/s per unit rut alignment error         |
| ARM_GRACE         | 0.75 s     | arm latch after dropping below 88          |
| SNAP_MAX_SPEED    | 44.0 m/s   | post-snapback speed cap                    |
| SNAP_GAIN_CAP     | 1.15       | max forward-speed multiplier from snapback |
| RHYTHM_LIMIT      | 4 / lap    | before mud-load penalty                    |
| ROLL_LIMIT        | 1.7        | lateral-G*yawRate product → rollover       |
| STUCK_TIME        | 4.0 s      | speed<1.5 m/s in depth>0.6 → failure/reset |

Gear table (`temporal/gears.js`):

| id | name              | offset | cooldown | blend | aiBlend | headingRealign | angularBlend | chaosRadius | panic |
|----|-------------------|--------|----------|-------|---------|----------------|--------------|-------------|-------|
| T1 | Lil' Skipper      | 8 s    | 6 s      | 1.00  | 0.55    | 0.55           | 0.6          | 35 m        | 0.35  |
| T2 | Big Ol' Skipper   | 20 s   | 12 s     | 1.00  | 0.80    | 0.25           | 0.9          | 80 m        | 0.70  |
| T3 | Grandpappy        | 40 s   | 22 s     | 1.00  | 1.00    | 0.00           | 1.0          | -1 (all)    | 1.00  |

---

## 5. EVENTS (EventBus contract)

    'snapback'   { gearId, tick, playerDeltaV, affected:[{id, deltaV}], clamped }
    'armed'      { armed:boolean }
    'gearSwitch' { gearId, lockoutS }
    'crash'      { id, kind:'rollover'|'stuck'|'spin' }
    'lap'        { id, lap, timeMs }
    'checkpoint' { id, index }
    'finish'     { standings:[...] }
    'gag'        { kind, x, z, intensity }

HUD, AudioBus, CameraRig, GagDirector and Fx subscribe; none of them are referenced by
the sim layer.

---

## 6. TEST PLAN (headless, `node --test games/muddy-timeskipper/tests`)

1. `RingBuffer`: wraparound integrity over 3x capacity; `ticksAgo` correctness.
2. `VelocityHistory`: exact retrieval at integral ages; interpolation at 0.5-tick ages;
   yaw shortest-arc interpolation across ±π; clamped flag before buffer fills.
3. `Snapback` invariants: position/yaw/mudLoad/lapProgress untouched; velocity formula;
   gain cap; vertical damping; cooldown & lockout gating; AI blend + panic dispatch.
4. `VehicleBody`: terminal speed within 2% of analytic; no NaN across 10^6 random-input
   steps; instability monotonic in speed; determinism (same seed+inputs → identical
   float state after 10 000 ticks).
5. Perf smoke: 6 vehicles x 120 Hz x 60 s in < 1.5 s wall time headless.