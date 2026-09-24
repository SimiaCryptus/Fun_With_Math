import { PAD } from '../core/registry.js';
import { fail } from '../core/errors.js';

// §7.1 frame geometry:  T = 1 + floor((M_pad - N) / H)
//
// For the padding policies that EXTEND the lane (§7.2 "append ... to reach the
// next whole frame") every hop-aligned position holding source samples begins a
// frame, so T = ceil(M / H) and M_pad = N + (T - 1) H. This is the convention
// §21 uses: M = 4096, N = 1024, H = 512  =>  M_pad = 4608, T = 8.
// PAD_DROP keeps only frames that lie wholly inside the source.
export function frameGeometry(M, N, H, padPolicy) {
  if (padPolicy === PAD.DROP) {
    const T = M < N ? 0 : 1 + Math.floor((M - N) / H);
    return { T, Mpad: T ? N + (T - 1) * H : 0 };
  }
  const T = Math.max(1, Math.ceil(M / H));
  return { T, Mpad: N + (T - 1) * H };
}

export function padLane(x, Mpad, policy) {
  if (x.length >= Mpad) return x.subarray(0, Mpad);
  const out = new Float64Array(Mpad);
  out.set(x);
  switch (policy) {
    case PAD.ZERO: break;
    case PAD.REFLECT:
      for (let i = x.length; i < Mpad; i++) {
        const s = 2 * x.length - 2 - i;             // mirror about the terminal sample, excluding it
        out[i] = s >= 0 ? x[s] : 0;
      }
      break;
    case PAD.WRAP:
      for (let i = x.length; i < Mpad; i++) out[i] = x[i % x.length];
      break;
    case PAD.DROP:
      fail('FDDP_E_PARAM', 'PAD_DROP never extends the lane; frameGeometry must be consulted first');
      break;
    default: fail('FDDP_E_PARAM', `pad policy ${policy} unsupported`);
  }
  return out;
}

// 2-D block extraction, Profile C binding: t = by*Wb + bx (raster order).
export function extractBlock(plane, planeWidth, bx, by, bs, offset, scale, out) {
  for (let r = 0; r < bs; r++) {
    const s = (by * bs + r) * planeWidth + bx * bs;
    for (let c = 0; c < bs; c++) out[r * bs + c] = (plane[s + c] + offset) * scale;
  }
  return out;
}