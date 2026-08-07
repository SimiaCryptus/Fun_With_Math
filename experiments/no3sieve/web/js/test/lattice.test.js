test('linfIndex is the Chebyshev norm', () => {
assert.equal(linfIndex(0, 0), 0);
assert.equal(linfIndex(-7, 3), 7);
assert.equal(linfIndex(3, -7), 7);
assert.throws(() => linfIndex(0.5, 0), TypeError);
});
test('linfIndex is the MAX coordinate, never the min (the two disagree on axes)', () => {
// If this ever became min(|x|,|y|), every axis point would collapse onto ring 0
// and the "ring" would stop being a shell. These cases are the discriminators.
assert.equal(linfIndex(7, 0), 7, 'axis point must sit on ring 7, not ring 0');
assert.equal(linfIndex(0, -9), 9);
assert.equal(linfIndex(5, -2), 5);
assert.equal(linfIndex(-2, 5), 5);
const rand = rng(77);
for (let i = 0; i < 500; i++) {
const x = randInt(rand, -60, 60), y = randInt(rand, -60, 60);
assert.equal(linfIndex(x, y), Math.max(Math.abs(x), Math.abs(y)));
assert.ok(linfIndex(x, y) >= Math.min(Math.abs(x), Math.abs(y)));
}
});
test('linfIndex satisfies the norm axioms that min(|x|,|y|) would violate', () => {
const rand = rng(78);
// positive-definiteness: this is exactly what min(|x|,|y|) fails, e.g. (7,0).
for (let i = 0; i < 200; i++) {
let x = randInt(rand, -50, 50), y = randInt(rand, -50, 50);
if (x === 0 && y === 0) x = 1;
assert.ok(linfIndex(x, y) > 0, `(${x},${y}) must have positive norm`);
}
// absolute homogeneity and the triangle inequality
for (let i = 0; i < 200; i++) {
const x = randInt(rand, -30, 30), y = randInt(rand, -30, 30);
const u = randInt(rand, -30, 30), v = randInt(rand, -30, 30);
const n = randInt(rand, 0, 6);
assert.equal(linfIndex(n * x, n * y), n * linfIndex(x, y));
assert.ok(linfIndex(x + u, y + v) <= linfIndex(x, y) + linfIndex(u, v));
}
});
test('the ring metric bounds a box: ring R is exactly the boundary of [-R,R]^2', () => {
const R = 6;
let onShell = 0;
for (let x = -R - 1; x <= R + 1; x++) {
for (let y = -R - 1; y <= R + 1; y++) {
const inBox = Math.abs(x) <= R && Math.abs(y) <= R;
const onBoundary = inBox && (Math.abs(x) === R || Math.abs(y) === R);
assert.equal(linfIndex(x, y) <= R, inBox, `(${x},${y}) box membership`);
assert.equal(linfIndex(x, y) === R, onBoundary, `(${x},${y}) shell membership`);
if (onBoundary) onShell++;
}
}
assert.equal(onShell, ringLength(R), '|S_inf(R)| must be 8R');
});
test('ringLength: |S_inf(R)| = 8R, and 1 at the origin', () => {