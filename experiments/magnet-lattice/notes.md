# Notes

- [x] persist settings/arrangement to localStorage — `main.js` `snapshot()/persist()/restore()`
      (key `magnet-lattice/v1`; debounced + on unload/hide; "Forget saved state" in Settings).
- [x] touch: pinch-to-zoom — touch pointers tracked in a Map; a second finger converts the
      active gesture into a `pinch` (zoom about midpoint + pan). A freshly placed magnet is
      undone if the placing touch becomes a pinch.
- [x] eigen-spectrum selector: click/tap a bar to select the mode; selected bar is emphasised
      and labelled with ω; hover shows a faint column + tooltip. The slider remains as a
      secondary control.
- [x] coupling-matrix hover: row/column bands + outlined cell (and mirror), the two coupled
      magnets get a ring on the scene, and `C_ij` / `H_ij` are printed under the chart.
- [x] optimizer sweep: `MinimaSweep` in `analysis.js` — structured seeds + random starts →
      `relax` → Hessian PSD filter → dedupe under the lattice D4 point-group ops that preserve
      the position set (× global dipole flip) → auto-tags (ferro / checkerboard AFM / vortex /
      zero net moment / soft), orbit size, hit counts. Runs chunked in the animation loop;
      results listed in the Analyze panel and clickable.

## Next

- catalog: export/import the catalog as JSON alongside the arrangement
- basin-of-attraction estimate from hit counts (needs uniform sampling guarantees)
- keyboard ←/→ to step through modes in the spectrum