# Velocity Racer

A Speed Racer–inspired first-person arcade racing game in which the
speed of light has been lowered to **88 mph**. As the player accelerates
toward c, the world visibly warps: lengths contract, colors shift,
clocks slow, and the track ahead bunches into a bright tunnel.

**Stack:** modular ES6 (no bundler required), plain HTML/CSS, three.js.

---

## 1. Concept

### 1.1 Pitch

- Fast, stylized, cel-shaded racer with a retro-futurist look.
- The "gimmick" is real special relativity, exaggerated for fun:
  c = 88 mph (~39.3 m/s). Top speed is capped just under c (e.g. 87.9 mph).
- Winning is about _managing_ relativistic effects, not just going fast:
  at high β the road contracts and reaction time (in your frame) shrinks,
  but your lap timer (track frame) also runs differently from your
  cockpit clock.

### 1.2 Inspirations

- _Speed Racer_ (2008): saturated color, impossible tracks, loop-de-loops.
- _Back to the Future_: 88 mph as the magic number.
- MIT Game Lab's _A Slower Speed of Light_: proof that relativistic
  rendering is fun and legible.
- _Wipeout_ / _F-Zero_: arcade handling, boost management.

### 1.3 Design Pillars

1. **Speed you can see** – every mph near c must change the picture.
2. **Readable physics** – exaggerate, but keep effects consistent.
3. **Short sessions** – a lap is 60–120 s; a race is 3 laps.
4. **Zero build step** – open `index.html`, play.

---

## 2. Gameplay

### 2.1 Core Loop

1. Start on the grid, countdown 3-2-1.
2. Accelerate; steer through corners, banks and loops.
3. Hit boost pads / collect "photons" to gain boost energy.
4. Spend boost to approach c; manage warping vision and dilated time.
5. Complete 3 laps; compare **cockpit time** vs **track time**.

### 2.2 Controls

| Action    | Keyboard        | Gamepad    |
| --------- | --------------- | ---------- |
| Throttle  | W / Up          | RT         |
| Brake     | S / Down        | LT         |
| Steer     | A/D, Left/Right | Left stick |
| Boost     | Shift / Space   | A          |
| Look back | Q               | B          |
| Camera    | C / V, wheel    | Y          |
| Pause     | Esc             | Start      |

### 2.3 Speed Model

- Two speeds, two frames:
   - **Track speed** `v` (coordinate): `β = v / c`, `γ = 1 / sqrt(1 - β²)`,
     always `< 88 mph`. Moves the car along the spline in track time.
   - **Driver speed** `w = γv` (celerity): track metres covered per tick of
     the driver's own clock. This is what the cockpit speedometer reads and
     it is _unbounded_ — 88 mph is not a wall from the seat.
- Thrust is proper acceleration integrated over proper time:
   `dw/dτ = F/m − k·w² − brake`, `dτ = dt/γ`. Since `d(γv)/dt = γ³ dv/dt`
   this is the same `a ∝ F/(γ³m)` relativistic-mass asymptote, written in
   the frame the driver feels.
- Boost / pads add proper thrust; quadratic drag on `w` sets the plateaus:
   throttle ≈ **120 mph** driver (β≈0.81), boost ≈ **145** (β≈0.86),
   boost + pad ≈ **160** (β≈0.88). c is never approached closely enough
   for the picture to fall apart.
- Speed tiers (driver mph, design targets):
   - 0–50: no visible effects (β < 0.5).
   - 50–100: subtle color shift, mild contraction (β < 0.75).
   - 100–160: strong tunnel/aberration, obvious Doppler, forward glow.

### 2.4 Relativistic Effects (player-visible)

1. **Lorentz contraction** – geometry along velocity axis scaled by 1/γ.
2. **Relativistic aberration** – incoming light angles compress forward;
   the world appears to bulge toward the vanishing point.
3. **Doppler shift** – objects ahead shift blue, behind shift red.
4. **Headlight effect** – forward objects brighten, rear objects dim.
5. **Time dilation** – two clocks in HUD: cockpit (proper time) and
   track (coordinate time). Lap results show both.
6. **Relativistic Doppler of audio** – engine and ambient pitch shift.

