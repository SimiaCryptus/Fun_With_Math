# Vocal Parkour — Notes

## Overview
Vocal Parkour is a voice-controlled parkour game that uses microphone input
(via Voice Activity Detection, VAD) to trigger player actions such as jumping
or dashing. The game and its supporting VAD demo tooling live under
`games/vocal_parkour/web/`.

## Structure
- `games/vocal_parkour/web/public/`
  - `games-vocal_parkour-web-index.css` — Base styles for the main game page
    (dark color scheme, full-height layout, `#app` mount point).
  - `games-vocal_parkour-web-index.html` — Main game page entry point. Now
    includes a top navigation link back to the site root (`/`) for easy
    return to the games hub.
  - `games-vocal_parkour-web-packages-vad-demo-index.css` — Styles for the
    standalone VAD demo page (`voice-calibration` panel, indicator dot,
    threshold slider, word-score readout, etc.).

## Recent Changes
- Added a "Home" link (`<a href="/">← Home</a>`) to the top of the game page
  so players can navigate back to the root of the site without using the
  browser back button. Implemented as a simple `<nav>` element placed before
  the `#app` mount point in the HTML entry file.

## Conventions
- File naming mirrors directory structure using dashes, e.g.
  `games-vocal_parkour-web-index.css` corresponds to
  `games/vocal_parkour/web/index.css` semantically, but is served flatly
  from `public/`.
- Dark theme is the default (`color-scheme: dark`) across both the main game
  and the VAD demo tooling.
- The VAD demo (`vad-demo`) is a developer-facing utility for testing
  microphone calibration, thresholds, and word-detection scoring — it is not
  part of the player-facing game flow.

## Follow-ups
- Confirm the home link's target route works for both the standalone dev
  server and the production/static hosting setup.
- Consider adding the same home link treatment to the VAD demo page for
  consistency, if that page is intended to be player/developer-navigable.