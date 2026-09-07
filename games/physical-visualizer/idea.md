# Physical Visualizer

> A Winamp-esque, skinnable, GPU-driven music visualizer that reacts to **what you hear**
> *and* **how you move**. Runs entirely in a mobile browser, installs as a PWA, works offline.

---

## 1. Elevator Pitch

Hold your phone. Play a track. The room fills with a Milkdrop-style feedback bloom that pulses on the kick drum. Tilt
the device and the whole field of particles slides downhill as if the pixels had mass. Shake it and the preset shatters
into the next one. All of it is drawn by WebGL fragment shaders at 60fps behind a pixel-perfect, draggable, 1997-era
skinned chrome UI that you can dock, shade, and double-size.

**Stack:** vanilla HTML + modular ES6 (no bundler required) + WebGL2 + Web Audio API + DeviceMotion/DeviceOrientation +
Service Worker/PWA.

---

## 2. Goals

| #  | Goal                          | Success criterion                                                          |
|----|-------------------------------|----------------------------------------------------------------------------|
| G1 | Audio-reactive rendering      | Visible latency between transient and pixel < 40ms                         |
| G2 | Physically-reactive rendering | Tilt/shake affects simulation state, not just camera                       |
| G3 | Mobile-first performance      | 60fps on a 3-year-old mid-range Android at 0.75x scale                     |
| G4 | Zero-install, offline capable | Full functionality after first load with network disabled                  |
| G5 | Nostalgic, skinnable UI       | Loads classic `.wsz` skin archives; UI is diegetic, not a toolbar          |
| G6 | No build step required        | `python -m http.server` in the project root is a valid dev loop            |
| G7 | Extensible presets            | A preset is a JSON descriptor + GLSL; addable without touching engine code |

### Non-Goals (v1)

