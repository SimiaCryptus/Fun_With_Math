import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tilings, tilingIds } from '../src/tilings/registry.js';
import { generateBoard } from '../src/tilings/Tiling.js';
import { normalize } from '../src/config.js';

const make = partial => {
  const cfg = normalize(partial, tilingIds);
  return generateBoard(tilings[cfg.tiling], cfg);
};

test('hex + rhombus reproduces the classic N×N Hex board', () => {
  const N = 7;
  const b = make({ tiling: 'hex', outline: 'rhombus', size: N });
  assert.equal(b.cells.length, N * N);
  assert.equal(b.euler, 1);
  assert.ok(b.clean);
  assert.equal(b.chords.length, 0);
  for (const arc of b.arcs) assert.equal(arc.cells.length, N);
  assert.equal(b.cells.filter(c => c.arcs.length === 2).length, 4, 'four corner cells');
  for (const c of b.cells.filter(c => !c.boundary)) assert.equal(c.neighbors.length, 6);
  assert.equal(b.arcs[0].owner, b.arcs[2].owner);
  assert.notEqual(b.arcs[0].owner, b.arcs[1].owner);
});

test('bundled tilings weld into a disc with one- or two-sided edges', () => {
  const combos = [
    ['hex', 'rhombus'], ['hex', 'hexagon'], ['hex', 'square'],
    ['square', 'square'], ['square', 'hexagon'],
    ['triangle', 'rhombus'], ['truncSquare', 'rhombus'], ['truncSquare', 'square'],
    ['triHex', 'rhombus'], ['triHex', 'hexagon'],
     ['rhombiTriHex', 'hexagon'], ['rhombiTriHex', 'square'], ['snubSquare', 'square'],
     ['truncHex', 'hexagon'], ['truncHex', 'square'], ['truncTriHex', 'square'],
     ['cairo', 'square'], ['cairo', 'hexagon'], ['brick', 'square'], ['brick', 'rhombus'],
  ];
  for (const [t, o] of combos) {
     const b = make({ tiling: t, outline: o, size: 8 });
    assert.equal(b.euler, 1, `${t}/${o} Euler`);
    for (const e of b.edges) assert.ok(e.cells.length >= 1 && e.cells.length <= 2, `${t}/${o} edge`);
    for (const a of b.arcs) assert.ok(a.cells.length > 0, `${t}/${o} arc ${a.id}`);
    assert.equal(b.players, o === 'hexagon' ? 3 : 2);
  }
});

test('pinched tilings expose chords with interleaving conflicts', () => {
  const sq = make({ tiling: 'square', outline: 'square', size: 5 });
  assert.ok(!sq.clean);
  assert.equal(sq.chords.length, 2 * 16, 'two chords per interior vertex');
  for (const ch of sq.chords) assert.equal(ch.conflicts.length, 1);
  const tri = make({ tiling: 'triangle', outline: 'rhombus', size: 4 });
  assert.equal(tri.maxDegree, 6);
  const v = tri.vertices.find(v => v.interior && v.degree === 6);
  assert.equal(v.chords.length, 9); // C(6,2) - 6 consecutive pairs
});
test('the new tilings have the advertised vertex classes', () => {
   assert.ok(make({ tiling: 'truncHex', outline: 'square', size: 8 }).clean, '3.12.12 is trivalent');
   assert.ok(make({ tiling: 'truncTriHex', outline: 'square', size: 8 }).clean, '4.6.12 is trivalent');
   const brick = make({ tiling: 'brick', outline: 'square', size: 8 });
   assert.ok(brick.clean, 'running bond is trivalent');
   for (const c of brick.cells) assert.equal(c.vertices.length, 6, 'bricks carry their edge midpoints');
   assert.equal(make({ tiling: 'rhombiTriHex', outline: 'square', size: 8 }).maxDegree, 4);
   assert.equal(make({ tiling: 'snubSquare', outline: 'square', size: 8 }).maxDegree, 5);
   const cairo = make({ tiling: 'cairo', outline: 'square', size: 8 });
   assert.equal(cairo.maxDegree, 4);
   for (const c of cairo.cells.filter(c => !c.boundary)) assert.equal(c.vertices.length, 5, 'Cairo tiles are pentagons');
   const kinds = new Set(make({ tiling: 'truncTriHex', outline: 'square', size: 8 }).cells.map(c => c.kind));
   assert.deepEqual([...kinds].sort(), ['dodecagon', 'hex', 'square']);
});
test('welded polygons are always counter-clockwise', () => {
   for (const t of ['snubSquare', 'rhombiTriHex', 'cairo', 'brick']) {
     const b = make({ tiling: t, outline: 'square', size: 7 });
     for (const c of b.cells) {
       let a = 0;
       for (let i = 0, n = c.poly.length; i < n; i++) {
         const p = c.poly[i], q = c.poly[(i + 1) % n];
         a += p[0] * q[1] - q[0] * p[1];
       }
       assert.ok(a > 0, `${t} cell ${c.id}`);
     }
   }
});


test('clip edge mode produces a crisp convex edge without overlaps', () => {
  const b = make({ tiling: 'hex', outline: 'square', size: 6, edgeMode: 'clip' });
  assert.equal(b.euler, 1);
  for (const e of b.edges) assert.ok(e.cells.length <= 2);
});