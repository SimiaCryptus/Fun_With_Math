// §15.6 — bit-packed payloads are LSB-first within each octet, and INT4 packs
// "two per octet, low nibble first". Per-PATCH zero padding to an octet
// boundary (not per-chunk) is what keeps patchOffset(i) pure arithmetic.
export class BitWriter {
  constructor(sizeHint = 64) {
    this.buf = new Uint8Array(sizeHint);
    this.len = 0; this.cur = 0; this.nbits = 0;
  }
  _push(b) {
    if (this.len === this.buf.length) {
      const g = new Uint8Array(this.buf.length * 2);
      g.set(this.buf); this.buf = g;
    }
    this.buf[this.len++] = b;
  }
  write(value, bits) {
    for (let i = 0; i < bits; i++) {
      this.cur |= ((value >>> i) & 1) << this.nbits;
      if (++this.nbits === 8) { this._push(this.cur); this.cur = 0; this.nbits = 0; }
    }
  }
  alignToByte() { if (this.nbits) { this._push(this.cur); this.cur = 0; this.nbits = 0; } }
  finish() { this.alignToByte(); return this.buf.subarray(0, this.len); }
}

export class BitReader {
  constructor(bytes, byteOffset = 0) { this.b = bytes; this.p = byteOffset; this.n = 0; }
  read(bits) {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      v |= ((this.b[this.p] >>> this.n) & 1) << i;
      if (++this.n === 8) { this.n = 0; this.p++; }
    }
    return v;
  }
  alignToByte() { if (this.n) { this.n = 0; this.p++; } }
}

export function packNibbles(values) {           // values are int4 in [-8,7]
  const w = new BitWriter(Math.ceil(values.length / 2));
  for (let i = 0; i < values.length; i++) w.write(values[i] & 0xf, 4);
  return w.finish();                            // zero-padded to octet
}

export function unpackNibbles(bytes, count, byteOffset = 0) {
  const r = new BitReader(bytes, byteOffset);
  const out = new Int8Array(count);
  for (let i = 0; i < count; i++) {
    const v = r.read(4);
    out[i] = (v & 0x8) ? v - 16 : v;            // sign-extend
  }
  return out;
}