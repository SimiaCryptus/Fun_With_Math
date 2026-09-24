/** Embedding → per-id colour: projected 2-D coordinates mapped to OKLab at fixed lightness. */

function toSrgb(x) {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

export function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * coords: Float32Array n*2 (aligned projection). Hue = angle; chroma grows with radius
 * (with a floor so central points stay tinted).
 */
export function embeddingColors(coords, ids, { lightness = 0.82, chroma = 0.17 } = {}) {
  const map = new Map();
  if (!coords) return map;
  const n = ids.length;
  let ext = 0;
  for (let i = 0; i < n; i++) ext = Math.max(ext, Math.hypot(coords[2 * i], coords[2 * i + 1]));
  ext = ext || 1;
  for (let i = 0; i < n; i++) {
    const x = coords[2 * i];
    const y = coords[2 * i + 1];
    const r = Math.hypot(x, y);
    const k = r > 1e-12 ? (chroma * (0.35 + 0.65 * Math.min(1, r / ext))) / r : 0;
    const [R, G, B] = oklabToRgb(lightness, x * k, y * k);
    map.set(ids[i], `rgb(${R}, ${G}, ${B})`);
  }
  return map;
}