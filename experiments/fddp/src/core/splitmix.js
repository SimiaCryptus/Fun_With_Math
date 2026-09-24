// Appendix A.1 — the Gear table is defined BY CONSTRUCTION, not by literal
// listing, so it is independently verifiable and cannot be mistranscribed.
const M = (1n << 64n) - 1n;
const GOLDEN = 0x9E3779B97F4A7C15n;

export function splitmix64(seed) {
  let z = (BigInt(seed) + GOLDEN) & M;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M;
  return (z ^ (z >> 31n)) & M;
}

export const GEAR = (() => {
  const t = new BigUint64Array(256);
  for (let i = 0; i < 256; i++) t[i] = splitmix64(BigInt(i) + GOLDEN);
  return t;
})();

// §4.2 content-defined cut points. Kept here so the CDC demo of M9 has a
// verified table long before it has a UI.
export function cdcCutPoints(bytes, anchorBits = 13) {
  const mask = (1n << BigInt(anchorBits)) - 1n;
  const MIN = 1 << (anchorBits - 2), MAX = 1 << (anchorBits + 2);
  const cuts = [0];
  let g = 0n, last = 0;
  for (let i = 0; i < bytes.length; i++) {
    g = ((g << 1n) + GEAR[bytes[i]]) & M;
    const len = i - last + 1;
    if (len < MIN) continue;
    if ((g & mask) === 0n || len >= MAX) { cuts.push(i + 1); last = i + 1; }
  }
  if (cuts[cuts.length - 1] !== bytes.length) cuts.push(bytes.length);
  return cuts;
}