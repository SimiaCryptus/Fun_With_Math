import { fail, check } from './errors.js';
import { PRESETS, profileBase } from './profiles.js';
import { bandEdges, mergeDegenerate, validateEdges, BAND_SCHEME } from '../dsp/bands.js';
import { makeWindow, verifyCola } from '../dsp/windows.js';
import { LIMITS, IMPLEMENTED_TRANSFORMS, QUANT, NORM_MODE, RESOLUTION, PRIVATE_USE, CHANNEL } from './registry.js';
import { sha256, hex } from './digest.js';

// Typed arrays cannot be frozen (Object.freeze throws "Cannot freeze array
// buffer views with elements"); they are immutable by convention in the EPS.
function deepFreeze(o) {
  if (ArrayBuffer.isView(o)) return o;
  for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]);
  return Object.freeze(o);
}

// This build constructs exactly one channel per bin: SIGNED_LOGMAG for RAGGED
// tiling and LOGMAG for RESAMPLE_FIXED (the area average discards sign).
const IMPLEMENTED_CHANNELS = [CHANNEL.LOGMAG, CHANNEL.SIGNED_LOGMAG];

export function resolveEPS(presetName, overrides = {}) {
  const preset = PRESETS[presetName];
  if (!preset) fail('FDDP_E_PROFILE', `unknown preset "${presetName}"`);
  const eps = profileBase(preset.base);

  eps.presetName = presetName;
  eps.resolution = preset.resolution;
  eps.Kp = preset.Kp;
  eps.norm = { mode: preset.norm, lambda: 64, quantRange: eps.quantRange };
  eps.quant = { scheme: preset.quant, bits: preset.bits };
  eps.requestedLevel = preset.request;
  if (preset.centered !== undefined) eps.centered = preset.centered;
  eps.overrides = {};

  for (const [k, v] of Object.entries(overrides)) {
    eps.overrides[k] = v;                       // §6: each override recorded explicitly
    if (k === 'Kp') eps.Kp = v;
    else if (k === 'quantBits') {
      eps.quant.bits = v;
      eps.quant.scheme = v === 4 ? QUANT.AFFINE_INT4 : v === 8 ? QUANT.AFFINE_INT8 : QUANT.NONE;
    }
    else if (k === 'quantScheme') eps.quant.scheme = v;
    else if (k === 'normMode') eps.norm.mode = v;
    else if (k === 'lambda') eps.norm.lambda = v;
    else if (k === 'quantRange') { eps.norm.quantRange = v; eps.quantRange = v; }
    else eps[k] = v;
  }

  // ---- derived geometry -------------------------------------------------
  if (eps.domain === 'image') {
    eps.K = eps.blockSize * eps.blockSize;
    eps.bandEdges = mergeDegenerate(Uint32Array.from(eps.bandEdgesExplicit));
    eps.bandScheme = BAND_SCHEME.EXPLICIT;
    eps.G = eps.groupW * eps.groupH;
    eps.alignW = eps.blockSize * eps.groupW;    // pad to whole quads of blocks
    eps.alignH = eps.blockSize * eps.groupH;
  } else {
    check(Number.isInteger(Math.log2(eps.N)) && eps.N >= 64 && eps.N <= LIMITS.MAX_N,
          'FDDP_E_PARAM', `N=${eps.N} must be a power of two in [64,65536] (§7.1)`);
    check(eps.H >= 1 && eps.H <= eps.N, 'FDDP_E_PARAM', `H=${eps.H} outside [1,N] (§7.1)`);
    eps.K = eps.N;
    if (eps.bandEdgesExplicit) {
      // §10.1: a transported (merged) edge array always wins over the generating rule.
      eps.bandEdges = mergeDegenerate(Uint32Array.from(eps.bandEdgesExplicit));
      if (!('bandScheme' in overrides)) eps.bandScheme = BAND_SCHEME.EXPLICIT;
    } else {
      eps.bandEdges = bandEdges(eps.bandScheme, { K: eps.K, J: eps.bandJNominal });
    }
  }
  eps.J = validateEdges(eps.bandEdges, eps.K);

  // D-15: RESAMPLE_FIXED area-averages |X|, so the channel it actually emits is
  // LOGMAG. Declare what is emitted, not what was requested.
  if (eps.resolution === RESOLUTION.RESAMPLE_FIXED)
    eps.channels = eps.channels.map(c => c === CHANNEL.SIGNED_LOGMAG ? CHANNEL.LOGMAG : c);
  eps.C = eps.channels.length;
  eps.L = eps.lanes.length;

  // ---- normative validation --------------------------------------------
  check(IMPLEMENTED_TRANSFORMS.includes(eps.transform), 'FDDP_E_PARAM',
        `transform 0x${eps.transform.toString(16)} not implemented by this build (§8.1)`);
  check(eps.L >= 1 && eps.L <= LIMITS.MAX_LANES_CORE, 'FDDP_E_LANE_BUDGET',
        `L=${eps.L} exceeds Core limit ${LIMITS.MAX_LANES_CORE} (§5.3)`);
  check(eps.D % 8 === 0, 'FDDP_E_PARAM', 'D must be divisible by 8 (§12.2)');
  check(eps.centered === 0 || eps.centered === 1, 'FDDP_E_PARAM', 'CENTERED must be 0 or 1 (§7.2)');
  check(eps.C === 1 && IMPLEMENTED_CHANNELS.includes(eps.channels[0]), 'FDDP_E_PARAM',
        `channel set [${eps.channels.map(c => '0x' + c.toString(16)).join(',')}] not implemented by this build (§9.1)`);
  const q = eps.quant;
  if (q.scheme === QUANT.VQ || q.scheme === QUANT.RVQ)
    fail('FDDP_E_CODEBOOK_MISSING', 'VQ/RVQ requires a codebook this build cannot resolve (§11.4)');
  check((q.scheme === QUANT.NONE && (q.bits === 16 || q.bits === 32))
     || (q.scheme === QUANT.AFFINE_INT8 && q.bits === 8)
     || (q.scheme === QUANT.AFFINE_INT4 && q.bits === 4),
        'FDDP_E_PARAM', `quantiser 0x${q.scheme.toString(16)} with a ${q.bits}-bit payload is not implemented by this build (§11.3)`);
  if (q.scheme !== QUANT.NONE && eps.norm.mode === NORM_MODE.NONE)
    fail('FDDP_E_PARAM',
         'integer quantisation with NORM=NONE has no transportable per-patch scale in the 8-byte side-channel (§11.2, D-06)');
  check(Object.values(NORM_MODE).includes(eps.norm.mode), 'FDDP_E_PARAM',
        `normalization mode 0x${eps.norm.mode.toString(16)} unknown (§11.1)`);
  if (eps.resolution === RESOLUTION.RESAMPLE_FIXED)
    check(eps.Kp > 0, 'FDDP_E_PARAM', 'RESAMPLE_FIXED requires K_p > 0');
  for (const c of eps.channels)
    if (PRIVATE_USE(c)) eps.nonInterchange = true;              // §20 / D-04

  // §7.4 — verify COLA numerically even when it is trivially satisfied
  // (rectangular window, H = N). Exercising the path is the point.
  if (eps.domain === 'bytes') {
    const w = makeWindow(eps.window, eps.N, eps.windowParam);
    eps.colaCheck = verifyCola(w, eps.H, 1);
  } else {
    const w = makeWindow(eps.window, eps.blockSize, 0);
    eps.colaCheck = verifyCola(w, eps.blockSize, 1);
  }

  return deepFreeze(eps);
}

export function epsDigest(eps) {
  const json = JSON.stringify(eps, (k, v) =>
    ArrayBuffer.isView(v) ? Array.from(v) : v);
  return hex(sha256(new TextEncoder().encode(json)));
}

export function epsToJSON(eps) {
  return JSON.stringify(eps, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v, 2);
}