- Full Milkdrop `.milk` preset compatibility (per-frame equation VM) — see §14 stretch.
- Streaming service integration (DRM'd audio cannot be routed through an AnalyserNode).
- Desktop-only features: no keyboard-mandatory interactions.
- Server-side anything. This is a static site.

---

## 3. Design Pillars

1. **The device is an instrument.** Motion is not a gimmick overlay; it is an input to the same simulation the audio
   drives. Gravity is a real force in the particle solver.
2. **Everything is a signal.** Audio bands, accelerometer axes, gyro rates, touch pressure, time, and battery level all
   normalize into a single `SignalBus` of named floats in
   `[-1, 1]` or `[0, 1]`. Presets bind to signal *names*, not sources.
3. **Frames are cheap, state is precious.** Feedback buffers (ping-pong FBOs) persist across frames; each frame is a
   small perturbation of the last. This is what makes it look like Milkdrop and not a bar chart.
4. **Graceful degradation, aggressively.** No gyro? Use touch-drag as virtual tilt. No WebGL2? Fall back to WebGL1 +
   extensions. No mic permission? File input.
5. **Do not hurt people.** Photosensitivity guards are on by default and non-optional in their hard limits.

---

## 4. File / Module Layout

```
  games/physical-visualizer/
  ├── index.html                 # single entry, no framework
  ├── manifest.webmanifest
  ├── sw.js                      # service worker (precache + runtime cache)
  ├── idea.md
  ├── css/
  │   ├── reset.css
  │   ├── chrome.css             # winamp window chrome, skin CSS custom props
  │   └── layout.css             # responsive/mobile docking rules
  ├── src/
  │   ├── main.js                # bootstrap, permission gates, wiring
  │   ├── core/
  │   │   ├── Clock.js           # fixed-step accumulator + frame pacing
  │   │   ├── EventBus.js        # tiny pub/sub
  │   │   ├── SignalBus.js       # named float registry, smoothing, history ring
  │   │   ├── Store.js           # IndexedDB wrapper (tracks, skins, presets, prefs)
  │   │   └── Capability.js      # feature detection + device tier scoring
  │   ├── audio/
  │   │   ├── AudioEngine.js     # AudioContext graph owner
  │   │   ├── Analyser.js        # FFT read, windowing, log-band folding
  │   │   ├── BeatDetector.js    # spectral flux onset + tempo estimation
  │   │   ├── LoudnessMeter.js   # RMS / rough LUFS, auto-gain
  │   │   └── sources/
  │   │       ├── FileSource.js
  │   │       ├── MicSource.js
  │   │       └── ElementSource.js
  │   ├── motion/
  │   │   ├── MotionEngine.js    # permission flow + listener lifecycle
  │   │   ├── Fusion.js          # complementary filter, gravity/linear split
  │   │   ├── ShakeDetector.js   # jerk-threshold gesture
  │   │   └── VirtualTilt.js     # touch-drag fallback "tilt"
  │   ├── gfx/
  │   │   ├── Renderer.js        # context, resize, adaptive resolution
  │   │   ├── Program.js         # shader compile/link/uniform cache
  │   │   ├── Framebuffer.js     # RT + ping-pong pair helper
  │   │   ├── Mesh.js            # fullscreen tri, point sprites, line strip
  │   │   ├── Textures.js        # spectrum/waveform data textures, noise, palettes
  │   │   ├── PostChain.js       # bloom, chromatic aberration, scanline, LUT
  │   │   └── shaders/
  │   │       ├── common.glsl    # #include'd via a tiny preprocessor
  │   │       ├── warp/*.frag
  │   │       ├── comp/*.frag
  │   │       └── sim/*.frag     # particle position/velocity update passes
  │   ├── presets/
  │   │   ├── PresetManager.js   # load, validate, crossfade, random/shuffle
  │   │   ├── schema.js
  │   │   └── builtin/
  │   │       ├── oscilloscope.json
  │   │       ├── spectrum-bars.json
  │   │       ├── gravity-well.json
  │   │       ├── tunnel-of-love.json
  │   │       ├── liquid-sand.json
  │   │       └── plasma-storm.json
  │   ├── ui/
  │   │   ├── SkinLoader.js      # .wsz (zip) parse, sprite atlas slicing
  │   │   ├── Window.js          # draggable/snappable base window
  │   │   ├── MainWindow.js      # transport, seek, volume/balance, bitmap text
  │   │   ├── EqWindow.js        # 10-band BiquadFilter chain UI
  │   │   ├── PlaylistWindow.js
  │   │   ├── VisWindow.js       # the canvas host; fullscreen toggle
  │   │   ├── BitmapFont.js      # renders text from skin sprite sheets
  │   │   └── Gestures.js        # pointer events, pinch, long-press, swipe
  │   └── pwa/
  │       ├── install.js         # beforeinstallprompt UX
  │       └── wakelock.js
  └── assets/
      ├── skins/base.wsz
      ├── icons/{192,512,maskable}.png
      └── demo/loop.ogg          # ~600KB CC0 track for offline first-run
```

---

## 5. Data Flow

```
  ┌──────────────┐   ┌───────────────┐   ┌──────────────┐
  │ File / Mic / │   │ DeviceMotion  │   │ Pointer /    │
  │ <audio> el   │   │ Orientation   │   │ Touch        │
  └──────┬───────┘   └───────┬───────┘   └──────┬───────┘
         │ WebAudio graph    │ 60Hz events      │
  ┌──────▼───────┐   ┌───────▼───────┐          │
  │ AudioEngine  │   │ MotionEngine  │          │
  │  Analyser    │   │  Fusion       │          │
  │  BeatDetect  │   │  ShakeDetect  │          │
  └──────┬───────┘   └───────┬───────┘          │
         │  named floats     │                  │
         └─────────┬─────────┴──────────────────┘
                   ▼
            ┌─────────────┐   smoothing, clamping, history(256)
            │  SignalBus  │
            └──────┬──────┘
                   │  uniform pack (UBO / setUniform batch)
                   ▼
      ┌────────────────────────────┐
      │ Renderer                   │
      │  ├─ sim pass  (FBO A→B)    │  particle pos/vel, fluid advect
      │  ├─ warp pass (FBO ping ⇄) │  feedback: sample prev frame w/ distortion
      │  ├─ draw pass              │  waveform lines, point sprites, geometry
      │  └─ post chain             │  bloom → CA → LUT → scanlines
      └──────────────┬─────────────┘
                     ▼
                <canvas id="vis">
                     ▼
            Winamp chrome overlay (DOM, skin sprites)
  ```

Key rule: **the render loop never blocks on I/O**. Audio and motion write into double-buffered plain-object snapshots;
`requestAnimationFrame` reads the latest snapshot.

---

## 6. Audio Subsystem

### 6.1 Graph

```
  source ──▶ gain(preamp) ──▶ eq[0..9] (BiquadFilter peaking) ──▶ analyser ──┬─▶ destination
                                                                              └─▶ (silent gain 0 for mic monitoring off)
```

- `AnalyserNode`: `fftSize = 2048` (tier-scaled to 1024 on low tier),
  `smoothingTimeConstant = 0.65` for display, plus a **second** analyser at `0.0`
  smoothing feeding the beat detector so onsets aren't smeared.
- `getByteFrequencyData` into a reused `Uint8Array` (never allocate in the loop).
- `getByteTimeDomainData` for the oscilloscope / waveform texture.

### 6.2 Band Folding

Fold 1024 linear bins into **N log-spaced bands** (default 32) using precomputed bin-range tables, then derive the
headline signals:

| Signal      | Range         | Derivation                                                        |
|-------------|---------------|-------------------------------------------------------------------|
| `bass`      | 20–160 Hz     | mean band energy, normalized by rolling max                       |
| `lowMid`    | 160–600 Hz    | "                                                                 |
| `mid`       | 600–2.5 kHz   | "                                                                 |
| `treb`      | 2.5–12 kHz    | "                                                                 |
| `energy`    | full-band RMS | short-window (~50ms)                                              |
| `energyAvg` | full-band RMS | long-window (~3s), used for auto-gain                             |
| `flux`      | ≥0            | Σ max(0, mag[i] − magPrev[i]) over bins                           |
| `beat`      | 0/1 impulse   | `flux > median(flux, 43 frames) * sensitivity` + refractory 120ms |
| `beatEnv`   | 0..1          | attack 0ms, exponential release ~250ms (the "punch" uniform)      |
| `bpm`       | 60..200       | autocorrelation of the flux ring buffer, updated ~1Hz             |
| `phase`     | 0..1          | sawtooth locked to estimated beat grid                            |

Auto-gain: every band divided by a decaying peak-hold so a quiet track still fills the screen. Peak decays at ~ -0.5
dB/s, rises instantly.

### 6.3 Sources & Mobile Autoplay Reality

- `AudioContext` must be **created or resumed inside a user gesture**. The first-run UI is a single big "▶ CLICK TO
  WAKE" plate — this doubles as the gesture that also requests motion permission on iOS (both must be in the same
  trusted event).
