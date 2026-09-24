export const LANE_KIND = Object.freeze({
  U8_CENTERED: 0x01, U8_BITPLANE: 0x02, I16LE: 0x03, I16BE: 0x04, F32LE: 0x05,
  DELTA: 0x06, NGRAM_HASH: 0x07, ENTROPY: 0x08, MASK: 0x09, EXOGENOUS: 0x0A,
});
export const NON_INVERTIBLE = Object.freeze([LANE_KIND.ENTROPY, LANE_KIND.NGRAM_HASH]);

export const TRANSFORM = Object.freeze({
  DCT2: 0x01, RFFT: 0x02, MDCT: 0x03, DWT: 0x04, WHT: 0x05,
  MEL_RFFT: 0x06, CQT: 0x07, DCT2_2D: 0x08,
});
export const IMPLEMENTED_TRANSFORMS = Object.freeze([TRANSFORM.DCT2, TRANSFORM.RFFT, TRANSFORM.DCT2_2D]);

export const CHANNEL = Object.freeze({
  LOGMAG: 0x01, SIGNED_LOGMAG: 0x02, PHI_COS: 0x03, PHI_SIN: 0x04, IF: 0x05,
  GD: 0x06, FLUX_T: 0x07, FLUX_K: 0x08, VALID: 0x09, COHERE: 0x0A,
  LINEAR_PEAK: 0x80,                // private use, §20 -> non-interchange (D-04)
});

export const NORM_MODE = Object.freeze({
  GLOBAL_Z: 0x01, RUNNING_Z: 0x02, PATCH_Z: 0x03, PEAK: 0x04, NONE: 0x05,
});

export const QUANT = Object.freeze({
  NONE: 0x00, AFFINE_INT8: 0x01, AFFINE_INT4: 0x02, MU_LAW8: 0x03, VQ: 0x04, RVQ: 0x05,
});

export const PAD = Object.freeze({ ZERO: 0, REFLECT: 1, WRAP: 2, DROP: 3 });
export const ANCHOR = Object.freeze({ FIXED: 0, CDC: 1 });
export const RESOLUTION = Object.freeze({ RESAMPLE_FIXED: 'RESAMPLE_FIXED', RAGGED: 'RAGGED' });

export const LIMITS = Object.freeze({
  MAX_TOKENS: 1 << 24, MAX_EXPANSION: 64, MAX_CHUNK: 0x7fffffff,
  MAX_SEGMENTS: 1 << 20, MAX_N: 65536, MAX_LANES_CORE: 64, MAX_LANES_FULL: 512,
});

export const PRIVATE_USE = (id) => id >= 0x80 && id <= 0xfe;