// Cairo pentagonal — the dual of the snub square tiling: one pentagon per
// snub-square vertex, its corners at the centroids of the surrounding faces.
// Square centres have degree 4, triangle centres degree 3: pinched.
import snub from './snubSquare.js';
import { centroid } from '../geometry/Polygon.js';

const A = snub.basis[0][0];
const faces = [];
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
  for (const t of snub.protoTiles) faces.push(t.poly.map(p => [p[0] + i * A, p[1] + j * A]));
}
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;

/** Dual face around vertex v: centroids of the incident faces in angular order. */
const pentagon = v => faces
  .filter(f => f.some(p => near(p, v)))
  .map(centroid)
  .sort((p, q) => Math.atan2(p[1] - v[1], p[0] - v[0]) - Math.atan2(q[1] - v[1], q[0] - v[0]));

export default {
  id: 'cairo',
  name: 'Cairo pentagonal',
  vertexConfig: 'pentagons',
  clean: false,
  tags: ['pentagonal', 'pinched'],
  basis: snub.basis,
  // the four snub-square vertices per cell are exactly the corners of square A
  protoTiles: snub.protoTiles[0].poly.map(v => ({ kind: 'pent', poly: pentagon(v) })),
  latticeOffset: [-0.25, -0.25],
  cellWidth: 0.5 * A,
  defaultOutline: 'square',
  extent: size => ({ i: Math.ceil(size * 0.5), j: Math.ceil(size * 0.5) }),
};