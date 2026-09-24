import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEPS } from '../src/core/eps.js';
import { encode } from '../src/enc/encoder.js';
import { encodeVerified, decodeContainer } from '../src/dec/pipeline.js';
import { writeContainer } from '../src/container/writer.js';
import { readContainer } from '../src/container/reader.js';
import { buildLayout } from '../src/container/layout.js';
import { rgbToYCoCgR, yCoCgRToRgb } from '../src/enc/colorspace.js';
import { areaAverage, slotsEnergy } from '../src/dsp/resample.js';
import { xoshiro256ss } from '../src/core/xoshiro.js';
import { dct2d } from '../src/dsp/dct.js';
import { NormState } from '../src/enc/normalize.js';
import { quantize } from '../src/enc/quantize.js';
import { frameGeometry } from '../src/enc/framing.js';
import { NORM_MODE, CHANNEL, PAD } from '../src/core/registry.js';
import { sha256, hex } from '../src/core/digest.js';

// Minimal ImageData shim: no test may depend on the DOM.
function makeImage(w, h, seed = 1n) {
  const rng = xoshiro256ss(seed);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i]     = (x * 3 + y * 2) & 0xff;
    data[i + 1] = (x ^ y) & 0xff;
    data[i + 2] = Number(rng.next() & 0xffn);
    data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

test('REGRESSION — every shipped preset resolves (COLA at H=N, frozen typed arrays)', () => {
  for (const p of ['visual', 'analysis', 'analysis-tiny', 'faithful', 'bytes-a', 'bytes-faithful']) {
    const eps = resolveEPS(p);
    assert.ok(Number.isFinite(eps.colaCheck.deviation), `${p}: COLA deviation is ${eps.colaCheck.deviation}`);
    assert.ok(Object.isFrozen(eps) && Object.isFrozen(eps.norm), `${p}: EPS must be frozen`);
  }
});

test('§17.1 energy preservation — area average on LINEAR magnitudes', () => {
  const rng = xoshiro256ss(42n);
  for (let trial = 0; trial < 100; trial++) {
    const blk = Float64Array.from(rng.floats(256));
    const spec = dct2d(blk, 16, 16);
    const lin = Float64Array.from(spec, Math.abs);
    const edges = [0, 1, 3, 6, 10, 15, 21, 36, 66, 136, 256];
    let summed = 0;
    for (let j = 0; j < edges.length - 1; j++) {
      const k0 = edges[j], k1 = edges[j + 1], W = k1 - k0;
      const slots = areaAverage(lin.subarray(k0, k1), 0, W, Math.min(16, W));
      summed += slotsEnergy(slots, W);
    }
    let direct = 0;
    for (let i = 0; i < 256; i++) direct += blk[i] * blk[i];       // Parseval
    assert.ok(Math.abs(summed - direct) / direct <= 1e-5,
              `trial ${trial}: ${summed} vs ${direct}`);
  }
});

test('NEGATIVE CONTROL — averaging in the log domain breaks §17.1', () => {
  const rng = xoshiro256ss(43n);
  const blk = Float64Array.from(rng.floats(256));
  const spec = dct2d(blk, 16, 16);
  const logs = Float64Array.from(spec, v => Math.log(Math.abs(v) + 1e-6) - Math.log(1e-6));
  const slots = areaAverage(logs, 0, 256, 16);      // deliberately wrong input
  const wrong = slotsEnergy(slots, 256);
  let direct = 0;
  for (let i = 0; i < 256; i++) direct += blk[i] * blk[i];
  assert.ok(Math.abs(wrong - direct) / direct > 1e-5, 'the guard test must be able to fail');
});

test('YCoCg-R is exactly reversible for every 8-bit triple sampled', () => {
  const rng = xoshiro256ss(5n);
  const n = 20000;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n * 3; i++) rgb[i] = Number(rng.next() & 0xffn);
  const { Y, Co, Cg } = rgbToYCoCgR(rgb, n);
  const back = yCoCgRToRgb(Y, Co, Cg, n);
  for (let i = 0; i < n * 3; i++) assert.equal(back[i], rgb[i], `octet ${i}`);
});

