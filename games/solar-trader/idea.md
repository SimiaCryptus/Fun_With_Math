# SOLAR TRADER — Design Document (v2)

> A hard-ish sci-fi trading game where the *navigation itself* is the game.
> You do not "fly to Ceres". You buy a launch window, burn into a Lambert arc,
> coast for 214 days, and hope the platinum price at Psyche Forge holds.

---

## 1. Pitch

**Solar Trader** is a browser game about interplanetary logistics under real
orbital mechanics. Planets and asteroids move on their true (JPL approximate)
ephemerides. Travel between two rocks is not a distance — it is a *transfer
problem*: a departure date, a time of flight, and a delta-v bill you pay in
propellant mass.

You run a single ship. You buy hydrogen scooped from Jupiter's upper
atmosphere, water cracked out of Ceres, platinum-group metals ripped from
16 Psyche, and you sell them where they are scarce. You spend the profit on
a better engine, bigger tanks, an aeroshell, more cargo volume — every one of
which reshapes which parts of the solar system you can reach at all.

**The fantasy:** being a small-time freighter captain who is *good at
celestial mechanics*.

---

## 2. Design Pillars

1. **The porkchop plot is the main menu.** The central verb is picking a point
   on a departure-date × time-of-flight heatmap. Everything else serves that.
2. **Real numbers, honest units.** AU, km/s, tons, days. No "warp cores".
   A LEO→Mars transfer costs ~4-6 km/s and takes ~7-9 months, and the game
   never lies about that.
3. **Time is the scarcest resource.** Money is recoverable. A missed synodic
   window costs you 26 months.
4. **Upgrades unlock geometry, not damage numbers.** A higher-Isp engine does
   not make you "stronger"; it makes Saturn *exist* for you.
5. **Readable, not simplified.** Show the math (v∞, C3, Isp, mass ratio) but
   always pair it with a plain-language consequence line.

---

## 3. Core Loop

```
  DOCKED  ──► read market ──► buy cargo ──► open Nav ──► scan launch windows
     ▲                                                        │
     │                                                        ▼
  sell / refuel / upgrade ◄── arrive & capture ◄── coast ◄── depart burn
```

* **Micro loop (minutes):** market arbitrage + choosing a transfer off the
  porkchop.
* **Meso loop (a session):** a 2-4 leg trade circuit that ends back at a hub
  with enough cash for the next upgrade tier.
* **Macro loop (a campaign):** Inner system (Earth/Luna/Mars/NEAs) → Belt
  (Ceres/Vesta/Psyche) → Jovian (Callisto) → Outer (Titan, Oberon, Triton).
  Each ring is gated by delta-v budget and by patience.

---

## 4. Simulation Model

### 4.1 Units (canonical)

All simulation math runs in canonical heliocentric units so that `mu_sun = 1`:

| Quantity | Unit | Value |
|---|---|---|
| Length | 1 AU | 1.495978707e11 m |
| Time   | 1 TU | sqrt(AU³/µ☉) ≈ 5.0226e6 s ≈ 58.132 d |
| Speed  | 1 VU | AU/TU ≈ 29.78 km/s |

The UI converts to AU / days / km/s at the edges only. Canonical units keep
the Kepler and Lambert solvers well conditioned in float64.

### 4.2 Ephemeris

Bodies use **JPL's approximate Keplerian elements with per-century rates**
(valid 1800–2050; the campaign starts 2035-06-01 to stay inside the fit).

```
  T = centuries since J2000
  a = a0 + ȧT,  e = e0 + ėT,  I = I0 + İT
  L = L0 + L̇T, ϖ = ϖ0 + ϖ̇T, Ω = Ω0 + Ω̇T
  M = L - ϖ  (wrapped to ±180°),  ω = ϖ - Ω
```