- iOS Safari: an `<audio>` element source requires `crossOrigin="anonymous"` for remote files or the analyser reads
  silence; local `File` → `createObjectURL` is safest.
- Mic input (`getUserMedia({audio:{echoCancellation:false, autoGainControl:false,
  noiseSuppression:false}})`) — these constraints matter or the spectrum gets mangled.
- "Play what's on my phone" is not possible; document it, offer file picker + drag/drop + `showOpenFilePicker` where
  available.
- Silent switch on iOS mutes `<audio>` unless the context is created with
  `playsinline` + user interaction; note in FAQ.

---

## 7. Motion Subsystem

### 7.1 Permission Flow

```js
  // must be called from a click/touch handler
async function requestMotion() {
    const needsPrompt = typeof DeviceMotionEvent?.requestPermission === 'function';
    if (!needsPrompt) return 'granted';          // Android / older iOS
    try {
        return await DeviceMotionEvent.requestPermission();
    } catch {
        return 'denied';
    }                   // requires https + user gesture
}
```

Denied → `VirtualTilt` transparently takes over: dragging anywhere on the canvas produces the same `tiltX/tiltY` signals
with spring-return.

### 7.2 Signals

| Signal           | Source                                                   | Notes                                                    |
|------------------|----------------------------------------------------------|----------------------------------------------------------|
| `tiltX`, `tiltY` | `deviceorientation` beta/gamma → clamped ±45° → `[-1,1]` | screen-orientation corrected                             |
| `yaw`            | alpha (or webkitCompassHeading)                          | unreliable; used only for slow drift                     |
| `gravX/Y/Z`      | `accelerationIncludingGravity`, low-passed α=0.9         | the "which way is down" vector                           |
| `accelX/Y/Z`     | `acceleration` (linear) or `incl − gravity`              | high-passed; the "kick" of a flick                       |
| `jerk`           | ‖Δaccel‖/Δt                                              | drives shake detection & camera punch                    |
| `spinRate`       | `rotationRate.alpha/beta/gamma` → magnitude              | rotation blur / vortex strength                          |
| `shake`          | 0/1 impulse                                              | jerk > 25 m/s³ sustained 3 frames, 500ms refractory      |
| `flat`           | 0..1                                                     | how close gravity is to (0,0,±9.8): enables "table mode" |

