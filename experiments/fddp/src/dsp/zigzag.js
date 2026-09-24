// The Profile C binding (plan §2.2): "bin k" IS the zig-zag index of the
// coefficient within the block. This makes a band a contiguous bin range,
// which is what §10.1 requires; true radial rings are not contiguous.
const cache = new Map();

export function zigzagOrder(n) {
  let z = cache.get(n);
  if (z) return z;
  const order = new Uint32Array(n * n);
  let i = 0, r = 0, c = 0, up = true;
  while (i < n * n) {
    order[i++] = r * n + c;
    if (up) {
      if (c === n - 1) { r++; up = false; }
      else if (r === 0) { c++; up = false; }
      else { r--; c++; }
    } else {
      if (r === n - 1) { c++; up = true; }
      else if (c === 0) { r++; up = true; }
      else { r++; c--; }
    }
  }
  const inverse = new Uint32Array(n * n);
  for (let k = 0; k < n * n; k++) inverse[order[k]] = k;
  z = { order, inverse };
  cache.set(n, z);
  return z;
}