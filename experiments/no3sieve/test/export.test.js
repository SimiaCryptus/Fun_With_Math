import test from 'node:test';
import assert from 'node:assert/strict';
import { setLevel } from '../js/util/log.js';
import { normalizeConfig } from '../js/sieve.js';
import {
  download,
  toCSV,
  toTXTGrid,
  toJSON,
  toNDJSON,
  toManifest,
  toDensityCurveCSV,
  toSVG,
  toPNGBlob,
} from '../js/data/export.js';

setLevel('silent');

const CFG = normalizeConfig({ rMax: 4 });
const PTS = Int32Array.from([0, 0, 3, 1, -2, 2]); // valid: no three collinear

test('toCSV emits metadata by default and bare pairs on request', () => {
  const lines = toCSV(PTS).trim().split('\n');
  assert.equal(lines[0], 'x,y,order_index,ring');
  assert.equal(lines[1], '0,0,0,0');
  assert.equal(lines[2], '3,1,1,3');
  assert.equal(lines[3], '-2,2,2,2');
  const bare = toCSV(PTS, { withMeta: false }).trim().split('\n');
  assert.equal(bare[0], 'x,y');
  assert.equal(bare[1], '0,0');
  const shifted = toCSV(PTS, { withMeta: false, origin: [1, 1] })
    .trim()
    .split('\n');
  assert.equal(shifted[1], '-1,-1');
  assert.throws(() => toCSV(Int32Array.from([1])), RangeError);
  assert.throws(() => toCSV(PTS, { origin: [1] }), TypeError);
});

test('toTXTGrid prints the top row first', () => {
  const g = toTXTGrid(Int32Array.from([0, 0, 1, 1]), 0, 0, 2);
  assert.equal(g, '.#\n#.\n');
  assert.equal(
    toTXTGrid(Int32Array.from([5, 5]), 0, 0, 2),
    '..\n..\n',
    'out-of-window points drop'
  );
  assert.throws(() => toTXTGrid(PTS, 0.5, 0, 4), TypeError);
  assert.throws(() => toTXTGrid(PTS, 0, 0, 0), RangeError);
  assert.throws(() => toTXTGrid(PTS, 0, 0, 9000), RangeError);
});

test('toJSON embeds config_hash, points_sha256 and the verification report', () => {
  const obj = JSON.parse(toJSON(PTS, CFG, { note: 'extra' }));
  assert.equal(obj.k, 3);
  assert.equal(obj.metric, 'linf');
  assert.equal(obj.version, CFG.version);
  assert.match(obj.config_hash, /^[0-9a-f]{64}$/);
  assert.match(obj.points_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(obj.points, [
    [0, 0],
    [3, 1],
    [-2, 2],
  ]);
  assert.equal(obj.verification.ok, true);
  assert.equal(obj.note, 'extra');
  assert.throws(() => toJSON(PTS, null), TypeError);
});

test('toJSON still serialises an invalid set, but flags it', () => {
  const obj = JSON.parse(toJSON(Int32Array.from([0, 0, 1, 1, 2, 2]), CFG));
  assert.equal(obj.verification.ok, false);
  assert.ok(obj.verification.triple);
});

test('toNDJSON is one ring per line, and is honest about an empty log', () => {
  const s = toNDJSON([
    { r: 0, k: 1, added: Int32Array.from([0, 0]) },
    { r: 1, k: 1, added: Int32Array.from([]) },
  ]);
  const lines = s.trim().split('\n');
  assert.deepEqual(JSON.parse(lines[0]), { r: 0, k: 1, new_points: [0, 0] });
  assert.deepEqual(JSON.parse(lines[1]), { r: 1, k: 1, new_points: [] });
  assert.equal(toNDJSON([]), '\n');
  assert.throws(() => toNDJSON(null), TypeError);
});

test('toManifest is canonical JSON and survives a missing curve / non-browser host', () => {
  const txt = toManifest(CFG, { k: 3, ms: 1 });
  const obj = JSON.parse(txt);
  assert.deepEqual(Object.keys(obj), Object.keys(obj).slice().sort(), 'keys must be sorted');
  assert.equal(obj.density_curve, null);
  assert.equal(typeof obj.ua, 'string');
  assert.equal(obj.metric, 'linf');
  assert.match(obj.config_hash, /^[0-9a-f]{64}$/);
  assert.equal(toManifest(CFG, { k: 3, ms: 1 }), txt, 'the manifest must be reproducible');
  assert.throws(() => toManifest(null, {}), TypeError);
  assert.throws(() => toManifest(CFG, null), TypeError);
});

test('toDensityCurveCSV has a stable header and one row per usable size', () => {
  const rows = toDensityCurveCSV(PTS, 4, [1, 3, 999]).trim().split('\n');
  assert.equal(rows[0], 's,max_pop,c(s),argmax_x,argmax_y');
  assert.equal(rows.length, 3);
  assert.match(rows[1], /^1,\d+,\d+\.\d{6},-?\d+,-?\d+$/);
  assert.throws(() => toDensityCurveCSV(PTS, -1, [1]), RangeError);
  assert.throws(() => toDensityCurveCSV(PTS, 4, []), TypeError);
});

test('toSVG draws a background plus one rect per in-range point', () => {
  const svg = toSVG(Int32Array.from([0, 0, 1, 1, 99, 99]), 1, 4);
  assert.match(svg, /^<svg xmlns/);
  assert.match(svg, /width="12" height="12"/);
  assert.equal((svg.match(/<rect /g) || []).length, 3, 'background + 2 points');
  assert.match(svg, /<rect x="4" y="4"/);
  assert.throws(() => toSVG(PTS, 1, 0), RangeError);
  assert.throws(() => toSVG(PTS, -1), RangeError);
});

test('DOM-only exports fail with a clear message outside a browser', () => {
  assert.throws(() => download('a.csv', 'text/csv', 'x'), /no DOM/);
  assert.throws(() => download('', 'text/csv', 'x'), TypeError);
  assert.throws(() => download('a.csv', 'text/csv', null), TypeError);
  assert.throws(() => toPNGBlob(PTS, 1)); // document is not defined
  assert.throws(() => toPNGBlob(PTS, 1e6), RangeError); // caught before the DOM
});
