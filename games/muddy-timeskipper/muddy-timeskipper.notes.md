# Muddy Timeskipper — Dev Notes

## Overview

A mud-racing / time-travel arcade driving game built with Three.js. Players
race a filthy off-road vehicle across the "Sludge Speedway" track, build
speed, and trigger a **SNAPBACK** (time-skip) maneuver upon reaching 88 MPH.

## Entry Point

- `index.html` — page shell, boot screen, HUD/UI containers, import map for
  Three.js (loaded via unpkg CDN, pinned to `0.164.1`).
- `src/main.js` — exports `boot({ glCanvas, hudCanvas, gearRow, trackId })`,
  the game's async bootstrap function invoked once the player dismisses the
  boot/start overlay.

## Navigation

- A persistent **Home** link (`#home`, top-left, fixed position) is present
  on the page at all times, including during boot and gameplay, allowing the
  player to return to the site root (`/`) at any point without needing to
  reload or lose their place in the site hierarchy.
- The link is styled consistently with the game's "gunk" button aesthetic
  (dark brown background, cream text, hard drop shadow) and sits above the
  boot overlay (`z-index:5` vs boot's `z-index:10` — note boot overlay is
  removed on start, so the home link remains accessible post-boot too).

## Controls

- `W` / `↑` — throttle
- `S` / `↓` — brake
- `A` / `D` — steer
- `SPACE` — handbrake
- `SHIFT` — SNAPBACK (time-skip), only usable at 88 MPH
- `1` / `2` / `3` — manual gear select
- `C` — toggle orbit camera (drag to look, wheel to zoom)

## UI Structure

- `#gl` — main WebGL render canvas (fullscreen, fixed).
- `#hud` — 2D HUD overlay canvas, non-interactive (`pointer-events:none`).
- `#ui` — pointer-events container hosting `#gearRow`, the gear-selection
  button row anchored bottom-left.
- `#boot` — full-screen start overlay with title, instructions, and the
  "START THE FILTH" button; removed from DOM on start (one-time listener).

## Follow-ups / TODO

- Confirm relative vs absolute path for the home link (`/`) works correctly
  when the game is hosted from a subdirectory or via GitHub Pages project
  path — may need adjustment to a relative `../../` path if the site isn't
  served from domain root.
- Consider adding a confirmation prompt before navigating home mid-race to
  avoid accidental loss of progress.
