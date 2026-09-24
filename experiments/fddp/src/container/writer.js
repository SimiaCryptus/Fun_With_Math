import { ChunkWriter } from './chunks.js';
import { packFhdr, FLAG } from './fhdr.js';
import { buildLayout } from './layout.js';
import { toF16 } from '../core/f16.js';
import { RESOLUTION, QUANT, NON_INVERTIBLE, LANE_KIND } from '../core/registry.js';
import { fail } from '../core/errors.js';

const DATA_SPLIT = 8 * 1024 * 1024;

function u8(...v) { return Uint8Array.from(v); }

// §11.2 — the 8-byte side-channel is fixed and mandatory. There is no code path
// in this file that can emit a body without one.
function packSide(side, out, o) {
  const dv = new DataView(out.buffer, out.byteOffset + o, 8);
  dv.setUint16(0, toF16(side.mean), true);
  dv.setUint16(2, toF16(side.logScale), true);
  dv.setUint8(4, side.validFrac & 0xff);
  dv.setUint8(5, side.flags & 0xff);
  dv.setUint16(6, toF16(side.cohere), true);
}

export function writeContainer(result, eps, extras = {}) {
  const w = new ChunkWriter();
  const layout = buildLayout(eps);
  const level = extras.achievedLevel ?? 0;

  let flags = 0;
  if (eps.centered) flags |= FLAG.CENTERED;
  if (eps.causal) flags |= FLAG.CAUSAL;
  // §13.3: NO_RECONSTRUCT is about the LANE SET being non-invertible, not about
  // the achieved level. An L0 container is still decodable; it is just labelled L0.
  if (eps.lanes.every(ln => NON_INVERTIBLE.includes(ln.kind))) flags |= FLAG.NO_RECONSTRUCT;
  if (eps.lanes.some(ln => ln.kind === LANE_KIND.MASK)) flags |= FLAG.HAS_MASK;
  if (eps.quant.scheme !== QUANT.NONE) flags |= FLAG.QUANT_PRESENT;

  w.push('FHDR', packFhdr({
    profile_id: eps.profileId, flags, D: eps.D, S: eps.S, C: eps.C, L: eps.L,
    G: eps.G, Kp: eps.resolution === RESOLUTION.RAGGED ? 0 : eps.Kp,
    anchor_mode: eps.anchorMode, anchor_bits: eps.anchorBits,
    reconstruction_level: level, pad_policy: eps.padPolicy,
    token_count: result.patches.length, latency_samples: extras.latency ?? 0,
  }));

  // LANE: u16 L, then {u8 kind, u16 parent, f32 offset, f32 scale}
  {
    const b = new Uint8Array(2 + eps.L * 11);
    const dv = new DataView(b.buffer);
    dv.setUint16(0, eps.L, true);
    eps.lanes.forEach((ln, i) => {
      const o = 2 + i * 11;
      dv.setUint8(o, ln.kind); dv.setUint16(o + 1, ln.parent, true);
      dv.setFloat32(o + 3, ln.offset, true); dv.setFloat32(o + 7, ln.scale, true);
    });
    w.push('LANE', b);
  }

  // XFRM: u8 S, then per scale {u16 Nr,u16 Nc,u16 Hr,u16 Hc,u8 win,f32 winp,u8 xf,u8 scal,u32 K}
  // = 19 bytes per scale. (Previously sized 1 + 17 and written to offset 20: RangeError.)
  {
    const PER_SCALE = 19;
    const b = new Uint8Array(1 + PER_SCALE);
    const dv = new DataView(b.buffer);
    dv.setUint8(0, 1);
    const N = eps.domain === 'image' ? eps.blockSize : eps.N;
    const Nc = eps.domain === 'image' ? eps.blockSize : 1;
    const H = eps.domain === 'image' ? eps.blockSize : eps.H;
    dv.setUint16(1, N, true); dv.setUint16(3, Nc, true);
    dv.setUint16(5, H, true); dv.setUint16(7, Nc, true);
    dv.setUint8(9, eps.window); dv.setFloat32(10, eps.windowParam, true);
    dv.setUint8(14, eps.transform); dv.setUint8(15, eps.scaling);
    dv.setUint32(16, eps.K, true);
    w.push('XFRM', b);
  }

  // BAND: u8 S, {u8 scheme, u16 J, u32[J+1] edges}. §10.1: the MERGED array.
  {
    const J = eps.J;
    const b = new Uint8Array(1 + 3 + (J + 1) * 4);
    const dv = new DataView(b.buffer);
    dv.setUint8(0, 1); dv.setUint8(1, eps.bandScheme); dv.setUint16(2, J, true);
    for (let i = 0; i <= J; i++) dv.setUint32(4 + i * 4, eps.bandEdges[i], true);
    w.push('BAND', b);
  }

  w.push('CHAN', Uint8Array.from([eps.C, ...eps.channels]));

  {
    const b = new Uint8Array(1 + 4 + 4 + 4);
    const dv = new DataView(b.buffer);
    dv.setUint8(0, eps.norm.mode);
    dv.setFloat32(1, eps.norm.lambda, true);
    dv.setFloat32(5, eps.norm.quantRange, true);   // D-06: the quantiser step derives from this
    dv.setUint32(9, 0, true);                       // statistics table length (GLOBAL_Z only)
    w.push('NORM', b);
  }

  {
    const b = new Uint8Array(2 + 32);
    b[0] = eps.quant.scheme; b[1] = eps.quant.bits;   // codebook digest left zero
    w.push('QUAN', b);
  }

  // XTRA/IMGD — the Profile C 2-D binding (D-01). Without this a decoder is
  // guessing at geometry, so decode fails hard if it is absent.
  if (eps.domain === 'image') {
    const m = result.meta;
    const b = new Uint8Array(4 + 20);
    b.set(u8(0x49, 0x4d, 0x47, 0x44), 0);         // "IMGD"
    const dv = new DataView(b.buffer);
    dv.setUint32(4, m.width, true); dv.setUint32(8, m.height, true);
    dv.setUint32(12, m.widthPad, true); dv.setUint32(16, m.heightPad, true);
    dv.setUint8(20, 1 /* YCoCg-R */); dv.setUint8(21, eps.blockSize);
    dv.setUint8(22, eps.groupW); dv.setUint8(23, eps.groupH);
    w.push('XTRA', b);
  } else {
    const b = new Uint8Array(4 + 16);
    b.set(u8(0x42, 0x59, 0x54, 0x44), 0);         // "BYTD"
    const dv = new DataView(b.buffer);
    dv.setBigUint64(4, BigInt(result.meta.length), true);
    dv.setUint32(12, result.meta.T, true);
    dv.setUint32(16, result.meta.nGroups, true);
    w.push('XTRA', b);
  }

  // DATA — canonical order (§10.4), patches never straddle a chunk boundary.
  // All multi-octet body values are written little-endian through DataView;
  // never through a typed array's platform-endian buffer.
  {
    let buf = [], size = 0;
    const flush = () => {
      if (!buf.length) return;
      const b = new Uint8Array(size);
      let o = 0;
      for (const p of buf) { b.set(p, o); o += p.length; }
      w.push('DATA', b);
      buf = []; size = 0;
    };
    for (const rec of result.patches) {
      const stride = layout.strides[rec.coord.j];
      const p = new Uint8Array(stride);
      packSide(rec.side, p, 0);
      const body = rec.body;
      const dv = new DataView(p.buffer);
      if (rec.bodyBits === 32) { for (let n = 0; n < body.length; n++) dv.setFloat32(8 + 4 * n, body[n], true); }
      else if (rec.bodyBits === 16) { for (let n = 0; n < body.length; n++) dv.setUint16(8 + 2 * n, body[n], true); }
      else if (rec.bodyBits === 8) { for (let n = 0; n < body.length; n++) p[8 + n] = body[n] & 0xff; }
      else p.set(body, 8);                         // already nibble-packed + padded (§15.6)
      if (size + stride > DATA_SPLIT) flush();
      buf.push(p); size += stride;
    }
    flush();
  }

  // STAT — ancillary. Useful, skippable, never load-bearing.
  {
    const idStr = new TextEncoder().encode(extras.encoderId || 'fddp-web/1.0.0');
    const json = new TextEncoder().encode(JSON.stringify(extras.metrics || {}));
    const b = new Uint8Array(8 + 32 + 4 + 4 + 2 + idStr.length + 4 + json.length);
    const dv = new DataView(b.buffer);
    dv.setBigUint64(0, BigInt(result.canonical.length), true);
    b.set(result.digest, 8);
    dv.setUint32(40, result.stats.nonfinite_count, true);
    dv.setUint32(44, result.stats.clamp_count, true);
    dv.setUint16(48, idStr.length, true);
    b.set(idStr, 50);
    dv.setUint32(50 + idStr.length, json.length, true);
    b.set(json, 54 + idStr.length);
    w.push('STAT', b);
  }

  w.push('IEND', new Uint8Array(0));
  const out = w.finish();
  if (out.length > result.canonical.length * 64 && result.canonical.length > 0)
    fail('FDDP_E_PARAM', `container exceeds MAX_EXPANSION (64x) of the source (§18.1)`);
  return out;
}