// §16.3 — conformance inputs are generated deterministically; no external data.
const M = (1n << 64n) - 1n;
const rotl = (x, k) => ((x << k) | (x >> (64n - k))) & M;

export function xoshiro256ss(seed) {
  const s = new BigUint64Array(4);
  let z = BigInt(seed);
  for (let i = 0; i < 4; i++) {
    z = (z + 0x9E3779B97F4A7C15n) & M;
    let t = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M;
    t = ((t ^ (t >> 27n)) * 0x94D049BB133111EBn) & M;
    s[i] = (t ^ (t >> 31n)) & M;
  }
  return {
    next() {
      const r = (rotl((s[1] * 5n) & M, 7n) * 9n) & M;
      const t = (s[1] << 17n) & M;
      s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
      s[2] ^= t; s[3] = rotl(s[3], 45n);
      return r;
    },
    bytes(n) {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = Number(this.next() & 0xffn);
      return out;
    },
    floats(n) {
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = Number(this.next() >> 11n) / 9007199254740992 * 2 - 1;
      return out;
    },
  };
}