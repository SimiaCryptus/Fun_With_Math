test('scanMax reports windows that exceed the I2 bound instead of dropping them', () => {
  // 4x4 fully occupied: every 2x2 window holds 4 > 2s+1 = 5? no — use s=1..2
  // s=2 => hist length 6, pop 4 fits; s=1 => pop 1 fits. Force an overflow
  // with a dense 3x3 and s=1 is impossible, so use a saturated 4x4 at s=2..
  const cw = 4,
    ch = 4;
  const grid = new Int32Array(cw * ch).fill(3); // 3 per cell: 2x2 window = 12
  const S = buildSAT(grid, cw, ch);
  const got = scanMax(S, cw, ch, 2); // hist holds p <= 5
  assert.equal(got.max, 12);
  assert.equal(got.overflow, 9, 'all 3x3 = 9 placements overflow the histogram');
  let counted = 0;
  for (const v of got.hist) counted += v;
  assert.equal(counted, 0);
});
