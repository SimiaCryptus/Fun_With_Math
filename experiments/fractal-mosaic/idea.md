# Recursive Photomosaic Fractal Viewer — Software Specification

## 1. Overview

This document specifies the design of a browser-based application that transforms a
personal photo album into an **infinitely zoomable, recursively self-similar
photomosaic**. The system renders a single conceptual infinite 2D plane. Every
visible region of that plane is filled with a photo. As the user zooms in, any
photo may reveal itself to be composed of a mosaic of other photos from the same
album, which themselves may decompose into further mosaics, without a fixed
recursion limit. The experience is meant to feel like an infinite fractal built
entirely out of the user's own memories, rather than a mathematically generated
pattern (e.g. Mandelbrot-style zoomers) or a traditional single-level
photomosaic.

The system must be:

- **Locally finite** — only a bounded neighborhood around the camera is ever
  materialized, loaded, or rendered, regardless of how deep the user zooms.
- **Deterministic** — a given tile at a given coordinate and zoom level always
  produces the same visual content across sessions, reloads, and devices.
- **Performant** — smooth pan/zoom at interactive frame rates, using GPU
  rendering, chunked streaming, and mipmapped textures.
- **Precomputed where possible** — expensive operations (embeddings, indexing,
  mipmap generation) happen offline in a preprocessing pipeline; the browser
  runtime only does index lookups, layout decisions, and rendering.

This is a greenfield system. No existing tool combines quadtree tiling,
deterministic procedural tile identity, image-feature indexing, and recursive
photomosaic substitution into an infinite zoom experience. Fractal zoomers
(XaoS, Fraktaler, Forma Fractalis, GMT) render mathematical fractals, not
photo-derived mosaics, and existing photomosaic tools produce a single static
level rather than a recursive hierarchy.

---

## 2. Goals and Non-Goals

### Goals

- Given an arbitrary personal photo album, generate an experience where panning
  and zooming over an infinite plane reveals photos, then mosaics of photos,
  then mosaics of mosaics, indefinitely.
- Guarantee visual stability: revisiting the same coordinates always yields the
  same tile content (no flicker or reshuffling on re-render).
- Support at least two generation modes:
  - **Hero-driven mode**: a curated "top-level" image is approximated at depth
    by mosaics of album photos.
  - **Album-driven mode**: no hero image; the plane is a self-similar tiling of
    the album, recursively decomposed at every level.
- Run entirely in a modern browser after a one-time static asset load, with no
  server-side rendering required at runtime (a static file host / CDN is
  sufficient).
- Scale to albums ranging from hundreds to tens of thousands of photos.

### Non-Goals (initial version)

- Real-time ingestion of new photos while the viewer is running (album is
  preprocessed as a batch job).
- Server-side dynamic mosaic computation (all matching indices are static
  assets shipped to the client).
- Support for non-image media (video, audio) in this version.
- Collaborative/multi-user shared canvases.

---

## 3. Core Conceptual Model

### 3.1 The Infinite Plane

The world is modeled as an infinite 2D plane subdivided by a **quadtree**.
Zoom level `L` is a non-negative integer. At level `L`, the plane is divided
into a grid of tiles, each of conceptual size `2^-L` relative to level 0. Each
tile has an integer coordinate `(x, y, L)`.

A tile is **atomic** if it is rendered as a single photo scaled to fill its
bounds, or **composite (mosaic)** if it is subdivided into an `n × m` grid of
child tiles at level `L+1`, each of which is itself atomic or composite.

### 3.2 Deterministic Tile Identity

Every tile's content must be a pure function of `(x, y, L)` plus a fixed global
seed (the "album seed", derived from album content hash and generation mode).
This is implemented via a seeded PRNG:

```
tileSeed(x, y, L, albumSeed) = hash(albumSeed, x, y, L)
rng = PRNG(tileSeed)
```

The PRNG deterministically decides:

- Whether the tile is atomic or composite (subject to depth/zoom heuristics).
- If composite, the subdivision grid shape (e.g. 2×2, 3×3, irregular).
- For each subcell, which photo (or which further recursion) occupies it,
  drawn via a nearest-neighbor query against the feature index, using the
  PRNG to break ties / introduce controlled diversity.

This guarantees tiles can be destroyed and recreated (e.g. on cache eviction
and re-entry into the viewport) without any visible seam or discontinuity.

### 3.3 Recursive Substitution Rule

At every level, the same album and the same matching rules apply — this
self-similarity is what produces the fractal feel. Concretely:

1. A parent tile is associated with a **target descriptor** (a color signature
   and/or semantic embedding), either inherited from the hero image region it
   approximates (hero-driven mode) or from the photo currently occupying that
   tile (album-driven mode).
