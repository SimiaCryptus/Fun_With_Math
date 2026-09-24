import { roundHalfEven } from '../core/roundeven.js';
import { toF16, fromF16 } from '../core/f16.js';
import { packNibbles, unpackNibbles } from '../core/bits.js';
import { QUANT } from '../core/registry.js';
import { fail } from '../core/errors.js';

// §11.3. Every round in this file is roundHalfEven. Delta is derived from the
// EPS quantRange and the (transported) per-patch normaliser, so no extra
// side-channel field is needed and the decoder reproduces it exactly (D-06).
export function quantDelta(eps) {
  switch (eps.quant.scheme) {
    case QUANT.AFFINE_INT8: return eps.norm.quantRange / 127;
    case QUANT.AFFINE_INT4: return eps.norm.quantRange / 7;
    default: return 1;
  }
}

// Returns the payload AND `recon`, the values a decoder will recover from that
// payload. The encoder feeds `recon` -- never `u` -- to its running statistics,
// so encoder and decoder replay the identical EMA schedule (§11.1, §13.2 step 2).
export function quantize(u, eps, stats) {
  const scheme = eps.quant.scheme;
  if (scheme === QUANT.NONE) {
    if (eps.quant.bits === 32) {
      const d = Float32Array.from(u);
      return { data: d, bits: 32, count: u.length, recon: Float64Array.from(d) };
    }
    if (eps.quant.bits === 16) {
      const d = new Uint16Array(u.length), recon = new Float64Array(u.length);
      for (let i = 0; i < u.length; i++) { d[i] = toF16(u[i]); recon[i] = fromF16(d[i]); }
      return { data: d, bits: 16, count: u.length, recon };
    }
    fail('FDDP_E_PARAM', `unquantised payload width ${eps.quant.bits} unsupported`);
  }
  const D = quantDelta(eps);
  const lim = scheme === QUANT.AFFINE_INT8 ? [-128, 127] : [-8, 7];
  const q = new Int8Array(u.length);
  const recon = new Float64Array(u.length);
  for (let i = 0; i < u.length; i++) {
    let v = roundHalfEven(u[i] / D);
    if (v < lim[0]) { v = lim[0]; if (stats) stats.clamp_count++; }
    else if (v > lim[1]) { v = lim[1]; if (stats) stats.clamp_count++; }
    q[i] = v;
    recon[i] = v * D;
  }
  if (scheme === QUANT.AFFINE_INT4) return { data: packNibbles(q), bits: 4, count: u.length, recon };
  return { data: q, bits: 8, count: u.length, recon };
}

export function dequantize(bytes, byteOffset, count, eps) {
  const out = new Float64Array(count);
  switch (eps.quant.scheme) {
    case QUANT.NONE: {
      if (eps.quant.bits === 32) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset + byteOffset, count * 4);
        for (let i = 0; i < count; i++) out[i] = dv.getFloat32(i * 4, true);
      } else {
        const dv = new DataView(bytes.buffer, bytes.byteOffset + byteOffset, count * 2);
        for (let i = 0; i < count; i++) out[i] = fromF16(dv.getUint16(i * 2, true));
      }
      break;
    }
    case QUANT.AFFINE_INT8: {
      const D = quantDelta(eps);
      for (let i = 0; i < count; i++) {
        const b = bytes[byteOffset + i];
        out[i] = ((b & 0x80) ? b - 256 : b) * D;
      }
      break;
    }
    case QUANT.AFFINE_INT4: {
      const D = quantDelta(eps);
      const q = unpackNibbles(bytes, count, byteOffset);
      for (let i = 0; i < count; i++) out[i] = q[i] * D;
      break;
    }
    case QUANT.VQ:
    case QUANT.RVQ:
      // §11.4: a silently substituted codebook produces plausible-looking but
      // semantically wrong output, which is worse than an error. No fallback
      // path exists in this file, deliberately.
      fail('FDDP_E_CODEBOOK_MISSING', 'referenced codebook digest unresolvable');
      break;
    default:
      fail('FDDP_E_PARAM', `quantiser 0x${eps.quant.scheme.toString(16)} unsupported`);
  }
  // §18.2: check dequantised values for finiteness before the inverse transform.
  for (let i = 0; i < count; i++)
    if (!Number.isFinite(out[i])) fail('FDDP_E_NONFINITE', `dequantised value ${i} is not finite`);
  return out;
}