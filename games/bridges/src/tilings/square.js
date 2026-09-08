export default {
  id: 'square',
  name: 'Square',
  vertexConfig: '4.4.4.4',
  clean: false,
  tags: ['regular', 'pinched'],
  basis: [[1, 0], [0, 1]],
  protoTiles: [{ kind: 'square', poly: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] }],
  latticeOffset: [-0.5, -0.5],
  cellWidth: 1,
  defaultOutline: 'square',
  extent: size => ({ i: size, j: size }),
};