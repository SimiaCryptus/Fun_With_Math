# Symmetry Diffusion

An interactive pixel-art canvas where you can draw with symmetry and watch colors diffuse across the grid in real time.

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
2. Draw a few coloured blobs, then hit **Play** with **Rate ≈ 0.30** and **Renorm = 1.00** to watch the colours swirl
   without fading.
3. Use **Random** followed by **Play** at high speed to generate organic, tie-dye textures.
4. Lower **Renorm** toward 0 to let the image slowly converge to a uniform colour — useful for blending transitions.
5. Combine **Translation X + Translation Y** with any rotational symmetry to tile the pattern seamlessly across the
   canvas.
6. Increase the grid to **256** and the aspect ratio to **2.00** for a wide, high-resolution canvas; decrease to **32**
   for a chunky pixel-art look.

## File Structure

```
symmetry_simple/
├── index.html   # markup and UI controls
├── style.css    # layout and dark-theme styles
├── app.js       # all application logic (single self-contained IIFE)
└── README.md    # this file
```