import { crc32cParts } from '../core/crc32c.js';
import { fail } from '../core/errors.js';
import { LIMITS } from '../core/registry.js';

export const SIGNATURE = Uint8Array.from([0x46, 0x44, 0x44, 0x50, 0x0d, 0x0a, 0x1a, 0x0a]);

// §15.4 registry criticality. DEVIATION D-11: §15.3's "bit 5 of byte 0 clear =>
// critical" contradicts §15.4's table for XTRA and STAT (both uppercase, both
// listed ancillary). We resolve by NAME for registered types and by the BIT
// RULE for unregistered ones, and log the ambiguity.
const REGISTERED = new Map(Object.entries({
  FHDR: true, LANE: true, XFRM: true, BAND: true, CHAN: true, NORM: true,
  QUAN: true, POSI: false, SEGS: false, DATA: true, STAT: false, XTRA: false, IEND: true,
}));

export function isCritical(type) {
  if (REGISTERED.has(type)) return REGISTERED.get(type);
  return (type.charCodeAt(0) & 0x20) === 0;
}

export class ChunkWriter {
  constructor() { this.parts = []; this.length = SIGNATURE.length; this.parts.push(SIGNATURE); }
  push(type, payload) {
    if (payload.length > LIMITS.MAX_CHUNK) fail('FDDP_E_PARAM', `chunk ${type} exceeds MAX_CHUNK`);
    const head = new Uint8Array(8);
    const dv = new DataView(head.buffer);
    dv.setUint32(0, payload.length, true);
    for (let i = 0; i < 4; i++) head[4 + i] = type.charCodeAt(i);
    const crc = crc32cParts([head.subarray(4, 8), payload]);   // §15.3: type||payload
    const tail = new Uint8Array(4);
    new DataView(tail.buffer).setUint32(0, crc, true);
    this.parts.push(head, payload, tail);
    this.length += 8 + payload.length + 4;
  }
  finish() {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

export function* parseChunks(bytes) {
  for (let i = 0; i < SIGNATURE.length; i++)
    if (bytes[i] !== SIGNATURE[i]) fail('FDDP_E_SIGNATURE', `bad magic at offset ${i}`);
  let p = SIGNATURE.length;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (;;) {
    if (p + 8 > bytes.length) fail('FDDP_E_TRUNCATED', 'chunk header past end of container');
    const len = dv.getUint32(p, true);
    // §18.1: validate every length field against the remaining bytes BEFORE
    // allocating anything at all.
    if (len > LIMITS.MAX_CHUNK) fail('FDDP_E_PARAM', `chunk length ${len} > MAX_CHUNK`);
    if (p + 12 + len > bytes.length) fail('FDDP_E_TRUNCATED', `chunk claims ${len} bytes, container has fewer`);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const payload = bytes.subarray(p + 8, p + 8 + len);
    const crc = dv.getUint32(p + 8 + len, true);
    const want = crc32cParts([bytes.subarray(p + 4, p + 8), payload]);
    if (crc !== want)
      fail('FDDP_E_CRC', `chunk ${type} CRC ${crc.toString(16)} != ${want.toString(16)}`);
    yield { type, payload, offset: p, length: len, critical: isCritical(type) };
    p += 12 + len;
    if (type === 'IEND') return;
    if (p >= bytes.length) fail('FDDP_E_TRUNCATED', 'container ends before IEND');
  }
}