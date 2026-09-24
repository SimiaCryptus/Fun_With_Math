// Appendix A.4 — CRC-32C (Castagnoli), reflected 0x82F63B78, init/final 0xFFFFFFFF.
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0x82f63b78 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32c(bytes, seed = 0xffffffff) {
  let c = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

export function crc32cFinal(bytes) { return (crc32c(bytes) ^ 0xffffffff) >>> 0; }

export function crc32cParts(parts) {
  let c = 0xffffffff;
  for (const p of parts) c = crc32c(p, c);
  return (c ^ 0xffffffff) >>> 0;
}