2. If the tile is composite, the target descriptor is split across subcells
   (e.g. by sampling the corresponding region of the parent photo, or by
   perturbing the parent descriptor procedurally).
3. Each subcell queries the feature index for the best-matching photo(s) given
   its target descriptor, filtered by a diversity constraint (e.g. avoid
   reusing a photo already used in a nearby tile within the last `k`
   ancestors).
4. The chosen photo becomes the new "target" for that subcell, and the process
   repeats at the next level.

### 3.4 Zoom-Depth Behavior

- At coarse zoom (far out), tiles are rendered atomically using low-resolution
  mipmaps — the user sees whole photos or a hero composition.
- As zoom increases past per-tile resolution thresholds, atomic tiles are
  promoted to composite tiles, revealing their constituent mosaic.
- There is no hard maximum recursion depth; depth is bounded only by available
  album diversity and PRNG-driven decisions (e.g. probability of subdivision
  decreasing with depth to keep the experience navigable, if desired).

---

## 4. System Architecture

The system has two major parts: an **offline preprocessing pipeline** and a
**browser runtime**.

```
┌────────────────────────┐        ┌──────────────────────────────┐
│   Preprocessing (CLI)   │ ---->  │  Static Assets (CDN/S3/etc.) │
│  - embeddings           │        │  - manifest.json             │
│  - color signatures     │        │  - ann-index (binary)        │
│  - mipmap generation    │        │  - thumbnails atlas          │
│  - index building       │        │  - photos/<id>/<level>.jpg   │
└────────────────────────┘        └──────────────────────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────────┐
                                   │      Browser Runtime     │
                                   │  - Camera controller     │
                                   │  - Chunk manager         │
                                   │  - Tile generator        │
                                   │  - Texture pool          │
                                   │  - GPU renderer (R3F/GL) │
                                   └─────────────────────────┘
```

### 4.1 Preprocessing Pipeline (offline, run once per album update)

Responsibilities:

1. **Ingest** raw photos from a source directory/bucket.
2. **Compute features** per photo:
   - Mean color / color histogram (fast color-space signature).
   - Semantic embedding via a CLIP-family model (ONNX export), for
     semantically coherent matching (optional but recommended).
3. **Generate mipmap pyramid** per photo: a fixed set of resolutions (e.g. 16,
   64, 256, 1024 px on the long edge), stored as separate JPEG/WebP/AVIF files.
4. **Build an ANN (approximate nearest neighbor) index** over the embeddings
   and/or color signatures, exported in a WASM-loadable binary format.
5. **Emit a manifest** (`manifest.json`) describing every photo: id, aspect
   ratio, available mipmap levels and their URLs, color signature, and
   embedding reference/index offset.
6. **Emit a thumbnail atlas** — a single packed image containing the lowest-res
   thumbnail for every photo, to support instant far-zoom rendering with a
   single texture bind.
7. Compute and persist the **album seed** (hash of manifest content) used for
   deterministic PRNG tile generation.

Implementation: a Node.js or Python CLI tool (see §7) invoked as a build step,
producing a directory of static assets deployable to any static host/CDN.

### 4.2 Browser Runtime

Responsibilities:

1. **Bootstrap**: fetch `manifest.json`, thumbnail atlas, and ANN index on
   startup (lazy-load the ANN index if large; a coarse color-index can load
   first for immediate interactivity).
2. **Camera controller**: tracks pan/zoom state using integer zoom level `L`
   plus fractional tile-space offset, to avoid floating-point precision loss
   at deep zoom (see §5.3).
3. **Chunk manager**: determines which tiles are visible given the camera
   frustum, requests generation/loading of newly visible tiles, and evicts
   tiles/chunks that fall outside a retention radius.
4. **Tile generator**: given `(x, y, L)`, produces a **tile spec** (atomic vs.
   composite, chosen photo(s), subdivision layout) using the deterministic PRNG
   and ANN index queries. Results are cached (see §6).
5. **Texture pool**: manages GPU texture memory, mapping photo mipmap URLs to
   loaded textures, with LRU eviction.
6. **Renderer**: draws visible tiles as textured quads (instanced where
   possible), using the appropriate mipmap level for current zoom, with a
   custom shader for mosaic blending/edge transitions if desired.

---

## 5. Data Model and Static Asset Schemas

### 5.1 Directory Layout

