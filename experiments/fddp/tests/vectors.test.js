import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dct2, dct2Ref, dct3, dct2d, idct2d } from '../src/dsp/dct.js';
import { roundHalfEven } from '../src/core/roundeven.js';
import { crc32cFinal } from '../src/core/crc32c.js';
import { toF16, fromF16 } from '../src/core/f16.js';
import { splitmix64, GEAR } from '../src/core/splitmix.js';
import { bandEdges, BAND_SCHEME } from '../src/dsp/bands.js';
import { makeWindow, verifyCola, WINDOW } from '../src/dsp/windows.js';
import { packNibbles, unpackNibbles } from '../src/core/bits.js';
import { xoshiro256ss } from '../src/core/xoshiro.js';

// ---- §16.3 V1: DC response ----------------------------------------------
test('V1 — DC response, N=8, rect, orthonormal DCT-II', () => {
  const X = dct2(new Float64Array(8).fill(1));
  assert.ok(Math.abs(X[0] - 2.82842712) < 1e-7, `X[0]=${X[0]}, expected 2√2`);
  for (let k = 1; k < 8; k++) assert.ok(Math.abs(X[k]) < 1e-12);
  // the three classic wrong answers
  for (const wrong of [8, 1, 2]) assert.ok(Math.abs(X[0] - wrong) > 1e-3);
});

// ---- §16.3 V2: single-tone isolation + the half-sample offset -----------
test('V2 — single-tone isolation exposes the (n+½) offset', () => {
  const x = new Float64Array(8);
  for (let n = 0; n < 8; n++) x[n] = Math.cos((Math.PI / 8) * (n + 0.5) * 2);
  const X = dct2(x);
  assert.ok(Math.abs(X[2] - 2.0) < 1e-7, `X[2]=${X[2]}, expected 2.0`);
  for (let k = 0; k < 8; k++) if (k !== 2) assert.ok(Math.abs(X[k]) < 1e-10);
});

test('fast DCT agrees with the O(N²) reference to 1e-12', () => {
  const rng = xoshiro256ss(0xC0FFEEn);
  for (const N of [8, 16, 64, 128, 1024]) {
    const x = Float64Array.from(rng.floats(N));
    const a = dct2Ref(x), b = dct2(x);
    for (let k = 0; k < N; k++) assert.ok(Math.abs(a[k] - b[k]) < 1e-11, `N=${N} k=${k}`);
  }
});

test('Parseval: ‖DCT(x)‖² = ‖x‖² for the orthonormal transform', () => {
  const rng = xoshiro256ss(7n);
  for (const N of [8, 64, 256, 4096]) {
    const x = Float64Array.from(rng.floats(N));
    const X = dct2(x);
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) { a += x[i] * x[i]; b += X[i] * X[i]; }
    assert.ok(Math.abs(a - b) / a < 1e-12, `N=${N}: ${a} vs ${b}`);
  }
});

test('DCT-III inverts DCT-II', () => {
  const rng = xoshiro256ss(99n);
  for (const N of [8, 64, 1024]) {
    const x = Float64Array.from(rng.floats(N));
    const y = dct3(dct2(x));
    for (let i = 0; i < N; i++) assert.ok(Math.abs(x[i] - y[i]) < 1e-11);
  }
});

test('2-D separable DCT round-trips a 16×16 block to 1e-12', () => {
  const rng = xoshiro256ss(1234n);
  const x = Float64Array.from(rng.floats(256));
  const y = idct2d(dct2d(x, 16, 16), 16, 16);
  for (let i = 0; i < 256; i++) assert.ok(Math.abs(x[i] - y[i]) < 1e-12);
});

// ---- §11.3 round-half-to-even -------------------------------------------
test('round-half-to-even at every exact .5 point', () => {
  assert.equal(roundHalfEven(0.5), 0);
  assert.equal(roundHalfEven(1.5), 2);
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(-1.5), -2);
  assert.equal(roundHalfEven(-2.5), -2);
  assert.ok(Object.is(roundHalfEven(-0.5), -0));
  // Math.round would give 1, 2, 3, 4, -1, -2 — the exact bias §11.3 forbids
  assert.notEqual(roundHalfEven(2.5), Math.round(2.5));
});

