// 3.6.3.6 — kagome.  Degree-4 vertices: the Bridge Rule's home turf.
const H = Math.sqrt(3) / 2;
const hexagon = [0, 1, 2, 3, 4, 5].map(k => {
  const a = Math.PI / 3 * k;
  return [Math.cos(a), Math.sin(a)];
});

export default {
  id: 'triHex',
  name: 'Kagome',
  vertexConfig: '3.6.3.6',
  clean: false,
  tags: ['semiregular', 'pinched'],
  basis: [[2, 0], [1, 2 * H]],
  protoTiles: [
    { kind: 'hex',  poly: hexagon },
    { kind: 'up',   poly: [[1, 0], [1.5, H], [0.5, H]] },
    { kind: 'down', poly: [[1, 0], [0.5, -H], [1.5, -H]] },
  ],
  latticeOffset: [-0.5, -0.5],
  cellWidth: 1.2,
  defaultOutline: 'rhombus',
  extent: size => ({ i: Math.ceil(size * 0.7), j: Math.ceil(size * 0.7) }),
};