test('§7.1 frame geometry reproduces §21 and covers the tail', () => {
  assert.deepEqual(frameGeometry(4096, 1024, 512, PAD.ZERO), { T: 8, Mpad: 4608 });   // §21 verbatim
  assert.deepEqual(frameGeometry(100, 1024, 512, PAD.ZERO), { T: 1, Mpad: 1024 });
  assert.deepEqual(frameGeometry(4096, 1024, 512, PAD.DROP), { T: 7, Mpad: 4096 });
  assert.deepEqual(frameGeometry(100, 1024, 512, PAD.DROP), { T: 0, Mpad: 0 });
  for (const M of [1, 511, 512, 513, 4095, 4096, 4097]) {
    const { T, Mpad } = frameGeometry(M, 1024, 512, PAD.ZERO);
    assert.ok(Mpad >= M && T === 1 + Math.floor((Mpad - 1024) / 512), `M=${M}`);
  }
});

test('§10.4 emission order is a bijection onto (s,l,g,j)', () => {
  const eps = resolveEPS('visual');
  const img = makeImage(64, 64);
  const r = encode({ kind: 'image', imageData: img }, eps);
  const seen = new Set();
  const layout = buildLayout(eps);
  r.patches.forEach((p, i) => {
    const key = `${p.coord.s}/${p.coord.l}/${p.coord.g}/${p.coord.j}`;
    assert.ok(!seen.has(key), `duplicate coordinate ${key}`);
    seen.add(key);
    assert.deepEqual(layout.patchCoord(i), p.coord, `index ${i} does not invert`);
  });
  assert.equal(seen.size, r.tokenCount);
});

test('§15.6 patchOffset(i) matches a linear scan for 100 random indices', () => {
  const eps = resolveEPS('visual');
  const layout = buildLayout(eps);
  const n = 4000;
  let scan = 0;
  const offsets = [];
  for (let i = 0; i < n; i++) { offsets.push(scan); scan += layout.strides[i % eps.J]; }
  const rng = xoshiro256ss(11n);
  for (let t = 0; t < 100; t++) {
    const i = Number(rng.next() % BigInt(n));
    assert.equal(layout.patchOffset(i), offsets[i], `index ${i}`);
  }
});

test('§3 determinism — two encodes are byte-identical through S7', () => {
  const eps = resolveEPS('analysis');
  const img = makeImage(96, 64, 77n);
  const a = writeContainer(encode({ kind: 'image', imageData: img }, eps), eps, { achievedLevel: 1 });
  const b = writeContainer(encode({ kind: 'image', imageData: img }, eps), eps, { achievedLevel: 1 });
  assert.equal(hex(sha256(a)), hex(sha256(b)));
});

test('§11.1 causality — the transported side-channel equals the decoder\'s replayed prediction', () => {
  const eps = resolveEPS('visual', { normMode: NORM_MODE.RUNNING_Z });    // INT8: lossy on purpose
  const enc = new NormState(eps), dec = new NormState(eps);
  const rng = xoshiro256ss(3n);
  for (let i = 0; i < 1000; i++) {
    const coord = { s: 0, l: i % eps.L, g: Math.floor(i / eps.J), j: i % eps.J, segment: 0 };
    const tile = Float64Array.from(rng.floats(16), v => v * 6 + 4);
    const { tile: u, side } = enc.apply(tile, coord);
    const pred = dec.predictSide(coord);                // decoder has seen only prior payloads
    assert.equal(pred.mean, side.mean, `mean diverges at patch ${i}`);
    assert.equal(pred.logScale, side.logScale, `scale diverges at patch ${i}`);
    const body = quantize(u, eps);
    const vDec = dec.denormalize(body.recon, side);     // what the decoder reconstructs...
    enc.update(enc.denormalize(body.recon, side), coord);   // ...is what the encoder feeds its EMA
    dec.update(vDec, coord);
  }
  for (let k = 0; k < enc.mu.length; k++) {
    assert.equal(enc.mu[k], dec.mu[k]); assert.equal(enc.var[k], dec.var[k]);
  }
});