Fusion uses a complementary filter (`θ = 0.98(θ + ω·dt) + 0.02·θ_accel`) because the gyro alone drifts and the
accelerometer alone jitters under music-induced table vibration (real problem — phone on a speaker cabinet).

### 7.3 Physical Interactions (the fun part)

- **Gravity Well** — particle sim where `g = normalize(gravVector) * strength`. Tilt the phone, the glitter pours to the
  low corner and pools. Beats inject upward impulse; a kick "bounces" the pile.
- **Liquid Sand** — 2D stable-fluids advection where tilt biases the velocity field and `bass` injects divergence at the
  center.
- **Shake to Shuffle** — `shake` triggers preset crossfade (0.4s), with haptic
  `navigator.vibrate([12, 40, 18])`.
- **Steer the Tunnel** — tilt = camera yaw/pitch offset in the raymarched tunnel;
  `spinRate` rolls the horizon.
- **Parallax Chrome** — even the Winamp windows get a 4px translate from tilt via a CSS custom property (`--tilt-x`), so
  the UI feels like it floats above the vis.
- **Table Mode** — when `flat > 0.9` for 3s, chrome auto-hides and the visualizer goes fullscreen "lava lamp" mode; any
  motion brings the UI back.
- **Pocket Detection** — `flat==0 && light-ish heuristics` → drop render scale to 0.25 and skip post chain to save
  battery when nobody is looking.

---

## 8. Rendering Architecture

### 8.1 Passes

1. **Sim pass** *(optional per preset)* — renders into a floating-point (or RGBA8-packed)
   FBO holding particle `xy/vel` in texels. `N = 64×64 … 256×256` particles by tier.
2. **Warp / feedback pass** — the Milkdrop heart. Sample the previous composite with a per-pixel distortion (zoom,
   rotate, warp, drift), multiply by `decay ≈ 0.96`, then additively draw this frame's geometry on top. Ping-pong two
   FBOs.
3. **Draw pass** — waveform line strip (from waveform texture, drawn as instanced quads so it has thickness), point
   sprites for particles, geometry for bars/rings.
4. **Post chain** — threshold+blur bloom (½ then ¼ res), chromatic aberration keyed to
   `jerk`, optional scanline/CRT and a 32³ LUT for color grading per preset.

### 8.2 The Uniform Contract

Every preset shader can rely on this block (packed into a UBO on WebGL2, individual uniforms on WebGL1):

```glsl
  uniform vec3  u_resolution;   // w, h, dpr
  uniform vec4  u_time;         // t, dt, frame, elapsedBeats
  uniform vec4  u_audio;        // bass, mid, treb, energy
  uniform vec4  u_audio2;       // beatEnv, flux, bpm/200, phase
  uniform vec4  u_tilt;         // tiltX, tiltY, yaw, flat
  uniform vec4  u_accel;        // ax, ay, az, jerk
  uniform vec4  u_gravity;      // gx, gy, gz, spinRate
  uniform vec4  u_touch;        // x, y, down, age
  uniform vec4  u_params;       // 4 preset-authored knobs (0..1)
  uniform sampler2D u_spectrum; // 512x1 R8: current log-folded spectrum
  uniform sampler2D u_waveform; // 512x1 R8: time domain
  uniform sampler2D u_history;  // 256x64 R8: scrolling spectrogram
  uniform sampler2D u_prev;     // previous composite (feedback)
  uniform sampler2D u_noise;    // tileable blue noise
```

Because presets only talk to this contract, a preset written for audio automatically gains motion reactivity by
referencing `u_tilt` — no engine changes.

### 8.3 Preset Format