Minor bodies (Ceres, Vesta, Psyche, Eros, Bennu) use fixed osculating
elements at a stated epoch and mean-motion propagation. Inclination is fully
modelled — plane changes are a real cost, which is why Psyche (i≈3.1°) is
cheap and some NEAs are not.

Moons are **not** propagated. A station "at Callisto" is treated as a circular
parking orbit of Callisto's radius around Jupiter's barycentre; this is
accurate enough for the delta-v bookkeeping and keeps navigation heliocentric.

### 4.3 Trajectory propagation

Coasting uses a **universal-variable (Stumpff) Kepler propagator**, so
elliptic, parabolic and hyperbolic arcs share one code path and one solver.
No numeric integration, no drift, exact reversibility — you can scrub the
timeline forwards and backwards freely.

### 4.4 Transfers: patched conic

A leg is a single-revolution **Lambert arc** solved with Vallado's universal
variable formulation (bisection on ψ, bracket [-4π², 4π²]):

```
  r1 = ephem(origin, t_dep)
  r2 = ephem(target, t_dep + tof)
  (v1, v2) = lambert(r1, r2, tof)
  v∞_dep = |v1 - v_origin|
  v∞_arr = |v2 - v_target|
```

The gravity well is then charged honestly, from the station's circular
parking radius `rp` around parent µ:

```
  Δv_dep = sqrt(v∞² + 2µ/rp) - sqrt(µ/rp)      (escape, with Oberth benefit)
  Δv_arr = sqrt(v∞² + 2µ/rp) - sqrt(µ/rp)      (capture)
  Δv_arr *= (1 - aeroFactor)  if the body has an atmosphere and you fitted
                               an aeroshell (aerocapture)
```

Consequences that fall out for free and that players *feel*:
* Departing from a high orbit (Luna Gateway, Deimos Yard) is far cheaper than
  from LEO — but low orbits are where the industry and the cheap goods are.
* Oberth makes big-µ bodies (Jupiter) surprisingly cheap to leave.
* Aerocapture at Mars/Venus/Earth is the single best mid-game upgrade.

### 4.5 Propellant

Tsiolkovsky, applied per burn, in order, with cargo mass included:

```
  m0 = m_dry + m_prop + m_cargo
  m_used = m0 * (1 - exp(-Δv / (Isp * g0)))
  Δv_available = Isp*g0 * ln(m0 / (m0 - m_prop))
```

Loading 300 t of iron does not just fill the hold — it eats your range. The
Nav panel always shows *remaining* Δv after the currently selected plan.

### 4.6 Launch-window search (the porkchop)

For a selected origin/target pair the planner builds an N×M grid:

* X axis: departure date, spanning ~1.15 synodic periods from "now"
  (so at least one full window is always visible).
* Y axis: time of flight, 0.35× → 2.3× the Hohmann TOF.
* Colour: total Δv (dep+arr), clamped log-ish palette; unreachable /
  no-solution cells are drawn black.
* Overlay: a white contour at the player's current Δv budget — the literal
  boundary of where they can go today.

Clicking a cell selects a transfer; hovering reads out date, TOF, C3, v∞,
arrival date, propellant tons and remaining Δv.

### 4.7 Local (same-body) moves

Station-to-station at the same parent (LEO Gateway ↔ Luna Gateway) uses a
two-impulse Hohmann between circular parking radii, with TOF = half the
transfer period. Cheap, quick, and it teaches the Δv-vs-altitude lesson early.

---

## 5. Economy

### 5.1 Commodities (17)