test('NEGATIVE CONTROL — updating BEFORE emit desynchronises the replay at patch 1', () => {
  const eps = resolveEPS('visual', { normMode: NORM_MODE.RUNNING_Z });
  const bad = new NormState(eps), dec = new NormState(eps);
  const rng = xoshiro256ss(4n);
  let mismatches = 0;
  for (let i = 0; i < 50; i++) {
    const coord = { s: 0, l: 0, g: i, j: 0, segment: 0 };
    const tile = Float64Array.from(rng.floats(16), v => v * 6 + 4);
    bad.update(tile, coord);                            // WRONG order
    const { tile: u, side } = bad.apply(tile, coord);
    const pred = dec.predictSide(coord);
    if (pred.mean !== side.mean || pred.logScale !== side.logScale) mismatches++;
    dec.update(dec.denormalize(quantize(u, eps).recon, side), coord);
  }
  assert.ok(mismatches > 0, 'the causality guard must be able to fail');
});

test('RUNNING_Z survives the container round trip under INT8 (closed-loop replay)', () => {
  const eps = resolveEPS('visual', { normMode: NORM_MODE.RUNNING_Z });
  const img = makeImage(64, 64, 88n);
  const out = encodeVerified({ kind: 'image', imageData: img }, eps);
  const d = decodeContainer(out.container);
  assert.equal(d.eps.norm.mode, NORM_MODE.RUNNING_Z);
  for (let i = 0; i < d.rgb.length; i++) assert.equal(d.rgb[i], out.recon[i], `pixel octet ${i}`);
});

test('container round-trip, and every corruption raises its §19 code', () => {
  const eps = resolveEPS('visual');
  const img = makeImage(64, 64, 9n);
  const { container } = encodeVerified({ kind: 'image', imageData: img }, eps);
  const parsed = readContainer(container);
  assert.equal(parsed.fhdr.profile_id, eps.profileId);
  assert.deepEqual(Array.from(parsed.band.edges), Array.from(eps.bandEdges));
  assert.equal(parsed.xfrm.length, 1);
  assert.equal(parsed.xfrm[0].K, 256);                       // XFRM was previously truncated
  assert.equal(parsed.xfrm[0].Nr, 16);

  const bad = container.slice(); bad[container.length - 40] ^= 0xff;
  assert.throws(() => readContainer(bad), (e) => e.code === 'FDDP_E_CRC');

  assert.throws(() => readContainer(container.slice(0, container.length - 10)),
                (e) => e.code === 'FDDP_E_TRUNCATED');

  const nosig = container.slice(); nosig[3] = 0x51;
  assert.throws(() => readContainer(nosig), (e) => e.code === 'FDDP_E_SIGNATURE');
});

test('encoder self-verifies the level it declares (D-02)', () => {
  const img = makeImage(64, 64, 21n);
  const tiny = encodeVerified({ kind: 'image', imageData: img }, resolveEPS('analysis-tiny'));
  assert.ok(tiny.level <= 1, 'RESAMPLE_FIXED + INT4 must never claim L2');
  const faithful = encodeVerified({ kind: 'image', imageData: img }, resolveEPS('faithful'));
  assert.ok(faithful.metrics.relRMS < 1e-5,
            `faithful relRMS = ${faithful.metrics.relRMS}`);
  assert.ok(faithful.level >= 2, 'RAGGED + f32 should demonstrate L2');
});

test('an L0 container still decodes (NO_RECONSTRUCT is about lanes, not levels)', () => {
  const img = makeImage(32, 32, 66n);
  const out = encodeVerified({ kind: 'image', imageData: img }, resolveEPS('analysis-tiny'));
  const d = decodeContainer(out.container);
  assert.ok(d.rgb, 'L0 analysis output must still be reconstructable');
  assert.equal(d.declaredLevel, out.level);
  assert.deepEqual(d.eps.channels, [CHANNEL.LOGMAG], 'RESAMPLE_FIXED declares LOGMAG (D-15)');
  assert.deepEqual(d.parsed.chan, [CHANNEL.LOGMAG]);
});

test('decode path reproduces the encoder-side reconstruction exactly', () => {
  const eps = resolveEPS('visual');
  const img = makeImage(64, 48, 31n);
  const out = encodeVerified({ kind: 'image', imageData: img }, eps);
  const d = decodeContainer(out.container);
  assert.equal(d.width, 64); assert.equal(d.height, 48);
  assert.equal(d.presetName, 'visual');
  for (let i = 0; i < d.rgb.length; i++)
    assert.equal(d.rgb[i], out.recon[i], `pixel octet ${i}`);
});

