// Geometry helpers for the no-three-in-line problem.

export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

// Cross product test: zero => collinear.
// a, b, c are [x, y].
export function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

// Canonical line descriptor through two distinct lattice points p, q.
// Direction (dx, dy) reduced by gcd with sign convention; offset c.
// Returns string key "dx,dy,c".
export function lineKey(p, q) {
  let dx = q[0] - p[0];
  let dy = q[1] - p[1];
  const g = gcd(dx, dy) || 1;
  dx /= g;
  dy /= g;
  // Sign convention: first nonzero component positive.
  if (dx < 0 || (dx === 0 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  // Offset using point p: c = dy*px - dx*py
  const c = dy * p[0] - dx * p[1];
  return `${dx},${dy},${c}`;
}

// Enumerate all lattice cells in [0,n)^2 on the line through p, q (inclusive
// of p and q). Returns array of [x, y].
export function lineCells(p, q, n) {
  let dx = q[0] - p[0];
  let dy = q[1] - p[1];
  const g = gcd(dx, dy) || 1;
  dx /= g;
  dy /= g;
  const cells = [];
  // Walk backward from p then forward.
  let x = p[0],
    y = p[1];
  // move to lowest in-bounds point
  while (x - dx >= 0 && x - dx < n && y - dy >= 0 && y - dy < n) {
    x -= dx;
    y -= dy;
  }
  while (x >= 0 && x < n && y >= 0 && y < n) {
    cells.push([x, y]);
    x += dx;
    y += dy;
  }
  return cells;
}

export function pointId(x, y, n) {
  return y * n + x;
}
export function fromId(id, n) {
  return [id % n, Math.floor(id / n)];
}