```
assets/
  manifest.json
  album-seed.txt
  index.ann              # binary ANN index (embeddings)
  index-color.bin        # optional lightweight color-only index
  thumbnails-atlas.jpg   # packed atlas of lowest mip for all photos
  photos/
    <photo-id>/
      0.jpg   # e.g. 16px long edge
      1.jpg   # 64px
      2.jpg   # 256px
      3.jpg   # 1024px
```

### 5.2 `manifest.json` Schema

```json
{
  "albumSeed": "b7e2...",
  "generatedAt": "2025-01-01T00:00:00Z",
  "mipLevels": [16, 64, 256, 1024],
  "photos": [
    {
      "id": "p00001",
      "aspect": 1.5,
      "colorSignature": [0.12, 0.44, 0.31],
      "embeddingIndex": 4821,
      "tags": ["travel", "family"],
      "timestamp": "2019-06-02T00:00:00Z",
      "atlas": { "x": 0, "y": 0, "w": 16, "h": 16 },
      "mips": {
        "0": "photos/p00001/0.jpg",
        "1": "photos/p00001/1.jpg",
        "2": "photos/p00001/2.jpg",
        "3": "photos/p00001/3.jpg"
      }
    }
  ]
}
```

Notes:

- `embeddingIndex` is the row offset into the ANN index binary, allowing the
  manifest to stay small while embeddings live in a separate optimized format.
- `colorSignature` is duplicated inline for cheap, index-free approximate
  matching when only coarse color-field mode is needed.
- `tags` and `timestamp` support optional semantic modes (§8).

### 5.3 Tile Spec (runtime, generated not persisted)

```ts
type TileSpec =
  | { kind: 'atomic'; photoId: string }
  | {
      kind: 'composite';
      grid: { cols: number; rows: number };
      children: TileSpec[]; // one per subcell, generated lazily
    };
```

Composite children are generated **lazily** — only when the corresponding
sub-region is actually within the visible/prefetch radius — to preserve
locality of computation.

---

## 6. Performance Model

### 6.1 Chunking

- Tiles are grouped into fixed-size **chunks** (e.g. 16×16 tiles) per zoom
  level.
- Only chunks within a configurable radius (in chunk units) of the camera are
  materialized.
- Chunks outside the radius are torn down: their GPU textures released, their
  tile-spec cache entries either evicted or demoted to a lightweight
  "known-seed" placeholder (so they can be cheaply regenerated later without
  recomputation drift, since generation is deterministic).

### 6.2 Camera Representation

- Zoom level `L` is an integer; sub-level zoom is represented as a continuous
  float that triggers level transitions at thresholds (hysteresis to avoid
  thrashing at boundaries).
- Position is represented as `(tileX, tileY, fracX, fracY)` at the current
  level — integer tile coordinates plus a bounded fractional offset — rather
  than a single large float, to avoid precision loss arbitrarily deep into the
  zoom.

### 6.3 Caching

Two cache layers:

1. **Tile-spec cache** (CPU-side): memoized `(x, y, L) -> TileSpec` results,
   bounded by an LRU with a size proportional to the chunk retention radius.
2. **Texture cache** (GPU-side): memoized `photoId + mipLevel -> GPUTexture`,
   LRU-evicted based on GPU memory budget, independent of tile-spec cache
   lifetime (a texture may stay resident even if referencing tiles were
   evicted, if reused elsewhere).

### 6.4 Level of Detail

- Each photo has a fixed mipmap ladder (§5.1). The renderer selects the mip
  level whose on-screen tile size most closely matches (or exceeds by one
  step) the rendered pixel size, standard mipmap-selection practice.
- Composite tiles do not need to load the parent photo's higher mips at all
  once subdivided — only the subcell photos' appropriate mips are loaded,
  bounding memory use even at extreme depth.

### 6.5 Rendering

- GPU-accelerated via WebGL2 (broad compatibility) or WebGPU (preferred where
  available) through Three.js / React Three Fiber.
- Visible tiles are drawn as textured quads; instancing is used where many
  tiles share a draw call shape (e.g. uniform grid mosaics).
- A custom shader handles smooth cross-fade when a tile transitions from
  atomic to composite (or vice versa) to avoid visual popping.

---

## 7. Technology Stack