// ---- Appendix A.4 --------------------------------------------------------
test('CRC-32C of "123456789" is 0xE3069283', () => {
  assert.equal(crc32cFinal(new TextEncoder().encode('123456789')), 0xe3069283);
});

// ---- f16 -----------------------------------------------------------------
test('f16 round-trips the full 65536-code space', () => {
  for (let h = 0; h < 65536; h++) {
    const exp = (h >>> 10) & 0x1f, man = h & 0x3ff;
    if (exp === 0x1f && man) continue;                 // NaN payloads are not preserved
    assert.equal(toF16(fromF16(h)), h, `code ${h}`);
  }
});

// ---- Appendix A.1 --------------------------------------------------------
test('Gear table is generated, not transcribed', () => {
  assert.equal(GEAR[0], splitmix64(0x9E3779B97F4A7C15n));
  assert.equal(GEAR.length, 256);
  assert.notEqual(GEAR[0], GEAR[1]);
});

// ---- §10.1 / §21 band merging -------------------------------------------
test('§21 worked example: dyadic 16 nominal bands collapse to J=11', () => {
  const e = bandEdges(BAND_SCHEME.DYADIC, { K: 1024, J: 16 });
  assert.deepEqual(Array.from(e), [0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]);
  assert.equal(e.length - 1, 11, 'J is 11, not the nominal 16');
});

// ---- §7.4 COLA -----------------------------------------------------------
test('COLA: canonical pairs pass, non-tiling hops fail with the right code', () => {
  const w = makeWindow(WINDOW.HANN, 64);
   assert.ok(Math.abs(verifyCola(w, 32, 1).constant - 1) < 1e-12);      // Hann @ N/2 sums to 1
   assert.ok(Math.abs(verifyCola(w, 16, 1).constant - 2) < 1e-12);      // Hann @ N/4 sums to 2
   assert.ok(Math.abs(verifyCola(makeWindow(WINDOW.SQRT_HANN, 64), 16, 2).constant - 2) < 1e-12); // WOLA
   // A hop that does not tile the period (N/3 with N = 64) is a genuine violation.
   // (Note: periodic Hann with N divisible by 3 DOES satisfy COLA at N/3 -- sum 1.5.)
   assert.throws(() => verifyCola(w, 21, 1), (e) => e.code === 'FDDP_E_COLA_VIOLATION');
   assert.throws(() => verifyCola(w, 48, 1), (e) => e.code === 'FDDP_E_COLA_VIOLATION');
   assert.throws(() => verifyCola(makeWindow(WINDOW.BLACKMAN_HARRIS, 64), 32, 1),
                 (e) => e.code === 'FDDP_E_COLA_VIOLATION');
   // REGRESSION: H >= N/2 used to give an empty scan range and a NaN "violation".
  const rect = makeWindow(WINDOW.RECT, 16);
   assert.equal(verifyCola(rect, 16, 1).constant, 1);        // Profile C: rect @ H = N
   assert.ok(Math.abs(verifyCola(makeWindow(WINDOW.HANN, 1024), 512, 1).constant - 1) < 1e-12); // Profile A
});

// ---- §15.6 INT4 packing --------------------------------------------------
test('INT4 packs LSB-first, low nibble first, zero-padded per patch', () => {
  const q = Int8Array.from([1, 2, -1, 7, -8]);
  const p = packNibbles(q);
  assert.equal(p.length, 3);                                // 5 nibbles -> 3 octets
  assert.equal(p[0], 0x21);                                 // low nibble = 1, high = 2
  assert.equal(p[1], 0x7f);                                 // -1 -> 0xF low, 7 high
  assert.equal(p[2], 0x08);                                 // -8 -> 0x8, padded with zero
  assert.deepEqual(Array.from(unpackNibbles(p, 5)), [1, 2, -1, 7, -8]);
});