const H = Math.sqrt(3) / 2;

export default {
  id: 'triangle',
  name: 'Triangular',
  vertexConfig: '3.3.3.3.3.3',
  clean: false,
  tags: ['regular', 'pinched', 'experimental'],
  basis: [[1, 0], [0.5, H]],
  protoTiles: [
    { kind: 'up',   poly: [[0, 0], [1, 0], [0.5, H]] },
    { kind: 'down', poly: [[1, 0], [1.5, H], [0.5, H]] },
  ],
  latticeOffset: [0, 0],
  cellWidth: 0.5,
  defaultOutline: 'rhombus',
  extent: size => ({ i: size, j: size }),
};