```json
  {
  "id": "gravity-well",
  "name": "Gravity Well",
  "author": "you",
  "version": 1,
  "requires": {
    "webgl": 2,
    "float": "half",
    "particles": true
  },
  "sim": {
    "shader": "sim/particles-gravity.frag",
    "count": 16384
  },
  "warp": {
    "shader": "warp/zoom-rotate.frag",
    "decay": 0.955
  },
  "comp": {
    "shader": "comp/glitter.frag",
    "blend": "add"
  },
  "post": {
    "bloom": 0.6,
    "aberration": "jerk*0.004",
    "lut": "warm"
  },
  "params": [
    {
      "name": "viscosity",
      "default": 0.35
    },
    {
      "name": "sparkle",
      "default": 0.8,
      "bind": "treb"
    }
  ],
  "motion": {
    "gravityScale": 1.4,
    "shakeImpulse": 6.0
  }
}
```

`bind` lets a param be driven directly by a signal name; expressions in `post` go through a tiny safe expression parser
(no `eval`) over the SignalBus namespace.

### 8.4 Adaptive Performance

- `Capability.js` scores the device once (GPU renderer string, `deviceMemory`,
  `hardwareConcurrency`, a 200ms fill-rate microbenchmark) → tier `low|mid|high`.
- Runtime governor: rolling 30-frame mean frame time. If > 20ms for 1s, drop render scale one step (1.0 → 0.85 → 0.7 →
  0.5); if < 12ms for 4s, step back up. Hysteresis prevents oscillation. Never resize more than once per 500ms (FBO
  realloc is costly).
- Cap DPR at 2.0; on low tier cap at 1.25.
- `visibilitychange` → suspend rAF, `audioCtx.suspend()` when hidden and not playing.

---

## 9. The Winamp UI

### 9.1 Fidelity Targets

- Three windows: **Main (275×116)**, **Equalizer (275×116)**, **Playlist (275×n)**, each snapping to each other with
  10px magnetism, exactly like the original.
- **Windowshade** mode (double-click title bar → 14px tall strip).
- **Double size** toggle → integer 2x nearest-neighbor scaling; on mobile the default is "fit width with integer scale +
  letterbox".
- Bitmap font rendering from the skin's `TEXT.BMP` for the marquee title (with the classic scroll), and `NUMBERS.BMP`for
  the time display.
- Working sliders: volume, balance, seek, EQ bands + preamp, all skin-sprited.
- The little **spectrum analyzer / oscilloscope** in the main window's 76×16 area is a real, separate tiny canvas fed by
  the same SignalBus — a visualizer inside the visualizer. It respects the classic "peak dots falling" behavior.

### 9.2 Skinning

- `SkinLoader` unzips `.wsz` (a renamed ZIP) with a ~4KB inflate implementation or
  `DecompressionStream('deflate-raw')` where available.
- Parses `main.bmp`, `cbuttons.bmp`, `titlebar.bmp`, `viscolor.txt`, `pledit.txt`,
  `region.txt`; slices into an `ImageBitmap` atlas; exposes CSS custom properties (`--skin-main: url(blob:…)` +
  background-position sprites).
- `viscolor.txt` (24 colors) is uploaded as a 24×1 palette texture so *presets* can optionally adopt the skin's palette.
  Nice touch: the whole GL scene recolors when you change skins.
- Ships with one CC-licensed base skin; drag-and-drop any `.wsz` to load; stored in IndexedDB.

### 9.3 Mobile Layout Rules

- Below 480px logical width, windows stop being free-floating and become a vertical **stack**, with the vis canvas as an
  always-full-bleed background layer.
- Hit targets are enlarged with invisible 44×44 padding overlays — the sprites stay tiny and authentic, the touch areas
  do not.
- Swipe left/right on the canvas = prev/next preset. Swipe up = fullscreen. Two-finger pinch = zoom feedback intensity.
  Long press = preset info card.
- `safe-area-inset-*` respected; notch never eats the transport buttons.

---

## 10. PWA Layer

### `manifest.webmanifest`

```json
  {
  "name": "Physical Visualizer",
  "short_name": "PhysViz",
  "display": "fullscreen",
  "orientation": "any",
  "background_color": "#000000",
  "theme_color": "#1e1e2e",
  "start_url": "./index.html",
  "icons": [
    "…192, 512, maskable…"
  ],
  "file_handlers": [
    {
      "action": "./index.html?open",
      "accept": {
        "audio/*": [
          ".mp3",
          ".ogg",
          ".flac",
          ".m4a",
          ".wav"
        ]
      }
    }
  ],
  "share_target": {
    "action": "./index.html?share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [
        {
          "name": "audio",
          "accept": [
            "audio/*"
          ]
        }
      ]
    }
  },
  "shortcuts": [
    {
      "name": "Mic Mode",
      "url": "./index.html?src=mic"
    },
    {
      "name": "Random Preset",
      "url": "./index.html?preset=random"
    }
  ]
}
```