| id | name | base ¢/t | notes |
|---|---|---|---|
| `ice` | Dirty Ice | 200 | bulk, everywhere in the belt |
| `water` | Potable Water | 320 | processed ice |
| `o2` | LOX | 450 | life support + oxidiser |
| `h2` | Liquid Hydrogen | 950 | *propellant*, sets refuel price |
| `ch4` | Methane | 700 | Titan/Mars |
| `nh3` | Ammonia | 820 | volatiles, outer system |
| `d2` | Deuterium | 34 000 | Venus & ice giants |
| `he3` | Helium-3 | 1 900 000 | Jupiter/Uranus only, tiny tonnage |
| `silicates` | Regolith Aggregate | 150 | construction bulk |
| `iron` | Iron–Nickel | 1 200 | Psyche/Vesta |
| `ree` | Rare Earths | 45 000 | Mercury/Vesta |
| `pgm` | Platinum Group | 130 000 | Psyche/Eros — the money maker |
| `polymers` | Polymers & Feedstock | 9 000 | organics |
| `machinery` | Heavy Machinery | 90 000 | Earth/Deimos |
| `electronics` | Electronics | 260 000 | Earth only, high tech |
| `food` | Foodstuffs | 40 000 | Earth/Mars |
| `meds` | Pharmaceuticals | 410 000 | Earth, luxury demand outward |

### 5.2 Price model

Each station holds, per commodity: `stock`, `target` (equilibrium stock),
`prod` (t/day), `cons` (t/day), and a locality multiplier `mult`.

```
  scarcity = target / max(stock, target*0.05)
  price    = base * mult * clamp(scarcity^0.7, 0.35, 3.5)
  buy      = price * (1 + spread)      spread = 0.03 … 0.09 by station tech
  sell     = price * (1 - spread)
```

Stock evolves under production, consumption and *background NPC trade* that
relaxes it toward target with a 30-day time constant (solved in closed form,
so long warps land exactly where daily ticks would):

```
  stock' = (prod - cons) + (target - stock) / 30 d
  → settles at target + 30·(prod - cons):  exporters ≈1.33×, importers ≈0.67×
```

Without that term every import good hit the ceiling clamp inside a season and
the "dynamic" market froze into a static one. A slow bounded random walk on
`mult` (news events nudge it) supplies the remaining variation.

**Player trades move the stock and are priced for it**: a lot is filled in
slices and each slice pays the price at the stock it finds, so dumping 300 t
of PGM on a 40 t outpost pays a fraction of 300 × the posted quote. Big
cargo holds force you to spread sales across ports. This is the core of the
mid-game. The manifest shows the honest "sell all" estimate before you press
the button.

### 5.3 Refuelling

Propellant is bought as `h2` at the local price × a service fee. Stations that
produce hydrogen (Callisto Skim, Ceres) are cheap depots; Mercury is brutal.
Fuel logistics is a route-planning constraint, not a menu.

### 5.4 Contracts (light layer)

Each station offers 2–4 timed delivery contracts: *"180 t of water to Deimos
Yard before 2036-04-12, 1.1 M¢, 15% posted bond."* Accepting reserves cargo
space; failing forfeits the bond. Contracts exist to *justify* unattractive
routes and to teach window-timing.

---

## 6. Ship & Progression

Single hull, six upgrade tracks. Every track is a straight, legible trade-off.

| Track | Effect | Tiers |
|---|---|---|
| **Drive** | Specific impulse / thrust | NTR 900 s → Ion 3200 s → MPD 4800 s → Fusion 6500 s |
| **Tanks** | Propellant capacity (t) | 220 → 360 → 560 → 820 |
| **Hold** | Cargo capacity (t) | 180 → 300 → 480 → 700 |
| **Aeroshell** | Capture Δv reduction at atmospheric bodies | 0% → 45% → 70% |
| **Reactor** | Prereq for high-Isp drives; cuts burn time | 3 tiers |
| **Uplink** | See remote market prices (1 hop / belt / system-wide) | 3 tiers |

Dry mass rises with tiers, so a maxed hold on a weak drive is a trap. The
Shipyard panel previews Δv-full / Δv-empty before purchase.

**Progression gates (soft, purely physical):**
* Δv ≈ 9 km/s — Earth/Luna/Mars/NEAs.
* Δv ≈ 15 km/s — Main belt round trips.
* Δv ≈ 22 km/s + aeroshell — Jupiter.
* Δv ≈ 30 km/s — Saturn and beyond, with 3–6 year legs.

