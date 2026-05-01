# Symmetry Diffusion

An interactive pixel-art canvas where you can draw with symmetry and watch colors diffuse across the grid in real
time. The canvas is a small RGB grid (32–256 pixels wide) treated as a discrete field; symmetry operations and a
diffusion operator act on this field every frame.

## Features

### Drawing Tools

- **Draw** – paint pixels with the selected colour and brush size
- **Erase** – paint pixels black
- **Fill** – flood-fill a region with the selected colour
- **Brush size** – 1–10 pixel radius
- **Colour picker** – full HSV colour wheel plus eight quick-access palette swatches

### Symmetry Modes

All symmetry modes can be combined freely.

| Mode               | Effect                                            |
|--------------------|---------------------------------------------------|
| Translation X      | Wraps the canvas horizontally (toroidal)          |
| Translation Y      | Wraps the canvas vertically (toroidal)            |
| Mirror X           | Reflects strokes left ↔ right                     |
| Mirror Y           | Reflects strokes top ↔ bottom                     |
| Rotation 180°      | Adds a point-symmetric copy of every stroke       |
| Rotation 90° (×4)  | Four-fold rotational symmetry around the centre   |
| Rotation 60° (×6)  | Six-fold rotational symmetry (snowflake / hex)    |
| Rotation 30° (×12) | Twelve-fold rotational symmetry                   |
| Diagonal Mirror    | Reflects strokes across the main diagonal (x ↔ y) |

Symmetry also affects diffusion: pixels that are symmetry-peers of each other are connected as neighbours, so colour
spreads along the symmetry axes as well as spatially.

### Diffusion

- **Rate** (0–1) – how strongly each pixel blends toward its neighbours per step; higher values diffuse faster
- **Renorm** (0–1) – moment-preserving renormalisation after each step; at 1.0 the per-channel mean and standard
  deviation are held constant so colours never wash out; at 0.0 the raw diffused values are used (colours will
  eventually converge to grey)
- **Neighborhood** – which pixels count as neighbours:
    - *4-connected* – up/down/left/right only
    - *8-connected* – includes diagonals
    - *12-radius* – also includes distance-2 axial neighbours
- **Step** – advance the simulation by one frame manually
- **Play / Stop** – run the simulation continuously
- **Speed** – target frame rate, 1–120 fps

### Canvas

- **Grid size** – base width in pixels: 32, 64, 128, or 256
- **Aspect W/H** – stretch the grid; values above 1 give a landscape canvas, below 1 give portrait
- **Clear** – fill the canvas with black
- **Random** – fill every pixel with a random colour
- **Save PNG** – download the current canvas as a PNG file
- **Show Grid** – overlay a faint white grid (visible when display scale ≥ 4×)

## Theory

### The Field

The canvas is an RGB scalar field $u : \Omega \to [0,1]^3$ on a discrete grid $\Omega = \{0,\dots,W-1\} \times
\{0,\dots,H-1\}$. Every operation — drawing, symmetrising, diffusing — is a map $u \mapsto u'$ on this field.

### Symmetry as a Group Action

Each enabled symmetry option contributes a generator to a group $G$ acting on $\Omega$:

- **Mirror X / Mirror Y** generate the Klein four-group $\mathbb{Z}_2 \times \mathbb{Z}_2$ via the involutions
  $(x,y) \mapsto (W{-}1{-}x, y)$ and $(x,y) \mapsto (x, H{-}1{-}y)$.
- **Rotation 90° / 60° / 30°** generate cyclic groups $C_4$, $C_6$, $C_{12}$ acting around the centre
  $\mathbf{c} = ((W{-}1)/2, (H{-}1)/2)$ via rotation matrices $R_\theta$.
- **Diagonal Mirror** is the involution $(x,y) \mapsto (y,x)$.
- **Translation X / Y** convert the grid into a torus $\mathbb{Z}_W \times \mathbb{Z}_H$ and add half-period
  translations $(x,y) \mapsto (x + W/2, y)$ etc.

For a position $p \in \Omega$ the **orbit** $G \cdot p = \{g \cdot p : g \in G\}$ is the set of all positions that
must share the same colour for the image to respect the chosen symmetry. When you paint at $p$, the app paints the
entire orbit; this is implemented by `symmetryPositions(x, y)`.

