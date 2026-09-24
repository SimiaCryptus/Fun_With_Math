import { dequantize } from '../enc/quantize.js';
import { NormState } from '../enc/normalize.js';
import { invSignedLogMag, invLogMag } from '../enc/channels.js';
import { idct2d, dct3 } from '../dsp/dct.js';
import { zigzagOrder } from '../dsp/zigzag.js';
import { expandNN, slotsEnergy } from '../dsp/resample.js';
import { yCoCgRToRgb } from '../enc/colorspace.js';
import { buildLayout } from '../container/layout.js';
import { fromF16 } from '../core/f16.js';
import { makeWindow } from '../dsp/windows.js';
import { RESOLUTION } from '../core/registry.js';
import { fail, check } from '../core/errors.js';
import { roundHalfEven } from '../core/roundeven.js';

function unpackSide(bytes, o) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + o, 8);
  return { mean: fromF16(dv.getUint16(0, true)), logScale: fromF16(dv.getUint16(2, true)),
           validFrac: dv.getUint8(4), flags: dv.getUint8(5), cohere: fromF16(dv.getUint16(6, true)) };
}

// §13.2 — the inverse pipeline in reverse stage order.
// Works from EITHER an in-memory patch list (encoder self-verification) or a
// parsed container's DATA view. One implementation, two entry points: the
// self-check therefore exercises the real decoder, not a shadow of it.
export function decodePatchesFromData(dataView, eps, nPatches) {
  const layout = buildLayout(eps);
  const expected = layout.totalBytes(nPatches);
  if (dataView.length !== expected)
    fail('FDDP_E_COUNT_MISMATCH',
         `DATA is ${dataView.length} bytes, ${nPatches} patches require ${expected}`);
  const out = [];
  for (let i = 0; i < nPatches; i++) {
    const off = layout.patchOffset(i);
    const coord = layout.patchCoord(i);
    const side = unpackSide(dataView, off);
    const u = dequantize(dataView, off + 8, layout.counts[coord.j], eps);
    out.push({ coord, side, u });
  }
  return out;
}

// Steps 1-4 for one (group, lane): dequantised units -> G per-frame linear spectra.
// Returns the denormalised tiles' replay values so the caller can move state.
function recomposeGroup(units, base, eps, norm, frames) {
  const edges = eps.bandEdges, ragged = eps.resolution === RESOLUTION.RAGGED;
  for (let j = 0; j < eps.J; j++) {
    const rec = units[base + j];
    const k0 = edges[j], k1 = edges[j + 1], W = k1 - k0;
    // step 2: denormalise (RUNNING_Z: the side-channel is authoritative; the
    // replayed state must PREDICT it, and the causality test asserts it does)
    const v = norm.denormalize(rec.u, rec.side);
    for (let f = 0; f < eps.G; f++) {
      if (ragged) {
        for (let p = 0; p < W; p++)
          frames[f][k0 + p] = invSignedLogMag(v[(f * W + p) * eps.C], eps.delta);
      } else {
        // step 3: un-tile -- NN expand, then rescale to the decoded band energy
        const lin = new Float64Array(eps.Kp);
        for (let p = 0; p < eps.Kp; p++) lin[p] = invLogMag(v[(f * eps.Kp + p) * eps.C], eps.delta);
        const target = slotsEnergy(lin, W);
        const full = expandNN(lin, W, target);
        for (let p = 0; p < W; p++) frames[f][k0 + p] = full[p];   // sign unavailable: L0/L1
      }
    }
    norm.update(v, rec.coord);            // same post-emit, reconstructed-value schedule as the encoder
  }
}

