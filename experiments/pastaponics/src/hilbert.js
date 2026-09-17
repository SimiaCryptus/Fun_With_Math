// 2D Hilbert curve index → (x, y) on an n×n grid (n a power of two).
// The curve starts at (0, 0) and ends at (n‑1, 0); consecutive cells are unit steps.

export function hilbert2D(n, d) {
  let x = 0, y = 0, t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = (t >> 1) & 1;
    const ry = (t ^ rx) & 1;
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      const tmp = x; x = y; y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
}

export function hilbertPath2D(n) {
  const out = [];
  for (let d = 0; d < n * n; d++) out.push(hilbert2D(n, d));
  return out;
}