Because rotations by non-axis-aligned angles produce non-integer pixel coordinates, orbits are computed on $\mathbb
R^2$ and then snapped to the grid. This breaks the group law slightly (orbits of orbits are not always closed) but
is visually indistinguishable for the moderate grid sizes used here.

### Diffusion

The simulation step is a discrete heat-equation update. For each pixel $p$ with neighbour set $N(p)$ and edge
weights $w_{pq}$, the update is

$$u'(p) = u(p) + \alpha \sum_{q \in N(p)} \frac{w_{pq}}{\sum_{r} w_{pr}} \big(u(q) - u(p)\big),$$

where $\alpha$ is the **rate**. This is a normalised graph-Laplacian smoothing $u' = u - \alpha L u$ with the
convention that $L$'s rows sum to zero. As $\alpha \to 0$ the dynamics approach the continuous heat equation
$\partial_t u = \Delta u$ on the graph.

Spatial neighbours are weighted by inverse Euclidean distance ($1$ for axial, $1/\sqrt 2$ for diagonal, $1/2$ for
distance-2). Symmetry-peer neighbours are added with weight $1$, and when a peer falls between pixels (rotated
rotations), its contribution is **bilinearly distributed** over the four surrounding pixels. This keeps diffusion
smooth even when the symmetry orbit doesn't land on integer coordinates.

Combining the symmetry-peer edges into the graph means the heat equation is solved on a quotient-like manifold:
points that are far apart in pixel space but close under symmetry exchange colour directly, producing the
characteristic kaleidoscope flow.

### Moment-Preserving Renormalisation

Plain diffusion is energy-dissipating: each step reduces the variance of $u$, so over time the image converges to a
constant grey ($u \equiv \bar u$). To counteract this, after each diffusion step we compute per-channel means
$\mu_c, \mu'_c$ and standard deviations $\sigma_c, \sigma'_c$ before and after the step, and rescale:

