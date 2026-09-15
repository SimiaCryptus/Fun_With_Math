# EmergenSim Dev Notes

## Navigation
- Added a "Home" link (`#hud-home-link`) in the `#hud-header` HUD panel, pointing to `/` so
  players can return to the site's landing page without using browser back navigation.
- Styled via `css/hud.css` to match existing `.hud-badge` visuals, with a hover state that
  highlights in the accent-cyan color consistent with other interactive HUD elements.

## Follow-ups
- Verify the root `/` route resolves correctly relative to the deployment path (e.g. if the
  game is served from a subdirectory, this link may need to be adjusted to a relative path).
- Consider adding a confirmation prompt if leaving mid-simulation should warn about losing
  progress, since navigating home does not trigger any save/autopsy flow.