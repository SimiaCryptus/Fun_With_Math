export async function fileToImageData(file, maxEdge = 0) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let { width, height } = bitmap;
  if (maxEdge && Math.max(width, height) > maxEdge) {
    const s = maxEdge / Math.max(width, height);
    width = Math.max(1, Math.round(width * s));
    height = Math.max(1, Math.round(height * s));
  }
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return ctx.getImageData(0, 0, width, height);
}

export function rgbToImageData(rgb, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, s = 0, d = 0; i < width * height; i++, s += 3, d += 4) {
    out[d] = rgb[s]; out[d + 1] = rgb[s + 1]; out[d + 2] = rgb[s + 2]; out[d + 3] = 255;
  }
  return new ImageData(out, width, height);
}

export function errorImageData(a, b, width, height, gain = 8) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, s = 0, d = 0; i < width * height; i++, s += 3, d += 4) {
    out[d]     = 128 + (b[s]     - a[s])     * gain;
    out[d + 1] = 128 + (b[s + 1] - a[s + 1]) * gain;
    out[d + 2] = 128 + (b[s + 2] - a[s + 2]) * gain;
    out[d + 3] = 255;
  }
  return new ImageData(out, width, height);
}