---

## 7. Ports of Call (15 stations, 13 propagated bodies)

```
  Mercury   Caloris Smelters      ree, iron        ← water, food, o2
  Venus     Aphrodite Cloudworks  d2, polymers     ← food, machinery
  Earth     LEO Gateway           electronics,     ← pgm, ree, he3, ice
                                  machinery, meds
  Earth     Luna Shackleton       ice, o2, silicates ← food, machinery
  Mars      Tharsis Terminal      food, ch4, water ← electronics, pgm
  Mars      Deimos Yard           machinery, iron  ← h2, food
  Bennu     Bennu Claim (NEA)     ice, polymers    ← food, machinery
  Eros      Eros Camp (NEA)       pgm, iron        ← water, food
  Ceres     Ceres Anchorage       water, ice, nh3, o2 ← machinery, electronics
  Vesta     Vesta Diggings        iron, silicates, ree ← water, food
  Psyche    Psyche Forge          iron, pgm, ree   ← water, h2, food
  Jupiter   Callisto Skim         h2, he3, d2      ← food, electronics
  Saturn    Titan Cryoworks       ch4, nh3, polymers ← meds, electronics
  Uranus    Oberon Outstation     d2, he3, nh3     ← everything
  Neptune   Triton Deepwater      nh3, h2, ice     ← everything
```

---

## 8. UX / Screen Layout

```
 ┌────────────────────────────────────────────────────────────────┐
 │ 2035-06-01  ⏸ 1d 4d 16d 64d │ ¢ 2 480 000 │ Δv 12.4 km/s │ 118/300 t │
 ├──────────────┬─────────────────────────────────────┬───────────┤
 │  NAVIGATION  │                                     │  MARKET   │
 │  target list │      3D orbital view (three.js)     │  buy/sell │
 │  ┌─porkchop─┐│      orbits, bodies, plan arc,      │  ─────────│
 │  │▒▒▓▓██▓▒  ││      ship + trail, maneuver nodes   │ SHIPYARD  │
 │  └──────────┘│                                     │  upgrades │
 │  Δv / TOF /  │                                     │ CONTRACTS │
 │  arrival     │                                     │           │
 │  [ EXECUTE ] │                                     │           │
 ├──────────────┴─────────────────────────────────────┴───────────┤
 │ log: Departure burn 4.12 km/s — 71 t propellant expended.       │
 └────────────────────────────────────────────────────────────────┘
```

* **Camera:** orbit/pan/zoom, `F` focuses the selected body, scale is real AU
  with log-scaled body radii (or the planets are invisible).
* **Time:** pause / 1 / 4 / 16 / 64 days-per-second, plus "warp to departure"
  and "warp to arrival" which auto-pause on the node.
* **Colour language:** cyan = you, amber = plan, magenta = target,
  grey = other orbits.
* **Every number has a unit and a tooltip.**

---

## 9. Technical Architecture

Plain ES modules, no build step, no framework. `three` comes from an import
map so the folder can be opened from any static server.

```
  games/solar-trader/
    index.html            import map, DOM skeleton
    styles.css
    src/
      main.js             bootstrap + rAF loop
      core/
        units.js          AU/TU/VU constants, date helpers
        vec3.js           tiny array-based vector math (sim has no three dep)
        kepler.js         Stumpff, universal-variable propagate, elements<->state
        lambert.js        Vallado universal-variable Lambert solver
      data/
        bodies.js         ephemeris tables + physical constants
        stations.js       ports, parking radii, economy profiles
        commodities.js    goods table
        upgrades.js       ship upgrade tracks
      sim/
        ephemeris.js      body state at time t, orbit sampling
        ship.js           mass, Δv, cargo, upgrades, rocket equation
        economy.js        markets, prices, buy/sell, daily tick
        planner.js        transfer solving, porkchop grid, arc sampling
        game.js           authoritative state, time, flight execution, save
      render/
        scene.js          three.js scene, orbits, bodies, plan arc, labels
      ui/
        hud.js            top bar + event log
        nav.js            target list, porkchop canvas, transfer readout
        trade.js          market, shipyard, contracts
```

