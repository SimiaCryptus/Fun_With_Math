// binary16 <-> binary32. Rounding is round-half-to-even, per §11.3, applied to
// the mantissa truncation as well -- a half-ulp bias here would show up as a
// systematic DC shift in every f16 payload.
const _b = new ArrayBuffer(4);
const _f = new Float32Array(_b);
const _u = new Uint32Array(_b);

export function toF16(value) {
  _f[0] = value;
  const x = _u[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  let man = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (man ? 0x200 : 0);
  const e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign;                    // underflow to signed zero
    man |= 0x800000;
    const shift = 14 - e;                        // 14..24
    let r = man >>> shift;
    const rem = man & ((1 << shift) - 1);
    const half = 1 << (shift - 1);
    if (rem > half || (rem === half && (r & 1))) r++;
    return sign | r;
  }
  let r = (e << 10) | (man >>> 13);
  const rem = man & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && (r & 1))) r++;
  return sign | r;
}

export function fromF16(h) {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h >>> 10) & 0x1f;
  const man = h & 0x3ff;
  if (exp === 0) return sign * man * 5.960464477539063e-8;   // 2^-24
  if (exp === 0x1f) return man ? NaN : sign * Infinity;
  return sign * (1024 + man) * Math.pow(2, exp - 25);
}