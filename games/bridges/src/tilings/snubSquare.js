// 3.3.4.3.4 — squares tilted ±15° with triangles between them.  Degree 5:
// pinched, and the Bridge Rule's hardest customer.
const A = 2 * Math.cos(Math.PI / 12);   // lattice period for edge length 1
const H = Math.sqrt(3) / 2;

const square = (cx, cy, rot) => [0, 1, 2, 3].map(k => {
  const t = rot + Math.PI / 4 + Math.PI / 2 * k;
  return [cx + Math.cos(t) / Math.SQRT2, cy + Math.sin(t) / Math.SQRT2];
});
const squareA = square(0, 0, Math.PI / 12);          // corners at 60°, 150°, 240°, 330°
const squareB = square(A / 2, A / 2, -Math.PI / 12); // shares a corner with each A

/** Equilateral triangle on the outside of the CCW edge p -> q. */
const triangle = (p, q) => {
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1];
  return [p, [mx + dy * H, my - dx * H], q];
};

export default {
  id: 'snubSquare',
  name: 'Snub square',
  vertexConfig: '3.3.4.3.4',
  clean: false,
  tags: ['semiregular', 'pinched', 'experimental'],
  basis: [[A, 0], [0, A]],
  // every triangle borders exactly one A-type square, so the four on A's edges cover the cell
  protoTiles: [
    { kind: 'square', poly: squareA },
    { kind: 'square', poly: squareB },
    ...[0, 1, 2, 3].map(k => ({ kind: 'tri', poly: triangle(squareA[k], squareA[(k + 1) % 4]) })),
  ],
  latticeOffset: [-0.25, -0.25],
  cellWidth: 0.42 * A,
  defaultOutline: 'square',
  extent: size => ({ i: Math.ceil(size * 0.42), j: Math.ceil(size * 0.42) }),
};