**Dependency rule:** `sim/` and `core/` never import three.js. The renderer
reads the sim; the sim never reads the renderer. This keeps the model
headless-testable and lets the porkchop worker be moved off-thread later.

---

## 10. Milestones

1. **M1 — Clockwork.** Ephemeris + Kepler propagator + three.js orbits, time
   controls. You can watch the solar system run.
2. **M2 — Lambert.** Single transfer solve, arc rendering, execute/coast/dock.
3. **M3 — Porkchop.** Grid search, heatmap canvas, Δv budget contour.
4. **M4 — Trade.** Commodities, dynamic prices, cargo mass feedback.
5. **M5 — Ship.** Upgrades, aerocapture, refuelling, save/load.
6. **M6 — Texture.** Contracts, news events, mining at claims, achievements.

## 11. Stretch

* Multi-revolution Lambert solutions (the cheap slow arcs).
* Gravity assists: two-leg patched conic with a powered flyby solver, and a
  "Venus-Venus-Earth-Jupiter" tour finder.
* Low-thrust: Edelbaum/Sims-Flanagan approximation for the fusion drive, so
  late game is continuous-thrust spiral planning, not impulses.
* Fleet management: buy a second hull, queue automated routes.
* Real texture maps + a starfield from an actual catalogue.

## 12. References

* Vallado, *Fundamentals of Astrodynamics and Applications* — §2 (universal
  variables), §7 (Lambert).
* Bate, Mueller & White, *Fundamentals of Astrodynamics*.
* JPL SSD, *Approximate Positions of the Major Planets* (element tables).
* Izzo (2014), *Revisiting Lambert's Problem* — for a future faster solver.
## 13. Implementation Notes (v2.1 review)
Fixes and changes made against the v2 code drop:
* **Local (same-body) flights crashed the render loop** (`propagate(null)`).
  The ship now rides the parent body while on a Hohmann hop.
* **The porkchop is anchored** at the date it was computed and regrids only
  when "now" has walked ~1/8 of the way across it, or on RESCAN. Past columns
  are dimmed; the player's selected window survives a regrid. Departure dates
  are no longer silently clamped to "now" — a past cell reads as infeasible.
* **Panels no longer rebuild their DOM every frame** while the clock runs.
  They refresh on discrete events plus a 1–1.5 s throttle, and never while
  the pointer is reading the porkchop.
* Mining and refits advance the clock via `passDays`, which cancels a filed
  plan whose window was slept through instead of rewinding time to the node.
* A departure burn that is no longer affordable (cargo bought after filing)
  unfiles the plan rather than retrying every frame; a capture that cannot be
  completed is finished by port tugs for a salvage fee rather than stranding.
* Economy rebalanced as in §5.2 (background trade, integrated lot pricing,
  tamed scarcity clamps). Early trips are capital-limited, not price-limited.
* **Uplink track now does something**: the Market panel shows the nav target's
  (or in-flight destination's) prices when within uplink ring, with the
  buy-here/sell-there margin per tonne and the one-way light-time.
* Port list shows coplanar Hohmann Δv/TOF estimates against the current
  budget — pillar 4 made visible before any Lambert solve runs.
* Shipyard previews Δv (full tanks) for empty hold and full hold for the next
  tier of every track, with the delta against the current configuration.
* Lambert bracket-collapse exit now verifies the TOF residual; `bodyPeriod`
  uses `tuToDays` instead of a hard-coded constant; `Ship.fromJSON` merges
  over defaults so old saves cannot produce `tiers[undefined]`.