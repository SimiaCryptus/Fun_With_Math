/**
 * World layout: the play volume spans x ∈ [-w/2, w/2], y ∈ [0, h], z ∈ [-d/2, d/2].
 * Cell (x, y, z) is centred at (x - w/2 + 0.5, y + 0.5, z - d/2 + 0.5).
 */
export function cellCenter(grid, i, out) {
  const x = i % grid.width;
  const y = Math.floor(i / grid.layerSize);
  const z = Math.floor(i / grid.width) % grid.depth;
  out.set(x - grid.width / 2 + 0.5, y + 0.5, z - grid.depth / 2 + 0.5);
  return out;
}

/** World point -> cell index, or -1 if outside the play volume. */
export function worldToCell(grid, x, y, z) {
  const cx = Math.floor(x + grid.width / 2);
  const cy = Math.floor(y);
  const cz = Math.floor(z + grid.depth / 2);
  if (!grid.inBounds(cx, cy, cz)) return -1;
  return grid.index(cx, cy, cz);
}