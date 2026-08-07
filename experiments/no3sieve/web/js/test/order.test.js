test('orders are memoised (identical object) and per-mode', () => {
const a = ringOrder(6, 'clockwise');
assert.equal(ringOrder(6, 'clockwise'), a);
assert.notEqual(ringOrder(6, 'nearest_first'), a);
});
test('the two metrics stay in their lanes: L∞ picks the ring, L2 orders inside it', () => {
const R = 7;
const o = ringOrder(R, 'nearest_first');
const first = perimeterToCell(R, o[0], [0, 0]);
const last = perimeterToCell(R, o[o.length - 1], [0, 0]);
// Every cell of the shell has the SAME L∞ index — the ordering metric cannot
// move a cell to a different ring, it only permutes within one.
for (let i = 0; i < o.length; i++) {
const c = perimeterToCell(R, o[i], [0, 0]);
assert.equal(linfIndex(c[0], c[1]), R);
}
// ...but the L2 radii genuinely differ: face midpoints are nearest (R),
// corners are farthest (R√2). That difference is the whole point of the mode.
assert.equal(first[0] * first[0] + first[1] * first[1], R * R, 'a face midpoint comes first');
assert.equal(last[0] * last[0] + last[1] * last[1], 2 * R * R, 'a corner comes last');
});