### Service Worker Strategy

- **Precache** (install): shell HTML/CSS/JS, all builtin preset JSON + GLSL, base skin, icons, demo loop. Target < 1.5
  MB.
- **Runtime**: cache-first for `assets/`, stale-while-revalidate for presets so new ones can appear without a version
  bump, network-only for nothing (there is no API).
- Versioned cache name (`physviz-v{N}`), `skipWaiting` gated behind a
  "New version — Reload?" toast in the playlist window (never yank the rug mid-track).
- User-imported audio is **not** cached to Cache Storage; large blobs live in IndexedDB with a quota check
  (`navigator.storage.estimate()`) and LRU eviction.

### Other Platform APIs

| API                                      | Use                                  | Fallback                          |
|------------------------------------------|--------------------------------------|-----------------------------------|
| Screen Wake Lock                         | keep display on while playing        | `<video>` loop hack, or just warn |
| Media Session                            | lock-screen artwork + transport      | none                              |
| Vibration                                | beat haptics (opt-in), shake confirm | none                              |
| Fullscreen + Screen Orientation lock     | landscape "party mode"               | CSS rotate hint                   |
| Battery Status                           | auto-reduce quality < 20%            | ignore                            |
| Web Share                                | share a preset permalink             | copy-to-clipboard                 |
| MediaRecorder + `canvas.captureStream()` | record 10s clip w/ audio             | disabled                          |
| File System Access                       | reopen last folder                   | `<input type=file multiple>`      |

---

## 11. Accessibility & Safety

- `prefers-reduced-motion: reduce` → default to a calm preset, disable camera shake, cap feedback zoom, and turn off
  parallax. A visible toggle can override, once, behind a confirm.
- **Photosensitive epilepsy guard (always on):** the compositor tracks mean luminance per frame; more than 3 luminance
  transitions > 20% within any 1s window triggers a temporal low-pass (blend factor clamped) for the next 2s. Presets
  cannot opt out; they can only be *less* flashy than the cap.
- Red-flash specific limit: saturated red delta capped harder (per WCAG 2.3.1 spirit).
- All chrome buttons are real `<button>`s with `aria-label`s positioned over sprites; full keyboard operation
  (space/arrow/`z x c v b` classic Winamp keys) on desktop.
- Live region announces track changes; visualizer canvas is `aria-hidden`.
- Motion features are entirely optional; the app is fully usable with permission denied.

---

## 12. Roadmap

**Phase 0 — Skeleton (½ day)**
index.html, ES module graph, Clock, EventBus, fullscreen canvas, clear color pulsing to a sine. Proves the loop and the
no-build-step dev flow.

**Phase 1 — Audio (1–2 days)**
AudioEngine + FileSource + Analyser + band folding + BeatDetector. Debug HUD showing every signal as a live sparkline.
*This HUD stays forever, toggled with `~`.*

**Phase 2 — GL Core (2 days)**
Renderer, Program w/ `#include`, Framebuffer ping-pong, data textures, fullscreen tri. Ship two presets: `oscilloscope`,
`spectrum-bars`.

**Phase 3 — Feedback & Presets (2 days)**
Warp pass, PresetManager, crossfade, `tunnel-of-love` + `plasma-storm`. Preset JSON schema locked here.

**Phase 4 — Motion (1–2 days)**
MotionEngine, permission gate UX, Fusion, ShakeDetector, VirtualTilt.
`gravity-well` + `liquid-sand` presets. Parallax chrome.

**Phase 5 — Winamp Chrome (3 days)**
Window.js, MainWindow with bitmap font + real sliders, EQ wired to BiquadFilters, Playlist with drag-reorder, SkinLoader
for `.wsz`.

**Phase 6 — PWA & Polish (1–2 days)**
Manifest, SW, install prompt, wake lock, media session, share target, offline test with devtools throttled to "Offline".

**Phase 7 — Perf & Safety (1 day)**
Capability tiers, adaptive scaling governor, flash guard, reduced-motion, battery.

---

## 13. Testing & Tooling

- **No bundler in dev.** Native ES modules + import maps. An optional `esbuild` script produces a single-file build for
  production, but the source must always run raw.