### 2.5 Track & Progression

- v0.1: one loop track ("Photon Circuit"), 3 laps, time trial.
- v0.2: ghost car of best lap.
- v0.3: 3 tracks, simple AI rivals (rubber-banded).
- Later: track editor via JSON spline definitions.

### 2.6 HUD

- γ readout.
- Boost meter.
- Lap counter & minimap (optional).

---

## 3. Technical Plan

### 3.1 Constraints

- ES6 modules loaded natively via `<script type="module">`.
- three.js from CDN import map (pin a version).
- No transpile/bundle; optional dev server for CORS only.
- Target 60 fps on mid-range laptops at 1080p.

### 3.2 Architecture Overview

```
index.html
  └─ src/main.js            bootstraps Game
       ├─ core/             loop, time, input, state machine
       ├─ physics/          car model, track collision
       ├─ relativity/       math: β, γ, Lorentz, Doppler
       ├─ render/           scene, camera, materials, post FX
       ├─ world/            track builder, props, skybox
       ├─ ui/               HUD, menus
       └─ audio/            engine, Doppler-shifted playback
```

### 3.3 Proposed File Layout

```
games/velocity-racer/
  index.html
  styles.css
  idea.md
  assets/
    textures/
    audio/
    tracks/photon-circuit.json
  src/
    main.js
    core/
      Game.js            state machine: Menu → Countdown → Race → Results
      Loop.js            fixed-step physics (120 Hz) + variable render
      Input.js           keyboard + gamepad abstraction
      Clock.js           coordinate time & proper-time accumulator
    relativity/
      constants.js       C_MPH = 88, C_MS, unit conversions
      lorentz.js         beta(), gamma(), contract(), dilate()
      doppler.js         frequency factor per view angle
      aberration.js      direction transform for view vectors
    physics/
      Car.js             speed, heading, throttle/brake/boost
      TrackPhysics.js    stay-on-road, banking, loop gravity
    world/
      Track.js           builds mesh from Catmull-Rom spline JSON
      Props.js           billboards, pylons, lights
      Sky.js             gradient/star dome
       CarMesh.js         player hover car (un-warped, co-moving)
    render/
      Renderer.js        three.js setup, resize, render passes
       Camera.js          cockpit / chase camera, FOV, shake, warp fade window
      RelativisticMaterial.js  custom ShaderMaterial (vertex warp,
                               Doppler/headlight in fragment)
      PostFX.js          tunnel vignette, chromatic aberration, bloom
    ui/
      HUD.js             DOM-based speed/β/γ/clocks/boost
      Menu.js            start, pause, results
    audio/
      Engine.js          WebAudio oscillator/loop with pitch scaling
      Doppler.js         per-source pitch from relative velocity
```

### 3.4 Rendering Approach for Relativity

Vertex-shader based (cheap, works with standard meshes):

1. Uniforms: `uBeta` (vec3 velocity dir × β), `uGamma`, `uCamPos`.
2. In the vertex shader, transform each world vertex to camera-relative
   coords, apply Lorentz contraction along velocity axis, then apply
   aberration to the resulting direction.
3. Pass the pre-aberration view angle to the fragment shader to compute
   Doppler factor `D = 1 / (γ (1 - β cosθ))`.
4. Fragment: shift base color via a hue-shift LUT indexed by `D`;
   multiply intensity by `D^k` (headlight effect, k tunable ~3).
5. Post pass: radial blur + vignette scaled by β for the tunnel feel.

Fallback / v0: skip vertex warp, do Doppler + vignette only.

### 3.5 Physics Step

- Fixed 120 Hz step in `Loop.js`.
- Car state: position along spline `s`, lateral offset `d`, speed `v`.
- Track-space movement keeps collision trivial (clamp `d`).
- Convert (`s`, `d`) → world transform via spline frame for rendering.
- Proper time increment: `dτ = dt / γ`.

### 3.6 Data Formats

- Track JSON: `{ name, points: [[x,y,z], ...], width, banking: [...],
boostPads: [s...], photons: [s...] }`.
- Settings saved to `localStorage`: controls, effect intensity, best laps.

### 3.7 Dependencies

