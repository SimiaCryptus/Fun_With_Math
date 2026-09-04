# Recursive Photomosaic Fractal Viewer

A living photo album that turns your memories into an infinite, self-similar
mosaic.

## What you see

When you open the viewer, you are looking down at an infinite plane covered
with photographs. At first, the plane may look like a single hero photo or a
field of album photos. As you zoom in, something strange and delightful
happens: each photo dissolves into a mosaic of smaller photos from your album.
Zoom into one of those smaller tiles, and it, too, becomes a mosaic of even
smaller photos. This continues without a fixed end — every level is built from
the same collection, so the experience is fractal, self-similar, and endless.

The experience feels like diving into a photograph and discovering that it is
not just one image but a constellation of related moments.

## The core idea

Traditional photomosaics arrange many small photos to approximate one larger
target image, but they stop there: one static picture. Mathematical fractal
zoomers (like Mandelbrot explorers) create infinite detail, but the detail is
abstract geometry, not personal images.

This viewer combines both ideas. The infinite plane is split into tiles, and
each tile knows how to choose a photo or split into a grid of child tiles. The
choice of which photo goes where is based on the colors and structure of the
region it is replacing, plus a consistent random seed. That means:

- The same coordinates always show the same arrangement.
- No matter how deep you zoom, only the small set of tiles around the camera is
  computed and drawn.
- Your own photo collection provides the visual material at every depth.

## The interface

### Pan and zoom

- Drag with a mouse or one finger to pan.
- Use the scroll wheel or pinch gesture to zoom.
- On a touch screen, a two-finger pinch zooms around the midpoint.

### On-screen controls

A small panel at the top-left holds the controls:

- **Mode** — switch between Album-driven (the plane grows organically from the
  album itself) and Hero-driven (choose a single top-level photo that deeper
  levels approximate).
- **Hero** — when hero mode is active, pick any photo from the album as the
  starting image.
- **Mosaic** — how many sub-photos recompose each parent photo. You can choose
  a fixed grid (e.g. 3×3, 4×4, up to 24×24) or an automatic mixed setting that
  varies grid sizes per level.
- **Sub-tile** — how large, in pixels, each sub-photo becomes before its parent
  photo dissolves. Lower values make mosaics appear sooner; higher values keep
  the parent photo visible longer.
- **Blend** — controls the transition zone between seeing a photo as a whole
  and seeing its mosaic children.
- **Jitter** — adds per-tile variation to the dissolve threshold so tiles do
  not dissolve in lockstep, making the transition feel organic.
- **Structure** — balances how much the arrangement values the overall color of
  a region versus the internal layout (light/dark structure) when placing
  photos.
- **Diversity** — discourages repeating the same photo too close to itself.

Buttons below the sliders let you:

- **Reset** — return to the original view.
- **Jump** — teleport to a distant, unexplored region.
- **Re-seed** — change the random seed that shuffles the whole fractal.
- **Dive** — start or stop a continuous automatic zoom.
- **Link** — copy a URL that encodes the exact current view, so you can share or
  bookmark a particular spot.

The bottom-left stats panel shows your current zoom depth, tile grid, number of
visible tiles, texture usage, and frame rate. The bottom-right circular
indicator shows the current recursion depth and how far you are between levels.

### Keyboard shortcuts

- `D` — toggle dive (automatic zoom)
- `R` — reset view
- `J` — jump to a random location
- `H` — hide/show the control panel
- `+` / `-` — zoom in / out
- Arrow keys — pan

## How it feels to use

Because the arrangement is deterministic and local, there is no loading pause
as you zoom deeper. The view is built from the same photos repeatedly, but each
time at a different scale and arrangement. One moment you are looking at a
landscape; zoom into a leaf and it becomes a mosaic of smaller photos that
share the leaf's green and organic structure. Keep going, and those photos
themselves become mosaics, on and on.

The experience can be meditative or exploratory. Some people enjoy the pure
visual texture; others hunt for specific photos or try to trace a "path"
through related memories. Because the matching is based on color and structure,
photos that visually resemble each other cluster together, creating flowing
gradients of visual similarity across the plane.

## Background

The concept grew out of two long-standing forms:

1. **Photomosaics** — popularized in the 1990s and 2000s, these combine many
   small images into one larger target picture.
2. **Fractal zoomers** — software that lets you explore infinitely detailed
   mathematical sets, like the Mandelbrot or Julia sets, by panning and zooming.

Each is compelling on its own. But until now, no common tool made a photomosaic
that is itself recursive — where each tile is not a pixel but a whole new
mosaic. This viewer is a reference implementation of that idea, designed to work
entirely in the browser using a preprocessed album of photographs.

## Who might find this useful or interesting

- **Personal memory explorers** — transform a folder of family photos, travel
  shots, or a year in review into a navigable, self-similar space. Zooming
  becomes a way to revisit moments, with related images clustering naturally by
  color and composition.
- **Artists and designers** — create generative, self-similar collages from a
  custom set of images for installations, music videos, or interactive posters.
  The fractal nature makes every view unique but stable.
- **Educators and explainers** — demonstrate recursion, self-similarity,
  quadtrees, or deterministic procedural generation in a visually intuitive
  way. No math background required to see the pattern.
- **Curators and memory institutions** — turn large digitized image collections
  into an endlessly explorable visual index. Because only a small neighborhood
  is ever computed, even tens of thousands of photos can be browsed smoothly.
- **Curious technologists and artists-in-residence** — the included browser
  page runs as a self-contained demo with a procedurally generated album, so
  anyone can experience the effect immediately without a real photo collection.

## Technical personality (in plain language)

Under the hood, the viewer is deliberately minimal. It does not store an
infinite number of images; instead, it calculates which photo belongs in each
tile at the moment that tile is needed, using a formula that always gives the
same answer for the same location. The images themselves are served from a
small set of multi-resolution copies, so far-away tiles use low-resolution
thumbnails and close-up tiles load only the detail they need. This is why the
experience remains smooth even though the world is infinite and the gallery
may hold tens of thousands of photos.

The processing of real photos — computing their color signatures and preparing
the multi-resolution copies — happens offline, once per album. The browser then
simply reads those fingerprints and draws the tiles. For the built-in demo and
for photos selected from your device, that preprocessing happens automatically
inside the page.

---

The README should be placed in the same directory as the viewer. The actual
interactive page is `index.html`; the conceptual specification is `idea.md`.
This document is the human-facing explanation of what the project is and why
it matters.
