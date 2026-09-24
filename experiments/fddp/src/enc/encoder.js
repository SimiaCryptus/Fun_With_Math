import { canonicalizeImage, canonicalizeBytes, padReflectRGB, ftz } from './canonicalize.js';
import { rgbToYCoCgR } from './colorspace.js';
import { extractBlock, frameGeometry, padLane } from './framing.js';
import { dct2d, dct2 } from '../dsp/dct.js';
import { zigzagOrder } from '../dsp/zigzag.js';
import { areaAverage } from '../dsp/resample.js';
import { signedLogMag, logMag } from './channels.js';
import { NormState } from './normalize.js';
import { quantize } from './quantize.js';
import { makeWindow } from '../dsp/windows.js';
import { RESOLUTION, LIMITS } from '../core/registry.js';
import { check } from '../core/errors.js';

// S0..S7. Stages are executed in the §3 order; the only fusion is the
// per-band loop, which is bit-identical to the staged form.
export function encode(input, eps, hooks = {}) {
  return eps.domain === 'image'
    ? encodeImage(input.imageData, eps, hooks)
    : encodeBytes(input.bytes, eps, hooks);
}

function newStats() { return { nonfinite_count: 0, clamp_count: 0 }; }

// S6 -> S7 -> emit -> state update. Shared by both domains so the §11.1
// ordering exists in exactly one place and cannot drift.
function emitPatch(tile, coord, eps, norm, stats, patches, hooks) {
  const { tile: u, side } = norm.apply(tile, coord);
  const body = quantize(u, eps, stats);
  const rec = { coord, side, body: body.data, bodyBits: body.bits, count: tile.length };
  patches.push(rec);                                 // observable effect happens here
  if (hooks.onPatch) hooks.onPatch(rec);
  // ONLY now does state move -- and on what the decoder will actually see
  // (dequantised, denormalised), so the §13.2 replay is exact under quantisation.
  norm.update(norm.denormalize(body.recon, side), coord);
}

// Build one ragged-or-resampled tile from G per-frame spectra for band [k0,k1).
function buildTile(spectra, k0, k1, eps) {
  const W = k1 - k0, ragged = eps.resolution === RESOLUTION.RAGGED;
  const slots = ragged ? W : eps.Kp;
  const tile = new Float64Array(eps.G * slots * eps.C);
  for (let f = 0; f < eps.G; f++) {
    const z = spectra[f];
    if (ragged) {
      for (let p = 0; p < W; p++) tile[(f * W + p) * eps.C] = signedLogMag(z[k0 + p], eps.delta);
    } else {
      // §10.2: area-average LINEAR magnitudes, THEN compress.
      const lin = new Float64Array(W);
      for (let p = 0; p < W; p++) lin[p] = Math.abs(z[k0 + p]);
      const avg = areaAverage(lin, 0, W, eps.Kp);
      for (let p = 0; p < eps.Kp; p++) tile[(f * eps.Kp + p) * eps.C] = logMag(avg[p], eps.delta);
    }
  }
  return tile;
}

