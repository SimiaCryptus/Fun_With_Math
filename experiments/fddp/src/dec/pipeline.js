import { encode } from '../enc/encoder.js';
import { writeContainer } from '../container/writer.js';
import { readContainer } from '../container/reader.js';
import { FLAG } from '../container/fhdr.js';
import { decodePatchesFromData, decodeToPixels, decodeToBytes } from './decoder.js';
import { buildLayout } from '../container/layout.js';
import { resolveEPS } from '../core/eps.js';
import { PRESETS, PROFILE } from '../core/profiles.js';
import { RESOLUTION } from '../core/registry.js';
import { relativeRMS, psnr, byteEqual, spectralConvergenceRGB, scDb,
         determineLevel, bitsPerSourceOctet } from './metrics.js';
import { fail, check } from '../core/errors.js';
import { hex } from '../core/digest.js';

// §14.2 — algorithmic latency is REPORTED through the header, not measured.
export function latencySamples(eps) {
  if (eps.domain === 'bytes') return eps.N + (eps.G - 1) * eps.H + (eps.centered ? eps.N >> 1 : 0);
  // Profile C binding (D-01): a block quad commits after groupH block-rows; the
  // unit is pixel rows, since "samples" has no other meaning for a 2-D raster.
  return eps.blockSize * eps.groupH;
}

// Encode, then DECODE OUR OWN OUTPUT, measure, and only then declare a level.
export function encodeVerified(input, eps, hooks = {}) {
  const result = encode(input, eps, hooks);
  const layout = buildLayout(eps);
  const dataBytes = layout.totalBytes(result.patches.length);
  const latency = latencySamples(eps);

  // Round-trip through the real DATA serialisation so the self-check cannot
  // pass on a representation the container never actually carries.
  const provisional = writeContainer(result, eps, { achievedLevel: 0, latency });
  const parsed = readContainer(provisional);
  const units = decodePatchesFromData(parsed.dataView, eps, result.patches.length);

  let metrics, recon, level;
  if (eps.domain === 'image') {
    const imgd = parsed.xtra.find(x => x.sub === 'IMGD');
    if (!imgd) fail('FDDP_E_NO_RECONSTRUCT', 'XTRA/IMGD absent; geometry unknown (D-01)');
    const { rgb, clampCount } = decodeToPixels(units, eps, imgd);
    recon = rgb;
    const exact = byteEqual(result.canonical, rgb);
    const relRMS = relativeRMS(result.canonical, rgb);
    const sc = spectralConvergenceRGB(result.canonical, rgb, imgd.width, imgd.height);
    // D-12: `exact: false` on purpose -- DCT-II is not an integer-exact transform,
    // so byte equality is reported in STAT but never promoted to L3.
    level = determineLevel({ relRMS, sc, exact: false, payloadBits: eps.quant.bits,
                             request: eps.requestedLevel });
    metrics = {
      relRMS, psnr: psnr(result.canonical, rgb), spectralConvergence: sc,
      spectralConvergenceDb: scDb(sc), byteExact: exact, clampCount,
      bitsPerSourceOctet: bitsPerSourceOctet(dataBytes, result.canonical.length),
      tokens: result.patches.length, dataBytes,
    };
  } else {
    const bytd = parsed.xtra.find(x => x.sub === 'BYTD');
    if (!bytd) fail('FDDP_E_NO_RECONSTRUCT', 'XTRA/BYTD absent; framing unknown');
    let bytes = null, relRMS = 1, exact = false, clampCount = 0;
    try {
      ({ bytes, clampCount } = decodeToBytes(units, eps, bytd));
      relRMS = relativeRMS(result.canonical, bytes);
      exact = byteEqual(result.canonical, bytes);
    } catch (e) {
      if (e.code !== 'FDDP_E_NO_RECONSTRUCT') throw e;      // no silent swallow
    }
    recon = bytes;
    level = bytes ? determineLevel({ relRMS, sc: relRMS, exact: false,
                                     payloadBits: eps.quant.bits }) : 0;
    metrics = { relRMS, byteExact: exact, clampCount, tokens: result.patches.length, dataBytes,
                bitsPerSourceOctet: bitsPerSourceOctet(dataBytes, result.canonical.length) };
  }

  const requested = { L0: 0, L1: 1, L2: 2, L3: 3 }[eps.requestedLevel] ?? 0;
  metrics.requestedLevel = requested;
  metrics.achievedLevel = level;
  metrics.downgraded = level < requested;

  const container = writeContainer(result, eps, {
    achievedLevel: level, latency, metrics, encoderId: 'fddp-web/1.0.0',
  });

  return { result, container, metrics, recon, level, latency, sourceDigest: hex(result.digest) };
}