- **Signal replay:** MotionEngine and AudioEngine can be fed from a recorded JSON trace (`?trace=shake-test.json`) so
  gyro behavior is testable on a desktop.
- **Golden-frame tests:** render preset N at fixed t with synthetic signals to an offscreen canvas, hash the pixels,
  compare within tolerance. Catches shader regressions.
- Unit tests (plain `node --test`) for band folding math, beat detector on a synthetic click track (must find 120 BPM ±
  2), complementary filter convergence.
- Manual device matrix: iPhone SE/13 (Safari), Pixel mid-range (Chrome), Firefox Android (motion event quirks), plus
  desktop for the chrome layout.
- Perf budget assertions in CI: shell < 1.5MB precache, first paint < 1.5s on Slow 4G.

---

## 14. Risks & Open Questions

| Risk                                                                     | Mitigation                                                                      |
|--------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| iOS motion permission requires https + gesture, silently fails otherwise | Explicit capability screen that *shows* the denial state and offers VirtualTilt |
| Half-float render targets unsupported on old GLES2                       | Pack sim state into RGBA8 (16-bit fixed per channel)                            |
| Feedback loops + auto-gain can runaway to white                          | Hard clamp in comp pass + luminance guard doubles as a safety net               |
| Motion event rate varies 10–120Hz across devices                         | Resample to a fixed 60Hz internal tick with interpolation                       |
| `.wsz` parsing size cost                                                 | Prefer `DecompressionStream`; lazy-load the fallback inflate only when needed   |
| Battery drain / thermal throttling                                       | Governor + pocket detection + explicit "eco" toggle                             |
| Photosensitivity liability                                               | Guard is non-defeatable at the hard limit; first-run warning card               |

**Open:** Should presets be able to ship their own JS (sandboxed in a Worker) or stay declarative-only? Declarative for
v1; revisit if authors hit the wall.

---

## 15. Stretch Goals

- **Milkdrop `.milk` importer** — parse per-frame/per-vertex equations into a small stack VM evaluated in JS, feeding
  the existing uniform contract.
- **WebGPU path** — compute-shader particle sim, 1M particles, behind capability check.
- **WebXR** — "look around" the visualization in cardboard/passthrough; the gyro code already exists, this is mostly a
  camera swap.
- **Web MIDI** — map a nanoKONTROL to preset params for live VJ use.
- **Multi-device sync** — WebRTC datachannel; one phone is the audio master, others render a slice of the screen. A wall
  of phones. Absurd. Do it.
- **Permalink presets** — full preset (params + shader hash) LZ-compressed into the URL hash for sharing without a
  server.
- **AudioWorklet** — move flux/onset detection off the main thread for tighter timing.
---
## 16. Implementation Status
| Phase | State | Notes                                                                                  |
|-------|-------|----------------------------------------------------------------------------------------|
| 0     | ✅    | `Clock`, `EventBus`, `SignalBus`, no-build ES module graph                              |
| 1     | ✅    | `AudioEngine`, `Analyser` (32 log bands, peak-hold auto-gain), `BeatDetector`, HUD (`~`) |
| 2     | ✅    | `Renderer`, `Program` w/ `#include`, ping-pong FBOs, data textures, `oscilloscope`, `spectrum-bars` |
| 3     | ✅    | Warp pass, `PresetManager`, schema, `tunnel-of-love`, `plasma-storm`; transition is a decay "shatter", not a true crossfade |
| 4     | ✅    | `MotionEngine`, `Fusion`, `ShakeDetector`, `VirtualTilt`, `gravity-well`, parallax chrome, table mode. `liquid-sand` not yet written |
| 5     | ⏳    | Placeholder DOM transport in `ui/Controls.js`; `.wsz` `SkinLoader`, bitmap fonts, EQ/Playlist windows pending |
| 6     | ✅    | Manifest, SW (precache + SWR), install prompt, wake lock, media session, file handlers. `share_target` POST not handled in SW yet |
| 7     | ✅    | Tiering, adaptive scale governor, luminance flash guard (non-defeatable), reduced-motion baseline. Bloom/LUT and pocket detection pending |
Known gaps: WebGL1 fallback, `LoudnessMeter` (folded into `Analyser` for now), golden-frame tests, signal replay (`?trace=`).