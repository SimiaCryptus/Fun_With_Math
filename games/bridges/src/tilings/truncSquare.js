// 4.8.8 — octagons + squares.  Every vertex has degree 3: clean.
const S = 1;                       // edge length
const A = S * (1 + Math.SQRT2);    // lattice period
const R = S / (2 * Math.sin(Math.PI / 8));
const octagon = [0, 1, 2, 3, 4, 5, 6, 7].map(k => {
  const a = Math.PI / 8 + Math.PI / 4 * k;
  return [R * Math.cos(a), R * Math.sin(a)];
});
const h = S / Math.SQRT2;
const square = [[A / 2 + h, A / 2], [A / 2, A / 2 + h], [A / 2 - h, A / 2], [A / 2, A / 2 - h]];

export default {
  id: 'truncSquare',
  name: 'Truncated square',
  vertexConfig: '4.8.8',
  clean: true,
  tags: ['semiregular'],
  basis: [[A, 0], [0, A]],
  protoTiles: [{ kind: 'oct', poly: octagon }, { kind: 'square', poly: square }],
  latticeOffset: [-0.5, -0.5],
  cellWidth: A / 2,
  defaultOutline: 'square',
  extent: size => ({ i: Math.ceil(size * 0.6), j: Math.ceil(size * 0.6) }),
};