// §16.2: a decoder reconstructs the EPS from the container's own descriptors.
// The preset is only a LABEL; nothing about decoding depends on finding one.
function epsFromContainer(parsed) {
  const pid = parsed.fhdr.profile_id;
  const isBytes = pid === PROFILE.A;
  check(isBytes || pid === PROFILE.C, 'FDDP_E_PROFILE', `profile id ${pid} unsupported by this build`);
  check(parsed.xfrm.length >= 1, 'FDDP_E_TRUNCATED', 'XFRM carries no scale');
  const x0 = parsed.xfrm[0];
  const ragged = parsed.fhdr.Kp === 0;
  const overrides = {
    resolution: ragged ? RESOLUTION.RAGGED : RESOLUTION.RESAMPLE_FIXED,
    Kp: parsed.fhdr.Kp,
    normMode: parsed.norm.mode, lambda: parsed.norm.lambda, quantRange: parsed.norm.quantRange,
    quantBits: parsed.quan.bits, quantScheme: parsed.quan.scheme,
    bandScheme: parsed.band.scheme, bandEdgesExplicit: Array.from(parsed.band.edges),
    channels: parsed.chan,
    centered: (parsed.fhdr.flags & FLAG.CENTERED) ? 1 : 0,
    causal: (parsed.fhdr.flags & FLAG.CAUSAL) ? 1 : 0,
    D: parsed.fhdr.D,
    transform: x0.transform, scaling: x0.scaling,
  };
  if (isBytes) Object.assign(overrides, { N: x0.Nr, H: x0.Hr, window: x0.window, windowParam: x0.windowParam });
  const eps = resolveEPS(isBytes ? 'bytes-a' : 'visual', overrides);
  check(parsed.fhdr.G === eps.G && parsed.fhdr.L === eps.L && parsed.fhdr.C === eps.C,
        'FDDP_E_PARAM', `FHDR geometry (G=${parsed.fhdr.G}, L=${parsed.fhdr.L}, C=${parsed.fhdr.C}) disagrees with the descriptor chunks`);
  check(parsed.lane.length === eps.L, 'FDDP_E_PARAM', 'LANE count disagrees with FHDR.L');
  const presetName = Object.keys(PRESETS).find(k => {
    try {
      const e = resolveEPS(k);
      return e.profileId === eps.profileId && e.resolution === eps.resolution && e.Kp === eps.Kp
          && e.norm.mode === eps.norm.mode && e.quant.scheme === eps.quant.scheme
          && e.quant.bits === eps.quant.bits && e.centered === eps.centered;
    } catch (e) { return false; }                   // an unresolvable preset simply is not the label
  });
  return { eps, presetName: presetName || null };
}

export function decodeContainer(bytes) {
  const parsed = readContainer(bytes);
  const { eps, presetName } = epsFromContainer(parsed);

  const layout = buildLayout(eps);
  const nPatches = Math.round(parsed.dataView.length / layout.perGroup) * (eps.J * eps.L);
  if (nPatches !== parsed.fhdr.token_count) {
    // Advisory, per §18.1 -- but a mismatch is still reported, never absorbed.
    parsed.tokenCountMismatch = { header: parsed.fhdr.token_count, actual: nPatches };
  }
  const units = decodePatchesFromData(parsed.dataView, eps, nPatches);
  const declaredLevel = parsed.fhdr.reconstruction_level;
  const common = { parsed, eps, presetName, units, declaredLevel };

  if (parsed.fhdr.flags & FLAG.NO_RECONSTRUCT)
    return { ...common, note: 'container declares NO_RECONSTRUCT: lane set is analysis-only (§13.3)' };

  const imgd = parsed.xtra.find(x => x.sub === 'IMGD');
  if (imgd) {
    const { rgb, clampCount } = decodeToPixels(units, eps, imgd);
    return { ...common, rgb, width: imgd.width, height: imgd.height, clampCount,
             note: declaredLevel === 0 ? 'declared L0: reconstruction shown is best-effort analysis output (§13.1)' : '' };
  }
  const bytd = parsed.xtra.find(x => x.sub === 'BYTD');
  if (bytd) {
    const { bytes: out, clampCount } = decodeToBytes(units, eps, bytd);
    return { ...common, bytes: out, clampCount };
  }
  fail('FDDP_E_NO_RECONSTRUCT', 'no geometry descriptor (XTRA/IMGD or XTRA/BYTD) present');
}