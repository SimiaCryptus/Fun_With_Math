/**
 * Seedable, serializable PRNG. Marsaglia xorshift128 (four 32-bit lanes, no BigInt),
 * seeded through a splitmix32 expansion so nearby seeds decorrelate.
 * No Math.random is used anywhere in sim/ or metrics/.
 */
export class Rng {
  constructor(seed = 1) { this.s = new Uint32Array(4); this.seed(seed); }
  seed(seed) {
    let s = (seed >>> 0) ^ 0x9e3779b9;
    const mix = () => { s = (s + 0x9e3779b9) | 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
    this.s[0] = mix(); this.s[1] = mix(); this.s[2] = mix(); this.s[3] = mix();
    if (!(this.s[0] | this.s[1] | this.s[2] | this.s[3])) this.s[3] = 0x1234567;
    return this;
  }
  nextUint32() {
    const s = this.s; let t = s[3]; const x = s[0];
    s[3] = s[2]; s[2] = s[1]; s[1] = x;
    t ^= t << 11; t ^= t >>> 8;
    s[0] = t ^ x ^ (x >>> 19);
    return s[0];
  }
  next() { return this.nextUint32() / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  gauss() { let u = 0; while (u === 0) u = this.next(); const v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  getState() { return Array.from(this.s); }
  setState(a) { this.s.set(a); return this; }
}