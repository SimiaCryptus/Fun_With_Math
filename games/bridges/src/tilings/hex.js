const H = Math.sqrt(3) / 2;
const hexPoly = r => [0, 1, 2, 3, 4, 5].map(k => {
  const a = Math.PI / 3 * k;
  return [r * Math.cos(a), r * Math.sin(a)];
});

export default {
  id: 'hex',
  name: 'Hexagonal',
  vertexConfig: '6.6.6',
  clean: true,
  tags: ['classic', 'regular'],
  basis: [[1.5, H], [1.5, -H]],
  protoTiles: [{ kind: 'hex', poly: hexPoly(1) }],
  latticeOffset: [-0.5, -0.5],
  cellWidth: Math.sqrt(3),
  defaultOutline: 'rhombus',
  extent: size => ({ i: size, j: size }),
};