import { fail } from '../core/errors.js';
import { LANE_KIND, TRANSFORM, CHANNEL, NORM_MODE, QUANT, PAD, ANCHOR, RESOLUTION } from './registry.js';
import { WINDOW } from '../dsp/windows.js';

export const PROFILE = Object.freeze({ A: 1, B: 2, C: 3, D: 4, E: 5 });

// §6.3 Profile C, bound to 2-D per plan §2.2 and declared in XTRA/IMGD.
const C_BASE = {
  profileId: PROFILE.C, profileName: 'IMAGE_2D', domain: 'image',
  blockSize: 16, groupW: 2, groupH: 2, G: 4, S: 1,
  transform: TRANSFORM.DCT2_2D, scaling: 0x01 /* orthonormal */,
  window: WINDOW.RECT, windowParam: 0, padPolicy: PAD.REFLECT,
  anchorMode: ANCHOR.FIXED, anchorBits: 13, centered: 0, causal: 0,
  channels: [CHANNEL.SIGNED_LOGMAG],
  // §2.4 / D-03: contiguous zig-zag runs on triangular numbers ~ radial rings
  bandEdgesExplicit: [0, 1, 3, 6, 10, 15, 21, 36, 66, 136, 256],
  lanes: [
    { kind: LANE_KIND.EXOGENOUS, parent: 0xffff, name: 'Y',  offset: -127.5, scale: 1 / 127.5 },
    { kind: LANE_KIND.EXOGENOUS, parent: 0xffff, name: 'Co', offset: 0,      scale: 1 / 255 },
    { kind: LANE_KIND.EXOGENOUS, parent: 0xffff, name: 'Cg', offset: 0,      scale: 1 / 255 },
  ],
  D: 768, delta: 1e-6, quantRange: 4.0, maxTokens: 1 << 24,
};

// §6.1 Profile A, mandatory for all implementations.
// DEVIATION D-08: channels are {SIGNED_LOGMAG} rather than {LOGMAG, FLUX_T}.
// LOGMAG discards the sign of a real DCT coefficient, which makes even L1
// reconstruction of byte data meaningless. FLUX_T is available as an override.
const A_BASE = {
  profileId: PROFILE.A, profileName: 'GENERIC_BYTE', domain: 'bytes',
  N: 1024, H: 512, G: 4, S: 1,
  transform: TRANSFORM.DCT2, scaling: 0x01,
  window: WINDOW.HANN, windowParam: 0, padPolicy: PAD.ZERO,
  anchorMode: ANCHOR.FIXED, anchorBits: 13, centered: 0, causal: 0,
  channels: [CHANNEL.SIGNED_LOGMAG],
  bandScheme: 0x02 /* DYADIC */, bandJNominal: 16,
  lanes: [{ kind: LANE_KIND.U8_CENTERED, parent: 0xffff, name: 'bytes', offset: -127.5, scale: 1 / 127.5 }],
  D: 768, delta: 1e-6, quantRange: 4.0, maxTokens: 1 << 24,
};

// Presets (plan §2.3). Every declared reconstruction level is a REQUEST;
// the encoder measures and downgrades. A container never claims a level it
// did not demonstrate.
export const PRESETS = Object.freeze({
  'visual':        { base: 'C', resolution: RESOLUTION.RAGGED,          Kp: 0,  norm: NORM_MODE.PATCH_Z, quant: QUANT.AFFINE_INT8, bits: 8,  request: 'L2' },
  'analysis':      { base: 'C', resolution: RESOLUTION.RESAMPLE_FIXED,  Kp: 16, norm: NORM_MODE.PATCH_Z, quant: QUANT.AFFINE_INT8, bits: 8,  request: 'L1' },
  'analysis-tiny': { base: 'C', resolution: RESOLUTION.RESAMPLE_FIXED,  Kp: 4,  norm: NORM_MODE.PATCH_Z, quant: QUANT.AFFINE_INT4, bits: 4,  request: 'L0' },
  // D-07: f32, not f16. Log-domain f16 cannot reach L2's 1e-4 (see docs/deviations.md).
  'faithful':      { base: 'C', resolution: RESOLUTION.RAGGED,          Kp: 0,  norm: NORM_MODE.NONE,    quant: QUANT.NONE,        bits: 32, request: 'L2' },
   // D-14: centred framing (§7.2, signalled by FHDR.CENTERED) so the head of the
   // stream sits under a full window. Without it w[0] = 0 for Hann and byte 0 can
   // never be reconstructed. §21's own worked example uses CENTERED = 0; pass
   // { centered: 0 } to reproduce it.
   'bytes-a':       { base: 'A', resolution: RESOLUTION.RAGGED,          Kp: 0,  norm: NORM_MODE.PATCH_Z, quant: QUANT.AFFINE_INT8, bits: 8,  request: 'L1', centered: 1 },
   'bytes-faithful':{ base: 'A', resolution: RESOLUTION.RAGGED,          Kp: 0,  norm: NORM_MODE.NONE,    quant: QUANT.NONE,        bits: 32, request: 'L2', centered: 1 },
});

export function profileBase(letter) {
  if (letter === 'C') return { ...C_BASE };
  if (letter === 'A') return { ...A_BASE };
  fail('FDDP_E_PROFILE', `Profile ${letter} is not implemented by this build (§6)`);
}

export function profileById(id) {
  if (id === PROFILE.A) return profileBase('A');
  if (id === PROFILE.C) return profileBase('C');
  fail('FDDP_E_PROFILE', `profile id ${id} unknown or unsupported`);
}