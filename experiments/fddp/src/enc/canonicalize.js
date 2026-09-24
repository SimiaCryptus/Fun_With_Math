import { sha256 } from '../core/digest.js';
import { fail } from '../core/errors.js';

// §4.1 — reduce the source object to an octet sequence. For an image we
// composite alpha over an explicit background and RECORD that we did so;
// silently premultiplying is a reconstruction trap.
export function canonicalizeImage(imageData, background = 255) {
  const { width, height, data } = imageData;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, s = 0, d = 0; i < width * height; i++, s += 4, d += 3) {
    const a = data[s + 3] / 255;
    rgb[d]     = Math.round(data[s]     * a + background * (1 - a));
    rgb[d + 1] = Math.round(data[s + 1] * a + background * (1 - a));
    rgb[d + 2] = Math.round(data[s + 2] * a + background * (1 - a));
  }
  return { canonical: rgb, digest: sha256(rgb), width, height, alphaComposited: true };
}

export function canonicalizeBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('FDDP_E_PARAM', 'byte source must be a Uint8Array');
  return { canonical: bytes, digest: sha256(bytes) };
}

// §7.2 PAD_REFLECT, 2-D: mirror about the terminal sample, EXCLUDING it.
export function padReflectRGB(rgb, w, h, wp, hp) {
  const out = new Uint8Array(wp * hp * 3);
  const rx = (x) => x < w ? x : Math.max(0, 2 * w - 2 - x);
  const ry = (y) => y < h ? y : Math.max(0, 2 * h - 2 - y);
  for (let y = 0; y < hp; y++) {
    const sy = ry(y);
    for (let x = 0; x < wp; x++) {
      const sx = rx(x);
      const s = (sy * w + sx) * 3, d = (y * wp + x) * 3;
      out[d] = rgb[s]; out[d + 1] = rgb[s + 1]; out[d + 2] = rgb[s + 2];
    }
  }
  return out;
}

// §4.3 — flush denormals to zero before S2. This is both a bit-identity
// requirement and, per §18.3, a timing-side-channel mitigation.
export function ftz(arr) {
  for (let i = 0; i < arr.length; i++) if (Math.abs(arr[i]) < 1e-30) arr[i] = 0;
  return arr;
}

export function assertFinite(arr, policy = 'FAIL', stats = null) {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      if (policy !== 'CLAMP') fail('FDDP_E_NONFINITE', `non-finite lane sample at ${i} (§4.3)`);
      arr[i] = Math.sign(arr[i] || 1) * 3.4028234663852886e38;
      if (stats) stats.nonfinite_count++;
    }
  }
  return arr;
}