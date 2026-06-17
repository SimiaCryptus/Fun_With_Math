# Laser-Damage Camera Correction PWA

Implementation status: **Phase 0 (Skeleton) + Phase 1 (Profiling MVP)**.

See `idea.md` for the full concept and roadmap.

## What works now

- **PWA shell**: `index.html`, `manifest.webmanifest`, `sw.js` (offline cache).
- **Camera enumeration & live preview** (`getUserMedia` + `enumerateDevices`).
- **Profiling wizard**: captures a sequence of dark / flat / mixed frames.
- **Per-pixel streaming accumulator** (luminance mean/var/min/max + dark max).
- **Defect detection**: dead / stuck / hot / noisy heuristics with confidence.
- **Defect-map overlay** drawn over the live preview.
- **Adjustable thresholds** with re-detect (no recapture needed).
- In-memory profile object (persistence + correction come in later phases).

## Running

This is a no-build, modular-ES6 app. It must be served over **HTTPS** or
**localhost** for camera access. From the repo root:

```sh
# any static server works, e.g.:
npx serve experiments/camera-tool
# or
python3 -m http.server --directory experiments/camera-tool 8000
```

Then open the served URL, click **Start camera**, grant permission, and go
to the **Profiling** tab.

## Notes & limitations

- `getImageData` is 8-bit; very subtle hot pixels may be hard to detect in
  dark frames. This is a known limitation called out in `idea.md`.
- Icons referenced in the manifest (`icons/icon-192.png`, `icon-512.png`)
  are not included; the service worker tolerates their absence.

## Next phases

- **Phase 2**: IndexedDB profile store, save/load, export/import JSON.
- **Phase 3**: Apply mask + neighbor-average infill to captured stills.
- **Phase 4**: Web Worker offload, edge-aware / clustered-defect infill.