$$\tilde u_c(p) = \mu_c + \big(u'_c(p) - \mu'_c\big) \cdot \frac{\sigma_c}{\sigma'_c}.$$

The final value is a convex combination $u^{\text{out}} = (1{-}\rho)\,u' + \rho\,\tilde u$, where $\rho$ is the
**Renorm** slider. With $\rho = 1$ the first two moments of every channel are exact invariants of the dynamics, so
colours redistribute and swirl indefinitely without fading. With $\rho = 0$ the system is purely dissipative and
converges to grey.

This is the same trick used in instance/feature normalisation: standardise, then re-inject target moments. Because
only mean and variance are preserved, higher-order structure (edges, contrast distribution) still diffuses, which is
exactly what produces the slow, organic mixing you see.

## Implementation Notes

### State

`pixels` is a single `Float32Array` of length $3WH$ in row-major RGB layout. The helpers `idx(x,y)`, `getPixel`,
`setPixel` translate between $(x,y,c)$ and the flat index. Floats in $[0,1]$ are used internally; the conversion to
8-bit happens once per render in `render()` via a reused `ImageData` buffer.

### Rendering

The canvas backing store is exactly $W \times H$ pixels; CSS scales it up by an integer factor `displayScale`
computed in `resizeCanvas()`. This gives crisp, nearest-neighbour pixel art for free (the browser's default scaling
on a small canvas blown up via `style.width` is nearest on most platforms; if you need to guarantee it, add
`image-rendering: pixelated` in CSS).

### Symmetry Application

`symmetryPositions(x, y)` builds the orbit of $(x,y)$ for the currently enabled symmetries:

1. Start with the seed point $(x,y)$.
2. Append axis-aligned reflections (mirror X, mirror Y, their composition, 180° rotation) — these are exact integer
   maps.
3. Append rotational images for the active rotation group, computed in floating point and rounded.
4. Append the diagonal reflection $(y,x)$ (and its composition with both mirrors) if enabled.
5. For every seed thus generated, add half-period translations if Translation X / Y is on, then wrap or clip
   depending on whether wrapping is enabled.

The result is deduplicated via a `Set` keyed by `"x,y"` and returned as integer pairs. Drawing operations iterate
over this list.

### Neighbour Graph

`getNeighbors(x, y)` returns the weighted edge list for pixel $(x,y)$:

- Spatial offsets from the chosen connectivity (4 / 8 / 12), wrapped or clipped per translation flags, weighted by
  inverse Euclidean distance.
- Symmetry peers from the same generators as `symmetryPositions`, but kept as floating-point coordinates and routed
  through `addBilinearNeighbors` so each fractional peer contributes to the four surrounding integer pixels with
  bilinear weights.

The diffusion loop normalises by the sum of weights per pixel, so absolute weight magnitudes don't matter — only
their ratios do.

### Diffusion Step

`diffuseStep()` is a single explicit Euler step:

1. Compute per-channel mean $\mu$ and std $\sigma$ of `pixels`.
2. Allocate `next` and fill it from the Laplacian update.
3. Compute new moments $\mu', \sigma'$ of `next`.
4. Blend each pixel with its moment-rescaled version using the `renorm` weight.
5. Clamp to $[0,1]$ and swap `pixels = next`.

Stability requires roughly $\alpha \cdot \deg_{\max} < 1$. The default $\alpha = 0.30$ with 4–12 neighbours is well
inside this bound.

### Drawing

`paintAt(x, y)` fills a disc of radius `brushSize` centred at $(x,y)$, wrapping coordinates around the grid (so
drawing near an edge with translation symmetry is seamless). For symmetric drawing, the caller iterates over
`symmetryPositions` and invokes `paintAt` at every orbit point.

`floodFill` is a stack-based 4-connected flood with a small RGB tolerance for matching, so anti-aliased boundaries
fill cleanly.

### Animation

`animLoop(ts)` is a `requestAnimationFrame` driver that throttles itself to the requested fps by checking
`ts - lastFrameTime`. This keeps simulation rate decoupled from monitor refresh and avoids busy-spinning on fast
displays.

## Getting Started

No build step is required. Open `index.html` directly in any modern browser:

```
open symmetry_simple/index.html
```

Or serve it with any static file server, for example:

```bash
npx serve symmetry_simple
# then visit http://localhost:3000
```

## Usage Tips

1. Enable **Mirror X + Mirror Y + Rotation 90°** before drawing to get instant kaleidoscope patterns.
2. Draw a few coloured blobs, then hit **Play** with **Rate ≈ 0.30** and **Renorm = 1.00** to watch the colours
   swirl without fading.
3. Use **Random** followed by **Play** at high speed to generate organic, tie-dye textures.
4. Lower **Renorm** toward 0 to let the image slowly converge to a uniform colour — useful for blending transitions.
5. Combine **Translation X + Translation Y** with any rotational symmetry to tile the pattern seamlessly across the
   canvas.
6. Increase the grid to **256** and the aspect ratio to **2.00** for a wide, high-resolution canvas; decrease to
   **32** for a chunky pixel-art look.
7. Try **Rotation 60°** with **Translation X + Y** off and a single off-centre dot to grow a snowflake; switch on
   **12-radius** neighbourhood for fluffier branches.
8. For meditative loops: **Random**, **Rate = 0.05**, **Renorm = 1.00**, **Rotation 90°**, fps ≈ 30.

## File Structure

```
symmetry_simple/
├── index.html   # markup and UI controls
├── style.css    # layout and dark-theme styles
├── app.js       # all application logic (single self-contained IIFE)
└── README.md    # this file
```

## Possible Extensions

- **Implicit / semi-implicit time stepping** for larger stable rates (solve $(I + \alpha L) u' = u$ with a few
  Jacobi sweeps).
- **Anisotropic diffusion** — modulate edge weights by local gradient magnitude to preserve edges (Perona–Malik).
- **Reaction–diffusion** — add a per-pixel non-linear term ($u^3 - u$, Gray–Scott, etc.) to grow patterns instead of
  just smoothing.
- **Higher-order moment matching** — preserve skew/kurtosis or full per-channel histograms via histogram
  specification.
- **GPU implementation** — port `diffuseStep` to a fragment shader; the operation is embarrassingly parallel and
  would scale to 1024² grids easily.