// Offset rectangles (running bond).  Because each row is shifted half a brick,
// every long edge is split by the row above; storing bricks as hexagons with
// edge midpoints keeps the welded topology exact, and every vertex then
// touches exactly three bricks: clean.
export default {
  id: 'brick',
  name: 'Brick',
  vertexConfig: 'running bond',
  clean: true,
  tags: ['clean'],
  basis: [[2, 0], [1, 1]],
  protoTiles: [{ kind: 'brick', poly: [[-1, -0.5], [0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5], [-1, 0.5]] }],
  latticeOffset: [-0.5, -0.5],
  cellWidth: 1.3,
  defaultOutline: 'square',
  extent: size => ({ i: Math.ceil(size * 0.65), j: size }),
};