| Concern                                  | Choice                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rendering                                | Three.js or React Three Fiber (WebGL2 baseline, WebGPU renderer where supported)                                                                                         |
| Embeddings (offline)                     | CLIP-family model exported to ONNX; run via Python (open-clip, onnxruntime) in the preprocessing CLI                                                                     |
| Embeddings (runtime, optional)           | ONNX Runtime Web / TensorFlow.js, only if on-the-fly re-querying is needed client-side                                                                                   |
| ANN index                                | FAISS or HNSWlib, compiled to WASM for optional client-side querying; otherwise index is queried entirely offline and results baked into manifest-adjacent lookup tables |
| Spatial index (visible tile bookkeeping) | Flatbush / RBush, or a custom quadtree (straightforward to hand-roll)                                                                                                    |
| Deterministic PRNG                       | `seedrandom` or a small xorshift128 implementation                                                                                                                       |
| Offline image processing                 | Sharp (Node.js) or Pillow (Python) for mipmap generation and atlas packing                                                                                               |
| Static hosting                           | Any static file host / CDN (S3 + CloudFront, GCS, Cloudflare Pages, etc.)                                                                                                |

Rationale: no existing library performs recursive photomosaic tile generation;
the above are primitives to assemble the system. Three.js/R3F is chosen for
maturity of WebGL2/WebGPU abstraction, texture management, and instancing
support. FAISS/HNSWlib are chosen for mature, well-tested ANN implementations
with WASM build paths.

---

## 8. UX Specification

### 8.1 Interactions

- **Pan**: click-and-drag (desktop), single-finger drag (touch).
- **Zoom**: scroll wheel / pinch gesture, centered on cursor/pinch midpoint.
- **Depth indicator**: a subtle overlay (e.g. a small counter or ring
  indicator) showing current recursion depth / zoom level, to give the user a
  sense of how deep they've gone.

### 8.2 Generation Modes (user-selectable)

- **Hero-driven mode**: user selects or the system curates a top-level image;
  deeper levels approximate it via mosaic matching against the album.
- **Album-driven mode**: no hero; the plane is a self-similar tiling seeded
  directly from album photos with no target image to approximate.

### 8.3 Semantic Modes (optional, layered on top of either generation mode)

- **Color field mode**: matching prioritizes color-signature similarity,
  producing painterly, color-clustered fields.
- **Time mode**: spatial regions of the plane are biased toward photos from
  particular time ranges, so zooming across the plane traverses the album
  chronologically.
- **Tag mode**: spatial regions bias toward particular tags (travel, family,
  work, etc.), and zooming into a region of one tag increases the local
  concentration of related photos at deeper levels ("narrative paths").

### 8.4 Narrative Paths (stretch feature)

- Recognize salient content in the currently centered photo (e.g. a detected
  face or landmark) and bias deeper-level matching toward photos sharing that
  attribute, creating the effect of zooming "into" a person or place across
  the recursion.

---

## 9. Tile Generation Algorithm (Pseudocode)

```
function generateTile(x, y, L, context):
    seed = hash(context.albumSeed, x, y, L)
    rng = PRNG(seed)

    targetDescriptor = deriveTargetDescriptor(x, y, L, context)

    if shouldBeAtomic(L, rng, context):
        photo = queryIndex(targetDescriptor, context, rng)
        return AtomicTile(photo)

    grid = chooseGridShape(rng, context)
    children = []
    for (cx, cy) in gridCells(grid):
        childDescriptor = deriveChildDescriptor(targetDescriptor, cx, cy, grid)
        # recursive call is deferred/lazy in practice — only invoked
        # when the child tile enters the visible/prefetch radius
        children.append(lazy(() => generateTile(childX, childY, L+1,
                                                   context.with(childDescriptor))))
    return CompositeTile(grid, children)
```

Key properties:

- `shouldBeAtomic` may factor in current zoom vs. tile's on-screen size (never
  subdivide a tile too small to show meaningful detail) as well as a
  depth-decreasing subdivision probability to keep navigation tractable.
- `queryIndex` performs an ANN lookup against `targetDescriptor`, applies a
  diversity filter (e.g. reject photos used within N ancestor tiles), and
  returns a single best photo id.
- All randomness flows exclusively through `rng`, seeded deterministically, so
  re-generation always converges to identical output.

---

## 10. Open Questions / Future Work

- **Diversity/anti-repetition tuning**: what window size and penalty function
  best avoids visible repetition of the same photo across nearby tiles without
  degrading match quality, especially for small albums.
- **Dynamic album updates**: incremental preprocessing so adding new photos
  doesn't require a full re-embedding/re-index pass.
- **Server-assisted mode**: for very large albums where client-side ANN index
  size becomes prohibitive, consider a lightweight query API instead of a
  fully static bundle.
- **Video/live-photo tiles**: extending atomic tiles to support motion content.
- **Shareable coordinates**: encoding a specific `(x, y, L, mode)` view as a
  URL so specific "interesting" zoom paths can be bookmarked and shared.
- **Accessibility**: non-visual or reduced-motion means of experiencing depth
  (e.g. a list-based breadcrumb of the recursion path).
