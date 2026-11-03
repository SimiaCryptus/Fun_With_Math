// Axis-aligned boxes. A box is { lo: Float64Array, hi: Float64Array }.

export function makeBox(lo, hi) {
  return { lo: Float64Array.from(lo), hi: Float64Array.from(hi) };
}

export function unitBox(d = 3) {
  return makeBox(new Array(d).fill(0), new Array(d).fill(1));
}

export function boxVolume(b) {
  let v = 1;
  for (let i = 0; i < b.lo.length; i++) v *= Math.max(0, b.hi[i] - b.lo[i]);
  return v;
}

export function boxCenter(b) {
  const d = b.lo.length;
  const m = new Float64Array(d);
  for (let i = 0; i < d; i++) m[i] = 0.5 * (b.lo[i] + b.hi[i]);
  return m;
}

export function boxHalfWidths(b) {
  const d = b.lo.length;
  const h = new Float64Array(d);
  for (let i = 0; i < d; i++) h[i] = 0.5 * (b.hi[i] - b.lo[i]);
  return h;
}

export function boxMaxWidth(b) {
  let w = 0;
  for (let i = 0; i < b.lo.length; i++) w = Math.max(w, b.hi[i] - b.lo[i]);
  return w;
}

export function longestAxis(b) {
  let a = 0, w = -Infinity;
  for (let i = 0; i < b.lo.length; i++) {
    const wi = b.hi[i] - b.lo[i];
    if (wi > w) { w = wi; a = i; }
  }
  return a;
}

/** Bisect along `axis` (default: longest edge). Returns [lower, upper]. */
export function bisect(b, axis = longestAxis(b)) {
  const mid = 0.5 * (b.lo[axis] + b.hi[axis]);
  const lo1 = Float64Array.from(b.lo), hi1 = Float64Array.from(b.hi);
  const lo2 = Float64Array.from(b.lo), hi2 = Float64Array.from(b.hi);
  hi1[axis] = mid;
  lo2[axis] = mid;
  return [{ lo: lo1, hi: hi1 }, { lo: lo2, hi: hi2 }];
}

/** All 2^d corners, as Float64Arrays. */
export function boxCorners(b) {
  const d = b.lo.length;
  const out = [];
  for (let m = 0; m < 1 << d; m++) {
    const v = new Float64Array(d);
    for (let i = 0; i < d; i++) v[i] = (m >> i) & 1 ? b.hi[i] : b.lo[i];
    out.push(v);
  }
  return out;
}

export function boxContains(b, x) {
  for (let i = 0; i < b.lo.length; i++) {
    if (x[i] < b.lo[i] || x[i] > b.hi[i]) return false;
  }
  return true;
}