// ---------------------------------------------------------------- image ---
function encodeImage(imageData, eps, hooks) {
  const stats = newStats();
  const { canonical, digest, width, height } = canonicalizeImage(imageData);
  check(width > 0 && height > 0, 'FDDP_E_PARAM', 'empty image');
  const wp = Math.ceil(width / eps.alignW) * eps.alignW;
  const hp = Math.ceil(height / eps.alignH) * eps.alignH;
  const padded = padReflectRGB(canonical, width, height, wp, hp);
  const planes = rgbToYCoCgR(padded, wp * hp);
  const lanePlanes = [planes.Y, planes.Co, planes.Cg];

  const bs = eps.blockSize, K = eps.K;
  const Wb = wp / bs, Hb = hp / bs;
  const Gw = Wb / eps.groupW, Gh = Hb / eps.groupH;
  const nGroups = Gw * Gh;
  const tokenCount = nGroups * eps.L * eps.J;

  // §10.3 — compute the token total BEFORE emitting data, before allocation.
  check(tokenCount <= Math.min(eps.maxTokens, LIMITS.MAX_TOKENS), 'FDDP_E_TOKEN_BUDGET',
        `${tokenCount} tokens exceeds MAX_TOKENS`);

  const zz = zigzagOrder(bs);
  const block = new Float64Array(K);
  const spec = new Float64Array(K);
  const scratch = new Float64Array(K);
  const norm = new NormState(eps);
  const patches = [];
  const edges = eps.bandEdges;

  // §10.4 canonical emission order: segment, scale, time-group, lane, band.
  for (let g = 0; g < nGroups; g++) {
    const gy = Math.floor(g / Gw), gx = g % Gw;
    for (let l = 0; l < eps.L; l++) {
      const lane = eps.lanes[l];
      const quad = [];
      for (let q = 0; q < eps.G; q++) {           // row-major within the quad (D-01)
        const by = gy * eps.groupH + Math.floor(q / eps.groupW);
        const bx = gx * eps.groupW + (q % eps.groupW);
        extractBlock(lanePlanes[l], wp, bx, by, bs, lane.offset, lane.scale, block);
        ftz(block);
        dct2d(block, bs, bs, spec, scratch);
        const z = new Float64Array(K);
        for (let k = 0; k < K; k++) z[k] = spec[zz.order[k]];   // bin k == zig-zag index
        quad.push(z);
      }
      for (let j = 0; j < eps.J; j++) {
        const tile = buildTile(quad, edges[j], edges[j + 1], eps);
        emitPatch(tile, { s: 0, l, g, j, segment: 0 }, eps, norm, stats, patches, hooks);
      }
    }
    if (hooks.onProgress && (g & 63) === 0) hooks.onProgress(g / nGroups);
  }

  return {
    patches, tokenCount, canonical, digest, stats,
    meta: { domain: 'image', width, height, widthPad: wp, heightPad: hp, Wb, Hb, Gw, Gh, nGroups },
    eps,
  };
}

// ---------------------------------------------------------------- bytes ---
function encodeBytes(bytes, eps, hooks) {
  const stats = newStats();
  const { canonical, digest } = canonicalizeBytes(bytes);
  check(canonical.length > 0, 'FDDP_E_PARAM', 'empty byte source');
  const lane0 = eps.lanes[0];
  const head = eps.centered ? eps.N >> 1 : 0;       // §7.2 centred framing (FHDR.CENTERED)
  const x = new Float64Array(head + canonical.length);
  for (let i = 0; i < canonical.length; i++) x[head + i] = (canonical[i] + lane0.offset) * lane0.scale;
  ftz(x);

  const { T, Mpad } = frameGeometry(x.length, eps.N, eps.H, eps.padPolicy);
  const xp = padLane(x, Mpad, eps.padPolicy);
  const w = makeWindow(eps.window, eps.N, eps.windowParam);
  const nGroups = Math.ceil(T / eps.G);
  const tokenCount = nGroups * eps.L * eps.J;
  check(tokenCount <= Math.min(eps.maxTokens, LIMITS.MAX_TOKENS), 'FDDP_E_TOKEN_BUDGET',
        `${tokenCount} tokens exceeds MAX_TOKENS`);

  const spectra = [];
  const frame = new Float64Array(eps.N);
  for (let t = 0; t < T; t++) {
    const off = t * eps.H;
    for (let n = 0; n < eps.N; n++) frame[n] = xp[off + n] * w[n];
    spectra.push(dct2(frame));
  }
  const zero = new Float64Array(eps.N);

  const norm = new NormState(eps);
  const patches = [];
  const edges = eps.bandEdges;

  for (let g = 0; g < nGroups; g++) {
    const group = [];
    for (let f = 0; f < eps.G; f++) { const t = g * eps.G + f; group.push(t < T ? spectra[t] : zero); }
    for (let l = 0; l < eps.L; l++) {
      for (let j = 0; j < eps.J; j++) {
        const tile = buildTile(group, edges[j], edges[j + 1], eps);
        emitPatch(tile, { s: 0, l, g, j, segment: 0 }, eps, norm, stats, patches, hooks);
      }
    }
    if (hooks.onProgress && (g & 63) === 0) hooks.onProgress(g / nGroups);
  }
  return {
    patches, tokenCount, canonical, digest, stats,
    meta: { domain: 'bytes', length: canonical.length, T, nGroups, Mpad, head },
    eps,
  };
}