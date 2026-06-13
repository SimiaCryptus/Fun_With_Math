// Render a Float32Array scalar field onto a canvas using a colormap.

    import { colormaps } from "./colormap.js";

    export function renderField(canvas, fieldResult, opts) {
      const { data, min, max } = fieldResult;
      const { size, cmap } = opts;
      const colorFn = colormaps[cmap] || colormaps.viridis;

      // Resize canvas to match field resolution for pixel-accurate rendering.
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
      }

      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(size, size);
      const range = max - min || 1;

      for (let i = 0; i < data.length; i++) {
        const t = (data[i] - min) / range;
        const [r, g, b] = colorFn(t);
        const o = i * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }

      ctx.putImageData(img, 0, 0);
    }