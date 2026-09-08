// 3.12.12 — dodecagons with triangles in the notches.  Trivalent: clean.
const R = 1 / (2 * Math.sin(Math.PI / 12));   // dodecagon circumradius for edge 1
const P = 2 + Math.sqrt(3);                   // centre to centre = 2 × apothem
const H = Math.sqrt(3) / 2;
const u = a => [Math.cos(a), Math.sin(a)];
const dodV = k => { const a = Math.PI / 12 + Math.PI / 6 * k; return [R * Math.cos(a), R * Math.sin(a)]; };
const dodecagon = [...Array(12).keys()].map(dodV);

/** Triangle in the notch facing 30° + k·60°: that dodecagon edge plus an apex. */
const triangle = k => {
  const a = dodV(2 * k), b = dodV(2 * k + 1), d = u(Math.PI / 6 + Math.PI / 3 * k);
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return [a, [m[0] + d[0] * H, m[1] + d[1] * H], b];
};

export default {
  id: 'truncHex',
  name: 'Truncated hexagonal',
  vertexConfig: '3.12.12',
  clean: true,
  tags: ['semiregular'],
  basis: [[P, 0], [P / 2, P * H]],
  protoTiles: [
    { kind: 'dodecagon', poly: dodecagon },
    { kind: 'up', poly: triangle(0) },
    { kind: 'down', poly: triangle(1) },
  ],
  latticeOffset: [-0.5, -0.5],
  cellWidth: 0.6 * P,
  defaultOutline: 'hexagon',
  extent: size => ({ i: Math.ceil(size * 0.6), j: Math.ceil(size * 0.6) }),
};