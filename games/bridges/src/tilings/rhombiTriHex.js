// 3.4.6.4 — hexagons ringed by squares, with triangles in the notches.
// Every vertex touches four tiles: pinched (degree 4).
const P = 1 + Math.sqrt(3);                               // hex centre to hex centre
const u = a => [Math.cos(a), Math.sin(a)];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const hexV = k => u(Math.PI / 6 + Math.PI / 3 * k);      // circumradius 1 = edge 1
const hexagon = [0, 1, 2, 3, 4, 5].map(hexV);

/** Square on the hex edge facing k·60° (the edge between hexV(k-1) and hexV(k)). */
const square = k => {
  const d = u(Math.PI / 3 * k), a = hexV(k + 5), b = hexV(k);
  return [a, add(a, d), add(b, d), b];
};
/** Triangle in the notch at 30° + k·60°, between the squares facing k·60° and (k+1)·60°. */
const triangle = k => {
  const v = hexV(k);
  return [add(v, u(Math.PI / 3 * k)), add(v, u(Math.PI / 3 * (k + 1))), v];
};

export default {
  id: 'rhombiTriHex',
  name: 'Rhombitrihexagonal',
  vertexConfig: '3.4.6.4',
  clean: false,
  tags: ['semiregular', 'pinched'],
  basis: [[P, 0], [P / 2, P * Math.sqrt(3) / 2]],
  protoTiles: [
    { kind: 'hex', poly: hexagon },
    { kind: 'square', poly: square(0) }, { kind: 'square', poly: square(1) }, { kind: 'square', poly: square(2) },
    { kind: 'up', poly: triangle(0) }, { kind: 'down', poly: triangle(1) },
  ],
  latticeOffset: [-0.5, -0.5],
  cellWidth: 0.4 * P,
  defaultOutline: 'hexagon',
  extent: size => ({ i: Math.ceil(size * 0.4), j: Math.ceil(size * 0.4) }),
};