export function decodeToPixels(units, eps, imgd) {
  check(imgd.blockSize === eps.blockSize && imgd.groupW === eps.groupW && imgd.groupH === eps.groupH,
        'FDDP_E_PARAM', `IMGD geometry (${imgd.blockSize}, ${imgd.groupW}x${imgd.groupH}) differs from the EPS (D-01)`);
  check(eps.L === 3, 'FDDP_E_PARAM', 'Profile C binding requires exactly three colour lanes (D-01)');
  const bs = imgd.blockSize, K = bs * bs;
  const zz = zigzagOrder(bs);
  const wp = imgd.widthPad, hp = imgd.heightPad;
  check(wp % (bs * imgd.groupW) === 0 && hp % (bs * imgd.groupH) === 0 && wp >= imgd.width && hp >= imgd.height,
        'FDDP_E_PARAM', 'IMGD padded extent is not quad-aligned');
  const Wb = wp / bs, Gw = Wb / imgd.groupW;
  const n = wp * hp;
  const planes = [new Int16Array(n), new Int16Array(n), new Int16Array(n)];
  const norm = new NormState(eps);
  const spec = new Float64Array(K), block = new Float64Array(K), scratch = new Float64Array(K);
  let clampCount = 0;

  // patches arrive in canonical order: group-major, then lane, then band
  const perGroupLane = eps.J;
  const nGroupLane = units.length / perGroupLane;
  const quad = [];
  for (let f = 0; f < eps.G; f++) quad.push(new Float64Array(K));
  for (let gl = 0; gl < nGroupLane; gl++) {
    const base = gl * perGroupLane;
    const { l, g } = units[base].coord;
    for (const q of quad) q.fill(0);
    recomposeGroup(units, base, eps, norm, quad);
    const gy = Math.floor(g / Gw), gx = g % Gw;
    const lane = eps.lanes[l];
    const lo = l === 0 ? 0 : -255, hi = 255;
    for (let f = 0; f < eps.G; f++) {
      for (let k = 0; k < K; k++) spec[zz.order[k]] = quad[f][k];  // inverse zig-zag
      idct2d(spec, bs, bs, block, scratch);                        // step 5
      const by = gy * imgd.groupH + Math.floor(f / imgd.groupW);
      const bx = gx * imgd.groupW + (f % imgd.groupW);
      for (let r = 0; r < bs; r++) {
        const d = (by * bs + r) * wp + bx * bs;
        for (let c = 0; c < bs; c++) {
          const val = block[r * bs + c] / lane.scale - lane.offset;  // step 7: un-project
          const iv = roundHalfEven(val);
          if (iv < lo || iv > hi) clampCount++;
          planes[l][d + c] = Math.max(lo, Math.min(hi, iv));
        }
      }
    }
  }
  const rgbPad = yCoCgRToRgb(planes[0], planes[1], planes[2], n);
  // un-pad back to the canonical stream geometry
  const rgb = new Uint8Array(imgd.width * imgd.height * 3);
  for (let y = 0; y < imgd.height; y++)
    rgb.set(rgbPad.subarray((y * wp) * 3, (y * wp + imgd.width) * 3), y * imgd.width * 3);
  return { rgb, clampCount };
}

export function decodeToBytes(units, eps, bytd) {
  if (eps.resolution !== RESOLUTION.RAGGED)
    fail('FDDP_E_NO_RECONSTRUCT', 'byte reconstruction requires RAGGED tiling (RESAMPLE_FIXED discards coefficient sign)');
  if (eps.L !== 1)
    fail('FDDP_E_NO_RECONSTRUCT', 'multi-lane byte reconstruction is not implemented by this build');
  const T = bytd.T, N = eps.N, H = eps.H;
  const head = eps.centered ? N >> 1 : 0;           // §7.2: FHDR.CENTERED shifts every sample by N/2
  const Mpad = N + (T - 1) * H;
  check(bytd.length + head <= Mpad, 'FDDP_E_COUNT_MISMATCH',
        `BYTD claims ${bytd.length} octets but ${T} frames span only ${Mpad - head}`);
  const acc = new Float64Array(Mpad);
  const den = new Float64Array(Mpad);               // §13.2 step 6: OLA normaliser, built from the
                                                    // frames that actually exist (head AND tail ramps)
  const w = makeWindow(eps.window, N, eps.windowParam);
  const norm = new NormState(eps);
  const frames = [];
  for (let f = 0; f < eps.G; f++) frames.push(new Float64Array(N));

  const perGroupLane = eps.J;
  const nGroupLane = units.length / perGroupLane;
  for (let gl = 0; gl < nGroupLane; gl++) {
    const base = gl * perGroupLane;
    const { g } = units[base].coord;
    for (const fr of frames) fr.fill(0);
    recomposeGroup(units, base, eps, norm, frames);
    for (let f = 0; f < eps.G; f++) {
      const t = g * eps.G + f;
      if (t >= T) continue;                         // trailing zero frames of the last group
      const xw = dct3(frames[f]);                   // step 5
      const off = t * H;
      for (let n = 0; n < N; n++) { acc[off + n] += xw[n]; den[off + n] += w[n]; }   // synthesis window = 1 (OLA)
    }
  }
  const out = new Uint8Array(bytd.length);
  const lane = eps.lanes[0];
  let clampCount = 0;
  for (let i = 0; i < bytd.length; i++) {
    const p = i + head, d = den[p];
    const val = d > 1e-12 ? acc[p] / d : 0;         // w[0] = 0 for Hann: only CENTERED avoids this hole
    const iv = roundHalfEven(val / lane.scale - lane.offset);
    if (iv < 0 || iv > 255) clampCount++;
    out[i] = Math.max(0, Math.min(255, iv));
  }
  return { bytes: out, clampCount };
}