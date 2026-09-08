// 4.6.12 — dodecagons, hexagons and squares.  Trivalent: clean.
const R = 1 / (2 * Math.sin(Math.PI / 12));   // dodecagon circumradius for edge 1
const AP = 1 / (2 * Math.tan(Math.PI / 12));  // dodecagon apothem
const P = 3 + Math.sqrt(3);                   // centre to centre across a square
const H = Math.sqrt(3) / 2;
const u = a => [Math.cos(a), Math.sin(a)];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const dodV = k => { const a = Math.PI / 12 + Math.PI / 6 * k; return [R * Math.cos(a), R * Math.sin(a)]; };
const dodecagon = [...Array(12).keys()].map(dodV);

/** Square on the edge facing k·60° (between dodV(2k-1) and dodV(2k)). */
const square = k => {
  const d = u(Math.PI / 3 * k), a = dodV(2 * k + 11), b = dodV(2 * k);
  return [a, add(a, d), add(b, d), b];
};
/** Hexagon in the notch facing 30° + k·60°, one edge flush with the dodecagon. */
const hexagon = k => {
  const th = Math.PI / 6 + Math.PI / 3 * k;
  const c = [Math.cos(th) * (AP + H), Math.sin(th) * (AP + H)];
  return [0, 1, 2, 3, 4, 5].map(m => add(c, u(th + Math.PI / 6 + Math.PI / 3 * m)));
};

export default {
  id: 'truncTriHex',
  name: 'Truncated trihexagonal',
  vertexConfig: '4.6.12',
  clean: true,
  tags: ['semiregular'],
  basis: [[P, 0], [P / 2, P * H]],
  protoTiles: [
    { kind: 'dodecagon', poly: dodecagon },
    { kind: 'square', poly: square(0) }, { kind: 'square', poly: square(1) }, { kind: 'square', poly: square(2) },
    { kind: 'hex', poly: hexagon(0) }, { kind: 'hex', poly: hexagon(1) },
  ],
  latticeOffset: [-0.5, -0.5],
  cellWidth: 0.45 * P,
  defaultOutline: 'hexagon',
  extent: size => ({ i: Math.ceil(size * 0.45), j: Math.ceil(size * 0.45) }),
};