test('§18.1 no allocation is driven by an unvalidated header field', () => {
  const eps = resolveEPS('analysis-tiny');
  const img = makeImage(32, 32, 55n);
  const { container } = encodeVerified({ kind: 'image', imageData: img }, eps);
  // forge token_count = 2^40 in FHDR (offset 8 signature + 8 chunk header + 22)
  const bomb = container.slice();
  const dv = new DataView(bomb.buffer);
  dv.setBigUint64(8 + 8 + 22, 1n << 40n, true);
  assert.throws(() => readContainer(bomb),
                (e) => e.code === 'FDDP_E_CRC' || e.code === 'FDDP_E_TOKEN_BUDGET',
                'a forged count must be caught by CRC or by the budget check, never honoured');
});

test('Profile A over raw bytes reproduces §21 geometry (CENTERED = 0 as in the spec)', () => {
  const eps = resolveEPS('bytes-faithful', { centered: 0 });
  const rng = xoshiro256ss(1n);
  const bytes = rng.bytes(4096);
  const r = encode({ kind: 'bytes', bytes }, eps);
  assert.equal(eps.J, 11, 'dyadic bands merge to 11 (§21)');
  assert.equal(r.meta.T, 8, 'T = 1 + floor((4608-1024)/512) = 8');
  assert.equal(r.meta.Mpad, 4608);
  assert.equal(r.meta.nGroups, 2);
  assert.equal(r.tokenCount, r.meta.nGroups * eps.L * eps.J);
  assert.equal(r.tokenCount, 22);
});

test('bytes-faithful reaches L2 (byte-exact) and decodes back from its own container', () => {
  const eps = resolveEPS('bytes-faithful');
  assert.equal(eps.centered, 1);
  const bytes = xoshiro256ss(2n).bytes(3000);           // deliberately not a multiple of H
  const out = encodeVerified({ kind: 'bytes', bytes }, eps);
  assert.ok(out.metrics.byteExact, `relRMS = ${out.metrics.relRMS}`);
  assert.equal(out.level, 2);
  assert.equal(out.latency, 1024 + 3 * 512 + 512);      // §14.2 + centred head
  const d = decodeContainer(out.container);
  assert.ok(d.bytes && !d.rgb);
  assert.deepEqual(Array.from(d.bytes), Array.from(bytes));
  assert.equal(d.eps.centered, 1, 'CENTERED must travel through FHDR');
});

test('bytes-a (INT8, PATCH_Z) round-trips through the container and declares at most L1', () => {
  const bytes = xoshiro256ss(9n).bytes(2048);
  const out = encodeVerified({ kind: 'bytes', bytes }, resolveEPS('bytes-a'));
  assert.ok(out.level <= 1);
  const d = decodeContainer(out.container);
  assert.deepEqual(Array.from(d.bytes), Array.from(out.recon));
});

test('unsupported constructs raise the exact §19 code, never a fallback', () => {
  assert.throws(() => resolveEPS('nope'), (e) => e.code === 'FDDP_E_PROFILE');
  assert.throws(() => resolveEPS('visual', { transform: 0x07 }), (e) => e.code === 'FDDP_E_PARAM');
  assert.throws(() => resolveEPS('visual', { lanes: new Array(65).fill(0).map(() => ({ kind: 1, parent: 0xffff, offset: 0, scale: 1 })) }),
                (e) => e.code === 'FDDP_E_LANE_BUDGET');
  assert.throws(() => resolveEPS('visual', { quantBits: 8, normMode: NORM_MODE.NONE }),
                (e) => e.code === 'FDDP_E_PARAM');                                  // D-06
  assert.throws(() => resolveEPS('visual', { channels: [CHANNEL.PHI_COS] }),
                (e) => e.code === 'FDDP_E_PARAM');
  assert.throws(() => resolveEPS('bytes-a', { H: 700 }), (e) => e.code === 'FDDP_E_COLA_VIOLATION');
  // the token budget is enforced at ENCODE time (§10.3), before allocation
  const tight = resolveEPS('visual', { maxTokens: 4 });
  assert.throws(() => encode({ kind: 'image', imageData: makeImage(64, 64) }, tight),
                (e) => e.code === 'FDDP_E_TOKEN_BUDGET');
});