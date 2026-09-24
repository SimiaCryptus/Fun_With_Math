import { fail } from '../core/errors.js';

// §15.5 offset table, verbatim. RESERVED bytes MUST be zero and we verify it.
export const FHDR_SIZE = 40;
export const FLAG = Object.freeze({
  CENTERED: 1 << 0, CAUSAL: 1 << 1, NO_RECONSTRUCT: 1 << 2,
  HAS_MASK: 1 << 3, QUANT_PRESENT: 1 << 4,
});

export function packFhdr(f) {
  const b = new Uint8Array(FHDR_SIZE);
  const dv = new DataView(b.buffer);
  dv.setUint16(0, 1, true);              // version_major
  dv.setUint16(2, 0, true);              // version_minor
  dv.setUint16(4, f.profile_id, true);
  dv.setUint16(6, f.flags, true);
  dv.setUint16(8, f.D, true);
  dv.setUint8(10, f.S);
  dv.setUint8(11, f.C);
  dv.setUint16(12, f.L, true);
  dv.setUint16(14, f.G, true);
  dv.setUint16(16, f.Kp, true);
  dv.setUint8(18, f.anchor_mode);
  dv.setUint8(19, f.anchor_bits);
  dv.setUint8(20, f.reconstruction_level);
  dv.setUint8(21, f.pad_policy);
  dv.setBigUint64(22, BigInt(f.token_count), true);
  dv.setUint32(30, f.latency_samples, true);
  // 34..39 RESERVED, already zero
  return b;
}

export function unpackFhdr(p) {
  if (p.length < FHDR_SIZE) fail('FDDP_E_TRUNCATED', 'FHDR shorter than 40 bytes');
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const major = dv.getUint16(0, true);
  if (major !== 1) fail('FDDP_E_VERSION', `version_major ${major} unsupported`);
  for (let i = 34; i < 40; i++)
    if (p[i] !== 0) fail('FDDP_E_PARAM', `FHDR RESERVED byte ${i} is non-zero (§15.5)`);
  return {
    version_major: major, version_minor: dv.getUint16(2, true),
    profile_id: dv.getUint16(4, true), flags: dv.getUint16(6, true),
    D: dv.getUint16(8, true), S: dv.getUint8(10), C: dv.getUint8(11),
    L: dv.getUint16(12, true), G: dv.getUint16(14, true), Kp: dv.getUint16(16, true),
    anchor_mode: dv.getUint8(18), anchor_bits: dv.getUint8(19),
    reconstruction_level: dv.getUint8(20), pad_policy: dv.getUint8(21),
    token_count: Number(dv.getBigUint64(22, true)),
    latency_samples: dv.getUint32(30, true),
  };
}