- `three` (pinned via import map).
- Optionally `three/addons` for `EffectComposer`, `UnrealBloomPass`.
- No other runtime deps.

---

## 4. Milestones

| Version | Goal                                           |
| ------- | ---------------------------------------------- |
| 0.0     | Skeleton: HTML, module loading, spinning cube  |
| 0.1     | Spline track, cockpit camera, drivable car     |
| 0.2     | Relativity math + HUD (β, γ, dual clocks)      |
| 0.3     | Doppler/headlight shader, tunnel post FX       |
| 0.4     | Lorentz vertex warp + aberration               |
| 0.5     | Boost, photons, lap timing, results screen     |
| 0.6     | Audio with Doppler pitch                       |
| 0.7     | Ghost car, localStorage bests                  |
| 1.0     | 3 tracks, polish, menus, accessibility toggles |

---

## 5. Risks & Mitigations

- **Motion sickness** near c → intensity slider, optional FOV lock.
- **Shader complexity** → build incrementally; keep a non-relativistic
  material toggle for debugging.
- **Legibility at high β** → clamp effective β for rendering (e.g. 0.95)
- **Performance of post FX** → half-res passes, disable bloom on low end.

---

## 6. Open Questions

- Should AI rivals also experience dilation (asymmetric lap clocks)?
- Does boost recharge over track time or cockpit time?
- Should light delay (seeing the past) be simulated, or just aberration?

---

## 7. Implementation Status

Implemented (≈ v0.6):

- Zero-build ES6 modules + three.js import map (`index.html`).
- `world/Track.js`: Catmull-Rom spline, arc-length frames, auto banking
  from curvature, ribbon meshes for road / apron / rails.
- `render/RelativisticMaterial.js`: single shader doing Lorentz
  contraction + aberration in the vertex stage and Doppler hue slide +
  headlight gain `D^k` in the fragment stage; shared uniforms updated
  once per frame by `updateRelativity()`.
- `audio/Engine.js`: oscillator engine + Doppler-shifted wind band-pass.
- Rendering β clamped to `RENDER_BETA_MAX` (0.95) while physics uses the
- `render/PostFX.js`: additive forward core glow (no EffectComposer
   needed). The blackout vignette and "RELATIVISTIC BLACKOUT" warning were
   removed for usability.
- `ui/HUD.js`: driver mph (γv) + track mph, β, γ, boost, driver/track
   clocks, lap/best, FX readout.
  true β; FX intensity slider on `[` / `]`, hard toggle on `O`.
- `render/Camera.js` (`RaceCamera`): cockpit / chase / far-chase presets
   (`C`, gamepad Y) plus mouse-wheel zoom; the chase camera rides the
   spline behind the car so it never dips under the road. `world/CarMesh.js`
   appears outside the cockpit and opts out of the warp (`warp: false`).
- Near-field warp fade (`uWarpNear`/`uWarpFar`): triangles within a few
   metres of the eye straddle the observer, and aberrating their vertices
   independently smeared the road across the vanishing point ("under the
   track" bug). They now stay unwarped; the window is set per camera mode.
  Not yet: ghost car, AI rivals, extra tracks, minimap, track editor.
  Boost currently recharges on **track** time (see §6).
- Dual speedometers: **driver** speed (γv, headline number, tops out
   ≈160 mph) and **track** speed (v, < 88 mph), plus β (0.000–0.999).
- Dual clocks (driver τ / track t).
   while physics uses true β. The drivetrain plateaus at β≈0.88 anyway.
- **Blackout vignette** → removed. Darkening the edges near c hid the road
   edges and rails exactly when the player needed them; the tunnel feel now
   comes from FOV widening, aberration and the forward glow only.
- `physics/Car.js` + `TrackPhysics.js`: (s, d, w, heading) track-space
   model with celerity `w = γv` as primary state, proper-frame integration
   (`dw/dτ = F/m − k w²`, equivalent to the `a = F/(γ³m)` asymptote),
   wall clamp, pads, photons, lap events.
- Engine tuned in the driver's frame: throttle alone reads ≈120 mph on the
    cockpit speedo (β≈0.81), boost ≈145 (β≈0.86), boost + pad ≈160
    (β≈0.88). Results screen shows average driver vs. track speed.